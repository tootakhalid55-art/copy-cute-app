import { applyQrIdentity } from "@/lib/haseem/zatca-qr";
import { scanWithGatewayRecovery, scanFailureMessage } from "@/lib/haseem/scan-recovery";
import { useAuth } from "@/lib/haseem/auth";
import { applyRegisteredSupplier, resolveScanSupplier } from "@/lib/haseem/scan-supplier";
import { FilePreviewPane } from "@/components/haseem/FilePreviewPane";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState, useEffect, useSyncExternalStore } from "react";
import {
  Upload, Camera, FileText, Loader2, X, Check, AlertTriangle,
  Trash2, Plus, ScanLine, RefreshCw, Download, Eye,
} from "lucide-react";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, EmptyState } from "@/components/haseem/Shell";
import { useCollection, useKV } from "@/lib/haseem/store";
import { scanInvoice, type ScanResult, type ScanLine as SLine } from "@/lib/haseem/scan.functions";
import { useOrg } from "@/lib/db/org";
import { logClientEvent } from "@/lib/db/collections";
import { uploadAttachmentAndWait } from "@/lib/db/attachments";
import { toast } from "sonner";
import { validateSaudiVat, vatDigits, openZatcaLookup } from "@/lib/haseem/vat";

export const Route = createFileRoute("/purchases/scan")({
  head: () => ({ meta: [{ title: "مسح الفواتير بالذكاء الاصطناعي — كنار المحاسبية" }] }),
  component: ScanPage,
});

const ACCEPT = "application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/tiff,image/heic,image/heif";
const MAX_SIZE = 8 * 1024 * 1024; // 8MB

type Status = "pending" | "attachment-error" | "saving" | "save-error" | "scanning" | "review" | "saved" | "error" | "duplicate";
type Job = {
  id: string;
  file: File;
  dataUrl: string;
  status: Status;
  result?: ScanResult;
  error?: string;
  duplicateOf?: string;
  progress?: number;
  reviewPayload?: ReviewPayload;
  billId?: string;
};

// Keep the queue alive across SPA navigation, isolated by account and organization.
const queues = new Map<string, Job[]>();
const listeners = new Set<() => void>();
const emptyJobs: Job[] = [];
const activeSaves = new Set<string>();
function warnPendingSave(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}
function useScanQueue(scope: string) {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  const snapshot = useCallback(() => queues.get(scope) ?? emptyJobs, [scope]);
  const jobs = useSyncExternalStore(subscribe, snapshot, () => emptyJobs);
  const setJobs = useCallback((update: (jobs: Job[]) => Job[]) => {
    queues.set(scope, update(queues.get(scope) ?? emptyJobs));
    listeners.forEach((listener) => listener());
  }, [scope]);
  return [jobs, setJobs] as const;
}

function fileToDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2);
}

function ScanPage() {
  const scan = useServerFn(scanInvoice);
  const { currentOrgId } = useOrg();
  const { items: bills, addAsync: addBillAsync } = useCollection<any>("bills");
  const { items: suppliers, addAsync: addSupplierAsync } = useCollection<any>("suppliers");
  const { items: scanHistory, add: addHistory, remove: removeHistory } = useCollection<any>("invoice-scans");
  const [org] = useKV<{ name: string; taxNumber: string }>("org", {
    name: "شركة كنار الحديثة للمقاولات",
    taxNumber: "312756062700003",
  });

  const { user } = useAuth();
  const scope = `${user?.id ?? ""}:${currentOrgId ?? ""}`;
  const [jobs, setJobs] = useScanQueue(scope);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, [setJobs]);

  const runScan = useCallback(async (job: Job) => {
    updateJob(job.id, { status: "scanning", progress: 10, error: undefined });
    try {
      const qr = await (await import("@/lib/haseem/scan-qr")).readInvoiceQr(job.dataUrl);
      const extracted = await scanWithGatewayRecovery(
        () => scan({ data: { fileDataUrl: job.dataUrl, filename: job.file.name } }),
        (attempt) => updateJob(job.id, { error: `انقطاع مؤقت؛ جارٍ إعادة الاتصال (${attempt}/2)…` }),
      );
      const result = applyQrIdentity(extracted, qr);
      // Duplicate detection: same supplier + invoice number + total
      const dup = bills.find((b) =>
        b.partyName?.trim() === result.supplierName?.trim() &&
        (b.supplierRef || b.ref) === result.invoiceNumber &&
        Math.abs(Number(b.total || 0) - Number(result.grandTotal || 0)) < 0.5
      );
      updateJob(job.id, {
        status: dup ? "duplicate" : "review",
        result,
        duplicateOf: dup?.id,
        progress: 100,
        error: undefined,
      });
    } catch (e: any) {
      updateJob(job.id, { status: "error", error: scanFailureMessage(e), progress: 0 });
    }
  }, [scan, bills, updateJob]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const f of arr) {
      if (f.size > MAX_SIZE) {
        alert(`${f.name}: الملف يتجاوز 8MB`);
        continue;
      }
      const dataUrl = await fileToDataURL(f);
      const job: Job = { id: newId(), file: f, dataUrl, status: "pending", progress: 0 };
      setJobs((js) => [job, ...js]);
      // fire and forget — sequential to be gentle on rate limits
      queueMicrotask(() => runScan(job));
    }
  }, [runScan, setJobs]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const filteredHistory = useMemo(() => {
    if (!search.trim()) return scanHistory;
    const q = search.toLowerCase();
    return scanHistory.filter((h: any) =>
      [h.supplierName, h.invoiceNumber, h.grandTotal, h.invoiceDate, h.rawText]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [scanHistory, search]);

  useEffect(() => { setReviewId(null); }, [scope]);

  const reviewJob = jobs.find((j) => j.id === reviewId) || null;

  const saveOriginal = async (job: Job, billId: string): Promise<boolean> => {
    try {
      if (!currentOrgId) throw new Error("المنشأة غير متاحة");
      const up = await uploadAttachmentAndWait(job.file, {
        orgId: currentOrgId, entityType: "document", entityId: billId, purpose: "scanned-original",
      });
      if (up.status !== "done") throw new Error(up.error || "تعذر رفع الأصل");
      updateJob(job.id, { status: "saved", error: undefined, billId });
      return true;
    } catch {
      updateJob(job.id, { status: "attachment-error", billId, error: "الفاتورة محفوظة؛ لم يُحفظ الأصل بعد. اضغط إعادة رفع الأصل." });
      return false;
    }
  };

  const retryOriginal = async (job: Job) => {
    if (!job.billId) return;
    const key = `${scope}:${job.id}`;
    if (activeSaves.has(key)) return;
    activeSaves.add(key);
    window.addEventListener("beforeunload", warnPendingSave);
    updateJob(job.id, { status: "saving", error: undefined });
    try {
      if (await saveOriginal(job, job.billId)) toast.success("تم حفظ المستند الأصلي وربطه بالفاتورة");
      else toast.error("تعذر رفع الأصل؛ يمكنك إعادة المحاولة دون إنشاء فاتورة جديدة");
    } finally {
      activeSaves.delete(key);
      if (!activeSaves.size) window.removeEventListener("beforeunload", warnPendingSave);
    }
  };

  // Shared save routine — used by the review modal and the bulk
  // high-confidence approve button. Returns {ok:false, reason} instead of
  // throwing; in quiet mode duplicates are skipped without error toasts.
  const saveScannedInvoice = async (
    job: Job,
    payload: ReviewPayload,
    opts?: { quiet?: boolean; supplierCache?: Map<string, any> },
  ): Promise<{ ok: boolean; billId?: string; attachmentSaved?: boolean; reason?: "duplicate" | "error" | "vat-mismatch" }> => {
    const quiet = !!opts?.quiet;
    const qr = payload.zatcaQr?.status === "decoded" ? payload.zatcaQr.data : undefined;
    if (payload.zatcaQr?.status === "ambiguous") {
      if (!quiet) toast.error("يوجد أكثر من رمز فاتورة مختلف؛ ارفع كل فاتورة منفصلة قبل الحفظ");
      return { ok: false, reason: "error" };
    }
    if (qr) payload = { ...payload, supplierName: qr.sellerName, supplierVatNumber: qr.vatNumber };
    // Find or create supplier — must await the REAL DB record (the sync
    // add() returns an optimistic tmp_ stub that breaks the partyId link).
    // The cache covers a bulk run where several invoices share a supplier
    // that was just created: the render-time `suppliers` list is stale
    // during the loop and would create the same supplier again.
    const supplierKey = String(payload.supplierName ?? "").trim();
    let supplier;
    try {
      const vatMatches = qr ? suppliers.filter((s: any) => vatDigits(s.taxNumber) === qr.vatNumber) : [];
      if (!payload.selectedSupplierId && vatMatches.length > 1) throw new Error("يوجد أكثر من مورد برقم QR الضريبي؛ اختر المورد من القائمة");
      supplier = payload.selectedSupplierId
        ? resolveScanSupplier(suppliers, payload.selectedSupplierId, supplierKey)
        : vatMatches[0] ?? opts?.supplierCache?.get(supplierKey) ?? resolveScanSupplier(suppliers, undefined, supplierKey);
      if (qr && supplier && vatDigits(supplier.taxNumber) !== qr.vatNumber) throw new Error("الرقم الضريبي للمورد المسجل لا يطابق رمز QR؛ اختر المورد الصحيح أو صحح سجله أولًا");
      if (payload.selectedSupplierId && supplier) payload = applyRegisteredSupplier(payload, supplier);
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : "تعذر تحديد المورد");
      return { ok: false, reason: "error" };
    }
    if (!supplier && payload.createSupplier && supplierKey) {
      supplier = await addSupplierAsync({
        name: payload.supplierName,
        taxNumber: payload.supplierVatNumber,
        cr_number: payload.supplierCrNumber || undefined,
        address: payload.supplierAddress || undefined,
        phone: payload.supplierPhone || undefined,
        email: payload.supplierEmail || undefined,
        currency: payload.currency || "SAR",
        type: "company",
      });
    }
    if (supplier && supplierKey) opts?.supplierCache?.set(supplierKey, supplier);
    // Company verification: the VAT number on the invoice must match the one
    // stored for this supplier. In bulk mode a mismatch is not auto-approved;
    // in single mode the reviewer is warned and stays in control.
    if (supplier && payload.supplierVatNumber) {
      const stored = vatDigits(supplier.taxNumber);
      const extracted = vatDigits(payload.supplierVatNumber);
      if (stored && extracted && stored !== extracted) {
        logClientEvent("scan-save", `vat mismatch supplier=${String(supplier.name).slice(0, 40)}`);
        if (quiet) return { ok: false, reason: "vat-mismatch" };
        toast.warning(`تنبيه: الرقم الضريبي في الفاتورة (${extracted}) يختلف عن المسجل للمورد «${supplier.name}» (${stored})`, { duration: 9000 });
      }
    }
    logClientEvent("scan-save", `attempt org=${currentOrgId ? "yes" : "MISSING"} lines=${payload.lines?.length ?? 0}${quiet ? " bulk" : ""}`);
    // Same invoice number already in the system? Skip it as a duplicate —
    // loudly with a jump-to link in single mode, silently in bulk mode.
    if (payload.invoiceNumber) {
      const dup = bills.find((b: any) => b.ref === payload.invoiceNumber || b.supplierRef === payload.invoiceNumber);
      if (dup) {
        logClientEvent("scan-save", `duplicate pre-check hit ref=${payload.invoiceNumber}`);
        if (!quiet) {
          toast.error(`فاتورة برقم "${payload.invoiceNumber}" محفوظة مسبقاً — لا يمكن حفظها مرتين`, {
            duration: 8000,
            action: { label: "فتح الفاتورة المحفوظة", onClick: () => navigate({ to: "/purchases/bills/$id", params: { id: dup.id } }) },
          });
        }
        updateJob(job.id, { status: "duplicate", duplicateOf: dup.id });
        return { ok: false, reason: "duplicate" };
      }
    }
    let bill: any;
    try {
      bill = await addBillAsync({
        ref: payload.invoiceNumber || `BILL-${Math.floor(100000 + Math.random() * 900000)}`,
        supplierRef: payload.invoiceNumber,
        date: payload.invoiceDate || new Date().toISOString().slice(0, 10),
        dueDate: payload.dueDate || payload.invoiceDate || new Date().toISOString().slice(0, 10),
        partyId: supplier?.id || "",
        partyName: qr?.sellerName || supplier?.name || payload.supplierName,
        notes: `تم إنشاؤها بالمسح الذكي · PO: ${payload.purchaseOrderNumber || "—"}`,
        // "مؤكد" posts the invoice to the ledger server-side (the adapter
        // falls back to a saved draft with a toast on failure).
        status: payload.finalStatus || "مسودة",
        lines: payload.lines,
        subtotal: payload.subtotal,
        tax: payload.vat,
        total: payload.grandTotal,
        currency: payload.currency,
        source: "ai-scan",
        scannedOriginal: { filename: job.file.name, mime: job.file.type, size: job.file.size },
        scannedTemplate: null,
        zatcaQr: payload.zatcaQr ?? null,
        supplierReviewSource: qr ? "zatca-qr" : payload.selectedSupplierId ? "registered-supplier" : "scan",
        supplierInvoiceName: payload.supplierName,
        supplierVatNumber: payload.supplierVatNumber,
        supplierCrNumber: payload.supplierCrNumber,
        supplierAddress: payload.supplierAddress,
        supplierPhone: payload.supplierPhone,
        supplierEmail: payload.supplierEmail,
        scanExtras: { discount: payload.discount, shipping: payload.shipping, otherCharges: payload.otherCharges, poNumber: payload.purchaseOrderNumber },
      });
    } catch (e) {
      const msg = String((e as any)?.message ?? e ?? "");
      logClientEvent("scan-save", `failed: ${msg.slice(0, 140)}`);
      const isDup = /duplicate key.*doc_number|documents_org_id_kind_doc_number/i.test(msg);
      if (isDup) {
        const dupRef = payload.invoiceNumber || "";
        const existingBill = bills.find((b: any) => b.ref === dupRef || b.supplierRef === dupRef);
        updateJob(job.id, { status: "duplicate", duplicateOf: existingBill?.id });
        if (!quiet) {
          toast.error(`فاتورة برقم "${dupRef}" محفوظة مسبقاً — لا يمكن حفظها مرتين`, {
            duration: 8000,
            ...(existingBill
              ? { action: { label: "فتح الفاتورة المحفوظة", onClick: () => navigate({ to: "/purchases/bills/$id", params: { id: existingBill.id } }) } }
              : {}),
          });
        }
        return { ok: false, reason: "duplicate" };
      }
      if (!quiet) toast.error(msg || "تعذر حفظ الفاتورة");
      return { ok: false, reason: "error" };
    }
    logClientEvent("scan-save", `success id=${bill?.id ?? "?"}`);

    updateJob(job.id, { billId: bill.id });
    const attachmentSaved = await saveOriginal(job, bill.id);
    if (!attachmentSaved) toast.warning("حُفظت الفاتورة، لكن الأصل يحتاج إعادة رفع من قائمة المسح.");
    try {
    addHistory({
      supplierName: payload.supplierName,
      invoiceNumber: payload.invoiceNumber,
      invoiceDate: payload.invoiceDate,
      grandTotal: payload.grandTotal,
      billId: bill.id,
      originalFilename: job.file.name,
      originalDataUrl: job.dataUrl,
      rawText: job.result?.rawText || "",
      orgName: org.name,
    });
    } catch {
      toast.warning("الفاتورة محفوظة؛ تعذر تحديث الأرشيف المحلي فقط.");
    }
    return { ok: true, billId: bill.id, attachmentSaved };
  };

  // Bulk approve: every reviewed-and-waiting invoice whose extraction
  // confidence is high gets saved & posted in one click. Duplicates are
  // skipped quietly, and one invoice failing never stops the rest.
  const HIGH_CONFIDENCE = 85;
  const highConfJobs = jobs.filter(
    (j) => j.status === "review" && j.result && j.result.zatcaQr?.status !== "ambiguous" && !j.result.zatcaQr?.differences?.length && averageConfidence(j.result) >= HIGH_CONFIDENCE,
  );
  const [bulkSaving, setBulkSaving] = useState(false);
  const approveHighConfidence = async () => {
    if (bulkSaving || !highConfJobs.length) return;
    if (!confirm(`سيتم حفظ واعتماد ${highConfJobs.length} فاتورة نسبة الثقة فيها ${HIGH_CONFIDENCE}% فأكثر.\nالفواتير المكررة سيتم تجاوزها تلقائياً. متابعة؟`)) return;
    setBulkSaving(true);
    const batchIds = new Set(highConfJobs.map((job) => job.id));
    highConfJobs.forEach((job) => activeSaves.add(`${scope}:${job.id}`));
    window.addEventListener("beforeunload", warnPendingSave);
    setJobs((current) => current.map((job) => batchIds.has(job.id) ? { ...job, status: "saving" } : job));
    let ok = 0;
    let dup = 0;
    let fail = 0;
    let vatReview = 0;
    const supplierCache = new Map<string, any>();
    const seenRefs = new Set<string>();
    try {
      for (const job of highConfJobs) {
        const r = job.result!;
        try {
          // Two invoices with the same number inside the SAME batch: the
          // second is a duplicate of the first — skip before hitting the DB.
          if (r.invoiceNumber && seenRefs.has(r.invoiceNumber)) {
            updateJob(job.id, { status: "duplicate" });
            dup++;
            continue;
          }
          const res = await saveScannedInvoice(
            job,
            { ...r, createSupplier: true, finalStatus: "مؤكد" },
            { quiet: true, supplierCache },
          );
          if (res.ok) {
            ok++;
            if (r.invoiceNumber) seenRefs.add(r.invoiceNumber);
          } else if (res.reason === "duplicate") {
            dup++;
          } else if (res.reason === "vat-mismatch") {
            vatReview++;
          } else {
            fail++;
          }
        } catch (e) {
          // One bad invoice must never abort the rest of the batch.
          fail++;
          logClientEvent("scan-bulk", `job threw: ${String((e as any)?.message ?? e ?? "").slice(0, 120)}`);
        }
      }
      logClientEvent("scan-bulk", `done ok=${ok} dup=${dup} vat=${vatReview} fail=${fail}`);
      const parts = [
        ok ? `اعتُمدت ${ok} فاتورة ✓` : "",
        dup ? `تم تجاوز ${dup} مكررة` : "",
        vatReview ? `${vatReview} بحاجة مراجعة يدوية (اختلاف الرقم الضريبي عن المورد المسجل)` : "",
        fail ? `تعذّر ${fail}` : "",
      ].filter(Boolean).join(" · ");
      if (fail || vatReview) toast.warning(parts, { duration: 10000 });
      else toast.success(parts || "لا شيء للاعتماد", { duration: 8000 });
    } finally {
      highConfJobs.forEach((job) => activeSaves.delete(`${scope}:${job.id}`));
      if (!activeSaves.size) window.removeEventListener("beforeunload", warnPendingSave);
      setJobs((current) => current.map((job) => batchIds.has(job.id) && job.status === "saving" ? { ...job, status: "review" } : job));
      setBulkSaving(false);
    }
  };

  return (
    <Shell>
      <PageHeader
        title="مسح الفواتير بالذكاء الاصطناعي"
        subtitle="حمّل فواتير المورد (PDF أو صور) ليتم استخراج بياناتها وإنشاء فاتورة شراء تلقائياً"
        action={
          <Link to="/purchases/bills">
            <OutlineBtn>عرض فواتير المشتريات</OutlineBtn>
          </Link>
        }
      />

      {/* Uploader */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-[#0f2a1d] bg-[#f2f0e8]" : "border-[#eceae2] bg-white"
        }`}
      >
        <div className="w-14 h-14 mx-auto rounded-full bg-[#f2f0e8] flex items-center justify-center mb-3">
          <ScanLine className="w-7 h-7 text-[#0f2a1d]" />
        </div>
        <div className="font-bold text-lg">اسحب وأفلت الفواتير هنا</div>
        <p className="text-xs text-[#0f2a1d]/60 mt-1">
          PDF · JPG · PNG · WEBP · HEIC · TIFF — حتى 8MB لكل ملف — يمكن رفع عدة ملفات مرة واحدة
        </p>
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          <PrimaryBtn onClick={() => inputRef.current?.click()}>
            <Upload className="w-4 h-4" /> اختر من الجهاز
          </PrimaryBtn>
          <OutlineBtn onClick={() => cameraRef.current?.click()}>
            <Camera className="w-4 h-4" /> تصوير بالكاميرا
          </OutlineBtn>
        </div>
        <input
          ref={inputRef} type="file" accept={ACCEPT} multiple hidden
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <input
          ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Active queue */}
      {jobs.length > 0 && (
        <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#eceae2] bg-[#fafaf7] flex items-center justify-between gap-2 flex-wrap">
            <div className="font-semibold text-sm">قائمة المسح ({jobs.length})</div>
            <div className="flex items-center gap-3">
              {highConfJobs.length > 0 && (
                <PrimaryBtn
                  onClick={approveHighConfidence}
                  disabled={bulkSaving}
                  className="!py-1.5 !px-3 text-xs"
                  title={`حفظ واعتماد كل الفواتير التي نسبة الثقة فيها ${HIGH_CONFIDENCE}% فأكثر دفعة واحدة`}
                >
                  <Check className="w-3.5 h-3.5" />
                  {bulkSaving ? "جارٍ الاعتماد…" : `اعتماد ${highConfJobs.length} عالية الثقة`}
                </PrimaryBtn>
              )}
              <button
                onClick={() => setJobs((js) => js.filter((j) => j.status !== "saved"))}
                className="text-xs text-[#0f2a1d]/60 hover:underline"
              >مسح المكتملة</button>
            </div>
          </div>
          <div className="divide-y divide-[#eceae2]">
            {jobs.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                onReview={() => { if (!bulkSaving) setReviewId(j.id); }}
                onRetry={() => j.status === "attachment-error" ? retryOriginal(j) : runScan(j)}
                onRemove={() => setJobs((js) => js.filter((x) => x.id !== j.id))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Search + history */}
      <div className="rounded-xl bg-white border border-[#eceae2]">
        <div className="px-4 py-3 border-b border-[#eceae2] flex items-center justify-between gap-2 flex-wrap">
          <div className="font-semibold text-sm">أرشيف الفواتير الممسوحة</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالمورد، رقم الفاتورة، المبلغ، التاريخ، النص..."
            className="border border-[#eceae2] rounded-lg px-3 py-1.5 text-sm min-w-[260px]"
          />
        </div>
        {filteredHistory.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={FileText}
              title="لا توجد فواتير ممسوحة بعد"
              description="ابدأ برفع فاتورة مورد وسيتم حفظها هنا مع الملف الأصلي."
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs">
              <tr className="text-right">
                <th className="p-2.5">المورد</th>
                <th>رقم الفاتورة</th>
                <th>التاريخ</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {filteredHistory.map((h: any) => (
                <tr key={h.id} className="text-right hover:bg-[#fafaf7]">
                  <td className="p-2.5">{h.supplierName || "—"}</td>
                  <td className="p-2.5 font-mono">{h.invoiceNumber || "—"}</td>
                  <td className="p-2.5">{h.invoiceDate || "—"}</td>
                  <td className="p-2.5 tabular-nums">{Number(h.grandTotal || 0).toLocaleString()} ر.س</td>
                  <td className="p-2.5">
                    {h.billId
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-[#eaf5ee] text-[#0f6b3a]">تم الإنشاء</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-[#f7f6f0] text-[#0f2a1d]/60">مؤرشف</span>}
                  </td>
                  <td className="p-2.5">
                    <div className="flex gap-1 justify-end">
                      {h.originalDataUrl && (
                        <a
                          href={h.originalDataUrl}
                          download={h.originalFilename || "invoice"}
                          className="p-1.5 hover:bg-[#f7f6f0] rounded"
                          title="تنزيل الملف الأصلي"
                        ><Download className="w-3.5 h-3.5" /></a>
                      )}
                      <button
                        onClick={() => confirm("حذف السجل والملف؟") && removeHistory(h.id)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded"
                        title="حذف"
                      ><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reviewJob && reviewJob.result && (
        <ReviewModal
          job={reviewJob}
          suppliers={suppliers}
          onClose={() => setReviewId(null)}
          onSave={(payload) => {
            const key = `${scope}:${reviewJob.id}`;
            if (activeSaves.has(key)) return;
            activeSaves.add(key);
            window.addEventListener("beforeunload", warnPendingSave);
            updateJob(reviewJob.id, { status: "saving", error: undefined, result: payload, reviewPayload: payload });
            setReviewId(null);
            toast.info("جارٍ حفظ الفاتورة في الخلفية. يمكنك متابعة العمل داخل التطبيق؛ أبقِ علامة التبويب مفتوحة.");
            void (async () => {
              try {
                const res = await saveScannedInvoice(reviewJob, payload);
                if (!res.ok) throw new Error(res.reason === "duplicate"
                  ? "يوجد رقم فاتورة مكرر؛ راجع الفاتورة قبل إعادة الحفظ"
                  : "تعذر الحفظ؛ بيانات المراجعة محفوظة هنا لإعادة المحاولة");
                (res.attachmentSaved ? toast.success : toast.warning)(res.attachmentSaved ? "حُفظت الفاتورة مع المستند الأصلي." : "الفاتورة محفوظة؛ أعد رفع الأصل من قائمة المسح.", {
                  duration: 8000,
                  action: { label: "فتح الفاتورة", onClick: () => navigate({ to: "/purchases/bills/$id", params: { id: res.billId! } }) },
                });
              } catch (error) {
                const message = error instanceof Error ? error.message : "تعذر حفظ الفاتورة";
                updateJob(reviewJob.id, { status: "save-error", error: message });
                toast.error(message, { duration: 12000, action: {
                  label: "مراجعة المحاولة", onClick: () => { void navigate({ to: "/purchases/scan" }); },
                } });
              } finally {
                activeSaves.delete(key);
                if (!activeSaves.size) window.removeEventListener("beforeunload", warnPendingSave);
              }
            })();
          }}
        />
      )}
    </Shell>
  );
}

function JobRow({
  job, onReview, onRetry, onRemove,
}: { job: Job; onReview: () => void; onRetry: () => void; onRemove: () => void }) {
  const isImg = job.file.type.startsWith("image/");
  return (
    <div className="p-3 flex items-center gap-3">
      <div className="w-14 h-14 rounded-lg bg-[#f7f6f0] border border-[#eceae2] flex items-center justify-center overflow-hidden shrink-0">
        {isImg
          ? <img src={job.dataUrl} alt="" className="w-full h-full object-cover" />
          : <FileText className="w-6 h-6 text-[#0f2a1d]/50" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{job.file.name}</div>
        <div className="text-xs text-[#0f2a1d]/60 flex items-center gap-2 mt-0.5">
          <StatusBadge status={job.status} />
          {job.result && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${averageConfidence(job.result) >= 85 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              ثقة {averageConfidence(job.result)}%
            </span>
          )}
          {job.result?.supplierName && <span>· {job.result.supplierName}</span>}
          {job.result?.grandTotal ? <span>· {job.result.grandTotal.toLocaleString()} {job.result.currency}</span> : null}
          {job.error && <span className="text-red-600">· {job.error}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {(job.status === "review" || job.status === "duplicate" || job.status === "save-error") && (
          <PrimaryBtn onClick={onReview} className="!py-1.5 !px-3 text-xs">
            <Eye className="w-3.5 h-3.5" /> مراجعة
          </PrimaryBtn>
        )}
        {job.billId && <Link to="/purchases/bills/$id" params={{ id: job.billId }} className="text-xs underline">فتح الفاتورة</Link>}
        {(job.status === "error" || job.status === "attachment-error") && (
          <OutlineBtn onClick={onRetry} className="!py-1.5 !px-3 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> {job.status === "attachment-error" ? "إعادة رفع الأصل" : "إعادة"}
          </OutlineBtn>
        )}
        {job.status !== "scanning" && job.status !== "saving" && (
          <button onClick={onRemove} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="إزالة">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { t: string; c: string }> = {
    "attachment-error": { t: "محفوظة دون الأصل", c: "bg-amber-50 text-amber-700" },
    saving: { t: "جارٍ الحفظ في الخلفية…", c: "bg-blue-50 text-blue-700" },
    "save-error": { t: "تعذر الحفظ — راجع وأعد المحاولة", c: "bg-red-50 text-red-700" },
    pending:   { t: "في الانتظار", c: "bg-[#f7f6f0] text-[#0f2a1d]/70" },
    scanning:  { t: "جاري القراءة...", c: "bg-blue-50 text-blue-700" },
    review:    { t: "جاهزة للمراجعة", c: "bg-[#eaf5ee] text-[#0f6b3a]" },
    duplicate: { t: "احتمال تكرار", c: "bg-amber-50 text-amber-700" },
    saved:     { t: "تم الإنشاء", c: "bg-[#eaf5ee] text-[#0f6b3a]" },
    error:     { t: "خطأ", c: "bg-red-50 text-red-700" },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${m.c}`}>
      {(status === "scanning" || status === "saving") && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === "duplicate" && <AlertTriangle className="w-3 h-3" />}
      {status === "saved" && <Check className="w-3 h-3" />}
      {m.t}
    </span>
  );
}

type ReviewPayload = ScanResult & { createSupplier: boolean; finalStatus: string; selectedSupplierId?: string };

function ReviewModal({
  job, suppliers, onClose, onSave,
}: {
  job: Job;
  suppliers: any[];
  onClose: () => void;
  onSave: (v: ReviewPayload) => void | Promise<void>;
}) {
  const r = job.result!;
  const [form, setForm] = useState<ScanResult>(() => JSON.parse(JSON.stringify(r)));
  const [createSupplier, setCreateSupplier] = useState(job.reviewPayload?.createSupplier ?? true);
  const [selectedSupplierId, setSelectedSupplierId] = useState(() => {
    if (job.reviewPayload?.selectedSupplierId) return job.reviewPayload.selectedSupplierId;
    const matches = r.zatcaQr?.data ? suppliers.filter((s: any) => vatDigits(s.taxNumber) === r.zatcaQr!.data!.vatNumber) : [];
    return matches.length === 1 ? matches[0].id : "";
  });
  const [saving, setSaving] = useState(false);
  const submit = async (finalStatus: string) => {
    if (saving) return;
    if (form.zatcaQr?.status === "ambiguous") { toast.error("ارفع كل فاتورة في ملف منفصل لتحديد رمز QR الصحيح"); return; }
    const qrVat = form.zatcaQr?.data?.vatNumber;
    const selected = suppliers.find((s: any) => s.id === selectedSupplierId);
    if (qrVat && selected && vatDigits(selected.taxNumber) !== qrVat) { toast.error("المورد المختار لا يطابق الرقم الضريبي في QR"); return; }
    setSaving(true);
    try {
      await onSave({ ...form, createSupplier: selectedSupplierId ? false : createSupplier, finalStatus, selectedSupplierId: selectedSupplierId || undefined });
    } finally {
      setSaving(false);
    }
  };



  const supplierMatch = useMemo(
    () => selectedSupplierId ? suppliers.find((s: any) => s.id === selectedSupplierId) : (suppliers.filter((s: any) => s.name?.trim() === form.supplierName?.trim()).length === 1 ? suppliers.find((s: any) => s.name?.trim() === form.supplierName?.trim()) : undefined),
    [suppliers, form.supplierName, selectedSupplierId]
  );

  useEffect(() => { if (supplierMatch) setCreateSupplier(false); }, [supplierMatch]);

  const isPdf = job.file.type === "application/pdf";

  const c = (field: string) => Number(form.confidence?.[field] ?? 0);
  const conf = (field: string) => {
    const v = c(field);
    const cls = v >= 90 ? "bg-[#eaf5ee] text-[#0f6b3a]"
             : v >= 70 ? "bg-amber-50 text-amber-700"
             : "bg-red-50 text-red-700";
    return v > 0 ? (
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`} title="مستوى الثقة">{v}%</span>
    ) : null;
  };

  const updateLine = (i: number, patch: Partial<SLine>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l) }));
  const addLine = () =>
    setForm((f) => ({ ...f, lines: [...f.lines, { description: "", qty: 1, price: 0, tax: 15 }] }));
  const rmLine = (i: number) =>
    setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-auto">
      <div dir="rtl" className="bg-white rounded-xl w-full max-w-6xl my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#eceae2] bg-[#fafaf7]">
          <div>
            <h3 className="font-bold">مراجعة الفاتورة قبل الإنشاء</h3>
            <p className="text-xs text-[#0f2a1d]/60 mt-0.5">
              {job.file.name} · {(job.file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-[#eceae2]"><X className="w-4 h-4" /></button>
        </div>

        {job.status === "duplicate" && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>تحذير:</strong> يبدو أن هذه الفاتورة موجودة مسبقاً (نفس المورد، رقم الفاتورة والمبلغ).
              يمكنك حفظها كنسخة جديدة أو إلغاء العملية.
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1.12fr)] gap-4 p-5">
          <div className="rounded-xl border border-[#eceae2] bg-[#faf9f4] overflow-hidden min-h-[620px] flex flex-col shadow-sm">
            <div className="px-4 py-3 border-b border-[#eceae2] flex items-center justify-between bg-white/70">
              <div>
                <div className="text-xs font-semibold text-[#0f2a1d]/60">الملف الأصلي</div>
                <div className="text-sm font-bold">{job.file.name}</div>
              </div>
              <a
                href={job.dataUrl}
                download={job.file.name}
                className="text-[11px] px-2 py-1 rounded-md border border-[#eceae2] hover:bg-[#fafaf7]"
              >
                تنزيل
              </a>
            </div>
            <div className="flex-1 min-h-0 bg-[#f7f6f0]">
              <FilePreviewPane
                src={job.dataUrl}
                mime={job.file.type}
                filename={job.file.name}
                minHeightClass="min-h-[560px]"
              />
            </div>
          </div>

          <div className="space-y-4 text-sm">
            <p className="rounded-xl border p-3 bg-green-50">تُنشأ الفاتورة بقالب كنار الموحد، مع الاحتفاظ بالمستند الأصلي.</p>
            <div className="rounded-xl border border-[#eceae2] bg-white overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-[#eceae2] bg-[#fafaf7] flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-[#0f2a1d]/60">السجل الرقمي</div>
                  <div className="font-bold">بيانات الفاتورة داخل النظام</div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#eaf5ee] text-[#0f6b3a]">
                  {form.zatcaQr?.data ? "الاسم والرقم الضريبي من QR" : selectedSupplierId ? "بيانات المورد من السجل" : "بيانات مستخرجة للمراجعة"}
                </span>
              </div>
              {form.zatcaQr && <div role="status" className="m-4 p-3 rounded border bg-amber-50 text-sm space-y-1">
                {form.zatcaQr.data ? <>
                  <p>تم اعتماد اسم المورد ورقمه الضريبي من رمز QR: <strong>{form.zatcaQr.data.sellerName} — {form.zatcaQr.data.vatNumber}</strong></p>
                  {!!form.zatcaQr.differences?.length && <p>اختلاف عن قراءة الذكاء الاصطناعي: {form.zatcaQr.differences.join("، ")}. راجع الفاتورة قبل الاعتماد.</p>}
                  {!!form.zatcaQr.differences?.length && <p>القراءة الأصلية: {form.zatcaQr.originalName || "—"} — {form.zatcaQr.originalVat || "—"}</p>}
                  <p>إجمالي QR: {form.zatcaQr.data.total} · الضريبة: {form.zatcaQr.data.vat} · التاريخ: {form.zatcaQr.data.timestamp}</p>
                  <p className="text-xs">تمت قراءة بيانات الرمز؛ لم يتم التحقق من التوقيع الإلكتروني لدى الهيئة. المبالغ تبقى قابلة للمراجعة.</p>
                </> : <p>{form.zatcaQr.warning}</p>}
              </div>}
              <div className="p-4 grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-2 rounded-lg border bg-blue-50 p-3">
                  <label htmlFor="registered-scan-supplier" className="block font-semibold">اختيار مورد مسجل</label>
                  <select id="registered-scan-supplier" value={selectedSupplierId} disabled={saving} className="w-full border rounded px-3 py-2 bg-white" onChange={e => {
                    const id = e.target.value;
                    setSelectedSupplierId(id);
                    if (id) {
                      const supplier = suppliers.find((item: any) => item.id === id);
                      if (supplier) setForm(current => applyRegisteredSupplier(current, supplier));
                      setCreateSupplier(false);
                    } else {
                      setForm(current => ({ ...current, supplierName: r.supplierName, supplierVatNumber: r.supplierVatNumber, supplierCrNumber: r.supplierCrNumber, supplierAddress: r.supplierAddress, supplierPhone: r.supplierPhone, supplierEmail: r.supplierEmail }));
                      setCreateSupplier(true);
                    }
                  }}>
                    <option value="">استخدام البيانات المستخرجة / إدخال يدوي</option>
                    {suppliers.map((supplier: any) => <option key={supplier.id} value={supplier.id} disabled={!!form.zatcaQr?.data && vatDigits(supplier.taxNumber) !== form.zatcaQr.data.vatNumber}>{supplier.name} — {supplier.taxNumber || "بدون رقم ضريبي"}{supplier.code ? ` — ${supplier.code}` : ""}</option>)}
                  </select>
                  {selectedSupplierId && <p role="status" className="text-xs">تم جلب الرقم الضريبي وبقية بيانات المورد من سجله تلقائيًا.</p>}
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div><dt>السجل التجاري</dt><dd>{form.supplierCrNumber || "—"}</dd></div>
                    <div><dt>الهاتف</dt><dd dir="ltr">{form.supplierPhone || "—"}</dd></div>
                    <div><dt>البريد الإلكتروني</dt><dd>{form.supplierEmail || "—"}</dd></div>
                    <div><dt>العنوان</dt><dd>{form.supplierAddress || "—"}</dd></div>
                  </dl>
                </div>
                <FormField label="اسم المورد" extra={conf("supplierName")}>
                  <input
                    value={form.supplierName}
                    readOnly={!!form.zatcaQr?.data}
                    disabled={saving}
                    onChange={(e) => {
                      const name = e.target.value;
                      const matches = suppliers.filter((supplier: any) => supplier.name?.trim() === name.trim());
                      if (matches.length === 1) {
                        setForm(current => applyRegisteredSupplier(current, matches[0]));
                        setSelectedSupplierId(matches[0].id);
                        setCreateSupplier(false);
                      } else {
                        setForm(current => selectedSupplierId
                          ? { ...applyRegisteredSupplier(current, { id: "", name }), supplierName: name }
                          : { ...current, supplierName: name });
                        setSelectedSupplierId("");
                        setCreateSupplier(true);
                        if (matches.length > 1) toast.info("يوجد أكثر من مورد بهذا الاسم؛ اختر المورد من القائمة حسب الرقم الضريبي");
                      }
                    }}
                    list="supplier-list"
                    className="border border-[#eceae2] rounded-lg px-3 py-2 w-full"
                  />
                  <datalist id="supplier-list">
                    {suppliers.map((s: any) => <option key={s.id} value={s.name} />)}
                  </datalist>
                </FormField>
                <FormField label="الرقم الضريبي" extra={conf("supplierVatNumber")}>
                  <input
                    value={form.supplierVatNumber}
                    readOnly={!!selectedSupplierId || !!form.zatcaQr?.data}
                    onChange={(e) => setForm({ ...form, supplierVatNumber: e.target.value })}
                    className="border border-[#eceae2] rounded-lg px-3 py-2 w-full font-mono"
                  />
                  {(() => {
                    const v = vatDigits(form.supplierVatNumber);
                    if (!v) return null;
                    const check = validateSaudiVat(v);
                    const storedVat = supplierMatch ? vatDigits(supplierMatch.taxNumber) : "";
                    const mismatch = supplierMatch && storedVat && storedVat !== v;
                    const sameVatOther = !supplierMatch
                      ? suppliers.find((s: any) => vatDigits(s.taxNumber) === v && s.name?.trim() !== form.supplierName?.trim())
                      : null;
                    return (
                      <div className="mt-1 space-y-1 text-[11px]">
                        {check.ok
                          ? <div className="text-emerald-700">✓ صيغة الرقم الضريبي صحيحة</div>
                          : <div className="text-red-600">✗ {check.issues.join(" · ")}</div>}
                        {mismatch && (
                          <div className="text-red-600 font-semibold">
                            ⚠ الرقم المستخرج من الفاتورة لا يطابق الرقم المسجل للمورد «{supplierMatch.name}» ({storedVat}) — راجع الفاتورة قبل الاعتماد
                          </div>
                        )}
                        {supplierMatch && storedVat && !mismatch && (
                          <div className="text-emerald-700">✓ مطابق للرقم المسجل للمورد «{supplierMatch.name}»</div>
                        )}
                        {sameVatOther && (
                          <div className="text-amber-700">⚠ هذا الرقم مسجّل عندك باسم مورد آخر: «{sameVatOther.name}»</div>
                        )}
                        <button
                          type="button"
                          onClick={() => { openZatcaLookup(v); toast.info("نُسخ الرقم — الصقه في حقل البحث بصفحة الهيئة"); }}
                          className="text-[#0f2a1d] underline underline-offset-2 hover:opacity-70"
                        >
                          التحقق الرسمي من موقع هيئة الزكاة ↗
                        </button>
                      </div>
                    );
                  })()}
                </FormField>
                <FormField label="رقم الفاتورة" extra={conf("invoiceNumber")}>
                  <input
                    value={form.invoiceNumber}
                    onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                    className="border border-[#eceae2] rounded-lg px-3 py-2 w-full font-mono"
                  />
                </FormField>
                <FormField label="رقم أمر الشراء" extra={conf("purchaseOrderNumber")}>
                  <input
                    value={form.purchaseOrderNumber}
                    onChange={(e) => setForm({ ...form, purchaseOrderNumber: e.target.value })}
                    className="border border-[#eceae2] rounded-lg px-3 py-2 w-full"
                  />
                </FormField>
                <FormField label="تاريخ الفاتورة" extra={conf("invoiceDate")}>
                  <input
                    type="date"
                    value={form.invoiceDate}
                    onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                    className="border border-[#eceae2] rounded-lg px-3 py-2 w-full"
                  />
                </FormField>
                <FormField label="تاريخ الاستحقاق" extra={conf("dueDate")}>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="border border-[#eceae2] rounded-lg px-3 py-2 w-full"
                  />
                </FormField>
                <FormField label="العملة" extra={conf("currency")}>
                  <input
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="border border-[#eceae2] rounded-lg px-3 py-2 w-full"
                  />
                </FormField>
                <FormField label="اللغة">
                  <input
                    value={form.language}
                    readOnly
                    className="border border-[#eceae2] rounded-lg px-3 py-2 w-full bg-[#f7f6f0]"
                  />
                </FormField>
              </div>
            </div>

            <div className={`text-xs px-3 py-2 rounded-lg border ${
              supplierMatch
                ? "bg-[#eaf5ee] border-[#c9e6d3] text-[#0f6b3a]"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}>
              {supplierMatch
                ? <>✓ تم ربط المورد الحالي: <strong>{supplierMatch.name}</strong></>
                : (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createSupplier}
                      onChange={(e) => setCreateSupplier(e.target.checked)}
                    />
                    مورد جديد — إنشاء "{form.supplierName || "—"}" تلقائياً
                  </label>
                )}
            </div>

            <div className="rounded-xl border border-[#eceae2] bg-white overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 bg-[#fafaf7] border-b border-[#eceae2]">
                <div className="text-xs font-semibold">البنود المستخرجة ({form.lines.length})</div>
                <button
                  onClick={addLine}
                  className="text-[11px] inline-flex items-center gap-1 px-2 py-1 border border-[#eceae2] rounded hover:bg-white"
                ><Plus className="w-3 h-3" /> إضافة سطر</button>
              </div>
              <div className="max-h-[240px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#faf9f4]">
                    <tr className="text-right">
                      <th className="p-1.5">الوصف</th>
                      <th className="p-1.5 w-14">الكمية</th>
                      <th className="p-1.5 w-20">السعر</th>
                      <th className="p-1.5 w-14">%</th>
                      <th className="p-1.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((l, i) => (
                      <tr key={i} className="border-t border-[#eceae2]">
                        <td className="p-1"><input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} className="w-full border border-[#eceae2] rounded px-1.5 py-1" /></td>
                        <td className="p-1"><input type="number" value={l.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} className="w-full border border-[#eceae2] rounded px-1.5 py-1 text-center" /></td>
                        <td className="p-1"><input type="number" step="0.01" value={l.price} onChange={(e) => updateLine(i, { price: Number(e.target.value) })} className="w-full border border-[#eceae2] rounded px-1.5 py-1 text-center" /></td>
                        <td className="p-1"><input type="number" value={l.tax} onChange={(e) => updateLine(i, { tax: Number(e.target.value) })} className="w-full border border-[#eceae2] rounded px-1.5 py-1 text-center" /></td>
                        <td className="p-1"><button onClick={() => rmLine(i)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                    {form.lines.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-[#0f2a1d]/50">لم يتم اكتشاف بنود — أضف يدوياً</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <TotalField label="المجموع الفرعي" value={form.subtotal} extra={conf("subtotal")}
                onChange={(v) => setForm({ ...form, subtotal: v })} />
              <TotalField label="الخصم" value={form.discount} extra={conf("discount")}
                onChange={(v) => setForm({ ...form, discount: v })} />
              <TotalField label="الشحن" value={form.shipping} extra={conf("shipping")}
                onChange={(v) => setForm({ ...form, shipping: v })} />
              <TotalField label="رسوم أخرى" value={form.otherCharges} extra={conf("otherCharges")}
                onChange={(v) => setForm({ ...form, otherCharges: v })} />
              <TotalField label="ضريبة القيمة المضافة" value={form.vat} extra={conf("vat")}
                onChange={(v) => setForm({ ...form, vat: v })} />
              <TotalField label="الإجمالي الكلي" value={form.grandTotal} extra={conf("grandTotal")}
                onChange={(v) => setForm({ ...form, grandTotal: v })} bold />
            </div>

            <div className="rounded-lg border border-[#eceae2] bg-[#fafaf7] px-4 py-3 text-xs text-[#0f2a1d]/70">
              <div className="font-semibold text-[#0f2a1d] mb-1">ملخص السجل الرقمي</div>
              <div className="grid grid-cols-2 gap-2">
                <div>المورد: <strong>{form.supplierName || "—"}</strong></div>
                <div>رقم الفاتورة: <strong>{form.invoiceNumber || "—"}</strong></div>
                <div>الإجمالي قبل الضريبة: <strong>{Number(form.subtotal || 0).toLocaleString()}</strong></div>
                <div>VAT 15%: <strong>{Number(form.vat || 0).toLocaleString()}</strong></div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#eceae2] bg-[#fafaf7]">
          <div className="text-xs text-[#0f2a1d]/60">
            المستوى العام للثقة: <strong>{averageConfidence(form)}%</strong>
          </div>
          <div className="flex gap-2">
            <OutlineBtn onClick={onClose} disabled={saving}>إلغاء</OutlineBtn>
            <OutlineBtn onClick={() => submit("مسودة")} disabled={saving}>
              حفظ كمسودة
            </OutlineBtn>
            <PrimaryBtn onClick={() => submit("مؤكد")} disabled={saving}>
              <Check className="w-4 h-4" /> {saving ? "جارٍ الحفظ…" : "حفظ واعتماد"}
            </PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function averageConfidence(r: ScanResult): number {
  const vs = Object.values(r.confidence || {}).map(Number).filter((n) => n > 0);
  if (!vs.length) return 0;
  return Math.round(vs.reduce((a, b) => a + b, 0) / vs.length);
}

function FormField({ label, extra, children }: { label: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-[#0f2a1d]/70 flex items-center gap-1.5">
        {label} {extra}
      </span>
      {children}
    </label>
  );
}

function TotalField({
  label, value, onChange, bold, extra,
}: { label: string; value: number; onChange: (v: number) => void; bold?: boolean; extra?: React.ReactNode }) {
  return (
    <label className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[#eceae2] ${bold ? "bg-[#f2f0e8]" : "bg-white"}`}>
      <span className="text-[#0f2a1d]/70 flex items-center gap-1.5">{label} {extra}</span>
      <input
        type="number" step="0.01" value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-24 text-right bg-transparent outline-none tabular-nums ${bold ? "font-bold" : ""}`}
      />
    </label>
  );
}


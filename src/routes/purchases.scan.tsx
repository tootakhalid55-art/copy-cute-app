import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  Upload, Camera, FileText, Loader2, X, Check, AlertTriangle,
  Trash2, Plus, ScanLine, RefreshCw, Download, Eye,
} from "lucide-react";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, EmptyState } from "@/components/haseem/Shell";
import { useCollection, useKV } from "@/lib/haseem/store";
import { scanInvoice, type ScanResult, type ScanLine as SLine } from "@/lib/haseem/scan.functions";

export const Route = createFileRoute("/purchases/scan")({
  head: () => ({ meta: [{ title: "مسح الفواتير بالذكاء الاصطناعي — حسيم" }] }),
  component: ScanPage,
});

const ACCEPT = "application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/tiff,image/heic,image/heif";
const MAX_SIZE = 8 * 1024 * 1024; // 8MB

type Status = "pending" | "scanning" | "review" | "saved" | "error" | "duplicate";
type Job = {
  id: string;
  file: File;
  dataUrl: string;
  status: Status;
  result?: ScanResult;
  error?: string;
  duplicateOf?: string;
  progress?: number;
};

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
  const { items: bills, add: addBill } = useCollection<any>("bills");
  const { items: suppliers, add: addSupplier } = useCollection<any>("suppliers");
  const { items: scanHistory, add: addHistory, remove: removeHistory } = useCollection<any>("invoice-scans");
  const [org] = useKV<{ name: string; taxNumber: string }>("org", {
    name: "شركة كنار الحديثة للمقاولات",
    taxNumber: "312756062700003",
  });

  const [jobs, setJobs] = useState<Job[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const runScan = useCallback(async (job: Job) => {
    updateJob(job.id, { status: "scanning", progress: 10 });
    try {
      const result = await scan({ data: { fileDataUrl: job.dataUrl, filename: job.file.name } });
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
      });
    } catch (e: any) {
      updateJob(job.id, { status: "error", error: e?.message || "فشل المسح", progress: 0 });
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
  }, [runScan]);

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

  const reviewJob = jobs.find((j) => j.id === reviewId) || null;

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
          <div className="px-4 py-3 border-b border-[#eceae2] bg-[#fafaf7] flex items-center justify-between">
            <div className="font-semibold text-sm">قائمة المسح ({jobs.length})</div>
            <button
              onClick={() => setJobs((js) => js.filter((j) => j.status === "scanning"))}
              className="text-xs text-[#0f2a1d]/60 hover:underline"
            >مسح المكتملة</button>
          </div>
          <div className="divide-y divide-[#eceae2]">
            {jobs.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                onReview={() => setReviewId(j.id)}
                onRetry={() => runScan(j)}
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
          onSave={async (payload) => {
            // Find or create supplier
            let supplier = suppliers.find(
              (s: any) => s.name?.trim() === payload.supplierName?.trim()
            );
            if (!supplier && payload.createSupplier) {
              supplier = addSupplier({
                name: payload.supplierName,
                taxNumber: payload.supplierVatNumber,
                currency: payload.currency || "SAR",
                type: "company",
              });
            }
            const bill = addBill({
              ref: payload.invoiceNumber || `BILL-${Math.floor(100000 + Math.random() * 900000)}`,
              supplierRef: payload.invoiceNumber,
              date: payload.invoiceDate || new Date().toISOString().slice(0, 10),
              dueDate: payload.dueDate || payload.invoiceDate || new Date().toISOString().slice(0, 10),
              partyId: supplier?.id || "",
              partyName: supplier?.name || payload.supplierName,
              notes: `تم إنشاؤها بالمسح الذكي · PO: ${payload.purchaseOrderNumber || "—"}`,
              status: "مسودة",
              lines: payload.lines,
              subtotal: payload.subtotal,
              tax: payload.vat,
              total: payload.grandTotal,
              currency: payload.currency,
              attachment: {
                filename: reviewJob.file.name,
                dataUrl: reviewJob.dataUrl,
                mime: reviewJob.file.type,
                size: reviewJob.file.size,
              },
              source: "ai-scan",
            });
            addHistory({
              supplierName: payload.supplierName,
              invoiceNumber: payload.invoiceNumber,
              invoiceDate: payload.invoiceDate,
              grandTotal: payload.grandTotal,
              billId: bill.id,
              originalFilename: reviewJob.file.name,
              originalDataUrl: reviewJob.dataUrl,
              rawText: reviewJob.result?.rawText || "",
              orgName: org.name,
            });
            updateJob(reviewJob.id, { status: "saved" });
            setReviewId(null);
            navigate({ to: "/purchases/bills/$id", params: { id: bill.id } });
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
          {job.result?.supplierName && <span>· {job.result.supplierName}</span>}
          {job.result?.grandTotal ? <span>· {job.result.grandTotal.toLocaleString()} {job.result.currency}</span> : null}
          {job.error && <span className="text-red-600">· {job.error}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {(job.status === "review" || job.status === "duplicate") && (
          <PrimaryBtn onClick={onReview} className="!py-1.5 !px-3 text-xs">
            <Eye className="w-3.5 h-3.5" /> مراجعة
          </PrimaryBtn>
        )}
        {job.status === "error" && (
          <OutlineBtn onClick={onRetry} className="!py-1.5 !px-3 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> إعادة
          </OutlineBtn>
        )}
        {job.status !== "scanning" && (
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
      {status === "scanning" && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === "duplicate" && <AlertTriangle className="w-3 h-3" />}
      {status === "saved" && <Check className="w-3 h-3" />}
      {m.t}
    </span>
  );
}

type ReviewPayload = ScanResult & { createSupplier: boolean };

function ReviewModal({
  job, suppliers, onClose, onSave,
}: {
  job: Job;
  suppliers: any[];
  onClose: () => void;
  onSave: (v: ReviewPayload) => void;
}) {
  const r = job.result!;
  const [form, setForm] = useState<ScanResult>(() => JSON.parse(JSON.stringify(r)));
  const [createSupplier, setCreateSupplier] = useState(true);

  useEffect(() => { setForm(JSON.parse(JSON.stringify(r))); }, [r]);

  const supplierMatch = useMemo(
    () => suppliers.find((s: any) => s.name?.trim() === form.supplierName?.trim()),
    [suppliers, form.supplierName]
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-auto" onClick={onClose}>
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

        <div className="grid md:grid-cols-2 gap-4 p-5">
          {/* Original */}
          <div className="rounded-lg border border-[#eceae2] bg-[#faf9f4] overflow-hidden min-h-[480px] flex flex-col">
            <div className="px-3 py-2 border-b border-[#eceae2] text-xs font-semibold flex items-center justify-between">
              <span>الملف الأصلي</span>
              <a href={job.dataUrl} download={job.file.name}
                className="text-[11px] text-[#0f2a1d]/60 hover:underline">تنزيل</a>
            </div>
            {isPdf
              ? <iframe src={job.dataUrl} title="pdf" className="flex-1 w-full" />
              : <div className="flex-1 overflow-auto bg-white flex items-center justify-center p-2">
                  <img src={job.dataUrl} alt="" className="max-w-full h-auto" />
                </div>}
          </div>

          {/* Extracted form */}
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="اسم المورد" extra={conf("supplierName")}>
                <input
                  value={form.supplierName}
                  onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
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
                  onChange={(e) => setForm({ ...form, supplierVatNumber: e.target.value })}
                  className="border border-[#eceae2] rounded-lg px-3 py-2 w-full font-mono"
                />
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

            {/* Supplier match indicator */}
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

            {/* Lines */}
            <div className="rounded-lg border border-[#eceae2] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-[#fafaf7] border-b border-[#eceae2]">
                <span className="text-xs font-semibold">البنود ({form.lines.length})</span>
                <button
                  onClick={addLine}
                  className="text-[11px] inline-flex items-center gap-1 px-2 py-1 border border-[#eceae2] rounded hover:bg-white"
                ><Plus className="w-3 h-3" /> إضافة سطر</button>
              </div>
              <div className="max-h-[220px] overflow-auto">
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

            {/* Totals */}
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
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#eceae2] bg-[#fafaf7]">
          <div className="text-xs text-[#0f2a1d]/60">
            المستوى العام للثقة: <strong>{averageConfidence(form)}%</strong>
          </div>
          <div className="flex gap-2">
            <OutlineBtn onClick={onClose}>إلغاء</OutlineBtn>
            <PrimaryBtn onClick={() => onSave({ ...form, createSupplier })}>
              <Check className="w-4 h-4" /> إنشاء فاتورة الشراء
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

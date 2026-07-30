import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Inbox, Mail, MessageCircle, Upload, Camera, Link2, Copy, Check,
  FileText, Loader2, AlertTriangle, Eye, Trash2, RefreshCw, Filter,
  Settings as SettingsIcon, Download, Zap,
} from "lucide-react";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, EmptyState } from "@/components/haseem/Shell";
import { useCollection, useKV } from "@/lib/haseem/store";
import { scanInvoice, type ScanResult } from "@/lib/haseem/scan.functions";

export const Route = createFileRoute("/purchases/inbox")({
  head: () => ({ meta: [
    { title: "صندوق المستندات الواردة — كنار المحاسبية" },
    { name: "description", content: "استقبال الفواتير من البريد وواتساب والرفع اليدوي ورابط مشترك" },
  ]}),
  component: InboxPage,
});

type Source = "email" | "whatsapp" | "upload" | "camera" | "link";
type DocStatus = "queued" | "scanning" | "review" | "approved" | "rejected" | "duplicate" | "error";

type IncomingDoc = {
  id: string;
  source: Source;
  from?: string;           // sender email / phone / uploader name
  subject?: string;
  receivedAt: number;
  filename: string;
  mime: string;
  dataUrl: string;
  status: DocStatus;
  result?: ScanResult;
  error?: string;
  billId?: string;
  duplicateOf?: string;
  notes?: string;
};

const ACCEPT = "application/pdf,image/*";
const MAX_SIZE = 8 * 1024 * 1024;

const SOURCE_META: Record<Source, { label: string; icon: any; color: string }> = {
  email:    { label: "البريد الإلكتروني", icon: Mail,          color: "bg-blue-50 text-blue-700" },
  whatsapp: { label: "واتساب",             icon: MessageCircle, color: "bg-green-50 text-green-700" },
  upload:   { label: "رفع يدوي",           icon: Upload,        color: "bg-amber-50 text-amber-700" },
  camera:   { label: "كاميرا الجوال",      icon: Camera,        color: "bg-purple-50 text-purple-700" },
  link:     { label: "رابط مشترك",         icon: Link2,         color: "bg-teal-50 text-teal-700" },
};

const STATUS_META: Record<DocStatus, { label: string; color: string }> = {
  queued:    { label: "قيد الانتظار", color: "bg-gray-100 text-gray-700" },
  scanning:  { label: "جاري المسح",   color: "bg-blue-50 text-blue-700" },
  review:    { label: "بحاجة لمراجعة", color: "bg-amber-50 text-amber-800" },
  approved:  { label: "معتمد",         color: "bg-emerald-50 text-emerald-700" },
  rejected:  { label: "مرفوض",         color: "bg-red-50 text-red-700" },
  duplicate: { label: "مكرر",          color: "bg-orange-50 text-orange-700" },
  error:     { label: "خطأ",           color: "bg-red-50 text-red-700" },
};

function newId() {
  return globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2);
}
function fileToDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}
function fmtTime(t: number) {
  const d = new Date(t);
  return d.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

function InboxPage() {
  const scan = useServerFn(scanInvoice);
  const navigate = useNavigate();
  const { items: docs, add, update, remove } = useCollection<IncomingDoc>("incoming-docs");
  const { items: bills, add: addBill } = useCollection<any>("bills");
  const { items: suppliers, add: addSupplier } = useCollection<any>("suppliers");

  const [settings, setSettings] = useKV("inbox-settings", {
    autoScan: true,
    autoApproveHighConfidence: false,
    shareToken: "",
    emailAlias: "",
    whatsappNumber: "",
  });

  // Generate share token + email alias once
  useEffect(() => {
    if (!settings.shareToken) {
      const tok = Math.random().toString(36).slice(2, 10);
      const alias = "inbox-" + Math.random().toString(36).slice(2, 8);
      setSettings({ ...settings, shareToken: tok, emailAlias: alias });
    }
  }, [settings, setSettings]);

  const [filter, setFilter] = useState<"all" | DocStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | Source>("all");
  const [search, setSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const runScan = useCallback(async (doc: IncomingDoc) => {
    update(doc.id, { status: "scanning" });
    try {
      const result = await scan({ data: { fileDataUrl: doc.dataUrl, filename: doc.filename } });
      const dup = bills.find((b: any) =>
        b.partyName?.trim() === result.supplierName?.trim() &&
        (b.supplierRef || b.ref) === result.invoiceNumber &&
        Math.abs(Number(b.total || 0) - Number(result.grandTotal || 0)) < 0.5
      );
      update(doc.id, {
        result,
        status: dup ? "duplicate" : "review",
        duplicateOf: dup?.id,
      });
    } catch (e: any) {
      update(doc.id, { status: "error", error: e?.message || "فشل المسح" });
    }
  }, [scan, bills, update]);

  const ingestFiles = useCallback(async (files: FileList | File[], source: Source, from?: string) => {
    const arr = Array.from(files);
    for (const f of arr) {
      if (f.size > MAX_SIZE) { alert(`${f.name}: يتجاوز 8MB`); continue; }
      const dataUrl = await fileToDataURL(f);
      const doc: IncomingDoc = {
        id: newId(), source, from, filename: f.name, mime: f.type,
        dataUrl, receivedAt: Date.now(), status: "queued",
      };
      add(doc);
      if (settings.autoScan) queueMicrotask(() => runScan(doc));
    }
  }, [add, runScan, settings.autoScan]);

  // Simulate email + whatsapp intake (demo — persistent queue in localStorage)
  const simulateInbound = useCallback((source: Source) => {
    uploadRef.current?.setAttribute("data-source", source);
    uploadRef.current?.click();
  }, []);

  const filtered = useMemo(() => {
    return docs
      .filter((d) => filter === "all" || d.status === filter)
      .filter((d) => sourceFilter === "all" || d.source === sourceFilter)
      .filter((d) => !search.trim() || [
        d.from, d.subject, d.filename, d.result?.supplierName, d.result?.invoiceNumber,
      ].filter(Boolean).some((v) => String(v).toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.receivedAt - a.receivedAt);
  }, [docs, filter, sourceFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: docs.length };
    for (const d of docs) c[d.status] = (c[d.status] || 0) + 1;
    return c;
  }, [docs]);

  const approve = useCallback((doc: IncomingDoc) => {
    if (!doc.result) return;
    const r = doc.result;
    // Match supplier
    let supplier = suppliers.find((s: any) => s.name?.trim() === r.supplierName?.trim());
    if (!supplier && r.supplierName) {
      supplier = { id: newId(), name: r.supplierName, taxNumber: r.supplierVatNumber || "", type: "supplier" };
      addSupplier(supplier);
    }
    const bill = {
      id: newId(),
      docKind: "bill",
      ref: r.invoiceNumber || `PO-${Date.now()}`,
      supplierRef: r.invoiceNumber,
      date: r.invoiceDate || new Date().toISOString().slice(0, 10),
      partyId: supplier?.id,
      partyName: r.supplierName,
      lines: (r.lines || []).map((l: any) => ({
        id: newId(), description: l.description, qty: l.qty, price: l.unitPrice,
        tax: l.taxRate ?? 15, total: l.total,
      })),
      subtotal: r.subtotal || 0,
      tax: r.vat || 0,
      total: r.grandTotal || 0,
      notes: `مستورد من ${SOURCE_META[doc.source].label}`,
      attachment: { dataUrl: doc.dataUrl, filename: doc.filename },
      createdAt: Date.now(),
    };
    addBill(bill);
    update(doc.id, { status: "approved", billId: bill.id });
    setReviewId(null);
  }, [suppliers, addSupplier, addBill, update]);

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/inbox-upload/${settings.shareToken}`
    : `/inbox-upload/${settings.shareToken}`;
  const emailAddr = `${settings.emailAlias}@inbox.haseem.app`;

  const reviewDoc = docs.find((d) => d.id === reviewId) || null;

  return (
    <Shell>
      <PageHeader
        title="صندوق المستندات الواردة"
        subtitle="استقبل الفواتير تلقائياً من البريد وواتساب ورابط الرفع، وراجعها قبل إنشاء فاتورة الشراء"
        action={
          <div className="flex gap-2">
            <OutlineBtn onClick={() => setShowSettings(true)}>
              <SettingsIcon className="w-4 h-4" /> إعدادات القنوات
            </OutlineBtn>
            <Link to="/purchases/scan">
              <OutlineBtn><Zap className="w-4 h-4" /> المسح المباشر</OutlineBtn>
            </Link>
          </div>
        }
      />

      {/* Intake channels */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(["email","whatsapp","upload","camera","link"] as Source[]).map((s) => {
          const M = SOURCE_META[s]; const Icon = M.icon;
          const count = docs.filter((d) => d.source === s).length;
          return (
            <button
              key={s}
              onClick={() => {
                if (s === "upload") uploadRef.current?.click();
                else if (s === "camera") cameraRef.current?.click();
                else if (s === "link") { navigator.clipboard?.writeText(shareUrl); alert("تم نسخ رابط الرفع"); }
                else if (s === "email") { setShowSettings(true); }
                else if (s === "whatsapp") { setShowSettings(true); }
              }}
              className="rounded-xl bg-white border border-[#eceae2] p-4 text-right hover:border-[#0f2a1d]/30 transition"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${M.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="mt-2 font-semibold text-sm">{M.label}</div>
              <div className="text-xs text-[#0f2a1d]/60 mt-0.5">{count} مستند</div>
            </button>
          );
        })}
      </div>

      <input ref={uploadRef} type="file" accept={ACCEPT} multiple hidden
        onChange={(e) => e.target.files && ingestFiles(e.target.files, "upload", "أنت")} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => e.target.files && ingestFiles(e.target.files, "camera", "الكاميرا")} />

      {/* Filters */}
      <div className="rounded-xl bg-white border border-[#eceae2]">
        <div className="px-4 py-3 border-b border-[#eceae2] flex flex-wrap items-center gap-2">
          <Inbox className="w-4 h-4 text-[#0f2a1d]/60" />
          <div className="font-semibold text-sm">صندوق الوارد ({filtered.length})</div>
          <div className="ms-auto flex flex-wrap gap-2 items-center">
            <select value={filter} onChange={(e) => setFilter(e.target.value as any)}
              className="border border-[#eceae2] rounded-lg px-2 py-1.5 text-sm">
              <option value="all">كل الحالات ({counts.all || 0})</option>
              {Object.entries(STATUS_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label} ({counts[k] || 0})</option>
              ))}
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)}
              className="border border-[#eceae2] rounded-lg px-2 py-1.5 text-sm">
              <option value="all">كل المصادر</option>
              {Object.entries(SOURCE_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث..." className="border border-[#eceae2] rounded-lg px-3 py-1.5 text-sm" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10">
            <EmptyState icon={Inbox} title="لا مستندات في الصندوق"
              description="اربط قناة بريد أو واتساب، أو شارك رابط الرفع مع الموردين لبدء الاستقبال التلقائي." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs">
              <tr className="text-right">
                <th className="p-2.5">المصدر</th>
                <th>من</th>
                <th>الملف</th>
                <th>المورد المستخرج</th>
                <th>الإجمالي</th>
                <th>وصل في</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {filtered.map((d) => {
                const M = SOURCE_META[d.source]; const Icon = M.icon;
                const S = STATUS_META[d.status];
                return (
                  <tr key={d.id} className="text-right hover:bg-[#fafaf7]">
                    <td className="p-2.5">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${M.color}`}>
                        <Icon className="w-3 h-3" />{M.label}
                      </span>
                    </td>
                    <td className="p-2.5">{d.from || "—"}</td>
                    <td className="p-2.5 max-w-[220px] truncate" title={d.filename}>{d.filename}</td>
                    <td className="p-2.5">{d.result?.supplierName || "—"}</td>
                    <td className="p-2.5 tabular-nums">
                      {d.result?.grandTotal ? `${Number(d.result.grandTotal).toLocaleString()} ر.س` : "—"}
                    </td>
                    <td className="p-2.5 text-xs">{fmtTime(d.receivedAt)}</td>
                    <td className="p-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${S.color}`}>
                        {d.status === "scanning" && <Loader2 className="inline w-3 h-3 animate-spin ms-1" />}
                        {S.label}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <div className="flex gap-1 justify-end">
                        {(d.status === "review" || d.status === "duplicate") && (
                          <button onClick={() => setReviewId(d.id)}
                            className="p-1.5 hover:bg-[#f7f6f0] rounded" title="مراجعة">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {d.status === "approved" && d.billId && (
                          <button onClick={() => navigate({ to: "/purchases/bills/$id", params: { id: d.billId! } })}
                            className="p-1.5 hover:bg-[#f7f6f0] rounded" title="فتح الفاتورة">
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(d.status === "error" || d.status === "queued") && (
                          <button onClick={() => runScan(d)} className="p-1.5 hover:bg-[#f7f6f0] rounded" title="إعادة المسح">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <a href={d.dataUrl} download={d.filename} className="p-1.5 hover:bg-[#f7f6f0] rounded" title="تنزيل">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button onClick={() => confirm("حذف المستند؟") && remove(d.id)}
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded" title="حذف">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="font-bold text-lg">إعدادات قنوات الاستقبال</div>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded">✕</button>
            </div>

            <section className="rounded-lg border border-[#eceae2] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-4 h-4 text-blue-700" />
                <div className="font-semibold text-sm">استقبال بالبريد الإلكتروني</div>
              </div>
              <p className="text-xs text-[#0f2a1d]/60 mb-2">
                أعد توجيه فواتير الموردين إلى العنوان أدناه ليتم إدخالها تلقائياً في الصندوق.
              </p>
              <CopyField value={emailAddr} />
            </section>

            <section className="rounded-lg border border-[#eceae2] p-3">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="w-4 h-4 text-green-700" />
                <div className="font-semibold text-sm">استقبال عبر واتساب Business</div>
              </div>
              <label className="text-xs text-[#0f2a1d]/60">رقم واتساب Business</label>
              <input value={settings.whatsappNumber}
                onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })}
                placeholder="+9665XXXXXXXX"
                className="w-full border border-[#eceae2] rounded-lg px-3 py-2 text-sm mt-1" />
              <p className="text-xs text-[#0f2a1d]/60 mt-2">
                عند تفعيل Webhook واتساب، ستدخل المرفقات تلقائياً. للتجربة الآن: أرسل صور الفواتير عبر زر "رفع يدوي".
              </p>
            </section>

            <section className="rounded-lg border border-[#eceae2] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="w-4 h-4 text-teal-700" />
                <div className="font-semibold text-sm">رابط رفع مشترك (للموردين)</div>
              </div>
              <CopyField value={shareUrl} />
              <p className="text-xs text-[#0f2a1d]/60 mt-2">
                شارك هذا الرابط مع مورديك — يستطيعون رفع الفواتير مباشرة دون تسجيل دخول.
              </p>
            </section>

            <section className="rounded-lg border border-[#eceae2] p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.autoScan}
                  onChange={(e) => setSettings({ ...settings, autoScan: e.target.checked })} />
                مسح OCR تلقائياً عند وصول أي مستند
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.autoApproveHighConfidence}
                  onChange={(e) => setSettings({ ...settings, autoApproveHighConfidence: e.target.checked })} />
                اعتماد تلقائي للفواتير عالية الثقة (تجريبي)
              </label>
            </section>

            <div className="flex justify-end">
              <PrimaryBtn onClick={() => setShowSettings(false)}>تم</PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* Review modal */}
      {reviewDoc && (
        <ReviewModal
          doc={reviewDoc}
          onClose={() => setReviewId(null)}
          onApprove={() => approve(reviewDoc)}
          onReject={() => { update(reviewDoc.id, { status: "rejected" }); setReviewId(null); }}
          onRescan={() => runScan(reviewDoc)}
        />
      )}
    </Shell>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input value={value} readOnly className="flex-1 border border-[#eceae2] rounded-lg px-3 py-2 text-sm font-mono ltr:text-left rtl:text-left" style={{ direction: "ltr" }} />
      <button onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="p-2 border border-[#eceae2] rounded-lg hover:bg-[#f7f6f0]">
        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

function ReviewModal({
  doc, onClose, onApprove, onReject, onRescan,
}: {
  doc: IncomingDoc;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRescan: () => void;
}) {
  const r = doc.result;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-[#eceae2] flex items-center justify-between">
          <div>
            <div className="font-bold">مراجعة المستند</div>
            <div className="text-xs text-[#0f2a1d]/60">{doc.filename} — من {doc.from || "—"}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">✕</button>
        </div>
        <div className="flex-1 overflow-auto grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-0">
          <div className="bg-[#f7f6f0] p-3 border-e border-[#eceae2] min-h-[300px]">
            {doc.mime.startsWith("image/") ? (
              <img src={doc.dataUrl} alt="" className="w-full rounded" />
            ) : (
              <iframe src={doc.dataUrl} title="doc" className="w-full h-full min-h-[500px] rounded bg-white" />
            )}
          </div>
          <div className="p-4 space-y-3 text-sm">
            {doc.status === "duplicate" && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-2 text-xs text-orange-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> يبدو مكرراً لفاتورة موجودة بنفس المورد والرقم والإجمالي.
              </div>
            )}
            {!r ? (
              <div className="text-[#0f2a1d]/60">لا توجد بيانات مستخرجة بعد.</div>
            ) : (
              <>
                <div className="rounded-lg border border-[#eceae2] bg-[#fafaf7] p-3">
                  <div className="text-xs font-semibold text-[#0f2a1d]/60 mb-2">السجل الرقمي</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Row label="المورد" value={r.supplierName} />
                    <Row label="الرقم الضريبي" value={r.supplierVatNumber} />
                    <Row label="رقم الفاتورة" value={r.invoiceNumber} />
                    <Row label="التاريخ" value={r.invoiceDate} />
                    <Row label="العملة" value={r.currency} />
                    <Row label="الإجمالي" value={`${r.grandTotal?.toLocaleString()} ر.س`} />
                  </div>
                </div>
                <Row label="المورد" value={r.supplierName} />
                <Row label="الرقم الضريبي" value={r.supplierVatNumber} />
                <Row label="رقم الفاتورة" value={r.invoiceNumber} />
                <Row label="التاريخ" value={r.invoiceDate} />
                <Row label="الإجمالي قبل الضريبة" value={r.subtotal?.toLocaleString()} />
                <Row label="الضريبة" value={r.vat?.toLocaleString()} />
                <Row label="الإجمالي" value={`${r.grandTotal?.toLocaleString()} ر.س`} />
                {r.lines && r.lines.length > 0 && (
                  <div className="border border-[#eceae2] rounded-lg overflow-hidden">
                    <div className="bg-[#faf9f4] px-2 py-1 text-xs font-semibold">البنود ({r.lines.length})</div>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-[#eceae2]">
                        {r.lines.map((l: any, i: number) => (
                          <tr key={i}><td className="p-1.5">{l.description}</td><td className="p-1.5 text-left tabular-nums">{l.total}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[#eceae2] flex justify-between">
          <OutlineBtn onClick={onRescan}><RefreshCw className="w-4 h-4" /> إعادة المسح</OutlineBtn>
          <div className="flex gap-2">
            <button onClick={onReject} className="px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm hover:bg-red-50">رفض</button>
            <PrimaryBtn onClick={onApprove} disabled={!r}><Check className="w-4 h-4" /> اعتماد وإنشاء فاتورة شراء</PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: any }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#eceae2] pb-1">
      <span className="text-[#0f2a1d]/60">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}


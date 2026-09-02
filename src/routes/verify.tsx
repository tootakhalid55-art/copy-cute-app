import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ShieldCheck, ExternalLink } from "lucide-react";
import { verifyDoc } from "@/lib/haseem/docSignature";

type Search = { k?: string; r?: string; t?: string };

// Legacy per-browser HMAC links carry a `k` param; server-verified links
// (the QR printed on documents) carry only r + t.
const LEGACY_KINDS: Record<string, { key: string; titleAr: string }> = {
  quotation: { key: "quotations", titleAr: "عرض سعر" },
  invoice: { key: "invoices", titleAr: "فاتورة ضريبية" },
  "credit-note": { key: "credit-notes", titleAr: "إشعار دائن" },
  "purchase-order": { key: "purchase-orders", titleAr: "أمر شراء" },
  bill: { key: "bills", titleAr: "فاتورة مشتريات" },
};

export const Route = createFileRoute("/verify")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    k: typeof s.k === "string" ? s.k : undefined,
    r: typeof s.r === "string" ? s.r : undefined,
    t: typeof s.t === "string" ? s.t : undefined,
  }),
  head: () => ({
    meta: [
      { title: "التحقق من صحة المستند — كنار المحاسبية" },
      { name: "description", content: "التحقق الآمن من صحة المستندات الصادرة عن نظام كنار المحاسبية." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyPage,
});

const STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  issued: "مُصدر",
  approved: "معتمد",
  posted: "مرحّل",
  paid: "مدفوع",
  partially_paid: "مدفوع جزئياً",
  cancelled: "ملغي",
  archived: "مؤرشف",
};

function fmtMoney(v: unknown, cur?: string) {
  const n = Number(v ?? 0);
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${cur === "SAR" || !cur ? "ر.س" : cur}`;
}

function VerifyPage() {
  const { k, r, t } = Route.useSearch();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "notfound">("loading");
  const [doc, setDoc] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      if (!r || !t) { setStatus("invalid"); return; }

      // Legacy links: per-browser HMAC signature over localStorage data.
      if (k) {
        const info = LEGACY_KINDS[k];
        if (!info) { setStatus("invalid"); return; }
        try {
          const raw = localStorage.getItem(`haseem:${info.key}`);
          const list: any[] = raw ? JSON.parse(raw) : [];
          const found = list.find((d) => String(d.ref) === String(r));
          if (!found) { setStatus("notfound"); return; }
          const ok = await verifyDoc({ kind: k, ref: found.ref, total: Number(found.total) || 0 }, t);
          setDoc({
            kind_ar: info.titleAr, doc_number: found.ref, issue_date: found.date,
            due_date: found.dueDate ?? found.expiry, party_name: found.partyName,
            subtotal: found.subtotal, vat_total: found.tax, grand_total: found.total,
            status: found.status, currency: "SAR", legacy: true,
          });
          setStatus(ok ? "valid" : "invalid");
        } catch { setStatus("invalid"); }
        return;
      }

      // Server verification — works from any device.
      try {
        const res = await fetch(`/api/public/verify?r=${encodeURIComponent(r)}&t=${encodeURIComponent(t)}`);
        if (res.status === 404) { setStatus("notfound"); return; }
        const body = await res.json();
        if (!res.ok || !body?.ok) { setStatus("invalid"); return; }
        setDoc(body);
        setStatus("valid");
      } catch { setStatus("invalid"); }
    })();
  }, [k, r, t]);

  return (
    <div dir="rtl" className="min-h-screen bg-[#f7f6f0] text-[#0f2a1d] flex items-start justify-center py-10 px-4" style={{ fontFamily: 'Cairo, "Segoe UI", Tahoma, sans-serif' }}>
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-6 h-6 text-[#0f2a1d]" />
          <h1 className="text-xl font-bold">التحقق من صحة المستند</h1>
        </div>

        <div className="bg-white border border-[#eceae2] rounded-xl shadow-sm overflow-hidden">
          <div className={`px-6 py-5 flex items-center gap-3 border-b border-[#eceae2] ${
            status === "valid" ? "bg-emerald-50" : status === "loading" ? "bg-slate-50" : status === "notfound" ? "bg-amber-50" : "bg-red-50"
          }`}>
            {status === "loading" && (
              <><div className="w-6 h-6 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
              <div className="font-semibold">جارٍ التحقق…</div></>
            )}
            {status === "valid" && (
              <><CheckCircle2 className="w-7 h-7 text-emerald-600" />
              <div>
                <div className="font-bold text-emerald-800">مستند صحيح وموثَّق</div>
                <div className="text-xs text-emerald-700/80">تطابق رمز التحقق مع سجل المستند في النظام.</div>
              </div></>
            )}
            {status === "invalid" && (
              <><XCircle className="w-7 h-7 text-red-600" />
              <div>
                <div className="font-bold text-red-800">رمز تحقق غير صالح</div>
                <div className="text-xs text-red-700/80">لا يمكن التحقق من صحة هذا المستند. قد يكون معدلاً أو صادراً من نظام آخر.</div>
              </div></>
            )}
            {status === "notfound" && (
              <><XCircle className="w-7 h-7 text-amber-600" />
              <div>
                <div className="font-bold text-amber-800">المستند غير موجود</div>
                <div className="text-xs text-amber-700/80">لم يُعثر على مستند مطابق لهذا الرقم ورمز التحقق.</div>
              </div></>
            )}
          </div>

          <div className="p-6 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <Field label="نوع المستند" value={doc?.kind_ar ?? "—"} />
              <Field label="الرقم المرجعي" value={r ?? "—"} />
              <Field label="المنشأة المُصدِرة" value={doc?.org_name ?? "—"} />
              <Field label="الرقم الضريبي" value={doc?.org_vat ?? "—"} />
            </div>

            {doc && (
              <>
                <div className="h-px bg-[#eceae2]" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="تاريخ الإصدار" value={doc.issue_date || "—"} />
                  <Field label="الصلاحية / الاستحقاق" value={doc.due_date || "—"} />
                  <Field label="العميل / المورد" value={doc.party_name || "—"} />
                  <Field label="الحالة" value={STATUS_AR[doc.status] ?? doc.status ?? "—"} />
                  <Field label="المجموع قبل الضريبة" value={fmtMoney(doc.subtotal, doc.currency)} />
                  <Field label="ضريبة القيمة المضافة" value={fmtMoney(doc.vat_total, doc.currency)} />
                  <Field label="الإجمالي" value={fmtMoney(doc.grand_total, doc.currency)} highlight />
                </div>
              </>
            )}

            <div className="pt-2">
              <Link to="/" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#eceae2] text-xs hover:bg-[#f7f6f0]">
                <ExternalLink className="w-4 h-4" /> الصفحة الرئيسية
              </Link>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-[#0f2a1d]/50 mt-4 text-center">
          يتم التحقق مباشرة من سجلات النظام عبر رمز فريد مطبوع على المستند.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-[#0f2a1d]/50 mb-0.5">{label}</div>
      <div className={highlight ? "font-bold text-base" : "font-medium"}>{value}</div>
    </div>
  );
}

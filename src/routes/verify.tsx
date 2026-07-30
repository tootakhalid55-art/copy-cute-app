import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ShieldCheck, FileText, ExternalLink } from "lucide-react";
import { verifyDoc } from "@/lib/haseem/docSignature";

type Search = { k?: string; r?: string; t?: string };

const KIND_TO_COLLECTION: Record<string, { key: string; label: string; titleAr: string; route: string }> = {
  quotation:     { key: "quotations",   label: "Quotation",   titleAr: "عرض سعر",       route: "/sales/quotations" },
  invoice:       { key: "invoices",     label: "Invoice",     titleAr: "فاتورة ضريبية",  route: "/sales/invoices" },
  "credit-note": { key: "credit-notes", label: "Credit Note", titleAr: "إشعار دائن",     route: "/sales/credit-notes" },
  "purchase-order":{ key: "purchase-orders", label: "Purchase Order", titleAr: "أمر شراء", route: "/purchases/purchase-orders" },
  bill:          { key: "bills",        label: "Bill",        titleAr: "فاتورة مشتريات",  route: "/purchases/bills" },
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

function VerifyPage() {
  const { k, r, t } = Route.useSearch();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "notfound">("loading");
  const [doc, setDoc] = useState<any | null>(null);
  const info = k ? KIND_TO_COLLECTION[k] : undefined;

  useEffect(() => {
    (async () => {
      if (!k || !r || !t || !info) { setStatus("invalid"); return; }
      try {
        const raw = localStorage.getItem(`haseem:${info.key}`);
        const list: any[] = raw ? JSON.parse(raw) : [];
        const found = list.find((d) => String(d.ref) === String(r));
        if (!found) { setStatus("notfound"); return; }
        setDoc(found);
        const ok = await verifyDoc({ kind: k, ref: found.ref, total: Number(found.total) || 0 }, t);
        setStatus(ok ? "valid" : "invalid");
      } catch {
        setStatus("invalid");
      }
    })();
  }, [k, r, t, info]);

  const [org] = useState<{ name: string; taxNumber: string }>(() => {
    try { return JSON.parse(localStorage.getItem("haseem:kv:org") || "null") ?? { name: "المنشأة", taxNumber: "" }; }
    catch { return { name: "المنشأة", taxNumber: "" }; }
  });

  return (
    <div dir="rtl" className="min-h-screen bg-[#f7f6f0] text-[#0f2a1d] flex items-start justify-center py-10 px-4" style={{ fontFamily: 'Cairo, "Segoe UI", Tahoma, sans-serif' }}>
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-6 h-6 text-[#0f2a1d]" />
          <h1 className="text-xl font-bold">التحقق من صحة المستند</h1>
        </div>

        <div className="bg-white border border-[#eceae2] rounded-xl shadow-sm overflow-hidden">
          <div className={`px-6 py-5 flex items-center gap-3 border-b border-[#eceae2] ${
            status === "valid" ? "bg-emerald-50" : status === "loading" ? "bg-slate-50" : "bg-red-50"
          }`}>
            {status === "loading" && (
              <><div className="w-6 h-6 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
              <div className="font-semibold">جارٍ التحقق…</div></>
            )}
            {status === "valid" && (
              <><CheckCircle2 className="w-7 h-7 text-emerald-600" />
              <div>
                <div className="font-bold text-emerald-800">مستند صحيح وموثَّق</div>
                <div className="text-xs text-emerald-700/80">تم التحقق من التوقيع الرقمي بنجاح.</div>
              </div></>
            )}
            {status === "invalid" && (
              <><XCircle className="w-7 h-7 text-red-600" />
              <div>
                <div className="font-bold text-red-800">توقيع غير صالح</div>
                <div className="text-xs text-red-700/80">لا يمكن التحقق من صحة هذا المستند. قد يكون معدلاً أو صادراً من نظام آخر.</div>
              </div></>
            )}
            {status === "notfound" && (
              <><XCircle className="w-7 h-7 text-amber-600" />
              <div>
                <div className="font-bold text-amber-800">المستند غير موجود</div>
                <div className="text-xs text-amber-700/80">لم يتم العثور على مستند بهذا الرقم في هذا المتصفح.</div>
              </div></>
            )}
          </div>

          <div className="p-6 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <Field label="نوع المستند" value={info?.titleAr ?? k ?? "—"} />
              <Field label="الرقم المرجعي" value={r ?? "—"} />
              <Field label="المنشأة" value={org.name} />
              <Field label="الرقم الضريبي" value={org.taxNumber || "—"} />
            </div>

            {doc && (
              <>
                <div className="h-px bg-[#eceae2]" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="التاريخ" value={doc.date || "—"} />
                  <Field label={info?.key === "quotations" ? "الصلاحية" : "الاستحقاق"} value={doc.expiry || doc.dueDate || "—"} />
                  <Field label="العميل / المورد" value={doc.partyName || "—"} />
                  <Field label="عدد البنود" value={String(doc.lines?.length ?? 0)} />
                  <Field label="المجموع الفرعي" value={fmtMoney(doc.subtotal, doc.currency)} />
                  <Field label="الضريبة" value={fmtMoney(doc.tax, doc.currency)} />
                  <Field label="الإجمالي" value={fmtMoney(doc.total, doc.currency)} highlight />
                  <Field label="الحالة" value={doc.status || "—"} />
                </div>

                {info && (
                  <div className="pt-2 flex flex-wrap gap-2">
                    <Link
                      to={`${info.route}/$id` as any}
                      params={{ id: doc.id } as any}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0f2a1d] text-white text-xs hover:opacity-90"
                    >
                      <FileText className="w-4 h-4" /> فتح المستند الأصلي
                    </Link>
                    <Link
                      to="/"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#eceae2] text-xs hover:bg-[#f7f6f0]"
                    >
                      <ExternalLink className="w-4 h-4" /> الصفحة الرئيسية
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <p className="text-[11px] text-[#0f2a1d]/50 mt-4 text-center">
          يتم التوقيع باستخدام HMAC-SHA256 محلي داخل المتصفح لأغراض العرض التوضيحي.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-[#0f2a1d]/60 mb-1">{label}</div>
      <div className={`text-sm ${highlight ? "font-bold text-[#0f2a1d]" : ""}`}>{value}</div>
    </div>
  );
}

function fmtMoney(n: unknown, currency?: string) {
  const num = Number(n) || 0;
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "AED" ? "د.إ" : "ر.س";
  return `${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
}


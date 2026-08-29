import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, money } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { getZatcaConfig, updateZatcaConfig, listZatcaInvoices, generateZatcaInvoice } from "@/lib/zatca/zatca.functions";
import { Download, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/settings/zatca")({
  head: () => ({ meta: [{ title: "الفوترة الإلكترونية ZATCA — كنار المحاسبية" }] }),
  component: ZatcaPage,
});

function ZatcaPage() {
  const { currentOrgId } = useOrg();
  const getCfg = useServerFn(getZatcaConfig);
  const saveCfg = useServerFn(updateZatcaConfig);
  const listInv = useServerFn(listZatcaInvoices);
  const [cfg, setCfg] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentOrgId) return;
    getCfg({ data: { orgId: currentOrgId } }).then(setCfg).catch(() => setCfg({}));
    listInv({ data: { orgId: currentOrgId } }).then((r: any) => setRows(r ?? [])).catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId]);

  const save = async () => {
    if (!currentOrgId || !cfg) return;
    setBusy(true);
    try {
      await saveCfg({ data: { orgId: currentOrgId, config: cfg } });
      toast.success("حُفظت إعدادات الفوترة الإلكترونية");
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الحفظ");
    } finally {
      setBusy(false);
    }
  };

  const field = (key: string, label: string, placeholder = "") => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs">{label}</span>
      <input
        value={cfg?.[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) => setCfg((c: any) => ({ ...c, [key]: e.target.value }))}
        className="border border-[#eceae2] rounded-lg px-3 py-2"
      />
    </label>
  );

  return (
    <Shell>
      <PageHeader
        title="الفوترة الإلكترونية (ZATCA المرحلة الثانية)"
        subtitle="سلسلة الفواتير الإلكترونية: العداد ICV، وسلسلة التجزئة PIH، وملفات UBL XML"
      />

      <div className="rounded-xl border border-[#dbeafe] bg-[#f3f9fe] p-4 text-xs leading-relaxed">
        <div className="flex items-center gap-2 font-semibold text-[#1b6ea8] mb-1"><ShieldCheck className="w-4 h-4" /> حالة الربط مع منصة فاتورة</div>
        يولّد النظام حالياً فواتير UBL 2.1 كاملة بسلسلة ICV/PIH ورمز QR للمرحلة الثانية. الربط المباشر (الاعتماد والإبلاغ)
        يتطلب شهادات CSID من بوابة فاتورة — بعد حصولك عليها يُفعَّل التوقيع والإرسال في مرحلة النشر.
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-5 space-y-4">
        <h3 className="font-semibold text-sm">بيانات البائع (تظهر في XML وفي رمز QR)</h3>
        {cfg && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {field("sellerName", "اسم المنشأة القانوني")}
              {field("vatNumber", "الرقم الضريبي (15 رقماً)", "3XXXXXXXXXXXXX3")}
              {field("crNumber", "السجل التجاري")}
              {field("street", "الشارع")}
              {field("building", "رقم المبنى")}
              {field("district", "الحي")}
              {field("city", "المدينة")}
              {field("postalCode", "الرمز البريدي")}
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs">نوع الفوترة</span>
                <select
                  value={cfg?.invoiceType ?? "simplified"}
                  onChange={(e) => setCfg((c: any) => ({ ...c, invoiceType: e.target.value }))}
                  className="border border-[#eceae2] rounded-lg px-3 py-2"
                >
                  <option value="simplified">مبسطة (B2C)</option>
                  <option value="standard">ضريبية قياسية (B2B)</option>
                </select>
              </label>
            </div>
            <PrimaryBtn onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ الإعدادات"}</PrimaryBtn>
          </>
        )}
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#eceae2] bg-[#fafaf7] text-sm font-semibold">سجل الفواتير الإلكترونية</div>
        {rows.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#0f2a1d]/50">
            لم تُولَّد فواتير إلكترونية بعد — استخدم زر XML بجانب الفاتورة المرحّلة في قائمة فواتير المبيعات.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f7f6f0] text-xs">
              <tr className="text-right">
                <th className="p-2.5">ICV</th><th>الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th><th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {rows.map((r) => (
                <tr key={r.id} className="text-right">
                  <td className="p-2.5 font-mono">{r.icv}</td>
                  <td className="p-2.5">{r.documents?.doc_number}</td>
                  <td className="p-2.5">{r.documents?.issue_date}</td>
                  <td className="p-2.5 tabular-nums">{money(Number(r.documents?.grand_total ?? 0))}</td>
                  <td className="p-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded ${r.status === "cleared" || r.status === "reported" ? "bg-[#eaf5ee] text-[#0f6b3a]" : r.status === "failed" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                      {r.status === "generated" ? "مولّدة" : r.status === "reported" ? "مُبلَّغة" : r.status === "cleared" ? "معتمدة" : "فشلت"}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <ZatcaDownload documentId={r.document_id} docNumber={r.documents?.doc_number} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

function ZatcaDownload({ documentId, docNumber }: { documentId: string; docNumber?: string }) {
  const { currentOrgId } = useOrg();
  const gen = useServerFn(generateZatcaInvoice);
  const [busy, setBusy] = useState(false);
  return (
    <OutlineBtn
      disabled={busy}
      onClick={async () => {
        if (!currentOrgId) return;
        setBusy(true);
        try {
          const res: any = await gen({ data: { orgId: currentOrgId, documentId } });
          const blob = new Blob([res.xml], { type: "application/xml" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${docNumber ?? "invoice"}.xml`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (e: any) {
          toast.error(e?.message ?? "فشل التوليد");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="w-3.5 h-3.5" /> XML
    </OutlineBtn>
  );
}

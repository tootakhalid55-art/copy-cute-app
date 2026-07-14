import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/reports/vat-return")({
  head: () => ({ meta: [{ title: "إقرار ضريبة القيمة المضافة — حسيم" }] }),
  component: VAT,
});

function VAT() {
  const { items: invoices } = useCollection<any>("invoices");
  const { items: bills } = useCollection<any>("bills");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);
  const inR = (d: string) => (!from || d >= from) && (!to || d <= to);
  const salesNet = invoices.filter((i) => inR(i.date)).reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const salesVat = invoices.filter((i) => inR(i.date)).reduce((s, i) => s + Number(i.tax || 0), 0);
  const purchaseNet = bills.filter((b) => inR(b.date)).reduce((s, b) => s + Number(b.subtotal || 0), 0);
  const purchaseVat = bills.filter((b) => inR(b.date)).reduce((s, b) => s + Number(b.tax || 0), 0);
  const net = salesVat - purchaseVat;
  return (
    <ReportShell title="إقرار ضريبة القيمة المضافة" subtitle="ملخص الإقرار الضريبي حسب هيئة الزكاة"
      filters={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}
      exportRows={() => ({ headers: ["البند", "القيمة"], rows: [["مبيعات خاضعة", salesNet], ["ضريبة مخرجات", salesVat], ["مشتريات خاضعة", purchaseNet], ["ضريبة مدخلات", purchaseVat], ["صافي الضريبة", net]] })}>
      <ReportTable headers={["البند", "الوعاء", "الضريبة"]}
        rows={[["المبيعات الخاضعة للضريبة (15%)", money(salesNet), money(salesVat)],
          ["المشتريات الخاضعة للضريبة (15%)", money(purchaseNet), money(purchaseVat)]]}
        totalsRow={["صافي الضريبة المستحقة", "", <strong key="n" className={net >= 0 ? "text-red-600" : "text-[#0f6b3a]"}>{money(net)}</strong>]} />
      <div className="text-xs text-[#0f2a1d]/60">{net >= 0 ? "يجب سداد صافي الضريبة للهيئة." : "لديك رصيد مسترد لصالحك."}</div>
    </ReportShell>
  );
}

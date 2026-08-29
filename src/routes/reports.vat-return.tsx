import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/reports/vat-return")({
  head: () => ({ meta: [{ title: "إقرار ضريبة القيمة المضافة — كنار المحاسبية" }] }),
  component: VAT,
});

// Only documents that actually hit the ledger count toward the VAT return.
const COUNTED = new Set(["مرحل", "مؤكد", "مدفوع", "مدفوع جزئياً", "مؤرشف"]);

function VAT() {
  const { items: invoices } = useCollection<any>("invoices");
  const { items: bills } = useCollection<any>("bills");
  const { items: creditNotes } = useCollection<any>("credit-notes");
  const { items: debitNotes } = useCollection<any>("debit-notes");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);
  const inR = (d: string) => (!from || d >= from) && (!to || d <= to);
  const counted = (rows: any[]) => rows.filter((r) => inR(r.date) && COUNTED.has(String(r.status)));
  const sum = (rows: any[], f: string) => rows.reduce((s, r) => s + Number(r[f] || 0), 0);
  const inv = counted(invoices);
  const cns = counted(creditNotes);
  const bls = counted(bills);
  const dns = counted(debitNotes);
  // Credit notes reduce output VAT; debit notes reduce input VAT.
  const salesNet = sum(inv, "subtotal") - sum(cns, "subtotal");
  const salesVat = sum(inv, "tax") - sum(cns, "tax");
  const purchaseNet = sum(bls, "subtotal") - sum(dns, "subtotal");
  const purchaseVat = sum(bls, "tax") - sum(dns, "tax");
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


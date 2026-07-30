import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/dashboard/cash-flow")({
  head: () => ({ meta: [{ title: "التدفق النقدي — كنار المحاسبية" }] }),
  component: CFPage,
});

function CFPage() {
  const { items: receipts } = useCollection<any>("receipts");
  const { items: payments } = useCollection<any>("payments");
  const { items: expenses } = useCollection<any>("expenses");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);
  const inR = (d: string) => (!from || d >= from) && (!to || d <= to);

  const cashIn = useMemo(() => receipts.filter((r) => inR(r.date)).reduce((s, r) => s + Number(r.amount || 0), 0), [receipts, from, to]);
  const cashOutPay = useMemo(() => payments.filter((p) => inR(p.date)).reduce((s, p) => s + Number(p.amount || 0), 0), [payments, from, to]);
  const cashOutExp = useMemo(() => expenses.filter((e) => inR(e.date)).reduce((s, e) => s + Number(e.amount || 0), 0), [expenses, from, to]);
  const cashOut = cashOutPay + cashOutExp;
  const net = cashIn - cashOut;

  return (
    <ReportShell
      title="التدفق النقدي"
      subtitle="حركة النقد الداخل والخارج"
      filters={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}
      exportRows={() => ({
        headers: ["البند", "القيمة"],
        rows: [["سندات القبض", cashIn], ["سندات الصرف", -cashOutPay], ["المصروفات", -cashOutExp], ["صافي التدفق", net]],
      })}
    >
      <ReportTable
        headers={["البند", "القيمة"]}
        rows={[
          ["إجمالي المقبوضات", money(cashIn)],
          ["سندات الصرف", `(${money(cashOutPay)})`],
          ["المصروفات المدفوعة", `(${money(cashOutExp)})`],
        ]}
        totalsRow={["صافي التدفق النقدي", <span key="n" className={net >= 0 ? "text-[#0f6b3a]" : "text-red-600"}>{money(net)}</span>]}
      />
    </ReportShell>
  );
}


import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/dashboard/profit-and-loss")({
  head: () => ({ meta: [{ title: "الأرباح والخسائر — حسيم" }] }),
  component: PLPage,
});

function PLPage() {
  const { items: invoices } = useCollection<any>("invoices");
  const { items: bills } = useCollection<any>("bills");
  const { items: expenses } = useCollection<any>("expenses");
  const { items: credits } = useCollection<any>("credit-notes");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);

  const rev = useMemo(() => invoices.filter((i) => inRange(i.date)).reduce((s, i) => s + Number(i.subtotal || 0), 0), [invoices, from, to]);
  const returns = useMemo(() => credits.filter((c) => inRange(c.date)).reduce((s, c) => s + Number(c.subtotal || 0), 0), [credits, from, to]);
  const cogs = useMemo(() => bills.filter((b) => inRange(b.date)).reduce((s, b) => s + Number(b.subtotal || 0), 0), [bills, from, to]);
  const opex = useMemo(() => expenses.filter((e) => inRange(e.date)).reduce((s, e) => s + Number(e.amount || 0), 0), [expenses, from, to]);
  const netRev = rev - returns;
  const gross = netRev - cogs;
  const net = gross - opex;

  return (
    <ReportShell
      title="قائمة الأرباح والخسائر"
      subtitle="الإيرادات مقابل التكاليف والمصروفات خلال الفترة"
      filters={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}
      exportRows={() => ({
        headers: ["البند", "القيمة"],
        rows: [
          ["إيرادات المبيعات", rev],
          ["مردودات المبيعات", -returns],
          ["صافي الإيرادات", netRev],
          ["تكلفة البضاعة المباعة", -cogs],
          ["مجمل الربح", gross],
          ["المصروفات التشغيلية", -opex],
          ["صافي الربح", net],
        ],
      })}
    >
      <ReportTable
        headers={["البند", "القيمة"]}
        rows={[
          ["إيرادات المبيعات", money(rev)],
          ["مردودات (إشعارات دائنة)", `(${money(returns)})`],
          [<strong key="a">صافي الإيرادات</strong>, <strong key="b">{money(netRev)}</strong>],
          ["تكلفة البضاعة المباعة", `(${money(cogs)})`],
          [<strong key="c">مجمل الربح</strong>, <strong key="d">{money(gross)}</strong>],
          ["المصروفات التشغيلية", `(${money(opex)})`],
        ]}
        totalsRow={["صافي الربح", <span key="net" className={net >= 0 ? "text-[#0f6b3a]" : "text-red-600"}>{money(net)}</span>]}
      />
    </ReportShell>
  );
}

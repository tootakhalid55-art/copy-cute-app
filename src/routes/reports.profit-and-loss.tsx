import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/reports/profit-and-loss")({
  head: () => ({ meta: [{ title: "قائمة الدخل — حسيم" }] }),
  component: PL,
});

function PL() {
  const { items: invoices } = useCollection<any>("invoices");
  const { items: bills } = useCollection<any>("bills");
  const { items: expenses } = useCollection<any>("expenses");
  const { items: credits } = useCollection<any>("credit-notes");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);
  const inR = (d: string) => (!from || d >= from) && (!to || d <= to);
  const rev = invoices.filter((i) => inR(i.date)).reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const ret = credits.filter((c) => inR(c.date)).reduce((s, c) => s + Number(c.subtotal || 0), 0);
  const cogs = bills.filter((b) => inR(b.date)).reduce((s, b) => s + Number(b.subtotal || 0), 0);
  const opex = expenses.filter((e) => inR(e.date)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const netRev = rev - ret;
  const net = netRev - cogs - opex;
  return (
    <ReportShell title="قائمة الدخل" subtitle="الأرباح والخسائر" filters={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}
      exportRows={() => ({ headers: ["البند", "القيمة"], rows: [["الإيرادات", rev], ["المردودات", -ret], ["التكلفة", -cogs], ["المصروفات", -opex], ["صافي الربح", net]] })}>
      <ReportTable headers={["البند", "القيمة"]}
        rows={[["إيرادات المبيعات", money(rev)], ["مردودات المبيعات", `(${money(ret)})`],
          [<strong key="a">صافي الإيرادات</strong>, <strong key="b">{money(netRev)}</strong>],
          ["تكلفة البضاعة المباعة", `(${money(cogs)})`],
          ["المصروفات التشغيلية", `(${money(opex)})`]]}
        totalsRow={["صافي الربح", <span key="n" className={net >= 0 ? "text-[#0f6b3a]" : "text-red-600"}>{money(net)}</span>]} />
    </ReportShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/reports/sales-by-customer")({
  head: () => ({ meta: [{ title: "المبيعات حسب العميل — كنار المحاسبية" }] }),
  component: R,
});

function R() {
  const { items: invoices } = useCollection<any>("invoices");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);
  const inR = (d: string) => (!from || d >= from) && (!to || d <= to);
  const map = useMemo(() => {
    const m: Record<string, { count: number; total: number; tax: number }> = {};
    invoices.filter((i) => inR(i.date)).forEach((i) => {
      const k = i.partyName || "—";
      m[k] ??= { count: 0, total: 0, tax: 0 };
      m[k].count += 1;
      m[k].total += Number(i.total || 0);
      m[k].tax += Number(i.tax || 0);
    });
    return m;
  }, [invoices, from, to]);
  const rows = Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  const total = rows.reduce((s, [, v]) => s + v.total, 0);
  return (
    <ReportShell title="المبيعات حسب العميل" filters={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}
      exportRows={() => ({ headers: ["العميل", "عدد الفواتير", "الإجمالي", "الضريبة"], rows: rows.map(([k, v]) => [k, v.count, v.total, v.tax]) })}>
      <ReportTable headers={["العميل", "عدد الفواتير", "الضريبة", "الإجمالي"]}
        rows={rows.map(([k, v]) => [k, v.count, money(v.tax), money(v.total)])}
        totalsRow={["الإجمالي", rows.reduce((s, [, v]) => s + v.count, 0), "", money(total)]} />
    </ReportShell>
  );
}


import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/reports/purchases-by-supplier")({
  head: () => ({ meta: [{ title: "المشتريات حسب المورد — كنار المحاسبية" }] }),
  component: R,
});

function R() {
  const { items: bills } = useCollection<any>("bills");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);
  const inR = (d: string) => (!from || d >= from) && (!to || d <= to);
  const map = useMemo(() => {
    const m: Record<string, { count: number; total: number }> = {};
    bills.filter((b) => inR(b.date)).forEach((b) => {
      const k = b.partyName || "—";
      m[k] ??= { count: 0, total: 0 };
      m[k].count += 1; m[k].total += Number(b.total || 0);
    });
    return m;
  }, [bills, from, to]);
  const rows = Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  const total = rows.reduce((s, [, v]) => s + v.total, 0);
  return (
    <ReportShell title="المشتريات حسب المورد" filters={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}
      exportRows={() => ({ headers: ["المورد", "عدد الفواتير", "الإجمالي"], rows: rows.map(([k, v]) => [k, v.count, v.total]) })}>
      <ReportTable headers={["المورد", "عدد الفواتير", "الإجمالي"]}
        rows={rows.map(([k, v]) => [k, v.count, money(v.total)])}
        totalsRow={["الإجمالي", rows.reduce((s, [, v]) => s + v.count, 0), money(total)]} />
    </ReportShell>
  );
}


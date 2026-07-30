import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/reports/sales-by-item")({
  head: () => ({ meta: [{ title: "المبيعات حسب الصنف — كنار المحاسبية" }] }),
  component: R,
});

function R() {
  const { items: invoices } = useCollection<any>("invoices");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);
  const inR = (d: string) => (!from || d >= from) && (!to || d <= to);
  const map = useMemo(() => {
    const m: Record<string, { qty: number; total: number }> = {};
    invoices.filter((i) => inR(i.date)).forEach((i) => {
      (i.lines || []).forEach((l: any) => {
        const k = l.description || "—";
        m[k] ??= { qty: 0, total: 0 };
        m[k].qty += Number(l.qty || 0);
        m[k].total += Number(l.qty || 0) * Number(l.price || 0);
      });
    });
    return m;
  }, [invoices, from, to]);
  const rows = Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  const total = rows.reduce((s, [, v]) => s + v.total, 0);
  return (
    <ReportShell title="المبيعات حسب الصنف" filters={<DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}
      exportRows={() => ({ headers: ["الصنف", "الكمية", "الإجمالي"], rows: rows.map(([k, v]) => [k, v.qty, v.total]) })}>
      <ReportTable headers={["الصنف", "الكمية", "الإجمالي"]}
        rows={rows.map(([k, v]) => [k, v.qty, money(v.total)])}
        totalsRow={["الإجمالي", rows.reduce((s, [, v]) => s + v.qty, 0), money(total)]} />
    </ReportShell>
  );
}


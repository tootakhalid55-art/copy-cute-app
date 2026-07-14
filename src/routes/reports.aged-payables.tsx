import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/reports/aged-payables")({
  head: () => ({ meta: [{ title: "أعمار الذمم الدائنة — حسيم" }] }),
  component: Aged,
});

function Aged() {
  const { items: bills } = useCollection<any>("bills");
  const { items: payments } = useCollection<any>("payments");
  const rows = useMemo(() => {
    const today = new Date();
    const buckets: Record<string, { name: string; a: number; b: number; c: number; d: number; e: number; total: number }> = {};
    bills.forEach((i) => {
      const name = i.partyName || "—";
      const out = Number(i.total || 0);
      const age = Math.floor((today.getTime() - new Date(i.date).getTime()) / 86400000);
      const rec = buckets[name] ??= { name, a: 0, b: 0, c: 0, d: 0, e: 0, total: 0 };
      if (age <= 30) rec.a += out;
      else if (age <= 60) rec.b += out;
      else if (age <= 90) rec.c += out;
      else if (age <= 120) rec.d += out;
      else rec.e += out;
      rec.total += out;
    });
    payments.forEach((p) => {
      const rec = Object.values(buckets).find((b) => b.name === p.supplier);
      if (rec) rec.total -= Number(p.amount || 0);
    });
    return Object.values(buckets).filter((r) => r.total > 0.01);
  }, [bills, payments]);
  const t = rows.reduce((s, r) => ({ a: s.a + r.a, b: s.b + r.b, c: s.c + r.c, d: s.d + r.d, e: s.e + r.e, total: s.total + r.total }), { a: 0, b: 0, c: 0, d: 0, e: 0, total: 0 });
  return (
    <ReportShell title="أعمار الذمم الدائنة" subtitle="المستحقات للموردين"
      exportRows={() => ({ headers: ["المورد", "0-30", "31-60", "61-90", "91-120", ">120", "الإجمالي"], rows: rows.map((r) => [r.name, r.a, r.b, r.c, r.d, r.e, r.total]) })}>
      <ReportTable headers={["المورد", "0-30 يوم", "31-60", "61-90", "91-120", "أكثر من 120", "الإجمالي"]}
        rows={rows.map((r) => [r.name, money(r.a), money(r.b), money(r.c), money(r.d), money(r.e), <strong key="t">{money(r.total)}</strong>])}
        totalsRow={["الإجمالي", money(t.a), money(t.b), money(t.c), money(t.d), money(t.e), money(t.total)]} />
    </ReportShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/reports/aged-receivables")({
  head: () => ({ meta: [{ title: "أعمار الذمم المدينة — حسيم" }] }),
  component: Aged,
});

function Aged() {
  const { items: invoices } = useCollection<any>("invoices");
  const { items: receipts } = useCollection<any>("receipts");
  const rows = useMemo(() => {
    const today = new Date();
    const buckets: Record<string, { name: string; a: number; b: number; c: number; d: number; e: number; total: number }> = {};
    invoices.forEach((i) => {
      const name = i.partyName || "—";
      const outstanding = Number(i.total || 0);
      const age = Math.floor((today.getTime() - new Date(i.date).getTime()) / (86400000));
      const rec = buckets[name] ??= { name, a: 0, b: 0, c: 0, d: 0, e: 0, total: 0 };
      if (age <= 30) rec.a += outstanding;
      else if (age <= 60) rec.b += outstanding;
      else if (age <= 90) rec.c += outstanding;
      else if (age <= 120) rec.d += outstanding;
      else rec.e += outstanding;
      rec.total += outstanding;
    });
    // subtract receipts naively per customer name
    receipts.forEach((r) => {
      const rec = Object.values(buckets).find((b) => b.name === r.customer);
      if (rec) rec.total -= Number(r.amount || 0);
    });
    return Object.values(buckets).filter((r) => r.total > 0.01);
  }, [invoices, receipts]);
  const t = rows.reduce((s, r) => ({ a: s.a + r.a, b: s.b + r.b, c: s.c + r.c, d: s.d + r.d, e: s.e + r.e, total: s.total + r.total }), { a: 0, b: 0, c: 0, d: 0, e: 0, total: 0 });
  return (
    <ReportShell title="أعمار الذمم المدينة" subtitle="تحليل المستحقات على العملاء"
      exportRows={() => ({ headers: ["العميل", "0-30", "31-60", "61-90", "91-120", ">120", "الإجمالي"], rows: rows.map((r) => [r.name, r.a, r.b, r.c, r.d, r.e, r.total]) })}>
      <ReportTable headers={["العميل", "0-30 يوم", "31-60", "61-90", "91-120", "أكثر من 120", "الإجمالي"]}
        rows={rows.map((r) => [r.name, money(r.a), money(r.b), money(r.c), money(r.d), money(r.e), <strong key="t">{money(r.total)}</strong>])}
        totalsRow={["الإجمالي", money(t.a), money(t.b), money(t.c), money(t.d), money(t.e), money(t.total)]} />
    </ReportShell>
  );
}

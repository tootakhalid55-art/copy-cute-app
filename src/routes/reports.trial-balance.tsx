import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, ReportTable, money } from "@/components/haseem/ReportShell";
import { normalizeJournalLines } from "@/lib/accounting/ledger";

export const Route = createFileRoute("/reports/trial-balance")({
  head: () => ({ meta: [{ title: "ميزان المراجعة — كنار المحاسبية" }] }),
  component: TB,
});

function TB() {
  const { items: accounts } = useCollection<any>("accounts");
  const { items: entries } = useCollection<any>("journal-entries");
  const rows = useMemo(() => {
    return accounts.map((a) => {
      let dr = 0, cr = 0;
      entries.forEach((e) => normalizeJournalLines(e).forEach((l) => {
        if (l.accountCode === a.code) { dr += Number(l.debit || 0); cr += Number(l.credit || 0); }
      }));
      const bal = Number(a.openingBalance || 0) + dr - cr;
      return { a, dr, cr, bal };
    }).filter((r) => r.dr || r.cr || r.bal);
  }, [accounts, entries]);
  const totalDr = rows.reduce((s, r) => s + r.dr, 0);
  const totalCr = rows.reduce((s, r) => s + r.cr, 0);
  return (
    <ReportShell title="ميزان المراجعة" subtitle="إجماليات المدين والدائن لكل حساب"
      exportRows={() => ({ headers: ["الرقم", "الحساب", "مدين", "دائن", "الرصيد"], rows: rows.map((r) => [r.a.code, r.a.name, r.dr, r.cr, r.bal]) })}>
      <ReportTable headers={["الرقم", "الحساب", "النوع", "مدين", "دائن", "الرصيد"]}
        rows={rows.map((r) => [r.a.code, r.a.name, r.a.type, money(r.dr), money(r.cr), money(r.bal)])}
        totalsRow={["", "الإجمالي", "", money(totalDr), money(totalCr), ""]} />
    </ReportShell>
  );
}


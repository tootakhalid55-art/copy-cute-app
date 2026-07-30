import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, ReportTable, money } from "@/components/haseem/ReportShell";
import {
  accountCreditDebit,
  isAssetAccount,
  isEquityAccount,
  isLiabilityAccount,
  normalizeJournalLines,
} from "@/lib/accounting/ledger";

export const Route = createFileRoute("/reports/balance-sheet")({
  head: () => ({ meta: [{ title: "الميزانية العمومية — كنار المحاسبية" }] }),
  component: BS,
});

function BS() {
  const { items: entries } = useCollection<any>("journal-entries");
  const { items: accounts } = useCollection<any>("accounts");

  const totals = useMemo(() => {
    const journalLines = entries.flatMap((entry) => normalizeJournalLines(entry));
    const assetAccounts = accounts.filter((account) => isAssetAccount(account));
    const liabilityAccounts = accounts.filter((account) => isLiabilityAccount(account));
    const equityAccounts = accounts.filter((account) => isEquityAccount(account));

    const sumGroup = (group: any[]) =>
      group.reduce((sum, account) => {
        const { debit, credit } = accountCreditDebit(journalLines, String(account.code));
        return sum + Math.max(0, debit - credit);
      }, Number(group.reduce((sum, account) => sum + Number(account.openingBalance || 0), 0)));

    const assets = sumGroup(assetAccounts);
    const liabilities = liabilityAccounts.reduce((sum, account) => {
      const { debit, credit } = accountCreditDebit(journalLines, String(account.code));
      return sum + Math.max(0, credit - debit);
    }, Number(liabilityAccounts.reduce((sum, account) => sum + Number(account.openingBalance || 0), 0)));
    const equity = equityAccounts.reduce((sum, account) => {
      const { debit, credit } = accountCreditDebit(journalLines, String(account.code));
      return sum + Math.max(0, credit - debit);
    }, Number(equityAccounts.reduce((sum, account) => sum + Number(account.openingBalance || 0), 0)));
    return { assets, liabilities, equity };
  }, [accounts, entries]);

  return (
    <ReportShell title="الميزانية العمومية" subtitle="حتى اليوم"
      exportRows={() => ({ headers: ["البند", "القيمة"], rows: [["الأصول", totals.assets], ["الالتزامات", totals.liabilities], ["حقوق الملكية", totals.equity]] })}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReportTable headers={["الأصول", "القيمة"]}
          rows={[["إجمالي الأصول", money(totals.assets)]]}
          totalsRow={["إجمالي الأصول", money(totals.assets)]} />
        <ReportTable headers={["الالتزامات وحقوق الملكية", "القيمة"]}
          rows={[["الالتزامات", money(totals.liabilities)], ["حقوق الملكية", money(totals.equity)]]}
          totalsRow={["الإجمالي", money(totals.liabilities + totals.equity)]} />
      </div>
    </ReportShell>
  );
}


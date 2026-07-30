import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";
import { accountCreditDebit, isExpenseAccount, isRevenueAccount, normalizeJournalLines } from "@/lib/accounting/ledger";

export const Route = createFileRoute("/reports/profit-and-loss")({
  head: () => ({ meta: [{ title: "قائمة الدخل — كنار المحاسبية" }] }),
  component: PL,
});

function PL() {
  const { items: entries } = useCollection<any>("journal-entries");
  const { items: accounts } = useCollection<any>("accounts");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);
  const inR = (d: string) => (!from || d >= from) && (!to || d <= to);
  const journalLines = useMemo(
    () =>
      entries
        .filter((entry) => inR(String(entry.date ?? "")))
        .flatMap((entry) => normalizeJournalLines(entry)),
    [entries, from, to],
  );
  const rev = useMemo(() => {
    return accounts
      .filter((account) => isRevenueAccount(account))
      .reduce((sum, account) => {
        const { debit, credit } = accountCreditDebit(journalLines, String(account.code));
        return sum + Math.max(0, credit - debit);
      }, 0);
  }, [accounts, journalLines]);
  const ret = useMemo(() => {
    return accounts
      .filter((account) => isRevenueAccount(account) && /مردود|returns?|refund/i.test(`${account.name} ${account.subtype ?? ""}`))
      .reduce((sum, account) => {
        const { debit, credit } = accountCreditDebit(journalLines, String(account.code));
        return sum + Math.max(0, debit - credit);
      }, 0);
  }, [accounts, journalLines]);
  const cogs = useMemo(() => {
    return accounts
      .filter((account) => isExpenseAccount(account) && /تكلفة المبيعات|cost of sales|cogs/i.test(String(account.subtype ?? "")))
      .reduce((sum, account) => {
        const { debit, credit } = accountCreditDebit(journalLines, String(account.code));
        return sum + Math.max(0, debit - credit);
      }, 0);
  }, [accounts, journalLines]);
  const opex = useMemo(() => {
    return accounts
      .filter((account) => isExpenseAccount(account) && !/تكلفة المبيعات|cost of sales|cogs/i.test(String(account.subtype ?? "")))
      .reduce((sum, account) => {
        const { debit, credit } = accountCreditDebit(journalLines, String(account.code));
        return sum + Math.max(0, debit - credit);
      }, 0);
  }, [accounts, journalLines]);
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


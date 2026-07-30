import test from "node:test";
import assert from "node:assert/strict";

function normalizeJournalLines(entry) {
  const raw = Array.isArray(entry.lines) && entry.lines.length > 0 ? entry.lines : entry.journal_lines ?? [];
  return raw
    .map((line) => ({
      accountCode: String(line.accountCode ?? line.account_code ?? line.account ?? line.gl_account_code ?? "").trim(),
      debit: Number(line.debit ?? line.debit_amount ?? 0) || 0,
      credit: Number(line.credit ?? line.credit_amount ?? 0) || 0,
    }))
    .filter((line) => !!line.accountCode);
}

function accountCreditDebit(lines, code) {
  return lines.reduce(
    (sum, line) => {
      if (line.accountCode !== code) return sum;
      return { debit: sum.debit + line.debit, credit: sum.credit + line.credit };
    },
    { debit: 0, credit: 0 },
  );
}

test("ledger-based reports derive balances from posted journal entries", () => {
  const accounts = [
    { code: "1201", name: "Accounts Receivable", type: "أصول", subtype: "أصول متداولة", openingBalance: 0 },
    { code: "4101", name: "Sales Revenue", type: "إيرادات", subtype: "إيرادات تشغيلية", openingBalance: 0 },
    { code: "5101", name: "COGS", type: "مصروفات", subtype: "تكلفة المبيعات", openingBalance: 0 },
    { code: "6401", name: "General Expenses", type: "مصروفات", subtype: "مصروفات تشغيلية", openingBalance: 0 },
    { code: "2101", name: "Accounts Payable", type: "التزامات", subtype: "التزامات متداولة", openingBalance: 0 },
    { code: "3001", name: "Owner Equity", type: "حقوق ملكية", subtype: "رأس المال", openingBalance: 0 },
  ];

  const entries = [
    {
      date: "2026-07-01",
      lines: [
        { account_code: "1201", debit: 1150, credit: 0 },
        { account_code: "4101", debit: 0, credit: 1000 },
        { account_code: "2101", debit: 0, credit: 150 },
      ],
    },
    {
      date: "2026-07-02",
      lines: [
        { account_code: "5101", debit: 400, credit: 0 },
        { account_code: "1201", debit: 0, credit: 400 },
      ],
    },
    {
      date: "2026-07-03",
      lines: [
        { account_code: "6401", debit: 75, credit: 0 },
        { account_code: "1201", debit: 0, credit: 75 },
      ],
    },
  ];

  const journalLines = entries.flatMap(normalizeJournalLines);
  const revenue = accounts
    .filter((a) => /إيرادات|revenue/i.test(`${a.type} ${a.subtype}`))
    .reduce((sum, account) => {
      const { debit, credit } = accountCreditDebit(journalLines, account.code);
      return sum + Math.max(0, credit - debit);
    }, 0);
  const cogs = accounts
    .filter((a) => /تكلفة المبيعات|cost of sales|cogs/i.test(`${a.type} ${a.subtype}`))
    .reduce((sum, account) => {
      const { debit, credit } = accountCreditDebit(journalLines, account.code);
      return sum + Math.max(0, debit - credit);
    }, 0);
  const opex = accounts
    .filter((a) => /مصروفات|expense/i.test(`${a.type} ${a.subtype}`) && !/تكلفة المبيعات|cost of sales|cogs/i.test(`${a.type} ${a.subtype}`))
    .reduce((sum, account) => {
      const { debit, credit } = accountCreditDebit(journalLines, account.code);
      return sum + Math.max(0, debit - credit);
    }, 0);

  assert.equal(revenue, 1000);
  assert.equal(cogs, 400);
  assert.equal(opex, 75);
  assert.equal(revenue - cogs - opex, 525);

  const assets = accounts
    .filter((a) => /أصول|asset/i.test(`${a.type} ${a.subtype}`))
    .reduce((sum, account) => {
      const { debit, credit } = accountCreditDebit(journalLines, account.code);
      return sum + Number(account.openingBalance || 0) + Math.max(0, debit - credit);
    }, 0);
  const liabilities = accounts
    .filter((a) => /التزامات|liabil/i.test(`${a.type} ${a.subtype}`))
    .reduce((sum, account) => {
      const { debit, credit } = accountCreditDebit(journalLines, account.code);
      return sum + Number(account.openingBalance || 0) + Math.max(0, credit - debit);
    }, 0);
  const equity = accounts
    .filter((a) => /حقوق ملكية|equity|capital/i.test(`${a.type} ${a.subtype}`))
    .reduce((sum, account) => {
      const { debit, credit } = accountCreditDebit(journalLines, account.code);
      return sum + Number(account.openingBalance || 0) + Math.max(0, credit - debit);
    }, 0);

  assert.equal(assets, 675);
  assert.equal(liabilities, 150);
  assert.equal(equity, 0);
});

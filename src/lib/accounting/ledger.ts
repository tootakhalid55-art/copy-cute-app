type AnyRecord = Record<string, any>;

export type NormalizedJournalLine = {
  accountCode: string;
  description: string;
  debit: number;
  credit: number;
};

export type LedgerAccount = {
  code: string;
  name: string;
  type?: string | null;
  subtype?: string | null;
  openingBalance?: number | null;
  [key: string]: any;
};

export type JournalEntryLike = {
  date?: string | null;
  ref?: string | null;
  memo?: string | null;
  status?: string | null;
  lines?: AnyRecord[] | null;
  journal_lines?: AnyRecord[] | null;
  [key: string]: any;
};

export function normalizeJournalLines(entry: JournalEntryLike): NormalizedJournalLine[] {
  const raw = Array.isArray(entry.lines) && entry.lines.length > 0 ? entry.lines : entry.journal_lines ?? [];
  return raw.map((line) => {
    const accountCode = String(
      line.accountCode ?? line.account_code ?? line.account ?? line.gl_account_code ?? "",
    ).trim();
    return {
      accountCode,
      description: String(line.description ?? line.memo ?? line.note ?? ""),
      debit: Number(line.debit ?? line.debit_amount ?? 0) || 0,
      credit: Number(line.credit ?? line.credit_amount ?? 0) || 0,
    };
  }).filter((line) => !!line.accountCode);
}

export function isRevenueAccount(account: LedgerAccount) {
  const type = String(account.type ?? "").trim();
  const subtype = String(account.subtype ?? "").trim();
  const name = String(account.name ?? "").trim();
  return /إيرادات|revenue/i.test(type)
    || /إيرادات|revenue/i.test(subtype)
    || /revenue|sales|income|returns?|discount/i.test(name);
}

export function isExpenseAccount(account: LedgerAccount) {
  const type = String(account.type ?? "").trim();
  const subtype = String(account.subtype ?? "").trim();
  const name = String(account.name ?? "").trim();
  return /مصروفات|expense/i.test(type)
    || /مصروفات|expense/i.test(subtype)
    || /تكلفة المبيعات|cost of sales|cogs/i.test(subtype)
    || /expense|marketing|admin|overhead|salar(y|ies)|rent|utilities|office/i.test(name);
}

export function isAssetAccount(account: LedgerAccount) {
  const type = String(account.type ?? "").trim();
  const subtype = String(account.subtype ?? "").trim();
  const name = String(account.name ?? "").trim();
  return /أصول|asset/i.test(type)
    || /أصول|asset/i.test(subtype)
    || /cash|bank|receivable|inventory|prepaid|asset/i.test(name);
}

export function isLiabilityAccount(account: LedgerAccount) {
  const type = String(account.type ?? "").trim();
  const subtype = String(account.subtype ?? "").trim();
  const name = String(account.name ?? "").trim();
  return /التزامات|liabil/i.test(type)
    || /التزامات|liabil/i.test(subtype)
    || /payable|vat payable|accrued|defer|liabil/i.test(name);
}

export function isEquityAccount(account: LedgerAccount) {
  const type = String(account.type ?? "").trim();
  const subtype = String(account.subtype ?? "").trim();
  const name = String(account.name ?? "").trim();
  return /حقوق ملكية|equity|capital/i.test(type)
    || /حقوق ملكية|equity|capital/i.test(subtype)
    || /equity|capital|retained earnings|owner/i.test(name);
}

export function accountBucket(account: LedgerAccount) {
  if (isAssetAccount(account)) return "asset";
  if (isLiabilityAccount(account)) return "liability";
  if (isEquityAccount(account)) return "equity";
  if (isRevenueAccount(account)) return "revenue";
  if (isExpenseAccount(account)) return "expense";
  return "other";
}

export function accountNetMovement(lines: NormalizedJournalLine[], code: string) {
  return lines.reduce((sum, line) => {
    if (line.accountCode !== code) return sum;
    return sum + line.debit - line.credit;
  }, 0);
}

export function accountCreditDebit(lines: NormalizedJournalLine[], code: string) {
  return lines.reduce(
    (sum, line) => {
      if (line.accountCode !== code) return sum;
      return {
        debit: sum.debit + line.debit,
        credit: sum.credit + line.credit,
      };
    },
    { debit: 0, credit: 0 },
  );
}

export function sumJournalLinesByAccount(lines: NormalizedJournalLine[], codes: string[]) {
  const set = new Set(codes.map((code) => String(code)));
  return lines.reduce(
    (sum, line) => {
      if (!set.has(line.accountCode)) return sum;
      return {
        debit: sum.debit + line.debit,
        credit: sum.credit + line.credit,
      };
    },
    { debit: 0, credit: 0 },
  );
}

export function journalWindow(entries: JournalEntryLike[], from?: string, to?: string) {
  return entries.filter((entry) => {
    const d = String(entry.date ?? "");
    return (!from || d >= from) && (!to || d <= to);
  });
}

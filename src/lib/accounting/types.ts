// Accounting core types (Batch 2C.0 + 2C.5)

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "cost_of_sales"
  | "expense"
  | "other_income"
  | "other_expense";

export type PostingEventType =
  | "invoice_posted"
  | "payment_created"
  | "payment_applied"
  | "credit_note_posted"
  | "debit_note_posted"
  | "inventory_posted"
  | "expense_posted"
  | "manual_journal";

export type PeriodStatus = "open" | "closed" | "locked";
export type JournalStatus = "draft" | "posted" | "reversed";

export type TaxType =
  | "standard"
  | "zero_rated"
  | "exempt"
  | "out_of_scope"
  | "reverse_charge";

export type JournalLineInput = {
  account_code: string;
  debit?: number;
  credit?: number;
  description?: string;
  cost_center_code?: string;
  branch_id?: string | null;
  party_id?: string | null;
  currency?: string;
  exchange_rate?: number;
  meta?: Record<string, unknown>;
};

export type PostJournalInput = {
  entry_date?: string;
  memo?: string;
  currency?: string;
  exchange_rate?: number;
  branch_id?: string | null;
  source_module?: string;
  source_document_type?: string;
  source_document_id?: string | null;
  event_type?: PostingEventType;
  event_id?: string;
  meta?: Record<string, unknown>;
  lines: JournalLineInput[];
};

// Rule leg — supports either a hardcoded `account_code` OR (preferred) an
// `account_key` that the Account Determination Engine resolves at post time.
export type RuleLegSpec = {
  side: "debit" | "credit";
  account_code?: string;
  account_key?: string;
  amount_expr: string;
  description?: string;
  cost_center_code?: string;
};

export type RuleConfig = {
  legs: RuleLegSpec[];
  currency_key?: string;
  exchange_rate_key?: string;
};

// Standard determination keys — any module can add more, but these are seeded.
export const DETERMINATION_KEYS = [
  "accounts_receivable",
  "accounts_payable",
  "sales_revenue",
  "sales_export_revenue",
  "sales_discounts",
  "purchase_discounts",
  "cogs",
  "inventory",
  "vat_payable",
  "vat_recoverable",
  "vat_reverse_charge_payable",
  "vat_reverse_charge_recoverable",
  "cash",
  "bank",
  "exchange_gain",
  "exchange_loss",
  "write_off",
  "advance_from_customer",
  "advance_to_supplier",
  "opening_balance_equity",
  "retained_earnings",
  "default_expense",
] as const;

export type DeterminationKey = (typeof DETERMINATION_KEYS)[number];

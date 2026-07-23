// Accounting core types (Batch 2C.0)

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
  entry_date?: string; // YYYY-MM-DD
  memo?: string;
  currency?: string;
  exchange_rate?: number;
  branch_id?: string | null;
  source_module?: string;
  source_document_type?: string;
  source_document_id?: string | null;
  event_type?: PostingEventType;
  event_id?: string; // idempotency key
  meta?: Record<string, unknown>;
  lines: JournalLineInput[];
};

// Rule config format stored in posting_rules.config
export type RuleLegSpec = {
  side: "debit" | "credit";
  account_code: string;         // resolved account code
  amount_expr: string;          // e.g. "subtotal", "vat_total", "grand_total - vat_total"
  description?: string;
  cost_center_code?: string;
};

export type RuleConfig = {
  legs: RuleLegSpec[];
  currency_key?: string;          // payload key for currency (default "currency")
  exchange_rate_key?: string;     // payload key for exchange rate (default "exchange_rate")
};

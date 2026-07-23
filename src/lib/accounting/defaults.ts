// Default Chart of Accounts and default Posting Rules for a new org.
// These are seed helpers callable from the UI or programmatically after org creation.

import { supabase } from "@/integrations/supabase/client";
import type { AccountType, PostingEventType, RuleConfig } from "./types";

export type CoAAccount = {
  code: string;
  name: string;
  name_en?: string;
  type: AccountType;
  category?: string;
  parent_code?: string;
  is_header?: boolean;
};

export const DEFAULT_COA: CoAAccount[] = [
  // Assets
  { code: "1", name: "الأصول", name_en: "Assets", type: "asset", is_header: true, category: "root" },
  { code: "11", name: "الأصول المتداولة", name_en: "Current Assets", type: "asset", is_header: true, parent_code: "1", category: "current_asset" },
  { code: "1101", name: "النقدية بالصندوق", name_en: "Cash on Hand", type: "asset", parent_code: "11", category: "cash" },
  { code: "1102", name: "البنوك", name_en: "Bank Accounts", type: "asset", parent_code: "11", category: "bank" },
  { code: "1201", name: "الذمم المدينة - عملاء", name_en: "Accounts Receivable", type: "asset", parent_code: "11", category: "receivables" },
  { code: "1301", name: "المخزون", name_en: "Inventory", type: "asset", parent_code: "11", category: "inventory" },
  { code: "1401", name: "ضريبة القيمة المضافة القابلة للاسترداد", name_en: "VAT Recoverable", type: "asset", parent_code: "11", category: "tax" },
  { code: "15", name: "الأصول الثابتة", name_en: "Fixed Assets", type: "asset", is_header: true, parent_code: "1", category: "fixed_asset" },
  { code: "1501", name: "الأثاث والمعدات", name_en: "Furniture & Equipment", type: "asset", parent_code: "15" },

  // Liabilities
  { code: "2", name: "الالتزامات", name_en: "Liabilities", type: "liability", is_header: true, category: "root" },
  { code: "21", name: "الالتزامات المتداولة", name_en: "Current Liabilities", type: "liability", is_header: true, parent_code: "2", category: "current_liability" },
  { code: "2101", name: "الذمم الدائنة - موردون", name_en: "Accounts Payable", type: "liability", parent_code: "21", category: "payables" },
  { code: "2201", name: "ضريبة القيمة المضافة المستحقة", name_en: "VAT Payable", type: "liability", parent_code: "21", category: "tax" },
  { code: "2301", name: "قروض قصيرة الأجل", name_en: "Short-term Loans", type: "liability", parent_code: "21" },

  // Equity
  { code: "3", name: "حقوق الملكية", name_en: "Equity", type: "equity", is_header: true, category: "root" },
  { code: "3101", name: "رأس المال", name_en: "Capital", type: "equity", parent_code: "3" },
  { code: "3201", name: "الأرباح المحتجزة", name_en: "Retained Earnings", type: "equity", parent_code: "3" },

  // Revenue
  { code: "4", name: "الإيرادات", name_en: "Revenue", type: "revenue", is_header: true, category: "root" },
  { code: "4101", name: "إيرادات المبيعات", name_en: "Sales Revenue", type: "revenue", parent_code: "4" },
  { code: "4201", name: "خصومات المبيعات", name_en: "Sales Discounts", type: "revenue", parent_code: "4" },

  // Cost of Sales
  { code: "5", name: "تكلفة المبيعات", name_en: "Cost of Sales", type: "cost_of_sales", is_header: true, category: "root" },
  { code: "5101", name: "تكلفة البضاعة المباعة", name_en: "COGS", type: "cost_of_sales", parent_code: "5" },

  // Expenses
  { code: "6", name: "المصروفات", name_en: "Expenses", type: "expense", is_header: true, category: "root" },
  { code: "6101", name: "مصروفات الرواتب", name_en: "Salaries Expense", type: "expense", parent_code: "6" },
  { code: "6201", name: "مصروفات الإيجار", name_en: "Rent Expense", type: "expense", parent_code: "6" },
  { code: "6301", name: "مصروفات المرافق", name_en: "Utilities Expense", type: "expense", parent_code: "6" },
  { code: "6401", name: "مصروفات عمومية", name_en: "General Expenses", type: "expense", parent_code: "6" },

  // Other
  { code: "7", name: "إيرادات أخرى", name_en: "Other Income", type: "other_income", is_header: true, category: "root" },
  { code: "7101", name: "فروقات صرف عملات - ربح", name_en: "FX Gain", type: "other_income", parent_code: "7" },
  { code: "8", name: "مصروفات أخرى", name_en: "Other Expenses", type: "other_expense", is_header: true, category: "root" },
  { code: "8101", name: "فروقات صرف عملات - خسارة", name_en: "FX Loss", type: "other_expense", parent_code: "8" },
];

export async function seedDefaultCoA(orgId: string): Promise<{ inserted: number }> {
  // Two-pass to resolve parent_ids
  const codeToId = new Map<string, string>();
  const existing = await supabase.from("chart_of_accounts").select("id,code").eq("org_id", orgId);
  (existing.data || []).forEach((r) => codeToId.set(r.code, r.id));

  const toInsert = DEFAULT_COA.filter((a) => !codeToId.has(a.code));
  if (toInsert.length === 0) return { inserted: 0 };

  // Pass 1: insert without parents
  const rows1 = toInsert.map((a) => ({
    org_id: orgId,
    code: a.code,
    name: a.name,
    name_en: a.name_en ?? null,
    type: a.type,
    category: a.category ?? null,
    is_header: !!a.is_header,
    is_active: true,
  }));
  const ins = await supabase.from("chart_of_accounts").insert(rows1).select("id,code");
  if (ins.error) throw ins.error;
  (ins.data || []).forEach((r) => codeToId.set(r.code, r.id));

  // Pass 2: set parents
  const updates = toInsert.filter((a) => a.parent_code && codeToId.get(a.parent_code));
  for (const a of updates) {
    await supabase
      .from("chart_of_accounts")
      .update({ parent_id: codeToId.get(a.parent_code!)! })
      .eq("org_id", orgId)
      .eq("code", a.code);
  }
  return { inserted: toInsert.length };
}

// ---------- Default posting rules ----------
export const DEFAULT_POSTING_RULES: {
  event_type: PostingEventType;
  name: string;
  description: string;
  config: RuleConfig;
}[] = [
  {
    event_type: "invoice_posted",
    name: "Sales Invoice",
    description: "Dr Accounts Receivable; Cr Sales Revenue; Cr VAT Payable",
    config: {
      legs: [
        { side: "debit",  account_code: "1201", amount_expr: "grand_total",           description: "AR — customer" },
        { side: "credit", account_code: "4101", amount_expr: "grand_total - vat_total", description: "Sales revenue" },
        { side: "credit", account_code: "2201", amount_expr: "vat_total",             description: "VAT payable" },
      ],
    },
  },
  {
    event_type: "expense_posted",
    name: "Purchase Invoice (Bill)",
    description: "Dr Inventory/Expense; Dr VAT Recoverable; Cr Accounts Payable",
    config: {
      legs: [
        { side: "debit",  account_code: "6401", amount_expr: "grand_total - vat_total", description: "Expense" },
        { side: "debit",  account_code: "1401", amount_expr: "vat_total",             description: "VAT recoverable" },
        { side: "credit", account_code: "2101", amount_expr: "grand_total",           description: "AP — supplier" },
      ],
    },
  },
  {
    event_type: "payment_created",
    name: "Customer Receipt",
    description: "Dr Bank; Cr Accounts Receivable",
    config: {
      legs: [
        { side: "debit",  account_code: "1102", amount_expr: "amount", description: "Bank receipt" },
        { side: "credit", account_code: "1201", amount_expr: "amount", description: "Settle AR" },
      ],
    },
  },
  {
    event_type: "payment_applied",
    name: "Supplier Payment",
    description: "Dr Accounts Payable; Cr Bank",
    config: {
      legs: [
        { side: "debit",  account_code: "2101", amount_expr: "amount", description: "Settle AP" },
        { side: "credit", account_code: "1102", amount_expr: "amount", description: "Bank payment" },
      ],
    },
  },
  {
    event_type: "credit_note_posted",
    name: "Sales Credit Note",
    description: "Dr Sales Revenue; Dr VAT Payable; Cr Accounts Receivable",
    config: {
      legs: [
        { side: "debit",  account_code: "4101", amount_expr: "grand_total - vat_total", description: "Reverse sales" },
        { side: "debit",  account_code: "2201", amount_expr: "vat_total", description: "Reverse VAT" },
        { side: "credit", account_code: "1201", amount_expr: "grand_total", description: "Reduce AR" },
      ],
    },
  },
  {
    event_type: "debit_note_posted",
    name: "Purchase Debit Note",
    description: "Dr Accounts Payable; Cr Expense; Cr VAT Recoverable",
    config: {
      legs: [
        { side: "debit",  account_code: "2101", amount_expr: "grand_total", description: "Reduce AP" },
        { side: "credit", account_code: "6401", amount_expr: "grand_total - vat_total", description: "Reverse expense" },
        { side: "credit", account_code: "1401", amount_expr: "vat_total", description: "Reverse VAT recoverable" },
      ],
    },
  },
  {
    event_type: "inventory_posted",
    name: "Inventory Movement (COGS)",
    description: "Dr COGS; Cr Inventory",
    config: {
      legs: [
        { side: "debit",  account_code: "5101", amount_expr: "amount", description: "COGS" },
        { side: "credit", account_code: "1301", amount_expr: "amount", description: "Inventory" },
      ],
    },
  },
];

export async function seedDefaultPostingRules(orgId: string) {
  const existing = await supabase
    .from("posting_rules")
    .select("event_type")
    .eq("org_id", orgId);
  const have = new Set((existing.data || []).map((r) => r.event_type));
  const rows = DEFAULT_POSTING_RULES.filter((r) => !have.has(r.event_type)).map((r) => ({
    org_id: orgId,
    event_type: r.event_type,
    name: r.name,
    description: r.description,
    config: r.config as unknown as never,
    is_active: true,
    priority: 100,
  }));
  if (rows.length === 0) return { inserted: 0 };
  const { error } = await supabase.from("posting_rules").insert(rows);
  if (error) throw error;
  return { inserted: rows.length };
}

export async function ensureCurrentFiscalYear(orgId: string) {
  const y = new Date().getFullYear();
  const existing = await supabase
    .from("fiscal_years")
    .select("id")
    .eq("org_id", orgId)
    .gte("start_date", `${y}-01-01`)
    .lte("end_date", `${y}-12-31`)
    .limit(1)
    .maybeSingle();
  if (existing.data) return existing.data.id;
  const { data, error } = await supabase
    .from("fiscal_years")
    .insert({
      org_id: orgId,
      name: String(y),
      start_date: `${y}-01-01`,
      end_date: `${y}-12-31`,
      is_current: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function seedAccountingFoundation(orgId: string) {
  const coa = await seedDefaultCoA(orgId);
  const rules = await seedDefaultPostingRules(orgId);
  const fyId = await ensureCurrentFiscalYear(orgId);
  return { coa, rules, fiscalYearId: fyId };
}

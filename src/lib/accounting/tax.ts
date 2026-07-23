// Tax Engine (Batch 2C.5)
// Per-line tax calculation supporting exclusive/inclusive/mixed, discounts before/after,
// reverse charge (self-assessed VAT), rounding, and multiple tax codes on one document.
// No VAT account is ever hardcoded — the posting engine uses the Account Determination
// Engine, keyed by the tax code's `payable_key` / `recoverable_key`.

import { supabase } from "@/integrations/supabase/client";
import type { TaxType } from "./types";

export type TaxCode = {
  id: string;
  org_id: string;
  code: string;
  description: string;
  description_en: string | null;
  rate: number;
  tax_type: TaxType;
  is_recoverable: boolean;
  is_payable: boolean;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  payable_key: string;
  recoverable_key: string;
};

export type TaxLineInput = {
  qty: number;
  price: number;
  discount?: number;        // absolute discount, applied BEFORE tax by default
  discount_after?: number;  // absolute discount applied AFTER tax (rare)
  tax_code: TaxCode;
  is_inclusive?: boolean;
};

export type TaxLineResult = {
  gross: number;         // qty * price
  discount: number;      // total discount applied
  taxable_amount: number;
  tax_rate: number;
  tax_amount: number;
  is_reverse_charge: boolean;
  line_total: number;    // taxable + tax (or taxable only for reverse charge)
};

const ROUND = (n: number, d = 2) => {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
};

export function computeTaxLine(l: TaxLineInput): TaxLineResult {
  const gross = ROUND(l.qty * l.price, 4);
  const discount = ROUND(l.discount ?? 0, 4);
  const net = Math.max(0, gross - discount);
  const rate = l.tax_code.rate || 0;
  const isRC = l.tax_code.tax_type === "reverse_charge";
  const noTax =
    l.tax_code.tax_type === "zero_rated" ||
    l.tax_code.tax_type === "exempt" ||
    l.tax_code.tax_type === "out_of_scope" ||
    rate === 0;

  let taxable: number;
  let tax: number;

  if (noTax) {
    taxable = ROUND(net, 2);
    tax = 0;
  } else if (l.is_inclusive) {
    // net already contains tax; extract it
    taxable = ROUND(net / (1 + rate / 100), 2);
    tax = ROUND(net - taxable, 2);
  } else {
    taxable = ROUND(net, 2);
    tax = ROUND(taxable * (rate / 100), 2);
  }

  // Reverse charge: buyer self-assesses; net stays taxable, VAT is memo only
  // (posted as VAT Payable AND VAT Recoverable — see posting rules).
  const line_total = isRC ? taxable : ROUND(taxable + tax - (l.discount_after ?? 0), 2);

  return {
    gross,
    discount,
    taxable_amount: taxable,
    tax_rate: rate,
    tax_amount: tax,
    is_reverse_charge: isRC,
    line_total,
  };
}

export type DocumentTaxSummary = {
  subtotal: number;
  discount_total: number;
  vat_total: number;
  reverse_charge_vat: number;
  grand_total: number;
  by_tax_code: Record<string, { taxable: number; tax: number; rate: number; type: TaxType }>;
};

export function summarizeDocument(lines: (TaxLineResult & { tax_code: TaxCode })[]): DocumentTaxSummary {
  const by_tax_code: DocumentTaxSummary["by_tax_code"] = {};
  let subtotal = 0, discount_total = 0, vat_total = 0, reverse_charge_vat = 0, grand_total = 0;
  for (const l of lines) {
    subtotal += l.taxable_amount;
    discount_total += l.discount;
    if (l.is_reverse_charge) reverse_charge_vat += ROUND(l.taxable_amount * (l.tax_rate / 100), 2);
    else vat_total += l.tax_amount;
    grand_total += l.line_total;
    const k = l.tax_code.code;
    if (!by_tax_code[k]) by_tax_code[k] = { taxable: 0, tax: 0, rate: l.tax_rate, type: l.tax_code.tax_type };
    by_tax_code[k].taxable += l.taxable_amount;
    by_tax_code[k].tax += l.is_reverse_charge ? 0 : l.tax_amount;
  }
  return {
    subtotal: ROUND(subtotal, 2),
    discount_total: ROUND(discount_total, 2),
    vat_total: ROUND(vat_total, 2),
    reverse_charge_vat: ROUND(reverse_charge_vat, 2),
    grand_total: ROUND(grand_total, 2),
    by_tax_code,
  };
}

// ---------- Persistence ----------
export async function listTaxCodes(orgId: string): Promise<TaxCode[]> {
  const { data, error } = await supabase
    .from("tax_codes")
    .select("*")
    .eq("org_id", orgId)
    .order("code");
  if (error) throw error;
  return (data ?? []) as TaxCode[];
}

export async function getTaxCode(orgId: string, code: string): Promise<TaxCode | null> {
  const { data, error } = await supabase
    .from("tax_codes")
    .select("*")
    .eq("org_id", orgId)
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return (data as TaxCode | null) ?? null;
}

export async function validateTaxCode(
  orgId: string,
  code: string,
  onDate: string = new Date().toISOString().slice(0, 10),
): Promise<TaxCode> {
  const { data, error } = await supabase.rpc("validate_tax_code", {
    _org: orgId,
    _code: code,
    _date: onDate,
  });
  if (error) throw error;
  return data as unknown as TaxCode;
}

// Phase B2 — Receipt / Payment / Write-off / Refund / Credit wrappers.
// All operations go through Settlement Engine RPCs (single source of truth).

import { supabase } from "@/integrations/supabase/client";

export type AllocationInput = {
  target_kind: "invoice" | "bill" | "credit_note" | "debit_note" | "advance";
  target_document_id: string;
  amount: number;
  memo?: string;
};

export type CreateReceiptInput = {
  party_id: string;
  cash_bank_account_id: string;
  amount: number;
  date?: string;
  currency?: string;
  exchange_rate?: number;
  branch_id?: string | null;
  reference?: string;
  memo?: string;
  auto_fifo?: boolean;
  allocations?: AllocationInput[];
};

export type CreatePaymentInput = CreateReceiptInput;

export async function createReceipt(orgId: string, input: CreateReceiptInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_receipt", { _org: orgId, _payload: input as never });
  if (error) throw error;
  return data as unknown as string;
}

export async function createPayment(orgId: string, input: CreatePaymentInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_payment", { _org: orgId, _payload: input as never });
  if (error) throw error;
  return data as unknown as string;
}

export async function createWriteoff(orgId: string, input: {
  target_document_id: string; amount: number; reason?: string; date?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_writeoff", { _org: orgId, _payload: input as never });
  if (error) throw error;
  return data as unknown as string;
}

export async function createRefund(orgId: string, input: {
  source_document_id: string; cash_bank_account_id: string; amount: number; reason?: string; date?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_refund", { _org: orgId, _payload: input as never });
  if (error) throw error;
  return data as unknown as string;
}

export async function reverseAllocation(orgId: string, allocationId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("reverse_allocation", { _org: orgId, _alloc: allocationId, _reason: reason ?? undefined } as never);
  if (error) throw error;
}

// -------- Credit control --------
export type CreditCheckResult = {
  party_id: string;
  credit_limit: number;
  exposure: number;
  new_amount: number;
  remaining: number;
  policy: "warn_only" | "block" | "require_approval" | "allow_override";
  credit_hold: boolean;
  ok: boolean;
};

export async function checkCredit(orgId: string, partyId: string, newAmount = 0): Promise<CreditCheckResult> {
  const { data, error } = await supabase.rpc("check_credit", { _org: orgId, _party: partyId, _new_amount: newAmount });
  if (error) throw error;
  return data as unknown as CreditCheckResult;
}

export async function setCreditHold(orgId: string, partyId: string, reason: string) {
  const { error } = await supabase.rpc("set_credit_hold", { _org: orgId, _party: partyId, _reason: reason });
  if (error) throw error;
}

export async function releaseCreditHold(orgId: string, partyId: string, reason?: string) {
  const { error } = await supabase.rpc("release_credit_hold", { _org: orgId, _party: partyId, _reason: reason ?? undefined } as never);
  if (error) throw error;
}

export async function overrideCreditLimit(orgId: string, partyId: string, documentId: string | null, amount: number, reason: string) {
  const { error } = await supabase.rpc("override_credit_limit", {
    _org: orgId, _party: partyId, _document: (documentId ?? undefined) as never, _amount: amount, _reason: reason,
  } as never);
  if (error) throw error;
}

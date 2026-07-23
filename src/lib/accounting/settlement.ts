// Document Settlement Engine — single source of truth for balances & allocations.
// No module should compute open balances or party balances independently; call this.

import { supabase } from "@/integrations/supabase/client";
import type { AllocatePaymentInput } from "./types";

export type DocumentOpenBalance = {
  document_id: string;
  org_id: string;
  party_id: string | null;
  branch_id: string | null;
  kind: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  original_amount: number;
  allocated_amount: number;
  consumed_amount: number;
  open_as_target: number;
  unapplied_as_source: number;
};

export type PartyBalanceRow = {
  org_id: string;
  party_id: string;
  party_type: string;
  balance: number;
};

export type AgingRow = {
  party_id: string;
  current_amt: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d91_plus: number;
  total: number;
};

export async function getDocumentOpenBalance(orgId: string, docId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_document_open_balance", { _org: orgId, _doc: docId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function getPartyBalance(orgId: string, partyId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_party_balance", { _org: orgId, _party: partyId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function listOpenDocuments(params: {
  orgId: string;
  partyId?: string;
  kinds?: string[]; // e.g. ['invoice','debit_note'] for AR; ['bill','supplier_debit_note'] for AP
}): Promise<DocumentOpenBalance[]> {
  let q = supabase
    .from("document_open_balances")
    .select("*")
    .eq("org_id", params.orgId)
    .gt("open_as_target", 0);
  if (params.partyId) q = q.eq("party_id", params.partyId);
  if (params.kinds && params.kinds.length > 0) q = q.in("kind", params.kinds);
  const { data, error } = await q.order("issue_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DocumentOpenBalance[];
}

export async function listUnappliedSources(params: {
  orgId: string;
  partyId?: string;
  kinds?: string[]; // e.g. ['customer_payment','receipt','advance','credit_note']
}): Promise<DocumentOpenBalance[]> {
  let q = supabase
    .from("document_open_balances")
    .select("*")
    .eq("org_id", params.orgId)
    .gt("unapplied_as_source", 0);
  if (params.partyId) q = q.eq("party_id", params.partyId);
  if (params.kinds && params.kinds.length > 0) q = q.in("kind", params.kinds);
  const { data, error } = await q.order("issue_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DocumentOpenBalance[];
}

export async function getAgingBuckets(params: {
  orgId: string;
  partyType?: "customer" | "supplier";
  asof?: string;
}): Promise<AgingRow[]> {
  const { data, error } = await supabase.rpc("get_aging_buckets", {
    _org: params.orgId,
    _party_type: params.partyType ?? null,
    _asof: params.asof ?? new Date().toISOString().slice(0, 10),
  } as never);
  if (error) throw error;
  return (data ?? []) as AgingRow[];
}

export async function validatePosting(orgId: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("validate_posting", { _org: orgId, _payload: payload as never });
  if (error) throw error;
  return data as { ok: boolean; errors: string[] };
}

export async function allocatePayment(orgId: string, input: AllocatePaymentInput): Promise<string[]> {
  const { data, error } = await supabase.rpc("allocate_payment", {
    _org: orgId,
    _payload: input as never,
  });
  if (error) throw error;
  return (data ?? []) as string[];
}

// FIFO helper — distributes an amount over open targets oldest-first.
export function fifoAllocate(amount: number, targets: DocumentOpenBalance[]): {
  target_kind: string; target_document_id: string; amount: number;
}[] {
  let remaining = Math.round(amount * 100) / 100;
  const out: { target_kind: string; target_document_id: string; amount: number }[] = [];
  for (const t of targets) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Math.round(t.open_as_target * 100) / 100);
    if (take <= 0) continue;
    out.push({ target_kind: t.kind === "bill" ? "bill" : t.kind === "debit_note" ? "debit_note" : t.kind === "credit_note" ? "credit_note" : "invoice", target_document_id: t.document_id, amount: take });
    remaining = Math.round((remaining - take) * 100) / 100;
  }
  return out;
}

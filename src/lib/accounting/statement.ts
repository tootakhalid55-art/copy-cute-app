// Unified Statement Engine — one API for customers, suppliers, cash and bank
// accounts. Backed by the get_statement RPC (Settlement Engine as source of truth).

import { supabase } from "@/integrations/supabase/client";

export type StatementAccountKind = "customer" | "supplier" | "cash_account";

export type StatementLine = {
  txn_date: string | null;
  doc_kind: string;
  doc_id: string | null;
  doc_number: string | null;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  currency: string;
  is_opening: boolean;
};

export async function getStatement(params: {
  orgId: string;
  accountKind: StatementAccountKind;
  accountId: string;
  from?: string | null;
  to?: string | null;
}): Promise<StatementLine[]> {
  const { data, error } = await supabase.rpc("get_statement", {
    _org: params.orgId,
    _account_kind: params.accountKind,
    _account_id: params.accountId,
    _from: params.from ?? null,
    _to: params.to ?? new Date().toISOString().slice(0, 10),
  } as never);
  if (error) throw error;
  return (data ?? []) as StatementLine[];
}

export function summarizeStatement(lines: StatementLine[]) {
  const opening = lines.find((l) => l.is_opening)?.balance ?? 0;
  const totalDebit = lines.filter((l) => !l.is_opening).reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.filter((l) => !l.is_opening).reduce((s, l) => s + Number(l.credit || 0), 0);
  const closing = lines.length ? Number(lines[lines.length - 1].balance || 0) : opening;
  return { opening, totalDebit, totalCredit, closing };
}

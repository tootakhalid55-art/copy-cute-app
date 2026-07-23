// Account Determination Engine — client helpers.
// No account number is ever hardcoded in business code; resolve via this module.

import { supabase } from "@/integrations/supabase/client";

export type DeterminationRow = {
  id: string;
  org_id: string;
  branch_id: string | null;
  doc_kind: string | null;
  key: string;
  account_code: string;
  description: string | null;
  is_active: boolean;
};

export async function resolveAccount(params: {
  orgId: string;
  key: string;
  branchId?: string | null;
  docKind?: string | null;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc("resolve_account", {
    _org: params.orgId,
    _branch: (params.branchId ?? null) as never,
    _doc_kind: (params.docKind ?? null) as never,
    _key: params.key,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function requireAccount(params: {
  orgId: string;
  key: string;
  branchId?: string | null;
  docKind?: string | null;
}): Promise<string> {
  const code = await resolveAccount(params);
  if (!code) throw new Error(`missing_account_determination:${params.key}`);
  return code;
}

export async function listDeterminations(orgId: string): Promise<DeterminationRow[]> {
  const { data, error } = await supabase
    .from("account_determinations")
    .select("*")
    .eq("org_id", orgId)
    .order("key");
  if (error) throw error;
  return (data ?? []) as DeterminationRow[];
}

export async function upsertDetermination(row: Partial<DeterminationRow> & {
  org_id: string;
  key: string;
  account_code: string;
}) {
  const { error } = await supabase.from("account_determinations").upsert(row, {
    onConflict: "org_id,branch_id,doc_kind,key",
  });
  if (error) throw error;
}

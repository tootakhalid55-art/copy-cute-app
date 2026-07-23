// Centralized document numbering. Calls the SQL sequence advancer.
import { supabase } from "@/integrations/supabase/client";

export async function nextDocumentNumber(params: {
  orgId: string;
  docType: string;
  branchId?: string | null;
  fiscalYearId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("next_document_number", {
    _org: params.orgId,
    _branch: (params.branchId ?? null) as never,
    _fy: (params.fiscalYearId ?? null) as never,
    _doc_type: params.docType,
  });
  if (error) throw error;
  return data as unknown as string;
}

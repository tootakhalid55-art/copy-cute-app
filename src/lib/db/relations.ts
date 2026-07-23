// Document relations helper — Quotation→SO→DN→Invoice, PO→GRN→Bill, Invoice→Payment.
// Reads and writes public.document_relations; navigation is bidirectional.
import { supabase } from "@/integrations/supabase/client";

export type RelationKind =
  | "quotation_to_order"
  | "order_to_delivery"
  | "delivery_to_invoice"
  | "po_to_grn"
  | "grn_to_bill"
  | "invoice_to_payment"
  | "credit_note_of"
  | "debit_note_of"
  | "generic";

export async function linkDocuments(
  orgId: string,
  sourceId: string,
  targetId: string,
  kind: RelationKind = "generic",
  meta: Record<string, any> = {},
) {
  const { data: uid } = await supabase.auth.getUser();
  const { data, error } = await (supabase.from("document_relations") as any)
    .insert({
      org_id: orgId,
      from_document_id: sourceId,
      to_document_id: targetId,
      relation_type: kind,
      meta,
      created_by: uid.user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listRelated(orgId: string, docId: string) {
  const { data, error } = await supabase
    .from("document_relations")
    .select("*")
    .eq("org_id", orgId)
    .or(`from_document_id.eq.${docId},to_document_id.eq.${docId}`);
  if (error) throw error;
  return data ?? [];
}


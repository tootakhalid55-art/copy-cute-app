// Unified Documents API — single entry point for every business document
// (invoices, quotations, POs, bills, credit/debit notes, delivery notes, GRN,
// payments, receipts, journal vouchers…).
//
// Status state machine:
//   draft → pending_approval | approved | cancelled
//   pending_approval → approved | draft | cancelled
//   approved → posted | cancelled
//   posted → cancelled
//
// The DB trigger `documents_status_guard` enforces the same rules server-side.
import { supabase } from "@/integrations/supabase/client";
import { emitDocEvent } from "./events";
import { enqueueNotification } from "./notifications";

export type DocStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "posted"
  | "cancelled";

export type DocKind =
  | "invoice"
  | "quotation"
  | "sales_order"
  | "delivery_note"
  | "credit_note"
  | "bill"
  | "purchase_order"
  | "purchase_quotation"
  | "goods_receipt_note"
  | "debit_note"
  | "payment"
  | "receipt"
  | "journal_voucher"
  | "expense";

const ALLOWED: Record<DocStatus, DocStatus[]> = {
  draft: ["pending_approval", "approved", "cancelled"],
  pending_approval: ["approved", "draft", "cancelled"],
  approved: ["posted", "cancelled"],
  posted: ["cancelled"],
  cancelled: [],
};

export function canTransition(from: DocStatus, to: DocStatus) {
  return ALLOWED[from]?.includes(to) ?? false;
}

export type CreateDocumentInput = {
  orgId: string;
  kind: DocKind;
  doc_number: string;
  issue_date?: string;
  due_date?: string | null;
  party_id?: string | null;
  party_snapshot?: Record<string, any>;
  currency?: string;
  exchange_rate?: number;
  tax_inclusive?: boolean;
  subtotal?: number;
  discount_total?: number;
  shipping?: number;
  other_charges?: number;
  grand_total?: number;
  notes?: string | null;
  terms?: string | null;
  po_number?: string | null;
  project?: string | null;
  template_id?: string | null;
  branch_id?: string | null;
  fiscal_year_id?: string | null;
  qr_payload?: string | null;
  meta?: Record<string, any>;
  lines?: Array<{
    line_no: number;
    item_id?: string | null;
    description?: string | null;
    quantity: number;
    unit?: string | null;
    unit_price: number;
    discount_percent?: number;
    discount_amount?: number;
    tax_rate?: number;
    tax_amount?: number;
    line_total: number;
    meta?: Record<string, any>;
  }>;
};

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("not signed in");
  return id;
}

export async function createDocument(input: CreateDocumentInput) {
  const uid = await currentUserId();
  const { lines = [], orgId, ...rest } = input;
  const payload: any = {
    org_id: orgId,
    created_by: uid,
    status: "draft" as DocStatus,
    issue_date: input.issue_date ?? new Date().toISOString().slice(0, 10),
    currency: input.currency ?? "SAR",
    exchange_rate: input.exchange_rate ?? 1,
    tax_inclusive: input.tax_inclusive ?? false,
    subtotal: input.subtotal ?? 0,
    discount_total: input.discount_total ?? 0,
    shipping: input.shipping ?? 0,
    other_charges: input.other_charges ?? 0,
    grand_total: input.grand_total ?? 0,
    party_snapshot: input.party_snapshot ?? {},
    meta: input.meta ?? {},
    ...rest,
  };
  const { data: doc, error } = await (supabase.from("documents") as any)
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;

  if (lines.length) {
    const rows = lines.map((l) => ({
      org_id: orgId,
      document_id: doc.id,
      ...l,
      meta: l.meta ?? {},
    }));
    const { error: lErr } = await (supabase.from("document_lines") as any).insert(rows);
    if (lErr) throw lErr;
  }

  await snapshotVersion(doc.id, orgId, uid, "created", doc);
  await emitDocEvent({
    type: "document.created",
    orgId,
    entityType: "document",
    entityId: doc.id,
    actorId: uid,
    payload: doc,
  });
  await enqueueNotification({
    orgId,
    event_type: "document.created",
    entity_type: "document",
    entity_id: doc.id,
    document_id: doc.id,
    title: `تم إنشاء مستند ${doc.doc_number}`,
    body: `النوع: ${doc.kind}`,
  });
  return doc;
}

export async function updateDocument(
  id: string,
  orgId: string,
  patch: Partial<CreateDocumentInput>,
) {
  const uid = await currentUserId();
  const { lines, ...rest } = patch as any;
  const payload: any = { ...rest, updated_by: uid };
  const { data, error } = await (supabase.from("documents") as any)
    .update(payload)
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;

  if (Array.isArray(lines)) {
    await supabase.from("document_lines").delete().eq("document_id", id).eq("org_id", orgId);
    if (lines.length) {
      const rows = lines.map((l: any) => ({
        org_id: orgId,
        document_id: id,
        ...l,
        meta: l.meta ?? {},
      }));
      const { error: lErr } = await (supabase.from("document_lines") as any).insert(rows);
      if (lErr) throw lErr;
    }
  }

  await snapshotVersion(id, orgId, uid, "updated", data);
  await emitDocEvent({
    type: "document.updated",
    orgId,
    entityType: "document",
    entityId: id,
    actorId: uid,
    payload: data,
  });
  return data;
}

export async function transitionStatus(
  id: string,
  orgId: string,
  next: DocStatus,
  opts?: { comment?: string },
) {
  const uid = await currentUserId();
  const { data: current, error: cErr } = await supabase
    .from("documents")
    .select("id,status,doc_number,kind")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();
  if (cErr) throw cErr;
  const from = current.status as DocStatus;
  if (!canTransition(from, next)) {
    throw new Error(`Illegal transition ${from} → ${next}`);
  }

  const patch: any = { status: next, updated_by: uid };
  const { data, error } = await (supabase.from("documents") as any)
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;

  const typeMap: Record<DocStatus, any> = {
    draft: "document.updated",
    pending_approval: "document.submitted",
    approved: "document.approved",
    posted: "document.posted",
    cancelled: "document.cancelled",
  };
  await emitDocEvent({
    type: typeMap[next],
    orgId,
    entityType: "document",
    entityId: id,
    actorId: uid,
    payload: { ...data, from, to: next, comment: opts?.comment },
  });
  await enqueueNotification({
    orgId,
    event_type: typeMap[next],
    entity_type: "document",
    entity_id: id,
    document_id: id,
    title: `${current.doc_number}: ${from} → ${next}`,
    body: opts?.comment ?? undefined,
  });
  return data;
}

export async function getDocument(id: string, orgId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("*, lines:document_lines(*)")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();
  if (error) throw error;
  return data;
}

export async function listDocuments(
  orgId: string,
  filter?: { kind?: DocKind | DocKind[]; status?: DocStatus | DocStatus[]; limit?: number },
) {
  let q = supabase.from("documents").select("*").eq("org_id", orgId).order("issue_date", { ascending: false });
  if (filter?.kind) q = Array.isArray(filter.kind) ? q.in("kind", filter.kind) : q.eq("kind", filter.kind);
  if (filter?.status) q = Array.isArray(filter.status) ? q.in("status", filter.status) : q.eq("status", filter.status);
  if (filter?.limit) q = q.limit(filter.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function snapshotVersion(documentId: string, orgId: string, uid: string, reason: string, snapshot: any) {
  const { data: rows } = await supabase
    .from("document_versions")
    .select("version")
    .eq("document_id", documentId)
    .order("version", { ascending: false })
    .limit(1);
  const version = (rows?.[0]?.version ?? 0) + 1;
  await (supabase.from("document_versions") as any).insert({
    org_id: orgId,
    document_id: documentId,
    version,
    reason,
    snapshot,
    created_by: uid,
  });
}

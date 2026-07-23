// Bridge between the legacy localStorage forms and the unified Supabase
// documents API. Lets a form persist a cloud copy of its record and remember
// the resulting UUID so attachments, approvals and the timeline can attach
// to that document.
import { createDocument, updateDocument, type DocKind } from "./documents";

export const KIND_MAP: Record<string, DocKind> = {
  invoice: "sales_invoice",
  "sales-invoice": "sales_invoice",
  bill: "purchase_invoice",
  "purchase-invoice": "purchase_invoice",
  "credit-note": "credit_note",
  "debit-note": "debit_note",
  "purchase-order": "purchase_order",
  quotation: "sales_quotation",
  "sales-quotation": "sales_quotation",
};

export function toDocKind(kind: string | undefined, fallback: DocKind = "sales_invoice"): DocKind {
  if (!kind) return fallback;
  return KIND_MAP[kind] ?? (kind as DocKind);
}

export type LocalDocRecord = {
  id?: string;
  dbId?: string | null;
  ref: string;
  date: string;
  dueDate?: string;
  expiry?: string;
  partyName?: string;
  partyId?: string;
  notes?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  lines?: Array<{ description: string; qty: number; price: number; tax: number }>;
  poNumber?: string;
  project?: string;
};

export async function syncDocumentToCloud(
  orgId: string,
  kind: DocKind,
  rec: LocalDocRecord,
  existingDbId?: string | null,
): Promise<string> {
  const linesPayload = (rec.lines ?? []).map((l, i) => {
    const qty = Number(l.qty || 0);
    const price = Number(l.price || 0);
    const taxRate = Number(l.tax || 0);
    const net = qty * price;
    const taxAmt = (net * taxRate) / 100;
    return {
      line_no: i + 1,
      description: l.description || "",
      quantity: qty,
      unit_price: price,
      tax_rate: taxRate,
      tax_amount: Math.round((taxAmt + Number.EPSILON) * 100) / 100,
      line_total: Math.round(((net + taxAmt) + Number.EPSILON) * 100) / 100,
    };
  });

  const payload: any = {
    orgId,
    kind,
    doc_number: rec.ref,
    issue_date: rec.date,
    due_date: rec.dueDate ?? rec.expiry ?? null,
    party_snapshot: rec.partyName
      ? { name: rec.partyName, external_id: rec.partyId ?? null }
      : {},
    notes: rec.notes ?? null,
    po_number: rec.poNumber ?? null,
    project: rec.project ?? null,
    subtotal: Number(rec.subtotal ?? 0),
    grand_total: Number(rec.total ?? 0),
    lines: linesPayload,
    meta: { source: "local", localId: rec.id ?? null },
  };

  if (existingDbId) {
    await updateDocument(existingDbId, orgId, payload);
    return existingDbId;
  }
  const doc = await createDocument(payload);
  return doc.id;
}

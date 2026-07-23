// Wire business document events to the Posting Engine.
// Business modules only emit events; this module converts them into journal entries.

import { onDocEvent, type DocEvent } from "@/lib/db/events";
import { postEvent } from "./posting-engine";
import type { PostingEventType } from "./types";

let started = false;

function pickPayload(e: DocEvent): Record<string, number | string | null | undefined> {
  const p = (e.payload || {}) as Record<string, unknown>;
  const out: Record<string, number | string | null | undefined> = {};
  for (const key of [
    "subtotal",
    "discount_total",
    "vat_total",
    "shipping",
    "other_charges",
    "grand_total",
    "amount",
    "exchange_rate",
  ]) {
    const v = p[key];
    if (typeof v === "number" || typeof v === "string") out[key] = v as number | string;
  }
  if (typeof p.currency === "string") out.currency = p.currency;
  return out;
}

function mapEventType(e: DocEvent): PostingEventType | null {
  if (e.type !== "document.posted" && e.type !== "document.approved") return null;
  const kind = String((e.payload as { kind?: string } | undefined)?.kind || "");
  switch (kind) {
    case "invoice":       return "invoice_posted";
    case "bill":          return "expense_posted";
    case "receipt":       return "payment_created";
    case "payment":       return "payment_applied";
    case "credit_note":   return "credit_note_posted";
    case "debit_note":    return "debit_note_posted";
    default:              return null;
  }
}

export function startAccountingSubscriber() {
  if (started) return;
  started = true;

  const handler = async (e: DocEvent) => {
    const et = mapEventType(e);
    if (!et) return;
    const orgId = e.orgId;
    if (!orgId) return;
    const payload = pickPayload(e);
    await postEvent({
      orgId,
      eventType: et,
      eventId: `${et}:${e.entityId}`,
      payload,
      sourceModule: (e.payload as { source_module?: string } | undefined)?.source_module ?? "documents",
      sourceDocumentType: (e.payload as { kind?: string } | undefined)?.kind,
      sourceDocumentId: e.entityId,
      currency: typeof payload.currency === "string" ? payload.currency : "SAR",
      exchangeRate: typeof payload.exchange_rate === "number" ? payload.exchange_rate : 1,
      memo: `Auto-post: ${e.type} ${(e.payload as { doc_number?: string } | undefined)?.doc_number ?? ""}`.trim(),
    });
  };

  onDocEvent("document.posted", handler);
  onDocEvent("document.approved", handler);
}

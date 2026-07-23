// Lightweight in-app event bus for document lifecycle.
// Batch 2C will subscribe to these to post journal entries; Notifications, OCR,
// AI, WhatsApp, Email, ZATCA, and Archive layers can all attach later without
// touching document code.
export type DocEventType =
  | "document.created"
  | "document.updated"
  | "document.submitted"
  | "document.approved"
  | "document.rejected"
  | "document.posted"
  | "document.cancelled"
  | "attachment.uploaded"
  | "attachment.failed"
  | "ocr.enqueued";

export type DocEvent<T = any> = {
  type: DocEventType;
  orgId: string;
  entityType: string; // "document" | "attachment" | ...
  entityId: string;
  actorId?: string | null;
  at: string;
  payload: T;
};

type Handler = (e: DocEvent) => void | Promise<void>;
const handlers = new Map<DocEventType, Set<Handler>>();

export function onDocEvent(type: DocEventType, h: Handler) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(h);
  return () => handlers.get(type)?.delete(h);
}

export async function emitDocEvent<T>(e: Omit<DocEvent<T>, "at"> & { at?: string }) {
  const evt: DocEvent<T> = { at: new Date().toISOString(), ...e } as DocEvent<T>;
  const subs = handlers.get(evt.type);
  if (!subs) return;
  for (const h of subs) {
    try {
      await h(evt);
    } catch (err) {
      console.error("[events] handler failed", evt.type, err);
    }
  }
}

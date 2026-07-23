// Notification queue. The delivery layer (email/whatsapp/inapp toast) will
// pick these up later; for now we just record events for auditability.
import { supabase } from "@/integrations/supabase/client";

export type NotificationInput = {
  orgId: string;
  event_type: string;
  entity_type?: string | null;
  entity_id?: string | null;
  document_id?: string | null;
  user_id?: string | null;
  title: string;
  body?: string | null;
  channel?: "inapp" | "email" | "whatsapp";
  payload?: Record<string, any>;
};

export async function enqueueNotification(input: NotificationInput) {
  try {
    await (supabase.from("notifications") as any).insert({
      org_id: input.orgId,
      event_type: input.event_type,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      document_id: input.document_id ?? null,
      user_id: input.user_id ?? null,
      title: input.title,
      body: input.body ?? null,
      channel: input.channel ?? "inapp",
      payload: input.payload ?? {},
      status: "pending",
    });
  } catch (e) {
    // Never fail the caller because we couldn't queue a notification.
    console.warn("[notifications] enqueue failed", e);
  }
}

export async function listNotifications(orgId: string, limit = 30) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(id: string) {
  await (supabase.from("notifications") as any).update({ read_at: new Date().toISOString() }).eq("id", id);
}

// Email intake webhook. Verify HMAC signature, create intake row, enqueue for processing.
// Provider-agnostic payload:
//   { org_id, sender, subject, attachments: [{ filename, content_type, data_base64 }] }
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function verifySig(secret: string, body: string, sig: string | null): boolean {
  if (!sig || !secret) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/ap-intake-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.AP_INTAKE_HMAC_SECRET || "";
        const body = await request.text();
        const sig = request.headers.get("x-signature");
        if (!secret || !verifySig(secret, body, sig)) {
          return new Response(JSON.stringify({ error: "invalid signature" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        let payload: any;
        try { payload = JSON.parse(body); } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
        }
        const orgId: string = payload.org_id;
        if (!orgId) return new Response(JSON.stringify({ error: "org_id required" }), { status: 400 });

        const admin = await adminClient();
        const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
        const created: string[] = [];

        for (const att of attachments) {
          const mime = att.content_type || "application/octet-stream";
          const dataUrl = `data:${mime};base64,${att.data_base64}`;
          const { data: intake, error } = await admin
            .from("ap_intake_documents")
            .insert({
              org_id: orgId,
              channel: "email",
              source_ref: `email:${payload.message_id || Date.now()}`,
              sender: payload.sender || null,
              subject: payload.subject || att.filename || "Email invoice",
              status: "received",
              raw_payload: { filename: att.filename, size: att.data_base64?.length || 0 },
            })
            .select("id")
            .single();
          if (error || !intake) continue;
          await admin.from("ap_intake_events").insert({
            intake_id: intake.id, org_id: orgId, event_type: "received",
            payload: { channel: "email", filename: att.filename, sender: payload.sender },
          });
          await admin.from("ap_intake_queue").insert({
            org_id: orgId, intake_id: intake.id,
            payload: { fileDataUrl: dataUrl, filename: att.filename || "invoice" },
          });
          created.push(intake.id);
        }
        return new Response(JSON.stringify({ ok: true, intake_ids: created }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

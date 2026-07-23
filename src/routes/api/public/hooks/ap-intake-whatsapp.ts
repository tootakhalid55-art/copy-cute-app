// WhatsApp Cloud API webhook. Verifies signature, downloads media, creates intake.
// Simplified: expects Meta WhatsApp Business Cloud API webhook payload.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function verify(sig: string | null, body: string, secret: string): boolean {
  if (!sig || !secret) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Meta requires GET for webhook verification with hub.challenge
export const Route = createFileRoute("/api/public/hooks/ap-intake-whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.WHATSAPP_VERIFY_TOKEN || "";
        if (mode === "subscribe" && token && token === expected) {
          return new Response(challenge || "", { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const secret = process.env.WHATSAPP_APP_SECRET || "";
        const raw = await request.text();
        const sig = request.headers.get("x-hub-signature-256");
        if (!verify(sig, raw, secret)) {
          return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
        }
        // Route org resolution requires a mapping table in real use; here we look up
        // by the receiving phone_number_id in a settings map inside organizations.meta.
        const payload = JSON.parse(raw);
        const admin = await adminClient();
        const entries = payload.entry || [];
        const created: string[] = [];

        for (const e of entries) {
          for (const change of e.changes || []) {
            const value = change.value || {};
            const phoneId = value.metadata?.phone_number_id;
            const { data: org } = await admin
              .from("organizations")
              .select("id, meta")
              .filter("meta->>whatsapp_phone_number_id", "eq", phoneId)
              .maybeSingle();
            if (!org) continue;

            for (const msg of value.messages || []) {
              if (!["image", "document"].includes(msg.type)) continue;
              const mediaId = msg[msg.type]?.id;
              if (!mediaId) continue;

              // Fetch media URL then binary
              const tokenRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
                headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN || ""}` },
              });
              const meta = await tokenRes.json();
              if (!meta.url) continue;
              const bin = await fetch(meta.url, {
                headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN || ""}` },
              });
              const buf = Buffer.from(await bin.arrayBuffer());
              const mime = meta.mime_type || "application/octet-stream";
              const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

              const { data: intake } = await admin
                .from("ap_intake_documents")
                .insert({
                  org_id: org.id,
                  channel: "whatsapp",
                  source_ref: `whatsapp:${msg.id}`,
                  sender: msg.from || null,
                  subject: msg[msg.type]?.caption || `WhatsApp ${msg.type}`,
                  status: "received",
                  raw_payload: { mime, size: buf.length },
                })
                .select("id")
                .single();
              if (!intake) continue;
              await admin.from("ap_intake_events").insert({
                intake_id: intake.id, org_id: org.id, event_type: "received",
                payload: { channel: "whatsapp", from: msg.from },
              });
              await admin.from("ap_intake_queue").insert({
                org_id: org.id, intake_id: intake.id,
                payload: { fileDataUrl: dataUrl, filename: `whatsapp-${msg.id}` },
              });
              created.push(intake.id);
            }
          }
        }

        return new Response(JSON.stringify({ ok: true, count: created.length }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

// Idempotent storage bootstrap. Fresh Supabase projects have NO storage
// buckets — the migrations only add RLS policies on them — so every upload
// (scanned originals, branding, backups) failed with "Bucket not found".
// This endpoint creates the app's private buckets with the service role and
// is safe to call repeatedly; the deploy script hits it after each restart.
import { createFileRoute } from "@tanstack/react-router";

const BUCKETS = ["documents", "attachments", "inbox", "backups", "branding"];

export const Route = createFileRoute("/api/public/ensure-storage")({
  server: {
    handlers: {
      GET: async () => {
        const out: Record<string, string> = {};
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          for (const id of BUCKETS) {
            const { error } = await supabaseAdmin.storage.createBucket(id, { public: false });
            if (!error) out[id] = "created";
            else if (/already exists|duplicate/i.test(error.message)) out[id] = "exists";
            else out[id] = `error: ${error.message}`;
          }
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        const ok = Object.values(out).every((v) => v === "created" || v === "exists");
        return new Response(JSON.stringify({ ok, buckets: out }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});

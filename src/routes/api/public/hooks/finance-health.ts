// Daily reconciliation runner — pg_cron POSTs here to run health checks
// across every org. The route verifies the Supabase anon key and calls
// the SECURITY DEFINER SQL function `cron_run_finance_health_all`.
//
// Also serves as the observability endpoint: logs structured JSON.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { log, timed } from "@/lib/obs";

export const Route = createFileRoute("/api/public/hooks/finance-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!verifyCronSecret(request)) {
          log.warn("finance_health.unauthorized", {});
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        const url = process.env.SUPABASE_URL!;
        const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const admin = createClient(url, apiKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              h.set("apikey", apiKey);
              if (apiKey.startsWith("sb_") && h.get("Authorization") === `Bearer ${apiKey}`) h.delete("Authorization");
              return fetch(input, { ...init, headers: h });
            },
          },
        });

        try {
          const { data, error } = await timed("finance_health.cron_run", async () => {
            return admin.rpc("cron_run_finance_health_all");
          });
          if (error) throw error;
          log.info("finance_health.cron_done", { orgs: data });
          return new Response(JSON.stringify({ ok: true, orgs: data }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log.error("finance_health.cron_failed", { error: msg });
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

// Client-error drop box. The browser posts sanitized error strings here when
// a save/post operation fails; entries are kept in /tmp on the server and the
// GET handler returns them, so the failure reason is readable remotely (the
// sandbox that develops this app cannot reach the VPS or its journal).
// Nitro's static handler only serves files that existed at build time, so
// this must be a server route — a runtime file in .output/public 404s.
// Only error text is accepted — no document data — and secrets-looking
// tokens are stripped before writing.
import { createFileRoute } from "@tanstack/react-router";

const MAX_ENTRIES = 80;
const MAX_LEN = 500;
const LOG_FILE = "/tmp/canar-client-errors.log";
const DEPLOY_LOG = "/tmp/canar-deploy.log";

function sanitize(s: string) {
  return s
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[jwt]")
    .replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, "[sb-key]")
    .replace(/(api[-_]?key|secret|token|password)["':\s=]+[^\s"',}]{6,}/gi, "$1=[redacted]")
    .slice(0, MAX_LEN);
}

export const Route = createFileRoute("/api/public/client-log")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            message?: string;
            context?: string;
          };
          const msg = sanitize(String(body.message ?? "").trim());
          if (!msg) return new Response("skip", { status: 200 });
          const ctx = sanitize(String(body.context ?? "").trim());
          const line = `${new Date().toISOString()} | ${ctx} | ${msg}`;

          const { appendFileSync, readFileSync, writeFileSync } = await import("node:fs");
          appendFileSync(LOG_FILE, line + "\n");
          const lines = readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
          if (lines.length > MAX_ENTRIES) {
            writeFileSync(LOG_FILE, lines.slice(-MAX_ENTRIES).join("\n") + "\n");
          }
        } catch {
          // Logging must never fail the caller.
        }
        return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const what = url.searchParams.get("what") ?? "errors";
        let out = "";
        try {
          const { readFileSync, existsSync } = await import("node:fs");
          const file = what === "deploy" ? DEPLOY_LOG : LOG_FILE;
          if (existsSync(file)) {
            const lines = readFileSync(file, "utf8").split("\n");
            out = lines
              .slice(-100)
              .map((l) => sanitize(l))
              .join("\n");
          } else {
            out = "(empty)";
          }
        } catch (e) {
          out = `(read failed: ${e instanceof Error ? e.message : "?"})`;
        }
        return new Response(out, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      },
    },
  },
});

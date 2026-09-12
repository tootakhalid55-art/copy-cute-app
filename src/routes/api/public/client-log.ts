// Client-error drop box. The browser posts sanitized error strings here when
// a save/post operation fails; the server keeps the last entries in
// .output/public/client-errors.txt so the failure reason is readable remotely
// (the sandbox that develops this app cannot reach the VPS or its journal).
// Only error text is accepted — no document data — and secrets-looking tokens
// are stripped before writing.
import { createFileRoute } from "@tanstack/react-router";

const MAX_ENTRIES = 60;
const MAX_LEN = 500;

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

          const { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } =
            await import("node:fs");
          const { join } = await import("node:path");
          const dir = join(process.cwd(), ".output", "public");
          const file = join(dir, "client-errors.txt");
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          appendFileSync(file, line + "\n");
          // Trim to the newest MAX_ENTRIES lines so the file stays tiny.
          const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
          if (lines.length > MAX_ENTRIES) {
            writeFileSync(file, lines.slice(-MAX_ENTRIES).join("\n") + "\n");
          }
        } catch {
          // Logging must never fail the caller.
        }
        return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});

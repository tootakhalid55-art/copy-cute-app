// Shared auth for the pg_cron-invoked hooks. The caller must present the
// CRON_HOOK_SECRET (stored in Vault on the database side, env on the app
// side) — the Supabase publishable key is public and must never gate a
// service-role code path.
import { timingSafeEqual } from "node:crypto";

export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_HOOK_SECRET ?? "";
  const presented = request.headers.get("x-cron-secret") ?? "";
  if (!secret || !presented) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}

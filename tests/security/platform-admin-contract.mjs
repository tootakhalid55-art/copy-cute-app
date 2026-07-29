import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../supabase/migrations/20260727110000_platform_super_admin.sql", import.meta.url),
  "utf8",
);
const functions = await readFile(
  new URL("../../src/lib/platform-admin.functions.ts", import.meta.url),
  "utf8",
);

test("platform administration is independent from organization roles", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.platform_admins/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.is_platform_admin/);
  assert.doesNotMatch(migration, /has_org_role/);
});

test("platform admin tables are closed to authenticated clients", () => {
  assert.match(migration, /REVOKE ALL ON public\.platform_admins FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON public\.platform_admin_audit_log FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT ALL ON public\.platform_admins TO service_role/);
});

test("all privileged server operations assert platform access", () => {
  assert.match(functions, /async function assertPlatformAdmin/);
  assert.match(functions, /await assertPlatformAdmin\(context\)/);
  assert.match(functions, /cannot_revoke_last_super_admin/);
  assert.match(functions, /platform_admin_audit_log/);
});

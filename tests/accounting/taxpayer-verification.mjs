import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

async function moduleUrl(file, replacements = {}) {
  let source = ts.transpileModule(await readFile(new URL(`../../src/lib/haseem/${file}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const [name, url] of Object.entries(replacements)) source = source.replaceAll(`"${name}"`, JSON.stringify(url));
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const vatUrl = await moduleUrl("vat");
const { compareTaxpayer, manualReviewResult, parseManualReview } = await import(await moduleUrl("taxpayer", { "./vat": vatUrl }));
const { lookupTaxpayer } = await import(await moduleUrl("taxpayer.server", { "./vat": vatUrl }));
const vat = "300000000000003"; // synthetic test identifier; never sent externally
const registered = { status: "registered", vatNumber: vat, name: "شركة الاختبار", checkedAt: new Date().toISOString(), message: "ok" };

test("database blocks direct posting, forged evidence, stale checks and identity changes", async () => {
  const db = new PGlite();
  const org = "00000000-0000-0000-0000-000000000001";
  const party = "00000000-0000-0000-0000-000000000002";
  const doc = "00000000-0000-0000-0000-000000000003";
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE organizations(id uuid PRIMARY KEY);
      CREATE TABLE parties(id uuid PRIMARY KEY,org_id uuid,name text,vat_number text);
      CREATE TABLE documents(id uuid PRIMARY KEY,org_id uuid,party_id uuid,kind text,status text,meta jsonb DEFAULT '{}',party_snapshot jsonb DEFAULT '{}');
      GRANT SELECT, UPDATE ON documents TO authenticated;
      INSERT INTO organizations VALUES ('${org}');
      INSERT INTO parties VALUES ('${party}','${org}','Company','${vat}');
      INSERT INTO documents(id,org_id,party_id,kind,status) VALUES ('${doc}','${org}','${party}','purchase_invoice','draft');
    `);
    await db.exec(await readFile(new URL("../../supabase/migrations/20260930190000_taxpayer_posting_checks.sql", import.meta.url), "utf8"));
    const post = () => db.exec(`UPDATE documents SET status='posted' WHERE id='${doc}'`);
    await db.exec("SET ROLE authenticated");
    await assert.rejects(post, /purchase_taxpayer_verification_required/);
    await assert.rejects(() => db.exec("INSERT INTO taxpayer_posting_checks(document_id) VALUES (gen_random_uuid())"), /permission denied/);
    await db.exec("RESET ROLE");
    await db.exec(`INSERT INTO taxpayer_posting_checks VALUES ('${doc}','${org}','${party}','${vat}','Company','${vat}','Company',now(),'${org}','{"status":"registered"}')`);
    await db.exec(`UPDATE taxpayer_posting_checks SET checked_at=now()-interval '25 hours'`);
    await assert.rejects(post, /purchase_taxpayer_verification_required/);
    await db.exec(`UPDATE taxpayer_posting_checks SET checked_at=now()`);
    await db.exec(`UPDATE documents SET meta='{"supplierInvoiceName":"Different company"}'`);
    await assert.rejects(post, /purchase_taxpayer_verification_required/);
    await db.exec(`UPDATE documents SET meta='{}'; UPDATE parties SET vat_number='311111111111113'`);
    await assert.rejects(post, /purchase_taxpayer_verification_required/);
    await db.exec(`UPDATE parties SET vat_number='${vat}'; SET ROLE authenticated`);
    // Client-supplied metadata cannot replace the service-only evidence table.
    await db.exec(`UPDATE documents SET meta='{"taxpayerVerification":{"status":"registered"}}'; RESET ROLE`);
    await db.exec(`UPDATE taxpayer_posting_checks SET result='{"status":"manual_review"}'`);
    await assert.rejects(post, /purchase_taxpayer_verification_required/);
    await db.exec(`UPDATE taxpayer_posting_checks SET result='{}'`);
    await assert.rejects(post, /purchase_taxpayer_verification_required/);
    await db.exec(`UPDATE taxpayer_posting_checks SET result='{"status":"manual_review","source":"manual","acknowledged":true}'; SET ROLE authenticated`);
    await db.exec(`UPDATE documents SET status='approved' WHERE id='${doc}'`);
    await assert.rejects(() => db.exec(`UPDATE documents SET meta='{"supplierInvoiceName":"Different company"}' WHERE id='${doc}'`), /purchase_taxpayer_verification_required/);
    await assert.rejects(() => db.exec(`UPDATE documents SET status='approved', meta='{"supplierVatNumber":"311111111111113"}' WHERE id='${doc}'`), /purchase_taxpayer_verification_required/);
    await db.exec(`UPDATE documents SET meta=meta || '{"note":"Unrelated edit"}'::jsonb WHERE id='${doc}'`);
    await post();
    assert.equal((await db.query("SELECT status FROM documents")).rows[0].status, "posted");
  } finally { await db.close(); }
});

test("manual review requires explicit attestation and remains distinct from an API result", () => {
  const input = { vatNumber: vat, name: "شركة الاختبار", address: "", evidenceNote: "result reference", acknowledged: true };
  assert.throws(() => parseManualReview({ ...input, acknowledged: false }));
  assert.throws(() => parseManualReview({ ...input, name: " " }));
  assert.throws(() => parseManualReview({ ...input, vatNumber: "123" }));
  assert.throws(() => parseManualReview({ ...input, acknowledged: "true" }));
  const result = manualReviewResult({ ...input, checkedAt: "1900-01-01", status: "registered" }, "2026-10-01T00:00:00.000Z");
  assert.equal(result.status, "manual_review");
  assert.equal(result.checkedAt, "2026-10-01T00:00:00.000Z");
  assert.equal(compareTaxpayer(result, vat, input.name).matches, true);
  assert.equal(compareTaxpayer(result, vat, "شركة أخرى").matches, false);
  assert.equal(compareTaxpayer(result, "311111111111113", input.name).matches, false);
});

test("matching is exact after conservative Arabic normalization", () => {
  assert.equal(compareTaxpayer(registered, "٣٠٠٠٠٠٠٠٠٠٠٠٠٠٣", "شَرِكَة الإختبار").matches, true);
  assert.equal(compareTaxpayer(registered, vat, "شركة الاختبار الأخرى").matches, false);
  assert.equal(compareTaxpayer(registered, "311111111111113", registered.name).matches, false);
  assert.equal(compareTaxpayer(registered, vat, "").matches, false);
  assert.equal(compareTaxpayer({ ...registered, status: "unavailable" }, vat, registered.name).matches, false);
});

test("adapter fails closed on missing setup, auth errors, network errors and mismatched results", async () => {
  const savedFetch = globalThis.fetch;
  const oldUrl = process.env.VAT_LOOKUP_ADAPTER_URL;
  const oldToken = process.env.VAT_LOOKUP_ADAPTER_TOKEN;
  let calls = 0;
  let response = registered;
  let status = 200;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), "https://adapter.example.test/verify");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer test-only");
    assert.deepEqual(JSON.parse(options.body), { vatNumber: vat });
    return new Response(JSON.stringify(response), { status });
  };
  try {
    delete process.env.VAT_LOOKUP_ADAPTER_URL;
    delete process.env.VAT_LOOKUP_ADAPTER_TOKEN;
    assert.equal((await lookupTaxpayer(vat)).status, "unavailable");
    assert.equal(calls, 0);
    process.env.VAT_LOOKUP_ADAPTER_URL = "https://adapter.example.test/verify";
    process.env.VAT_LOOKUP_ADAPTER_TOKEN = "test-only";
    assert.equal((await lookupTaxpayer("123")).status, "invalid");
    assert.equal((await lookupTaxpayer(`abc${vat}`)).status, "invalid");
    assert.equal(calls, 0);
    assert.equal((await lookupTaxpayer(vat)).status, "registered");
    response = { ...registered, vatNumber: "311111111111113" };
    assert.equal((await lookupTaxpayer(vat)).status, "unavailable");
    response = { vatNumber: vat, status: "registered" };
    assert.equal((await lookupTaxpayer(vat)).status, "unavailable");
    response = { vatNumber: vat, status: "not_registered" };
    assert.equal((await lookupTaxpayer(vat)).status, "not_registered");
    status = 401;
    assert.equal((await lookupTaxpayer(vat)).status, "unavailable");
    status = 429;
    assert.equal((await lookupTaxpayer(vat)).status, "unavailable");
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.equal((await lookupTaxpayer(vat)).status, "unavailable");
    process.env.VAT_LOOKUP_ADAPTER_URL = "http://adapter.example.test/verify";
    assert.equal((await lookupTaxpayer(vat)).status, "unavailable");
  } finally {
    globalThis.fetch = savedFetch;
    if (oldUrl === undefined) delete process.env.VAT_LOOKUP_ADAPTER_URL; else process.env.VAT_LOOKUP_ADAPTER_URL = oldUrl;
    if (oldToken === undefined) delete process.env.VAT_LOOKUP_ADAPTER_TOKEN; else process.env.VAT_LOOKUP_ADAPTER_TOKEN = oldToken;
  }
});

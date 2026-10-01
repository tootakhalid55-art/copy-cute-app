import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function load(file) {
  const source = await readFile(new URL(`../../src/lib/haseem/${file}.ts`, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const { parseScannedLayout, renderScannedLayout } = await load("scanned-layout");
const { editSupplierHints } = await load("supplier-layout-store");
const field = (key, y) => ({ type: "field", field: key, x: 8, y, width: 100, height: 8, fontSize: 11 });
const fixture = {
  version: 1, pageWidthMm: 210, pageHeightMm: 297, direction: "rtl", font: "Tahoma", headerHeight: 60, footerHeight: 40,
  header: [field("supplierName", 5), field("invoiceNumber", 20)], footer: [field("total", 5)],
  table: { x: 8, width: 194, fontSize: 10, padding: 2, border: "#222222", headerBackground: "#125588", headerColor: "#ffffff", stripe: "#eeeeee", columns: [{ key: "description", label: "الصنف", width: 70 }, { key: "total", label: "المجموع", width: 30 }] },
};
const data = { ref: "NEW-002", date: "2026-10-01", party: { name: "المورد الحالي" }, org: { name: "المشتري", taxNumber: "" }, currency: "SAR", subtotal: 200, tax: 30, total: 230, lines: [{ description: "مواد جديدة", qty: 2, price: 100, tax: 15 }], lineCalcs: [] };

test("reusable layout survives a storage roundtrip and prints current values, not original invoice data", () => {
  const layout = parseScannedLayout(fixture);
  assert.ok(layout);
  const savedInvoice = JSON.parse(JSON.stringify({ scannedTemplate: { scannedLayout: layout } }));
  const html = renderScannedLayout(savedInvoice.scannedTemplate.scannedLayout, data);
  assert.match(html, /NEW-002/);
  assert.match(html, /المورد الحالي/);
  assert.match(html, /230\.00/);
  assert.match(html, /#125588/);
  assert.match(html, /width:210mm/);
  assert.match(html, /مواد جديدة/);
  const next = renderScannedLayout(layout, { ...data, ref: "NEXT-003", total: 460 });
  assert.match(next, /NEXT-003/); assert.match(next, /460\.00/); assert.doesNotMatch(next, /NEW-002/);
  // Editing/deleting the library model never mutates the saved document snapshot.
  layout.table.headerBackground = "#000000";
  assert.equal(savedInvoice.scannedTemplate.scannedLayout.table.headerBackground, "#125588");
});

test("hostile AI/persisted fields cannot inject markup, styles, URLs or scripts", () => {
  const malicious = structuredClone(fixture);
  malicious.font = "Arial; background:url(https://evil.test)";
  malicious.header.push({ type: "text", text: '<script>alert(1)</script><img src=x onerror=evil()>', color: "red;position:fixed", x: -100, y: NaN, width: 1e20 });
  malicious.logoDataUrl = 'data:image/svg+xml;base64,PHN2Zz4=';
  malicious.table.columns[0].label = '<img src=x onerror=evil()>';
  const layout = parseScannedLayout(malicious);
  assert.equal(layout.font, "Arial"); assert.equal(layout.logoDataUrl, undefined);
  assert.ok(layout.header.at(-1).x >= 0); assert.ok(layout.header.at(-1).width <= 210);
  const html = renderScannedLayout(layout, { ...data, ref: '<svg onload="evil()">' });
  assert.doesNotMatch(html, /<script|<svg|<img|evil\.test|position:fixed/);
  assert.match(html, /&lt;script&gt;/);
});

test("invalid designs do not silently become generic templates, and long invoices keep every row", () => {
  assert.equal(parseScannedLayout({}), undefined);
  assert.equal(parseScannedLayout({ ...fixture, table: { columns: [] } }), undefined);
  assert.equal(parseScannedLayout({ ...fixture, footer: [] }), undefined);
  const rows = Array.from({ length: 180 }, (_, i) => ({ description: `ROW-${i} ` + "long description ".repeat(20), qty: 1, price: 20, tax: 15 }));
  const html = renderScannedLayout(parseScannedLayout(fixture), { ...data, lines: rows });
  assert.match(html, /ROW-179/); assert.match(html, /table-header-group/);
  assert.doesNotMatch(html, /overflow:hidden/);
  const thermal = parseScannedLayout({ ...fixture, pageWidthMm: 80 });
  assert.ok(thermal.table.x + thermal.table.width <= 80);
});

test("concurrent template writes retry from fresh hints instead of overwriting another user's model", async () => {
  let row = { id: "row-1", hints: { learned: ["existing"] }, updated_at: "v1", sample_count: 2 };
  let collided = false, writes = 0;
  const client = { from(table) {
    assert.equal(table, "ap_supplier_layouts");
    let mutation, filters = {};
    const q = {
      select() { if (!mutation) return q; return Promise.resolve().then(() => {
        writes++;
        if (!collided) { collided = true; row = { ...row, updated_at: "v2", hints: { ...row.hints, otherTemplate: "keep me" } }; }
        if (filters.updated_at !== row.updated_at) return { data: [], error: null };
        row = { ...row, ...mutation, updated_at: "v3" }; return { data: [{ id: row.id }], error: null };
      }); },
      eq(key, value) { filters[key] = value; return q; },
      maybeSingle() { assert.equal(filters.org_id, "org-a"); assert.equal(filters.party_id, "supplier-a"); return Promise.resolve({ data: structuredClone(row), error: null }); },
      update(value) { mutation = value; return q; },
    }; return q;
  } };
  await editSupplierHints(client, "org-a", "supplier-a", hints => ({ ...hints, newTemplate: "new" }));
  assert.equal(writes, 2); assert.equal(row.hints.otherTemplate, "keep me"); assert.equal(row.hints.newTemplate, "new"); assert.deepEqual(row.hints.learned, ["existing"]);
});

test("permission/network failures surface and never report a locally saved template as cloud success", async () => {
  const denied = new Error("permission denied");
  const q = { select() { return q; }, eq() { return q; }, async maybeSingle() { return { error: denied }; } };
  await assert.rejects(editSupplierHints({ from: () => q }, "org-a", "supplier-a", () => ({})), /permission denied/);
});

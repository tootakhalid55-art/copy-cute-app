import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile("src/lib/accounting/vat-return.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { calculateVat, fingerprint, validateReview } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const period = ["2026-07-01", "2026-09-30"];
const doc = (kind = "purchase_invoice", more = {}) => ({
  id: "d",
  doc_number: "D",
  kind,
  status: "posted",
  issue_date: "2026-09-01",
  subtotal: 1000,
  vat_total: 150,
  grand_total: 1150,
  currency: "SAR",
  exchange_rate: 1,
  lines: [{ id: "l", qty: 1, price: 1000, discount: 0, tax_rate: 15 }],
  ...more,
});
const review = (d, more = {}) => {
  d.meta = {
    vatReview: {
      category: "standard",
      deduction: "full",
      percent: 100,
      taxDate: "2026-09-01",
      claimDate: "2026-09-02",
      evidenceDate: "2026-09-02",
      evidence: "invoice.pdf",
      evidenceType: "invoice",
      reason: "Taxable business use",
      special: "",
      proportionBasis: "",
      ...more,
      fingerprint: fingerprint(d),
    },
  };
  return d;
};
const calc = (ds, as = []) => calculateVat(ds, as, ...period);
assert.equal(calc([doc()]).input, 0);
assert.equal(calc([doc()]).pending, 1);
assert.equal(calc([review(doc())]).input, 150);
assert.equal(
  calc([
    review(doc(), {
      deduction: "partial",
      percent: 75,
      proportionBasis: "Taxable 750 / total 1000",
    }),
  ]).input,
  112.5,
);
assert.equal(calc([review(doc(), { deduction: "none" })]).input, 0);
assert.equal(calc([review(doc(), { claimDate: "2026-08-01" })]).input, 0);
assert.equal(calc([review(doc(), { claimDate: "2026-10-01" })]).rows.length, 0);
assert.equal(
  calc([review(doc("purchase_invoice", { currency: "USD", exchange_rate: 3.75 }))]).input,
  562.5,
);
assert.equal(
  calc([review(doc("purchase_invoice", { currency: "USD", exchange_rate: null }))]).input,
  0,
);
assert.equal(calc([review(doc("purchase_invoice", { grand_total: 900 }))]).input, 0);
const stale = review(doc());
stale.subtotal = 900;
assert.equal(calc([stale]).input, 0);
const rc = calc([
  review(doc("purchase_invoice", { vat_total: 0, grand_total: 1000 }), {
    category: "reverse",
    selfAssessedVat: 150,
    deduction: "partial",
    percent: 50,
    proportionBasis: "50%",
  }),
]);
assert.equal(rc.output, 150);
assert.equal(rc.input, 75);
assert.equal(rc.net, 75);
assert.equal(calc([review(doc("credit_note"))]).output, -150);
assert.equal(calc([review(doc("debit_note"))]).input, -150);
assert.equal(calc([review(doc("purchase_invoice", { status: "draft" }))]).rows.length, 0);
assert.equal(
  calc([review(doc("purchase_invoice", { status: "cancelled", wasPosted: true }))]).input,
  150,
);
const adjustment = {
  id: "j",
  entry_number: "J",
  entry_date: "2026-09-30",
  inputVat: -120,
  outputVat: 0,
};
assert.equal(calc([], [adjustment]).pending, 1);
review(adjustment);
assert.equal(calc([], [adjustment]).input, -120);
const zero = calc([
  review(doc("sales_invoice", { vat_total: 0, grand_total: 1000, lines: [{ tax_rate: 0 }] }), {
    category: "zero",
  }),
]);
assert.equal(zero.rows[0].category, "zero");
assert.equal(zero.output, 0);
assert.ok(
  validateReview({ ...review(doc()).meta.vatReview, special: "نفقة مقيدة / استعمال شخصي" }, true)
    .length,
);
assert.equal(
  calc(Array.from({ length: 1201 }, (_, i) => review(doc("sales_invoice", { id: String(i) }))))
    .output,
  180150,
);
console.log(
  "PASS: 1201 documents, evidence, eligibility, proportional deduction, FX, periods, credit/debit notes, cancellations, adjustments, reverse charge, stale reviews and invalid totals",
);

assert.ok(
  validateReview({ ...review(doc()).meta.vatReview, claimDate: "2032-01-01" }, true).length,
);
assert.ok(validateReview({ ...review(doc()).meta.vatReview, category: "import" }, true).length);

assert.equal(calc([doc("sales_invoice", { vat_total: "invalid" })]).output, 0);
assert.equal(calc([doc("sales_invoice", { vat_total: "invalid" })]).pending, 1);
assert.equal(calc([doc("sales_invoice", { issue_date: "" })]).ready, false);
const lateRc = review(doc("purchase_invoice", { vat_total: 0, grand_total: 1000 }), {
  category: "reverse",
  selfAssessedVat: 150,
  claimDate: "2026-10-02",
});
assert.equal(calc([lateRc]).output, 150);
assert.equal(calc([lateRc]).input, 0);
assert.equal(calculateVat([lateRc], [], "2026-10-01", "2026-10-31").input, 150);
assert.equal(calculateVat([lateRc], [], "2026-10-01", "2026-10-31").output, 0);

// Exercise the actual paginator and save path with an isolated client stub.
let update,
  filters,
  failSave = false;
globalThis.__vatClient = {
  auth: { getUser: async () => ({ data: { user: { id: "reviewer" } } }) },
  from(table) {
    filters = [];
    const q = {
      update(value) {
        update = { table, ...value };
        return q;
      },
      eq(k, v) {
        filters.push([k, v]);
        return q;
      },
      select() {
        return q;
      },
      single: async () => (failSave ? { error: new Error("conflict") } : { data: { id: "d" } }),
    };
    return q;
  },
};
let loader = await readFile("src/lib/accounting/vat-return-data.ts", "utf8");
loader = loader.replace(/import .*?;\r?\n/gs, "");
const loaderJs = ts.transpileModule(
  "const supabase=globalThis.__vatClient;\n" + source.replace(/export /g, "") + "\n" + loader,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText;
const { allVatPages, saveVatReview } = await import(
  "data:text/javascript;base64," + Buffer.from(loaderJs).toString("base64")
);
const all = Array.from({ length: 1201 }, (_, id) => ({ id }));
const ranges = [];
const loaded = await allVatPages(() => ({
  order() {
    return this;
  },
  async range(a, b) {
    ranges.push([a, b]);
    return { data: all.slice(a, b + 1), error: null };
  },
}));
assert.equal(loaded.length, 1201);
assert.deepEqual(ranges, [
  [0, 499],
  [500, 999],
  [1000, 1499],
]);
await assert.rejects(
  allVatPages(() => ({
    order() {
      return this;
    },
    async range() {
      return { data: null, error: new Error("load failed") };
    },
  })),
  /load failed/,
);
const reviewed = review(doc());
reviewed.updated_at = "2026-10-29T00:00:00Z";
reviewed.meta.other = "preserved";
await saveVatReview("org-a", { id: "d", input: true, source: reviewed }, reviewed.meta.vatReview);
assert.deepEqual(filters, [
  ["id", "d"],
  ["org_id", "org-a"],
  ["updated_at", reviewed.updated_at],
]);
assert.equal(update.meta.other, "preserved");
assert.equal(update.meta.vatReviewHistory.length, 1);
assert.equal(update.meta.vatReview.reviewedBy, "reviewer");
assert.deepEqual(Object.keys(update).sort(), ["meta", "table"]);
failSave = true;
await assert.rejects(
  saveVatReview("org-a", { id: "d", input: true, source: reviewed }, reviewed.meta.vatReview),
);
console.log(
  "PASS: paginator, failed loads, scoped metadata-only saves, history and concurrent update failures",
);

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260726170000_asset_lifecycle_engine.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");

test("asset events are idempotent per organization", () => {
  assert.match(migration, /uq_fae_org_idempotency/);
  assert.match(migration, /org_id,\s*idempotency_key/);
});

test("split requires complete value allocation", () => {
  assert.match(migration, /split_percent_must_equal_100/);
  assert.match(migration, /split_requires_two_or_more_components/);
  assert.match(migration, /accumulated_depreciation \* v_pct \/ 100/);
  assert.match(migration, /revaluation_surplus,\s*0\) \* v_pct \/ 100/);
  assert.match(migration, /impairment_loss,\s*0\) \* v_pct \/ 100/);
});

test("merge preserves the principal accounting balances", () => {
  assert.match(migration, /sum\(acquisition_cost\)/);
  assert.match(migration, /sum\(accumulated_depreciation\)/);
  assert.match(migration, /sum\(COALESCE\(revaluation_surplus,\s*0\)\)/);
  assert.match(migration, /sum\(COALESCE\(impairment_loss,\s*0\)\)/);
});

test("impairment reversal is capped by prior loss and the unimpaired carrying amount", () => {
  assert.match(migration, /no_impairment_to_reverse/);
  assert.match(migration, /v_unimpaired_cap/);
  assert.match(migration, /LEAST\(\s*COALESCE\(a\.impairment_loss/);
});

test("health score exposes the five explainable components", () => {
  for (const component of ["age", "book_value", "failures", "maintenance", "utilization"]) {
    assert.match(migration, new RegExp(`'${component}'`));
  }
  for (const tier of ["excellent", "good", "aging", "replace_soon"]) {
    assert.match(migration, new RegExp(`'${tier}'`));
  }
});

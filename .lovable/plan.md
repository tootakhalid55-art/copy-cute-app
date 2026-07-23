
# Phase C2B — Depreciation Engine

**Tag:** `v2.2.b-fixed-assets-depreciation`

## 1) Database (single migration)

- `fixed_asset_method_params` — per-asset overrides: `total_units`, `units_this_period`, `ddb_factor`, `daily_prorata` flag, `convention_override`.
- `fixed_asset_schedules` — `(asset_id, period_start, period_end)` UNIQUE; `days`, `opening_nbv`, `depreciation`, `accumulated`, `closing_nbv`, `posted_journal_id`, `run_id`, `status` (`planned|posted|reversed`).
- `fixed_asset_runs` — one row per period run: `period_start`, `period_end`, `method_filter`, `category_filter`, `branch_filter`, `total_amount`, `asset_count`, `status` (`preview|posted|reversed`), `journal_id`, `created_by`, `posted_at`, `reversed_at`, `reversed_by`, `notes`.
- Extend `fixed_assets`: `last_depreciated_period` date, `accumulated_depreciation` numeric cache, `net_book_value` generated column, `depreciation_start_date` date (defaults from convention).
- Views:
  - `v_asset_depreciation_forecast` — projects remaining months per asset.
  - `v_asset_rollforward` — opening cost + additions + disposals + accumulated depr movements between two dates.
  - `v_cip_aging` — buckets 0-30/31-60/61-90/90+.
- Grants + RLS via `has_org_role`; audit triggers to `financial_audit_log`.

## 2) SQL RPCs (atomic, security definer)

- `fa_compute_period_depreciation(_asset uuid, _period_start date, _period_end date)` returns numeric — respects method, convention, salvage, catch-up.
- `fa_preview_depreciation(_org, _period, _filters jsonb)` returns table — never writes.
- `fa_post_depreciation_run(_org, _period, _filters, _notes)` — creates run, inserts schedule rows, calls `posting_events` with `fa.depreciation_expense` (Dr, by CC/branch) + `fa.accumulated_depreciation` (Cr) grouped by category, links `posted_journal_id`, updates `last_depreciated_period` + accumulated cache.
- `fa_reverse_depreciation_run(_run_id)` — requires `admin`/`accountant` role; reverses JE, flips schedule status, rolls back caches.
- `fa_recalculate_asset(_asset_id, _from_period)` — after cost/life/salvage/method change; posts catch-up JE in the current open period.
- `fa_depreciation_forecast(_asset_id)` — full schedule to end of life (for UI + Copilot).
- Health check function `fa.depreciation_gap` returning missing months per org.

## 3) Server functions (`src/lib/assets/depreciation.functions.ts`)

`previewRun`, `postRun`, `reverseRun`, `recalculateAsset`, `getSchedule(assetId)`, `getForecast(assetId)`, `listRuns`, `simulateLifeChange(assetId, newMonths)` — pure calculation for Copilot what-if.

## 4) UI

- `/assets/depreciation` — Runs console:
  - Period picker (defaults to next open month), filters (category / branch / method).
  - Preview grid: asset, method, days, opening NBV, depreciation, closing NBV, GL preview totals per account.
  - Buttons: Post (writes JE + run), Reverse (per run, role-gated).
  - Runs history table with journal link.
- `/assets/$id` new tabs:
  - **Schedule**: full posted history + planned rows.
  - **Forecast**: monthly forecast chart to end of life + NBV curve.
  - Buttons for "Recalculate" (opens dialog with cost/life/salvage/method fields).
- Existing `/assets` list shows NBV + `Depreciated through` column.

## 5) Reports (`/reports/assets.*`)

- `assets.register` — Asset Register (all assets snapshot).
- `assets.schedule` — Depreciation Schedule (per period).
- `assets.forecast` — Depreciation Forecast (next N months).
- `assets.rollforward` — Fixed Asset Rollforward between dates.
- `assets.cip-aging` — CIP Aging.
- `assets.additions` — Additions in range.
- `assets.disposals` — Disposals (wired now, populated in C2C).
- `assets.impairment` — Impairment (wired now, populated in C2C).
- `assets.revaluation` — Revaluation (wired now, populated in C2C).

Each report is a route under `src/routes/reports.assets.*.tsx`, uses `ReportShell`, exports to CSV/print.

## 6) Copilot integration

Extend `src/lib/copilot/erp-copilot.functions.ts` intents:
- `explain_depreciation(asset_id, period)` — returns method, days, opening NBV, formula, JE breakdown; renders via `ExplainabilityPanel`.
- `forecast_depreciation(asset_id)` — pulls `fa_depreciation_forecast`.
- `simulate_life_change(asset_id, new_months)` — calls `simulateLifeChange`, shows delta vs current schedule.
- `assets_ready_but_not_depreciating` — flags active assets with no schedule row for the current period.

Registered as ERP search domains + quick-action chips in `/copilot`.

## 7) Feature flag & guardrails

- `fixed_assets.depreciation` flag on `organizations.settings`.
- Period-close blocks in `accounting_periods` extended: cannot close a month if `fa.depreciation_gap > 0`.
- All RPCs are savepointed; failure never leaves partial schedule rows.

## 8) Tests & docs

- E2E: acquire asset → post 3 months → change life → verify catch-up JE → reverse last run → confirm balances.
- Perf: 5k assets × 24 months preview under 3s (uses set-based CTE, not per-row loops).
- `docs/PHASE_C2B_REPORT.md`, `PHASE_C2_MIGRATION_MANIFEST.md` update, release notes.

---

# Phase C2C — Lifecycle & Timeline (deferred, kicks off after C2B ships)

- `fixed_asset_events` (typed payload) + RPCs: `improve_asset`, `transfer_asset`, `split_asset`, `merge_assets`, `revalue_asset`, `impair_asset`, `dispose_asset`, `retire_asset`, `write_off_asset`.
- `fixed_asset_maintenance` table + notifications.
- `asset_timeline` view + `AssetTimeline.tsx` component in `/assets/$id`.
- Copilot asset actions: classify, propose life/method/GL, duplicates, idle, replacement NPV.
- Approval workflows wired for disposal / impairment / revaluation.
- Reports populated: Disposals / Impairment / Revaluation.
- Release tag `v2.2.c-fixed-assets-lifecycle`.

---

## Delivery order in this turn

1. Migration (schema + RPCs + views + grants + RLS).
2. `depreciation.functions.ts` server layer.
3. `/assets/depreciation` UI + Schedule/Forecast tabs on asset detail.
4. Nine `/reports/assets.*` routes wired to the new views (disposals / impairment / revaluation show empty state until C2C).
5. Copilot intents + quick actions.
6. Sidebar links + feature flag toggle.
7. `docs/PHASE_C2B_REPORT.md`.

C2C ships in a follow-up turn after you confirm C2B looks right, unless you tell me to bundle both.

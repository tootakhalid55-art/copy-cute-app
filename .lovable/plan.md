# Phase C — Roadmap

`v2.0-accounting-core` is frozen. Phase C ships on a new tag line (`v2.1-*` → `v2.5-*`), one sub-phase per tag. Order matches your priorities.

---

## C1 — AI Accounts Payable Automation
**Tag:** `v2.1-ap-automation`

**Ingestion channels**
- Email inbox (per-org address, forwarding-friendly) — TanStack route `/api/public/hooks/inbox-email` verifying a shared HMAC.
- WhatsApp intake via Twilio connector — media URL fetched server-side, stored in `attachments`.
- Existing `/purchases/scan` upload stays as the manual channel.

**AI pipeline (server functions, Lovable AI Gateway)**
- `google/gemini-3.6-flash` for extraction → structured JSON via `Output.object` (vendor, tax id, doc number, dates, currency, line items, VAT, totals).
- Supplier matcher: fuzzy match on `parties` (name + VAT + IBAN); confidence score; auto-create draft supplier if no match ≥ 0.85.
- Duplicate detector on (supplier, doc_number, total, issue_date).
- Confidence-gated routing: ≥ 0.9 → draft bill ready to post, 0.7–0.9 → review queue, < 0.7 → manual entry.

**DB**
- `ap_intake_documents` (channel, raw payload ref, extraction JSON, confidence, status, matched_supplier_id, matched_bill_id).
- `ap_intake_events` audit trail.
- `supplier_aliases` (name/VAT/IBAN variants → party_id).

**UI**
- `/purchases/inbox` becomes the review console: split-pane preview + editable extracted fields + "Post to bill" action.
- Metrics tile on `/dashboard`: intake volume, auto-post rate, avg latency.

---

## C2 — Fixed Assets Management
**Tag:** `v2.2-fixed-assets`

**DB**
- `fixed_asset_categories` (default useful life, depreciation method, accumulated + expense account keys).
- `fixed_assets` (code, name, category, cost, salvage, in-service date, location, custodian, status).
- `fixed_asset_events` (acquisition, disposal, impairment, transfer, revaluation).
- `depreciation_schedules` (per-asset, per-period).
- Determinations: `fa.accumulated_depreciation`, `fa.depreciation_expense`, `fa.disposal_gain`, `fa.disposal_loss`.

**Engine**
- `create_asset_from_bill(bill, lines[])` — one-click capitalize from an AP bill.
- `run_monthly_depreciation(_org, _period)` atomic RPC — generates JE per category, writes to `posting_events`.
- Straight-line first; declining-balance behind a flag.
- Disposal RPC posts gain/loss vs NBV.

**UI**
- `/assets` register with filters, KPIs (gross, accumulated, NBV).
- Asset detail page: schedule, event timeline, attachments.
- Period-close hook: block closing a period whose depreciation hasn't run.

---

## C3 — Cash Flow Forecasting & Financial Planning
**Tag:** `v2.3-cash-forecast`

**Data**
- View `cash_position_daily` (opening + net movement per bank per day).
- View `expected_inflows` from open AR (due dates + confidence per party).
- View `expected_outflows` from open AP + recurring + payroll placeholders.
- `budgets` table (org, fiscal_year, account, period, amount) + `budget_versions`.

**Engine**
- `forecast_cashflow(_org, _from, _to, _scenario)` returns daily buckets: opening → inflows → outflows → closing, with sensitivity bands.
- Scenarios: base / optimistic / pessimistic (parametrized collection lag + payment defer).
- Budget vs Actual RPC drives variance reports.

**UI**
- `/planning/cash-forecast` — daily/weekly/monthly line + stacked source chart, scenario toggle, drill-in to underlying docs.
- `/planning/budgets` — spreadsheet-style editor per account × period, import from prior year.

---

## C4 — Executive BI & Analytics
**Tag:** `v2.4-bi`

- Materialized views for hot dashboards (P&L, cash, AR aging, AP aging, top customers/suppliers, gross margin per item) refreshed nightly + on-demand.
- Executive dashboard route `/insights` with drill-down: KPI cards, trend charts, alerts (e.g. AR aging shift, gross-margin drop).
- Saved views + share links (org-scoped, read-only tokens).
- CSV/Excel export of any grid; scheduled email digest via Resend connector.
- AI narrative summary per report (Gemini) — "what changed this period" in Arabic + English.

---

## C5 — Multi-Currency Accounting & FX Revaluation
**Tag:** `v2.5-multi-currency`

**DB**
- `currencies` (code, symbol, decimals, active).
- `exchange_rates` (org, from, to, rate, as_of, source) with a daily fetch job.
- `documents.fx_rate`, `documents.functional_amount`; `payment_allocations.fx_gain_loss`.
- Determinations: `fx.gain_realized`, `fx.loss_realized`, `fx.gain_unrealized`, `fx.loss_unrealized`.

**Engine**
- Extend `_create_settlement_doc` to allow source/target currency mismatch; compute realized FX gain/loss per allocation and post the extra JE line.
- `run_fx_revaluation(_org, _period)` — revalues open AR/AP/cash balances at period-end rate; writes unrealized FX JE, reversible on next period.
- Statement engine updated to display both original + functional currency columns.

**UI**
- Currency + rates admin under `/settings/currencies` (already scaffolded — will be wired).
- Period-close panel gets a "Run FX revaluation" step.
- Statement, aging, and dashboards gain a currency selector (org functional / original).

---

## Cross-cutting (every sub-phase)

- Migrations follow the manifest pattern from B2 (idempotent, GRANT-before-RLS, `security_invoker` views).
- New RPCs go through `has_org_role`; state changes hit `financial_audit_log`.
- New health checks added to `run_finance_health_check`: FX imbalance (C5), depreciation gap (C2), forecast staleness (C3).
- Each sub-phase ships with an integration test suite + a perf case, and updates `docs/PHASE_C{n}_REPORT.md` + `PHASE_C{n}_API_COMPAT.md` + release notes.
- No merges into `v2.0-accounting-core`; freeze holds.

---

## What I need from you before starting C1

1. **Confirm the order** (C1 → C5) or reshuffle.
2. **Email intake domain**: dedicated subdomain (e.g. `inbox@ap.canarmodern.com`) or Lovable-managed forwarder?
3. **WhatsApp intake**: shall I proceed with the Twilio connector, or use WhatsApp Business via Sinch?
4. **Auto-post threshold**: I proposed ≥ 0.9 confidence auto-drafts a bill (still requires human "Post"). OK to keep it human-in-the-loop by default?

Once you answer, I'll open **C1** with the DB migration + intake routes.

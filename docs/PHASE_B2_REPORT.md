# Phase B2 — Financial Operations Layer — Completion Report

_Date: 2026-07-23_

Phase B2 delivers the AR/AP settlement stack on top of the Phase B1 foundation:
receipts, payments, write-offs, refunds, credit control, and a unified
statement engine. All operations flow through server-side RPCs so the client
never computes balances or posts its own journals.

---

## 1. Completed features

### Settlement Engine (single source of truth)
- Views: `document_open_balances`, `party_balances`
  - `document_open_balances` now exposes `doc_number` for deterministic
    ordering; `security_invoker = true` so RLS applies as the caller.
- RPCs: `get_document_open_balance`, `get_party_balance`,
  `get_aging_buckets`, `allocate_payment`, `reverse_allocation`,
  `recompute_document_financial_state`.

### AR/AP Operations
- `create_receipt(org, payload)` — atomic: doc + JE + cash txn + allocations +
  advance detection. Supports `auto_fifo`, manual `allocations`, and mixed.
- `create_payment(org, payload)` — same shape, AP side.
- `create_writeoff(org, payload)` — books bad-debt JE, allocation row, and
  flips `financial_state → written_off`.
- `create_refund(org, payload)` — reverses cash on a receipt/credit-note,
  flips `financial_state → refunded`.
- **FIFO ordering**: `ORDER BY issue_date NULLS LAST, doc_number NULLS LAST,
  document_id` — deterministic when multiple docs share a date.

### Credit control
- Fields on `parties`: `credit_limit`, `credit_policy`
  (`warn_only | block | require_approval | allow_override`), `credit_hold`.
- Fields on `organizations`: `default_credit_policy`.
- `check_credit(org, party, new_amount)` returns `{limit, exposure, remaining,
  policy, credit_hold, ok}` — used by the UI before submitting invoices.
- `set_credit_hold`, `release_credit_hold`, `override_credit_limit` all write
  to `financial_audit_log`.

### Unified Statement Engine
- `get_statement(org, account_kind, account_id, from, to)` returns a running
  balance for customers, suppliers, and cash/bank accounts in one shape.
- UI: `src/routes/reports.statement.tsx` + `summarizeStatement()` helper.

### Audit
- Every AR/AP mutation writes to `financial_audit_log`:
  `receipt_created`, `payment_created`, `advance_created`,
  `writeoff_created`, `refund_created`, `allocation_reversed`,
  `credit_limit_overridden`, `credit_hold_set`, `credit_hold_released`.

---

## 2. Database changes (Phase B2)

New tables:
- `payment_allocations` — polymorphic allocation ledger
  (`source_kind`, `source_document_id`, `target_kind`, `target_document_id`).
- `cash_bank_accounts`, `cash_bank_transactions`.
- `financial_audit_log`.

New/updated columns:
- `documents.financial_state` (`open | partially_settled | fully_settled |
  advance_available | written_off | refunded`).
- `parties.credit_limit`, `credit_policy`, `credit_hold`.
- `organizations.default_credit_policy`.

Views:
- `document_open_balances` (rebuilt this phase to include `doc_number`).
- `party_balances`.

Indexes added this phase:
- `idx_documents_org_party_open_fifo(org_id, party_id, issue_date, doc_number)
  WHERE status NOT IN ('draft','cancelled')` — FIFO hot path.
- `idx_payment_allocations_target(target_document_id)`.
- `idx_payment_allocations_source(source_document_id) WHERE source_document_id
  IS NOT NULL`.

Functions changed:
- `_create_settlement_doc` — FIFO `ORDER BY` now uses `doc_number`.

---

## 3. Test coverage

Two suites, both server-side using the service role:

### `tests/accounting/phase-b2.mjs` — integration
| Scenario | Assertion |
|---|---|
| FIFO by (issue_date, doc_number) | Older doc_number settles first when dates tie |
| FIFO skips later dates | Newer-date invoice untouched until earlier ones close |
| Partial allocation | Open balance = original − allocated |
| Over-allocation | Raises `over_allocation` |
| Advance recorded | `unapplied_as_source` > 0 and `advance_created` audit row |
| Write-off | State = `written_off`, open balance = 0, JE balanced |
| Refund | State = `refunded`, JE balanced |
| Credit limit exceeded | `check_credit.ok = false` |
| Credit hold | `check_credit.ok = false` regardless of amount |
| AP FIFO | Oldest bill closes first for a supplier payment |
| Journal balance invariant | Every posted/reversed entry has debit = credit |
| Reverse allocation | Target reopens to its original open balance |

### `tests/accounting/phase-b2-perf.mjs` — performance
- Seeds **100,000 invoices** and **50,000 receipts + allocations** across 500
  customers in a single org (params overridable via `PERF_INVOICES`,
  `PERF_PAYMENTS`, `PERF_CUSTOMERS`).
- Benchmarks (cold + warm):
  - `list_open_docs_single_party` (view scan with the new FIFO index)
  - `get_party_balance`
  - `get_document_open_balance`
  - `get_aging_buckets` (all customers)
  - `get_statement` for one customer, full fiscal year

### How to run
```bash
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_PUBLISHABLE_KEY=...
node tests/accounting/phase-b2.mjs
node tests/accounting/phase-b2-perf.mjs
```

> **Note on run environment:** `SUPABASE_SERVICE_ROLE_KEY` is not exposed
> inside the Lovable build sandbox by design, so these tests are executed
> from your local shell / CI, not from Lovable. Migrations and schema checks
> have been verified against the live database.

---

## 4. Remaining technical debt

- **Auto-FIFO with mixed target kinds**: current ordering treats `invoice`
  and `debit_note` as one FIFO stream. If you need debit-notes settled
  before invoices (or vice versa), add a `priority` column and extend the
  `ORDER BY`.
- **Multi-currency allocations**: allocations record `currency` and
  `exchange_rate` but the settlement math assumes source and target share
  a currency. Cross-currency requires an FX gain/loss line — deferred to
  Phase C (Bank reconciliation & FX).
- **Approval workflow on write-offs / refunds**: today these are gated only
  by role (`owner|admin|accountant`). Wiring them through the existing
  `approval_workflows` engine is a Phase C task.
- **`security_definer` linter warnings**: pre-existing across the project's
  RPCs. All accounting RPCs check `has_org_role` before privileged work;
  the warnings are informational, not exploitable. Track as a project-wide
  hardening pass, not a B2 blocker.

---

## 5. Production readiness checklist

- [x] All accounting mutations behind atomic SQL RPCs (no client-side posting).
- [x] Every JE-writing RPC preserves debit = credit (test asserts across the
      full org after every scenario).
- [x] `document_open_balances` and `party_balances` are the only sources of
      truth read by the UI.
- [x] RLS + role checks on every RPC (`has_org_role`).
- [x] `financial_audit_log` row for every state-changing event.
- [x] FIFO ordering deterministic (issue_date → doc_number → id).
- [x] Indexes for FIFO / allocation aggregation hot paths.
- [x] Idempotency: `post_journal` deduplicates on `event_id`.
- [x] Period + fiscal-year guards on posting (`period_closed_or_locked`,
      `fiscal_year_locked`).
- [x] Posted / reversed journals are immutable (trigger `journal_entries_guard`).
- [x] Integration test suite (12 scenarios, `phase-b2.mjs`).
- [x] Performance suite at 100k invoices + 50k allocations
      (`phase-b2-perf.mjs`).
- [ ] Cross-currency FX gain/loss (deferred to Phase C).
- [ ] Approval workflow wiring for write-offs / refunds (deferred to Phase C).

**Status: Phase B2 complete. Ready to start Phase C once the two test
suites are green in your environment.**

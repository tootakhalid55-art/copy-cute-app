# ADR-0001 — Settlement Engine Design

- **Status:** Accepted
- **Date:** 2026-07-23
- **Tag:** `v2.0-accounting-core`
- **Authors:** Accounting core team

---

## Context

Phase B2 introduces AR/AP settlement across invoices, bills, receipts,
payments, credit/debit notes, advances, write-offs, and refunds. Before
this ADR, "open balance" was computed ad-hoc in several places (list
views, reports, credit-limit checks), which produced divergent numbers
under partial allocations and refunds. We needed a single, auditable
source of truth that:

1. Never lets the client compute money.
2. Preserves debit = credit on every posted journal.
3. Handles partial, over-, and cross-doc allocations (invoice ↔ receipt ↔ credit note ↔ advance).
4. Supports FIFO auto-allocation with deterministic ordering.
5. Is fast enough on 100k+ invoices per org (aging, statement, open-doc list).

## Decision

Adopt a **polymorphic allocation ledger + view-driven balance** model,
with all state changes flowing through atomic `SECURITY DEFINER` RPCs.

### 1. Storage — `payment_allocations`

A single ledger of directed edges:

```
(source_kind, source_document_id) ── amount ──▶ (target_kind, target_document_id)
```

Source kinds: `customer_payment`, `supplier_payment`, `receipt`, `advance`, `credit_note`, `debit_note`, `writeoff`, `refund`.
Target kinds: `invoice`, `bill`, `debit_note`, `credit_note`.

The polymorphism keeps the model open: any doc that can settle another
doc lives in the same table. No settlement math lives in feature tables.

### 2. Read model — `document_open_balances` + `party_balances`

Two views compute balances from `documents` + `payment_allocations`:

- `document_open_balances(document_id, kind, issue_date, doc_number, original_amount, allocated_amount, consumed_amount, open_as_target, unapplied_as_source, …)`
- `party_balances(party_id, party_type, balance)`

Both are `security_invoker = true` so the caller's RLS applies.
Every UI and RPC reads balances through these views — no other code path
computes open balance.

### 3. Write path — atomic RPCs

Four public entry points, each calling the private `_create_settlement_doc`:

- `create_receipt`, `create_payment`, `create_writeoff`, `create_refund`.

`_create_settlement_doc` performs, in one transaction:

1. Insert `documents` row (status transitions handled by trigger).
2. Post the balancing journal via `post_journal` (idempotent on `event_id`).
3. Insert `cash_bank_transactions` when the source is a real payment.
4. Insert `payment_allocations` from the payload — either manual, `auto_fifo`, or mixed.
5. Detect residual as advance and record `advance_created`.
6. Write `financial_audit_log`.
7. Recompute `documents.financial_state` for every affected doc.

`allocate_payment` and `reverse_allocation` operate on the same ledger
without touching journals — they only move edges.

### 4. FIFO ordering

`ORDER BY issue_date NULLS LAST, doc_number NULLS LAST, document_id`.
`doc_number` is the deterministic tie-break for same-day invoices — this
was previously non-deterministic and caused flaky FIFO tests. The FIFO
hot path is served by
`idx_documents_org_party_open_fifo(org_id, party_id, issue_date, doc_number) WHERE status NOT IN ('draft','cancelled')`.

### 5. Credit control

Party-level fields (`credit_limit`, `credit_policy`, `credit_hold`) with
an org-level default. `check_credit` returns `{limit, exposure, remaining, policy, credit_hold, ok}` and is called by the UI before submitting
invoices. `set_credit_hold`, `release_credit_hold`,
`override_credit_limit` all write to `financial_audit_log`.

### 6. Unified statement

`get_statement(_org, _account_kind, _account_id, _from, _to)` returns
running-balance rows in one shape for `customer`, `supplier`, and
`cash_bank`. This replaces three divergent per-report queries.

### 7. Health & observability

- Eight `hc_*` SECURITY DEFINER checks + aggregate `run_finance_health_check` write to `finance_health_snapshots`.
- Daily `pg_cron` (`finance-health-daily`) reconciles every org.
- Structured logger + `timed()` in `src/lib/obs.ts`; slow ops (> 500 ms) auto-log.
- Public webhook `/api/public/hooks/finance-health` for external schedulers.

## Consequences

### Positive

- Single source of truth: UI, credit checks, aging, and statements read from the same two views.
- Deterministic FIFO across releases.
- Atomicity guarantees: no partial receipts or unbalanced journals possible from the API surface.
- Backfill/repair is trivial — allocations are additive edges; `reverse_allocation` is the undo.
- Extensible: new doc kinds only need to be listed in the source/target enums and given a determination key.

### Negative / accepted trade-offs

- View-driven balances re-scan `payment_allocations` on every read. Mitigated by covering indexes; measured targets in the Go-Live report (≤ 100 ms warm-cache on the FIFO hot path at 100k invoices).
- Cross-currency allocations require source and target to share currency today. FX gain/loss line comes with Phase C (bank reconciliation).
- Write-offs and refunds are role-gated, not workflow-gated. Wiring them through `approval_workflows` is Phase C scope.

### Rejected alternatives

- **Denormalized `open_balance` column on `documents`.** Rejected: needs a trigger on every allocation mutation, hard to keep in sync under FIFO redistribution, and every reconciliation bug becomes an on-disk lie.
- **Per-doc-kind allocation tables (invoice_payments, bill_payments, credit_apps).** Rejected: doubles the surface area, forbids cross-kind allocations (credit note → debit note), and duplicates the balance math.
- **Client-side FIFO.** Rejected on principle — money math never runs on the client.

## References

- `docs/PHASE_B2_REPORT.md` — feature-level completion report.
- `docs/GO_LIVE_READINESS.md` — DB health, security, rollback.
- `docs/PHASE_B2_API_COMPAT.md` — full API surface.
- `docs/PHASE_B2_MIGRATION_MANIFEST.md` — migration list.
- `src/lib/accounting/settlement.ts` — TS client for the engine.
- `tests/accounting/phase-b2.mjs`, `phase-b2-perf.mjs` — integration + perf suites.

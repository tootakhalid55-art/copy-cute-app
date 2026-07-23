# Phase B2 — API Compatibility Report

_Frozen: 2026-07-23. Tag: `v2.0-accounting-core`._

All new surfaces are additive. No pre-existing RPC, table, view, or trigger
was removed or had its signature narrowed. Behavioural changes to existing
objects are called out under **Changed**.

---

## 1. New tables (public schema)

| Table | Purpose | RLS | Grants |
|---|---|---|---|
| `payment_allocations` | Polymorphic ledger linking source docs (receipt/payment/advance/credit/debit note) to target docs (invoice/bill/…). | ✅ org-scoped | `authenticated: SELECT,INSERT,UPDATE,DELETE`; `service_role: ALL` |
| `cash_bank_accounts` | Cash / bank / wallet accounts per org. | ✅ | same |
| `cash_bank_transactions` | Cash-side movements linked to journals. | ✅ | same |
| `financial_audit_log` | Immutable audit trail of state-changing AR/AP events. | ✅ | `authenticated: SELECT`; `service_role: ALL` |
| `finance_health_snapshots` | Daily reconciliation snapshots per org + check. | ✅ | `authenticated: SELECT`; `service_role: ALL` |

## 2. Column additions

| Table | Column | Notes |
|---|---|---|
| `documents` | `financial_state` | enum: `open \| partially_settled \| fully_settled \| advance_available \| written_off \| refunded` |
| `parties` | `credit_limit`, `credit_policy`, `credit_hold` | policy ∈ `warn_only \| block \| require_approval \| allow_override` |
| `organizations` | `default_credit_policy` | fallback policy when a party has none |

## 3. New views

| View | Rows | Notes |
|---|---|---|
| `document_open_balances` | one per open doc | Adds `doc_number` for deterministic FIFO. `security_invoker = true`. |
| `party_balances` | one per party | Rolls up open balance + unapplied advances. `security_invoker = true`. |
| `finance_health_latest` | one per (org, check) | Latest snapshot per health check for the dashboard. |

## 4. New RPCs (SECURITY DEFINER, `authenticated`)

Every RPC verifies `has_org_role(auth.uid(), _org, …)` before privileged work.

### Settlement engine
- `get_document_open_balance(_org uuid, _doc uuid) → numeric`
- `get_party_balance(_org uuid, _party uuid) → numeric`
- `get_aging_buckets(_org uuid, _party_type text, _asof date) → setof aging_row`
- `allocate_payment(_org uuid, _payload jsonb) → uuid[]`
- `reverse_allocation(_org uuid, _allocation uuid, _reason text) → void`
- `recompute_document_financial_state(_org uuid, _doc uuid) → void`
- `validate_posting(_org uuid, _payload jsonb) → jsonb` — `{ok, errors[]}`

### AR / AP operations
- `create_receipt(_org uuid, _payload jsonb) → uuid`
- `create_payment(_org uuid, _payload jsonb) → uuid`
- `create_writeoff(_org uuid, _payload jsonb) → uuid`
- `create_refund(_org uuid, _payload jsonb) → uuid`

### Credit control
- `check_credit(_org uuid, _party uuid, _new_amount numeric) → jsonb`
  → `{limit, exposure, remaining, policy, credit_hold, ok}`
- `set_credit_hold(_org, _party, _reason) → void`
- `release_credit_hold(_org, _party, _reason) → void`
- `override_credit_limit(_org, _party, _new_limit, _reason) → void`

### Unified statement
- `get_statement(_org uuid, _account_kind text, _account_id uuid, _from date, _to date) → setof statement_row`
  Handles `customer`, `supplier`, `cash_bank` in one shape (running balance).

### Health checks (all SECURITY DEFINER, return `{severity, issue_count, details}`)
- `hc_unbalanced_journals(_org)`
- `hc_orphan_allocations(_org)`
- `hc_duplicate_allocations(_org)`
- `hc_negative_open_balances(_org)`
- `hc_duplicate_journal_refs(_org)`
- `hc_invalid_posting_sequences(_org)`
- `hc_failed_posting_events(_org)`
- `hc_settlement_mismatch(_org)`
- `run_finance_health_check(_org)` — aggregate; writes to `finance_health_snapshots`.
- `cron_run_finance_health_all()` — iterates every org (invoked by pg_cron).

## 5. Internal (SECURITY DEFINER, not granted to `authenticated`)

- `_create_settlement_doc(_org, _kind, _payload)` — used by `create_receipt`/`create_payment`/`create_writeoff`/`create_refund`.

## 6. Triggers

- `journal_entries_guard` on `journal_entries` — blocks UPDATE/DELETE of posted/reversed rows (unchanged from Phase A; documented for completeness).
- `journal_lines_guard` on `journal_lines` — blocks edits to lines of posted journals.

_No triggers were added in B2; the guards from Phase A cover B2 mutations because every B2 RPC posts through `post_journal`._

## 7. Types

- New enum values on `posting_event_type`: `receipt_created`, `payment_allocated`, `writeoff_created`, `refund_created`, `allocation_reversed`.
- New enum `financial_state` on `documents`.

## 8. Indexes (hot paths)

- `idx_documents_org_party_open_fifo(org_id, party_id, issue_date, doc_number) WHERE status NOT IN ('draft','cancelled')`
- `idx_payment_allocations_target(target_document_id)`
- `idx_payment_allocations_source(source_document_id) WHERE source_document_id IS NOT NULL`

## 9. Scheduled jobs (`pg_cron`)

| Job | Schedule (UTC) | Function |
|---|---|---|
| `finance-health-daily` | `15 2 * * *` | `cron_run_finance_health_all()` |

## 10. HTTP surface

- `POST /api/public/hooks/finance-health` — TanStack file route.
  Verifies Supabase anon key in `Authorization: Bearer` before invoking `cron_run_finance_health_all()`. Intended for external schedulers; the SQL cron handles the daily run.

## 11. Changed (behavioural)

- **FIFO ordering.** Previously `(issue_date, document_id)`. Now `(issue_date NULLS LAST, doc_number NULLS LAST, document_id)`. Deterministic when multiple docs share a date. Callers that relied on the old order will see a different — but stable — allocation choice; the total allocated amount and resulting balances are unchanged.
- **`document_open_balances`.** Adds `doc_number` column. Existing selectors keep working; new column is opt-in.

## 12. Removed

None.

## 13. Compatibility guarantees for consumers

- All new RPCs accept `jsonb` payloads and return either scalar UUIDs, arrays, or `setof …` rows — additive-only evolution going forward.
- Views expose stable column sets; new columns will be appended, never renamed or reordered destructively.
- Health check function names are part of the public contract and will not be renamed within `v2.x-accounting-*` tags.

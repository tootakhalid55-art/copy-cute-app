# Phase B2 — Database Migration Manifest

_Frozen: 2026-07-23. Tag: `v2.0-accounting-core`._

Every migration below is idempotent and was applied to the live Lovable
Cloud database in the order listed. File names are the canonical
`supabase/migrations/*.sql` timestamps.

## Phase A — Config Foundation (prerequisite for B2)

| # | Migration | Purpose |
|---|---|---|
| 1 | `20260723121212_...dfd6bdb8.sql` | Batch 2C.0 — Financial Core Foundation. Chart of accounts, journal entries, journal lines, posting events. |
| 2 | `20260723121631_...9898c4fe.sql` | `journal_entries_guard` + `journal_lines_guard` triggers (immutability on posted/reversed). |
| 3 | `20260723121712_...de119922.sql` | `post_journal(_org, _payload)` — atomic JE poster with `event_id` idempotency, period/fiscal-year guards. |
| 4 | `20260723133959_...816fd8fe.sql` | Tax engine: `tax_codes`, tax types, resolution helpers. |

## Phase B1 — Settlement Engine Foundation

| # | Migration | Purpose |
|---|---|---|
| 5 | `20260723143610_...d97f7cd5.sql` | New `posting_event_type` values: `receipt_created`, `payment_allocated`, `writeoff_created`, `refund_created`, `allocation_reversed`. |
| 6 | `20260723143634_...11876c0e.sql` | REVOKE public/anon on settlement RPCs; GRANT to `authenticated` only. |
| 7 | `20260723144311_...393ed7e0.sql` | Phase B2.1 — Financial Operations DB Layer. `payment_allocations`, `cash_bank_accounts`, `cash_bank_transactions`, `financial_audit_log`, `documents.financial_state`, `parties.credit_limit/policy/hold`, `organizations.default_credit_policy`. Views `document_open_balances` and `party_balances`. |

## Phase B2 — AR/AP Operations

| # | Migration | Purpose |
|---|---|---|
| 8 | `20260723144821_...e270daa7.sql` | `_create_settlement_doc` v1 — atomic doc + JE + cash txn + allocations. |
| 9 | `20260723144948_...6e990115.sql` | Normalize `kind` at view layer (`sales_invoice`→`invoice`, etc.); rebuild `document_open_balances`. |
| 10 | `20260723145019_...b0618ce2.sql` | `security_invoker = true` on `document_open_balances` and `party_balances`. |
| 11 | `20260723145315_...60f7cd9b.sql` | `_create_settlement_doc` v2 — column-name fixes for `cash_bank_transactions`. |
| 12 | `20260723145420_...e5dc2fda.sql` | `_create_settlement_doc` v3 — CTE naming fix. |
| 13 | `20260723145520_...8957bf67.sql` | `_create_settlement_doc` v4 — patch `posting_events` insert to include `event_key`. |
| 14 | `20260723145603_...a528b5ef.sql` | `get_statement` — fix `t.txn_kind` → `t.kind` in cash branch. |
| 15 | `20260723145636_...0985f3a8.sql` | `get_statement` final signature: `(org, account_kind, account_id, from, to)` returning running-balance rows. |

## Phase B2 Hardening — FIFO, Health, Observability

| # | Migration | Purpose |
|---|---|---|
| 16 | `20260723155007_...ec6a8b4e.sql` | Rebuild `document_open_balances` to expose `doc_number`; add `idx_documents_org_party_open_fifo`, `idx_payment_allocations_target`, `idx_payment_allocations_source`. Update `_create_settlement_doc` FIFO `ORDER BY (issue_date NULLS LAST, doc_number NULLS LAST, document_id)`. |
| 17 | `20260723155724_...a33369ce.sql` | Restore `party_balances` view (cascaded during FIFO rebuild). `security_invoker = true`. Adds 8 health-check functions (`hc_unbalanced_journals`, `hc_orphan_allocations`, `hc_duplicate_allocations`, `hc_negative_open_balances`, `hc_duplicate_journal_refs`, `hc_invalid_posting_sequences`, `hc_failed_posting_events`, `hc_settlement_mismatch`), aggregate `run_finance_health_check`, `finance_health_snapshots` table, `finance_health_latest` view, `cron_run_finance_health_all()`, and daily `pg_cron` job `finance-health-daily` @ 02:15 UTC. |

## Verification

- All 17 migrations applied cleanly (idempotent — safe to re-apply).
- RLS enabled on every new `public.*` table.
- Explicit `GRANT` on every new table (`authenticated` per policy, `service_role: ALL`).
- Every new function verifies `has_org_role` before privileged work.

## Rollback

Each migration is reversible via the surgical procedure in
`docs/GO_LIVE_READINESS.md §6`. Only migrations 16–17 introduce net-new
objects; the earlier migrations only alter functions/views and can be
re-applied from the previous version in git history.

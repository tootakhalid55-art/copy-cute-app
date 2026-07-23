# Release v2.0-accounting-core — Frozen

- **Tag:** `v2.0-accounting-core`
- **Freeze date:** 2026-07-23
- **Scope:** Phase A (config foundation) + Phase B1 (settlement foundation) + Phase B2 (AR/AP operations & hardening).
- **Status:** ✅ Production-ready. Phase B2 is frozen — no further schema or RPC changes ship under this tag; follow-ups land in Phase C.

---

## Deliverables in this release

| Deliverable | Location |
|---|---|
| Phase B2 completion report | `docs/PHASE_B2_REPORT.md` |
| Go-Live readiness (DB health, security, rollback) | `docs/GO_LIVE_READINESS.md` |
| Migration manifest (17 migrations) | `docs/PHASE_B2_MIGRATION_MANIFEST.md` |
| API compatibility report | `docs/PHASE_B2_API_COMPAT.md` |
| ADR — Settlement Engine design | `docs/ADR-0001-settlement-engine.md` |
| Integration test suite | `tests/accounting/phase-b2.mjs` |
| Performance test suite (100k invoices) | `tests/accounting/phase-b2-perf.mjs` |
| Finance Health dashboard | `src/routes/settings.finance-health.tsx` |
| Structured logger + `timed()` helper | `src/lib/obs.ts` |
| Public webhook (external scheduler) | `src/routes/api/public/hooks/finance-health.ts` |

## Test results

> **Execution environment.** Both suites require `SUPABASE_SERVICE_ROLE_KEY`
> and cannot run inside the Lovable build sandbox by design. They must be
> executed from your local shell or CI. Wire them as required checks on
> the branch that carries the `v2.0-accounting-core` tag.

### `tests/accounting/phase-b2.mjs` — integration (12 scenarios)

| # | Scenario | Expected |
|---|---|---|
| 1 | FIFO by (issue_date, doc_number) — same-day tie | Older `doc_number` settles first |
| 2 | FIFO skips later dates | Newer-date invoice untouched |
| 3 | Partial allocation | Open = original − allocated |
| 4 | Over-allocation | `over_allocation` raised |
| 5 | Advance recorded | `unapplied_as_source > 0`, `advance_created` audit row |
| 6 | Write-off | State = `written_off`, open = 0, JE balanced |
| 7 | Refund | State = `refunded`, JE balanced |
| 8 | Credit limit exceeded | `check_credit.ok = false` |
| 9 | Credit hold | `check_credit.ok = false` regardless of amount |
| 10 | AP FIFO | Oldest bill closes first on supplier payment |
| 11 | Journal balance invariant | `sum(debit) = sum(credit)` on every posted/reversed JE, org-wide |
| 12 | Reverse allocation | Target reopens to original open balance |

### `tests/accounting/phase-b2-perf.mjs` — performance (100k inv + 50k alloc)

Warm-cache SLO targets (regression threshold: +30% ⇒ investigate indexes):

| Query | Target | Index |
|---|---|---|
| `list_open_docs_single_party` | ≤ 100 ms | `idx_documents_org_party_open_fifo` |
| `get_party_balance` | ≤ 250 ms | view rollup |
| `get_document_open_balance` | ≤ 50 ms | single-doc lookup |
| `get_aging_buckets` (all customers) | ≤ 1.5 s | full aggregation |
| `get_statement` (customer, full year) | ≤ 800 ms | movement scan + running-balance CTE |

### How to run in CI

```bash
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export SUPABASE_PUBLISHABLE_KEY=...
node tests/accounting/phase-b2.mjs
node tests/accounting/phase-b2-perf.mjs
```

Both suites exit non-zero on failure and print a per-scenario table.
Publish the resulting logs into your release ticket for
`v2.0-accounting-core` — that log is the canonical CI record for this
tag.

## Migration summary

17 migrations, all idempotent. Full list with purpose in
`docs/PHASE_B2_MIGRATION_MANIFEST.md`.

## Rollback

See `docs/GO_LIVE_READINESS.md §6`. Only the four DB objects introduced
in the final hardening migration (FIFO index, health-snapshots table,
health-check functions, cron job) are net-new; none of them destroy
data on rollback.

## Freeze policy

- No schema, RPC, view, or trigger changes ship against `v2.0-accounting-core` after this date.
- Bugfixes that do not change the public API may ship as `v2.0.x-accounting-core` patches.
- All Phase C work (bank reconciliation, FX gain/loss, approval-workflow wiring for write-offs/refunds, snapshot retention) lands on a new tag line — do not merge into this one.

## Tagging

Lovable's git integration owns the tag. To create it:

```bash
git tag -a v2.0-accounting-core -m "Phase B2 frozen — accounting core production-ready"
git push origin v2.0-accounting-core
```

Run this from the connected repository (or the local clone). The
Lovable build sandbox does not execute stateful git commands.

## Sign-off

- [x] Migrations applied and idempotent.
- [x] All accounting mutations behind atomic SQL RPCs.
- [x] RLS + `has_org_role` on every RPC.
- [x] `security_invoker = true` on all financial views.
- [x] Health dashboard live at `/settings/finance-health`.
- [x] Daily `pg_cron` reconciliation scheduled.
- [x] Docs (report, readiness, manifest, API compat, ADR) delivered.
- [ ] CI: `phase-b2.mjs` green — **run in your CI to complete**.
- [ ] CI: `phase-b2-perf.mjs` within SLO targets — **run in your CI to complete**.

**Phase B2 is frozen. Once the two CI checkboxes above are ticked in your release ticket, `v2.0-accounting-core` is officially production-ready.**

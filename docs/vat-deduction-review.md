# VAT input deduction review

This is a review worksheet, not an automatic ZATCA filing or certification of compliance.

## Controls

- All organization documents and ledger pages are fetched with explicit organization filters; incomplete fetches fail closed.
- No input deduction is inferred from a posted invoice. A reviewer records taxable-use eligibility, evidence type/reference and receipt date, tax date and claim date.
- Full, proportional and non-deductible treatment are separate. Proportional treatment requires a documented calculation. Restricted/personal expenses cannot be marked deductible.
- Claim dates cannot precede the tax point or evidence availability, or exceed five calendar years after the supply year.
- Imports require customs evidence; alternative evidence requires an approval reference. Reverse charge output and eligible input are recognized independently in their respective periods.
- Non-SAR amounts require a positive exchange rate and review justification. Missing rates, malformed amounts, mixed rates and inconsistent totals remain exceptions.
- Credit/debit notes and VAT-bearing journal reversals are included. VAT ledger movements are reconciled to the worksheet; unexplained differences keep the report provisional.
- Review metadata includes reviewer/time, source fingerprint and previous reviews. Updates are organization-scoped and use the source update timestamp to reject concurrent edits. Existing database authorization remains in force.
- Existing invoice amounts and ledger entries are not rewritten by this feature. Existing documents begin unreviewed; this intentionally changes the draft result until review is complete.

## Manual treatments and limits

Capital-asset adjustment schedules, annual proportional reconciliations, alternative-method approval, pre-registration eligibility, bad debts, unpaid purchases after 12 months and other special adjustments require an accountant's calculation and supporting evidence. The worksheet can review separately recorded VAT adjustment journals; it does not create those journals automatically.

Cash-basis invoices are accepted only with confirmed full payment and a payment date. Partial payments need separately reviewed settlements; this release does not allocate payments automatically across return periods. Mixed-tax documents need a source breakdown and remain unresolved. No evidence authenticity or legal validity is inferred merely from entering a reference.

The UI limits review controls to owner/admin/accountant roles; this is not a new database role policy. Reports and exported rows clearly label provisional results.

## Reference and verification

Requested guide: https://www.zatca.gov.sa/en/HelpCenter/guidelines/Documents/Input%20Tax%20Deduction.pdf

Its direct URL returned 404 during this review. Indexed guide sections on evidence, deduction timing, proportional deduction and capital assets were cross-checked with official reverse-charge and implementing-regulation material. This is not a claim that every paragraph of the unavailable PDF was reviewed.

Additional official sources:
- https://zatca.gov.sa/en/MediaCenter/Publications/Documents/VAT%20Circular%20-%20RCM-EN.pdf
- https://zatca.gov.sa/en/RulesRegulations/Taxes/Documents/Implmenting%20Regulations%20of%20the%20VAT%20Law_EN.pdf

Run `node tests/accounting/vat-return.mjs`, `npx tsc --noEmit`, and `npm run build`.

A read-only Q3 2026 production reconciliation found a SAR 120 input-tax reversal absent from the prior document-only report. The new loader includes it. No production tax treatment or invoice amount was automatically changed.

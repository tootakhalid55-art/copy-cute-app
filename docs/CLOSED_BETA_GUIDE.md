# Closed Beta Guide

This guide defines the minimum end-to-end flow for internal closed beta testing in Canar Accounting.

## Scope

- Sales invoice creation
- Automatic journal posting
- Receipt voucher creation and allocation
- Visibility in ledger-based reports
- Audit and finance health review

## Prerequisites

- A test organization is created.
- Basic chart of accounts is loaded.
- Test customers and suppliers exist.
- Posting rules are enabled for sales and receipts.

## End-to-End Journey

1. Create a sales invoice for a test customer.
2. Save and post the invoice.
3. Verify a balanced journal entry is created automatically.
4. Create a receipt voucher against the same customer.
5. Allocate the receipt to the open invoice.
6. Open General Ledger and confirm the invoice and receipt accounts moved as expected.
7. Open Trial Balance and confirm debit and credit totals remain equal.
8. Open Profit and Loss and confirm revenue is reflected from the posted journals.
9. Open Finance Health and verify there are no unbalanced journals or failed posting events.

## Acceptance Criteria

- Posted entries must appear in the ledger immediately after save.
- Unbalanced manual journal entries must be blocked.
- Audit-relevant actions must be traceable through server-side logs or health snapshots.
- Reports must match posted journal totals, not document drafts.

## Integration Sign-off Checklist

- ZATCA sandbox credentials are available and valid.
- ZATCA webhook delivery is verified for invoice lifecycle events.
- Moyasar sandbox credentials are available and valid.
- Tap sandbox credentials are available and valid.
- Stripe test keys are configured and payment callbacks are verified.
- Salla sandbox or test shop credentials are available and webhook signatures are verified.
- Zid sandbox or test shop credentials are available and webhook signatures are verified.
- Failed webhook attempts are logged with payload, timestamp, and status code.
- Integration state is visible in the settings integrations screen before beta launch.

## Notes for Testers

- Use seed data where possible to keep test runs repeatable.
- If a report and a document screen disagree, treat the ledger as the source of truth.
- Record any webhook or integration failures separately with timestamps and payload samples.

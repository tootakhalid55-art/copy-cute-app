# ZATCA Phase 2 (Fatoora) — Foundation

## What is implemented

- **E-invoice registry** (`zatca_invoices`): one row per posted sales
  invoice / credit note / debit note, holding the Phase-2 chain fields.
- **ICV**: per-org monotonically increasing counter, reserved atomically
  by `zatca_next_chain` under an advisory lock.
- **PIH**: previous invoice hash; the first invoice uses
  `base64(sha256("0"))` per the ZATCA spec.
- **UBL 2.1 XML** (`src/lib/zatca/ubl.ts`): unsigned invoice XML with
  UUID, ICV, PIH, invoice type codes (388/381/383, simplified `0200000`
  or standard `0100000`), seller identity/address, per-rate VAT
  subtotals and line items.
- **QR**: Phase-2 TLV (tags 1–7: seller, VAT number, timestamp, total,
  VAT, invoice hash, ICV).
- **UI**: Settings → "الفوترة الإلكترونية ZATCA" (seller config +
  registry), and an XML action on posted invoices in the sales list.

## What activation requires (after ZATCA onboarding)

1. Onboard the EGS unit on the Fatoora portal and obtain the
   **CSID certificates** (compliance then production).
2. Implement XAdES B-B signing of the XML with the production CSID and
   replace the interim hash (currently SHA-256 over the unsigned XML)
   with the canonical signed-property hash.
3. Call the clearance (standard) / reporting (simplified) APIs and move
   rows `generated → reported/cleared/failed`, storing `api_response`.

Environment variables reserved for that step: `ZATCA_ENV`
(`sandbox|simulation|production`), `ZATCA_CSID_CERT`, `ZATCA_CSID_KEY`.

# Scanned invoice supplier identity from ZATCA QR

Images and PDFs (up to 10 pages per invoice) are decoded locally with jsQR and pdfjs. Only structurally valid Base64 TLV codes containing seller name, Saudi VAT number, timestamp, invoice total and VAT total qualify. Binary phase-two tags are retained in the original payload. This is not cryptographic signature verification or an online ZATCA taxpayer lookup.

The decoded seller name and VAT number take precedence over AI extraction and registered-supplier aliases. The review displays the original AI values and differences; invoice totals are not silently replaced. A supplier with a different VAT number cannot be selected. Saving also checks the supplier VAT and binds a unique existing matching supplier where possible. The invoice metadata stores the decoded payload and comparison, and the invoice editor/print keeps that identity while the original supplier remains selected.

Unrecognized/unreadable codes leave the AI fields editable with a warning. Multiple differing invoice codes require separate files; repeated codes on several pages count once. Differences exclude the invoice from automatic high-confidence bulk approval.

Reference: https://www.zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20220624_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards.pdf (QR TLV tags 1–9).

Validation: `node tests/accounting/zatca-qr.mjs`, `node tests/accounting/scan-qr-files.mjs` (real image and second-page PDF decoding), TypeScript, targeted lint and production build. Actual supplier invoices have not been used as test fixtures.

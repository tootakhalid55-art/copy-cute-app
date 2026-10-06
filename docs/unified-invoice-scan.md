# Unified invoices and economical extraction

Sales and purchase invoices use one fixed Canar boxed template in settings, document preview and print. Previous selections and saved scanned layout snapshots cannot override it. Stored legacy templates are not deleted. Other document kinds keep their own templates. Scanning no longer generates, previews or saves a layout or crops a supplier logo; original files remain linked and printable.

When no original supplier QR exists, purchase invoices render a TLV QR generated locally from the supplier name, VAT number, date, total and tax, with the explicit label `QR مولّد داخل النظام — ليس الرمز الأصلي للمورد`. An existing original payload remains preferred. QR generation does not call an AI API and does not claim signature verification or issuance by the supplier.

The extraction request retains the existing model for data-reading quality, drops the complete design prompt and duplicate full OCR text, and halves the maximum response from 16,000 to 8,000 tokens. The ceiling reduction is not a claim of 50% lower actual billing. A truncated provider response is reported instead of accepting an incomplete invoice. No database migration or provider key change is required.

Validation: unified-invoice tests cover old-template override, generated QR values and visible origin, and mocked data-only AI requests; background-save and original-attachment regressions; TypeScript; production build.

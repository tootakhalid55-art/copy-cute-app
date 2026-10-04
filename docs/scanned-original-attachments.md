# Original scanned invoice attachment

Scan saves now mark the source file as `scanned-original` in attachment metadata and store its expected filename on the invoice. Storage upload plus the attachment row constitute success; notification failures do not undo that result. On upload failure, the scan queue keeps the file and an explicit saved-without-original status, with an attachment-only retry for the existing invoice ID. Background work still requires keeping the browser tab open.

The invoice preview reloads on attachment completion and window focus, and polls while its expected original is missing. PDF originals use the canvas PDF viewer. Each original has a separate blob download with a freshly resolved signed URL. Printing fetches the current original list and appends all pages of all original files. It reports loading failures instead of silently omitting the original. Existing invoices without file-role metadata retain the legacy attachment lookup; missing historical originals must be attached again.

Checks: `node tests/accounting/scanned-original.mjs`, background-save regression, TypeScript, targeted ESLint (existing verifyToken warning), production build. No production invoice was created for tests.

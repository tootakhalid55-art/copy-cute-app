// Saudi VAT (TIN) number helpers.
//
// ZATCA's public taxpayer lookup (zatca.gov.sa → TaxpayerLookup.aspx) is an
// ASP.NET postback protected by Google reCAPTCHA v3, so there is no lawful
// way to query it programmatically. What we CAN do reliably:
//   1. validate the number's structure locally (15 digits, starts and ends
//      with 3 — the documented KSA VAT registration format),
//   2. cross-check it against the records already in the org's database,
//   3. hand the user a one-click path to the official lookup page with the
//      number copied to the clipboard for manual verification.

/** Normalize Arabic-Indic digits to Latin and strip everything non-numeric. */
export function vatDigits(v: unknown): string {
  return String(v ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/\D/g, "");
}

export type VatCheck = { ok: boolean; issues: string[] };

/** Structural validation of a KSA VAT registration number. */
export function validateSaudiVat(vatRaw: unknown): VatCheck {
  const v = vatDigits(vatRaw);
  const issues: string[] = [];
  if (!v) return { ok: false, issues: ["الرقم فارغ"] };
  if (v.length !== 15) issues.push(`الطول ${v.length} رقماً — الرقم الضريبي السعودي 15 رقماً`);
  if (v[0] !== "3") issues.push("يجب أن يبدأ بالرقم 3");
  if (v.length === 15 && v[14] !== "3") issues.push("يجب أن ينتهي بالرقم 3");
  return { ok: issues.length === 0, issues };
}

export const ZATCA_LOOKUP_URL = "https://zatca.gov.sa/ar/eServices/Pages/TaxpayerLookup.aspx";

/** Copy the VAT number and open ZATCA's official lookup in a new tab. */
export async function openZatcaLookup(vatRaw: unknown): Promise<void> {
  const v = vatDigits(vatRaw);
  try {
    if (v) await navigator.clipboard.writeText(v);
  } catch {
    // clipboard can be blocked — the tab still opens
  }
  window.open(ZATCA_LOOKUP_URL, "_blank", "noopener");
}

import { vatDigits, validateSaudiVat } from "./vat";
import type { TaxpayerResult } from "./taxpayer";

// This is an application-owned adapter contract, NOT an undocumented ZATCA API.
// Deployment must supply an authorized provider adapter; never scrape reCAPTCHA.
export async function lookupTaxpayer(vat: string): Promise<TaxpayerResult> {
  const vatNumber = vatDigits(vat);
  const base = { vatNumber, checkedAt: new Date().toISOString() };
  const invalid = validateSaudiVat(vat);
  if (!invalid.ok) return { ...base, status: "invalid", message: invalid.issues.join(" · ") };
  const endpoint = process.env.VAT_LOOKUP_ADAPTER_URL;
  const token = process.env.VAT_LOOKUP_ADAPTER_TOKEN;
  const unavailable = { ...base, status: "unavailable" as const, message: "لم يتم التحقق من الهيئة. الربط الرسمي غير متاح؛ استخدم صفحة الهيئة للمراجعة اليدوية واحفظ الفاتورة مسودة." };
  if (!endpoint || !token) return unavailable;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password) return unavailable;
    const response = await fetch(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ vatNumber }),
    });
    if (!response.ok) return unavailable;
    const body = await response.json();
    // No response, schema/auth errors and ambiguous results are never 'not registered'.
    if (typeof body.vatNumber !== "string" || vatDigits(body.vatNumber) !== vatNumber) return unavailable;
    if (body.status === "not_registered") return { ...base, status: "not_registered", message: "أفادت خدمة التحقق بأن الرقم غير مسجل؛ يلزم مراجعة المورد" };
    if (body.status !== "registered" || typeof body.name !== "string" || !body.name.trim() || body.name.length > 500) return unavailable;
    return { ...base, status: "registered", name: body.name.trim(),
      address: typeof body.address === "string" ? body.address.slice(0, 2000) : undefined,
      message: "تم جلب بيانات التسجيل من خدمة التحقق المرتبطة" };
  } catch { return unavailable; }
}

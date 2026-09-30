import { vatDigits, validateSaudiVat } from "./vat";

export type TaxpayerResult = {
  status: "registered" | "not_registered" | "unavailable" | "invalid";
  vatNumber: string;
  name?: string;
  address?: string;
  checkedAt: string;
  message: string;
};

export function normalizedCompanyName(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/[^\p{L}\p{N}]/gu, "");
}

// Exact normalized comparison, never a fuzzy/AI assertion of legal identity.
export function compareTaxpayer(result: TaxpayerResult, vat: string, name: string) {
  if (!validateSaudiVat(vat).ok || result.vatNumber !== vatDigits(vat)) {
    return { matches: false, message: "الرقم الضريبي غير صحيح أو لا يطابق نتيجة التحقق" };
  }
  if (result.status !== "registered") return { matches: false, message: result.message };
  if (!name.trim() || !result.name?.trim()) return { matches: false, message: "اسم المنشأة مفقود؛ يلزم مراجعة الهوية" };
  if (normalizedCompanyName(name) !== normalizedCompanyName(result.name)) {
    return { matches: false, message: `اسم الفاتورة لا يطابق الاسم المسجل: ${result.name} — راجع الاسم أو الترجمة يدويًا` };
  }
  return { matches: true, message: "الرقم الضريبي واسم المنشأة مطابقان لنتيجة خدمة التحقق" };
}

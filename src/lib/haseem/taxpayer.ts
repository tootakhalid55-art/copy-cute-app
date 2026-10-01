import { vatDigits, validateSaudiVat } from "./vat";

export type TaxpayerResult = {
  status: "registered" | "manual_review" | "not_registered" | "unavailable" | "invalid";
  vatNumber: string;
  name?: string;
  address?: string;
  checkedAt: string;
  message: string;
};

export type ManualTaxpayerReview = {
  vatNumber: string; name: string; address: string;
  acknowledged: true; evidenceNote: string;
};

export function parseManualReview(input: unknown): ManualTaxpayerReview {
  const value = input as Partial<ManualTaxpayerReview> | null;
  if (!value || value.acknowledged !== true || typeof value.name !== "string" || !value.name.trim() || value.name.length > 500
    || typeof value.vatNumber !== "string" || !validateSaudiVat(value.vatNumber).ok
    || typeof value.address !== "string" || value.address.length > 2000
    || typeof value.evidenceNote !== "string" || value.evidenceNote.length > 1000) {
    throw new Error("أدخل الاسم والرقم من نتيجة الهيئة وأقر بأنك راجعتها يدويًا");
  }
  return { ...value, name: value.name.trim(), vatNumber: vatDigits(value.vatNumber) } as ManualTaxpayerReview;
}

export function manualReviewResult(input: unknown, checkedAt = new Date().toISOString()): TaxpayerResult {
  const review = parseManualReview(input);
  return { status: "manual_review", vatNumber: review.vatNumber, name: review.name,
    address: review.address, checkedAt, message: "مراجعة يدوية بإقرار المستخدم؛ لم يتم جلب النتيجة آليًا من الهيئة" };
}

export function normalizedCompanyName(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/[^\p{L}\p{N}]/gu, "");
}

// Exact normalized comparison, never a fuzzy/AI assertion of legal identity.
export function compareTaxpayer(result: TaxpayerResult, vat: string, name: string) {
  if (!validateSaudiVat(vat).ok || result.vatNumber !== vatDigits(vat)) {
    return { matches: false, message: "الرقم الضريبي غير صحيح أو لا يطابق نتيجة التحقق" };
  }
  if (result.status !== "registered" && result.status !== "manual_review") return { matches: false, message: result.message };
  if (!name.trim() || !result.name?.trim()) return { matches: false, message: "اسم المنشأة مفقود؛ يلزم مراجعة الهوية" };
  if (normalizedCompanyName(name) !== normalizedCompanyName(result.name)) {
    return { matches: false, message: `اسم الفاتورة لا يطابق الاسم المسجل: ${result.name} — راجع الاسم أو الترجمة يدويًا` };
  }
  return { matches: true, message: result.status === "manual_review"
    ? "الاسم والرقم مطابقان للبيانات التي نقلتها يدويًا من الهيئة؛ ليست نتيجة تحقق آلي"
    : "الرقم الضريبي واسم المنشأة مطابقان لنتيجة خدمة التحقق" };
}

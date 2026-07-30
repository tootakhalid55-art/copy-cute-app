// ZATCA document title / variant resolution.
// A sales invoice is a "Standard Tax Invoice" (B2B) when the buyer has a VAT
// registration number; otherwise it is a "Simplified Tax Invoice" (B2C).

export type InvoiceVariant = "standard" | "simplified";

export type DocTitle = {
  ar: string;
  en: string;
  variant?: InvoiceVariant;
};

const TITLES: Record<string, DocTitle> = {
  quotation: { ar: "عرض سعر", en: "Quotation" },
  "credit-note": { ar: "إشعار دائن", en: "Credit Note" },
  "debit-note": { ar: "إشعار مدين", en: "Debit Note" },
  "purchase-order": { ar: "أمر شراء", en: "Purchase Order" },
  bill: { ar: "فاتورة مشتريات", en: "Purchase Invoice" },
  payment_voucher: { ar: "سند صرف", en: "Payment Voucher" },
  receipt_voucher: { ar: "سند قبض", en: "Receipt Voucher" },
  journal_voucher: { ar: "قيد يومية", en: "Journal Voucher" },
  expense_voucher: { ar: "سند مصروف", en: "Expense Voucher" },
};

export function isVatRegistered(vat?: string | null) {
  const v = String(vat ?? "").replace(/\D/g, "");
  return v.length >= 15;
}

/** Resolve the printed document heading. Invoices become standard/simplified. */
export function resolveDocTitle(kind: string, buyerVatNumber?: string | null): DocTitle {
  if (kind === "invoice" || kind === "sales_invoice") {
    return isVatRegistered(buyerVatNumber)
      ? { ar: "فاتورة ضريبية", en: "Tax Invoice", variant: "standard" }
      : { ar: "فاتورة ضريبية مبسطة", en: "Simplified Tax Invoice", variant: "simplified" };
  }
  return TITLES[kind] ?? { ar: "مستند", en: "Document" };
}

/** ISO-8601 timestamp required by ZATCA (tag 3). */
export function docTimestamp(date: string, existingIso?: string | null) {
  if (existingIso) return existingIso;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function formatTimestamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

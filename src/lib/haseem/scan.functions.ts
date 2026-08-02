import { createServerFn } from "@tanstack/react-start";
import { callAnthropicAI } from "@/lib/ai-gateway.server";

export type ScanLine = {
  description: string;
  qty: number;
  unit?: string;
  price: number;
  discount?: number;
  tax: number;
  lineTotal?: number;
  confidence?: number;
};

export type ScanResult = {
  supplierName: string;
  supplierVatNumber: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string;
  currency: string;
  purchaseOrderNumber: string;
  subtotal: number;
  vat: number;
  discount: number;
  shipping: number;
  otherCharges: number;
  grandTotal: number;
  lines: ScanLine[];
  confidence: Record<string, number>; // 0-100 per field
  rawText: string;
  language: "ar" | "en" | "mixed";
};

const SYSTEM = `You are a precise OCR + invoice extraction engine for Arabic and English supplier invoices (Saudi Arabia / ZATCA compliant).
Return ONLY a JSON object matching this TypeScript type exactly, no markdown, no commentary:

{
  "supplierName": string,
  "supplierVatNumber": string,   // 15 digits if Saudi VAT, else best guess
  "invoiceNumber": string,
  "invoiceDate": string,         // ISO YYYY-MM-DD; empty string if unknown
  "dueDate": string,             // ISO YYYY-MM-DD; empty string if unknown
  "currency": string,            // e.g. "SAR", "USD"
  "purchaseOrderNumber": string,
  "subtotal": number,
  "vat": number,
  "discount": number,
  "shipping": number,
  "otherCharges": number,
  "grandTotal": number,
  "lines": [
    {
      "description": string,
      "qty": number,
      "unit": string,
      "price": number,
      "discount": number,
      "tax": number,             // VAT percent, e.g. 15
      "lineTotal": number,
      "confidence": number       // 0-100
    }
  ],
  "confidence": {                // 0-100 per top-level field
    "supplierName": number, "supplierVatNumber": number, "invoiceNumber": number,
    "invoiceDate": number, "dueDate": number, "currency": number,
    "purchaseOrderNumber": number, "subtotal": number, "vat": number,
    "discount": number, "shipping": number, "otherCharges": number, "grandTotal": number
  },
  "rawText": string,             // the full detected invoice text
  "language": "ar" | "en" | "mixed"
}

Rules:
- Numbers must be plain JSON numbers (no currency symbols, no commas).
- If a value is missing, use "" for strings, 0 for numbers, and confidence 0.
- Detect Arabic and Latin digits; convert Arabic-Indic digits to Latin.
- Prefer values printed on the invoice over recomputed values.
`;

async function extract(fileDataUrl: string, filename: string): Promise<ScanResult> {
  const isPdf = fileDataUrl.startsWith("data:application/pdf");

  const content: NonNullable<Parameters<typeof callAnthropicAI>[0]>["messages"][number]["content"] = [
    { type: "text", text: "استخرج بيانات فاتورة المورد من الملف المرفق وأعدها JSON فقط." },
    isPdf
      ? { type: "file", file: { filename, file_data: fileDataUrl } }
      : { type: "image_url", image_url: { url: fileDataUrl } },
  ];

  const raw = await callAnthropicAI({
    model: "claude-sonnet-5",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content },
    ],
  });

  // Strip markdown fences if present
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Best-effort fallback: extract the first {...} object
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) {
      // No JSON object at all in the response — surface a real error instead
      // of silently returning {}, which would show the user a "ready for
      // review" form with every field blank and no indication anything failed.
      throw new Error("AI_EXTRACTION_FAILED: تعذر استخراج بيانات الفاتورة من رد الذكاء الاصطناعي");
    }
    parsed = JSON.parse(m[0]);
  }

  const num = (v: any) => {
    if (typeof v === "number") return v;
    if (typeof v !== "string") return 0;
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const str = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));

  const lines: ScanLine[] = Array.isArray(parsed.lines)
    ? parsed.lines.map((l: any) => ({
        description: str(l.description),
        qty: num(l.qty) || 1,
        unit: str(l.unit),
        price: num(l.price),
        discount: num(l.discount),
        tax: num(l.tax) || 15,
        lineTotal: num(l.lineTotal),
        confidence: num(l.confidence),
      }))
    : [];

  const result: ScanResult = {
    supplierName: str(parsed.supplierName),
    supplierVatNumber: str(parsed.supplierVatNumber),
    invoiceNumber: str(parsed.invoiceNumber),
    invoiceDate: str(parsed.invoiceDate),
    dueDate: str(parsed.dueDate),
    currency: str(parsed.currency) || "SAR",
    purchaseOrderNumber: str(parsed.purchaseOrderNumber),
    subtotal: num(parsed.subtotal),
    vat: num(parsed.vat),
    discount: num(parsed.discount),
    shipping: num(parsed.shipping),
    otherCharges: num(parsed.otherCharges),
    grandTotal: num(parsed.grandTotal),
    lines,
    confidence: parsed.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {},
    rawText: str(parsed.rawText),
    language: (parsed.language === "ar" || parsed.language === "en" || parsed.language === "mixed")
      ? parsed.language
      : "mixed",
  };

  return result;
}

export const scanInvoice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const i = input as { fileDataUrl?: string; filename?: string };
    if (!i?.fileDataUrl || typeof i.fileDataUrl !== "string") {
      throw new Error("fileDataUrl is required");
    }
    if (i.fileDataUrl.length > 12 * 1024 * 1024) {
      throw new Error("الملف كبير جداً — الحد الأقصى 8MB");
    }
    return { fileDataUrl: i.fileDataUrl, filename: i.filename || "invoice" };
  })
  .handler(async ({ data }) => {
    return await extract(data.fileDataUrl, data.filename);
  });

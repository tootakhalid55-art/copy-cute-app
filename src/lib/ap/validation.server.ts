// AI validation: VAT calculation, currency, total reconciliation, PO/GRN matching.
// Pure server-side; no client imports.

export type ValidationIssue = { code: string; severity: "error" | "warn" | "info"; message: string };
export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  reconciledSubtotal?: number;
  reconciledVat?: number;
  reconciledTotal?: number;
};

const KSA_VAT = 0.15;
const KNOWN_CCY = new Set(["SAR", "USD", "EUR", "AED", "GBP", "JPY", "KWD", "BHD", "OMR", "QAR", "EGP", "JOD"]);

export function validateExtraction(ex: any): ValidationResult {
  const issues: ValidationIssue[] = [];
  const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const subtotal = num(ex?.subtotal);
  const vat = num(ex?.vat);
  const total = num(ex?.grandTotal);
  const lines = Array.isArray(ex?.lines) ? ex.lines : [];
  const currency = (ex?.currency || "SAR").toString().toUpperCase();

  // Currency check
  if (!KNOWN_CCY.has(currency)) {
    issues.push({ code: "unknown_currency", severity: "warn", message: `عملة غير معروفة: ${currency}` });
  }

  // Recompute from lines
  const lineSum = lines.reduce((s: number, l: any) => {
    const q = num(l.qty ?? 1);
    const p = num(l.price ?? l.unit_price);
    const d = num(l.discount);
    const lt = Number.isFinite(Number(l.lineTotal ?? l.line_total)) ? Number(l.lineTotal ?? l.line_total) : q * p - d;
    return s + lt;
  }, 0);

  const reconciledSubtotal = subtotal || Math.round(lineSum * 100) / 100;
  if (subtotal > 0 && Math.abs(subtotal - lineSum) > Math.max(0.5, subtotal * 0.02)) {
    issues.push({
      code: "subtotal_mismatch",
      severity: "warn",
      message: `مجموع البنود (${lineSum.toFixed(2)}) لا يطابق المجموع قبل الضريبة (${subtotal.toFixed(2)})`,
    });
  }

  // VAT
  const expectedVat = Math.round(reconciledSubtotal * KSA_VAT * 100) / 100;
  const reconciledVat = vat || expectedVat;
  if (vat > 0 && Math.abs(vat - expectedVat) > Math.max(0.5, expectedVat * 0.05) && currency === "SAR") {
    issues.push({
      code: "vat_mismatch",
      severity: "warn",
      message: `ضريبة القيمة المضافة المستخرجة (${vat.toFixed(2)}) لا تطابق 15% المتوقعة (${expectedVat.toFixed(2)})`,
    });
  }

  // Total reconciliation
  const reconciledTotal = Math.round((reconciledSubtotal + reconciledVat) * 100) / 100;
  if (total > 0 && Math.abs(total - reconciledTotal) > 0.5) {
    issues.push({
      code: "total_mismatch",
      severity: "error",
      message: `الإجمالي (${total.toFixed(2)}) لا يساوي المجموع + الضريبة (${reconciledTotal.toFixed(2)})`,
    });
  }

  // Required fields
  if (!ex?.supplierName) issues.push({ code: "missing_supplier", severity: "error", message: "اسم المورد غير مستخرج" });
  if (!ex?.invoiceNumber) issues.push({ code: "missing_invoice_number", severity: "warn", message: "رقم الفاتورة غير مستخرج" });
  if (total <= 0) issues.push({ code: "missing_total", severity: "error", message: "إجمالي الفاتورة غير مستخرج" });

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    reconciledSubtotal,
    reconciledVat,
    reconciledTotal,
  };
}

// Best-effort PO / GRN matcher: find candidate purchase orders / GRNs for the supplier
// with total within tolerance and issued before the invoice date.
export async function matchPurchaseOrderAndGrn(
  supabase: any,
  orgId: string,
  partyId: string | null,
  total: number,
  invoiceDate: string | null,
) {
  if (!partyId || !total) return { poId: null as string | null, grnId: null as string | null };

  const tolerance = Math.max(1, total * 0.02);
  const upper = new Date(invoiceDate || Date.now());
  const lower = new Date(upper.getTime() - 1000 * 60 * 60 * 24 * 180);

  const { data: pos } = await supabase
    .from("documents")
    .select("id, grand_total, issue_date")
    .eq("org_id", orgId)
    .eq("party_id", partyId)
    .eq("kind", "purchase_order")
    .gte("issue_date", lower.toISOString().slice(0, 10))
    .lte("issue_date", upper.toISOString().slice(0, 10))
    .order("issue_date", { ascending: false })
    .limit(20);

  const poId =
    (pos || []).find((p: any) => Math.abs(Number(p.grand_total) - total) <= tolerance)?.id ?? null;

  let grnId: string | null = null;
  if (poId) {
    const { data: grns } = await supabase
      .from("documents")
      .select("id")
      .eq("org_id", orgId)
      .eq("party_id", partyId)
      .in("kind", ["grn", "goods_receipt", "goods_receipt_note"])
      .order("issue_date", { ascending: false })
      .limit(10);
    grnId = (grns || [])[0]?.id ?? null;
  }

  return { poId, grnId };
}

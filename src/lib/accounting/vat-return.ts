export type VatReview = {
  category: "standard" | "zero" | "exempt" | "outside" | "import" | "reverse" | "mixed";
  deduction: "full" | "partial" | "none";
  percent: number;
  taxDate: string;
  claimDate: string;
  evidenceDate: string;
  evidence: string;
  reason: string;
  proportionBasis: string;
  special: string;
  evidenceType?: string;
  paidPercent?: number;
  paymentDate?: string;
  selfAssessedVat?: number;
  fingerprint?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};
export type VatRow = {
  id: string;
  ref: string;
  kind: string;
  date: string;
  input: boolean;
  base: number;
  vat: number;
  deductible: number;
  output: number;
  category: string;
  issues: string[];
  source: any;
  review?: VatReview;
  adjustment?: boolean;
};
export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function fingerprint(d: any) {
  return JSON.stringify([
    d.kind,
    d.issue_date,
    d.currency,
    d.exchange_rate,
    d.subtotal,
    d.vat_total,
    d.grand_total,
    d.status,
    d.lines?.map((l: any) => [l.id, l.qty, l.price, l.discount, l.tax_rate]),
    d.entry_date,
    d.debit,
    d.credit,
    d.inputVat,
    d.outputVat,
  ]);
}
const inputKinds = new Set(["purchase_invoice", "bill", "debit_note", "expense_voucher"]);
const saleKinds = new Set([
  "sales_invoice",
  "standard_tax_invoice",
  "simplified_tax_invoice",
  "invoice",
  "credit_note",
]);
export function validateReview(v: VatReview, input: boolean) {
  const errors: string[] = [];
  if (!["standard", "zero", "exempt", "outside", "import", "reverse", "mixed"].includes(v.category))
    errors.push("حدد التصنيف الضريبي");
  if (!validDate(v.taxDate)) errors.push("حدد تاريخ الاستحقاق الضريبي");
  if (!v.reason?.trim()) errors.push("سجل أساس المعالجة الضريبية");
  if (input) {
    if (!["full", "partial", "none"].includes(v.deduction)) errors.push("حدد أهلية الخصم");
    if (v.deduction !== "none") {
      if (!v.evidence?.trim() || !validDate(v.evidenceDate))
        errors.push("يلزم مرجع الإثبات وتاريخ استلامه");
      if (!validDate(v.claimDate) || v.claimDate < v.taxDate || v.claimDate < v.evidenceDate)
        errors.push("تاريخ الخصم لا يسبق الاستحقاق أو توفر الإثبات");
      if (
        validDate(v.claimDate) &&
        validDate(v.taxDate) &&
        Number(v.claimDate.slice(0, 4)) > Number(v.taxDate.slice(0, 4)) + 5
      )
        errors.push("تجاوز الخصم خمس سنوات تقويمية بعد سنة التوريد");
      if (!["invoice", "customs", "approved", "reverse"].includes(v.evidenceType || ""))
        errors.push("حدد نوع الإثبات الصالح للخصم");
      if (v.category === "import" && v.evidenceType !== "customs")
        errors.push("خصم ضريبة الواردات يتطلب مستندًا جمركيًا");
      if (v.evidenceType === "approved" && !v.proportionBasis?.trim())
        errors.push("يلزم مرجع موافقة الهيئة على المستند البديل");
      if (
        v.special === "أساس نقدي" &&
        (!Number.isFinite(v.paidPercent) ||
          v.paidPercent !== 100 ||
          !validDate(v.paymentDate || "") ||
          v.claimDate < (v.paymentDate || ""))
      )
        errors.push(
          "الأساس النقدي: يلزم إثبات السداد الكامل وتاريخه؛ الدفعات الجزئية تحتاج تسوية مستقلة مراجعَة",
        );
      if (
        v.deduction === "partial" &&
        (!Number.isFinite(v.percent) ||
          v.percent < 0 ||
          v.percent > 100 ||
          !v.proportionBasis?.trim())
      )
        errors.push("يلزم نسبة خصم بين 0 و100 وأساسها");
    }
  }
  if (
    v.category === "reverse" &&
    (!input || !Number.isFinite(v.selfAssessedVat) || Number(v.selfAssessedVat) < 0)
  )
    errors.push("يلزم مبلغ ضريبة الاحتساب العكسي المراجع");
  if (v.category === "mixed")
    errors.push("المستند مختلط التصنيف: يحتاج تفصيل البنود قبل اعتماد الإقرار");
  if (v.special === "نفقة مقيدة / استعمال شخصي" && v.deduction !== "none")
    errors.push("النفقة المقيدة أو الشخصية لا تقبل الخصم");
  if (v.special && !v.proportionBasis?.trim())
    errors.push("الحالة الخاصة تحتاج مذكرة معالجة وتسويات مرتبطة");
  return errors;
}
export function calculateVat(docs: any[], adjustments: any[], from: string, to: string) {
  const rows: VatRow[] = [];
  const warnings: string[] = [];
  const inRange = (d: string) => d >= from && d <= to;
  if (!validDate(from) || !validDate(to) || from > to)
    return {
      rows,
      warnings: ["الفترة غير صحيحة"],
      output: 0,
      input: 0,
      net: 0,
      pending: 0,
      ready: false,
    };
  for (const d of docs) {
    if (!inputKinds.has(d.kind) && !saleKinds.has(d.kind)) continue;
    if (
      !["posted", "paid", "partially_paid", "archived", "issued"].includes(d.status) &&
      !d.wasPosted
    )
      continue;
    if (!validDate(d.issue_date)) {
      warnings.push(`المستند ${d.doc_number || d.id} بلا تاريخ صالح؛ يلزم مراجعته`);
      continue;
    }
    const input = inputKinds.has(d.kind),
      v: VatReview | undefined = d.meta?.vatReview;
    const date = v ? (input && v.deduction !== "none" ? v.claimDate : v.taxDate) : d.issue_date;
    // Show an invalid review in its source period rather than silently losing it.
    const effectiveDate = validDate(date) ? date : d.issue_date;
    const outputDate = v && validDate(v.taxDate) ? v.taxDate : d.issue_date;
    if (!inRange(effectiveDate) && !(v?.category === "reverse" && inRange(outputDate))) continue;
    const issues: string[] = [];
    if (!v) issues.push("لم تراجع المعالجة الضريبية");
    else {
      issues.push(...validateReview(v, input));
      if (v.fingerprint !== fingerprint(d)) issues.push("تغير المستند بعد المراجعة؛ أعد مراجعته");
    }
    const rate = d.currency === "SAR" ? 1 : Number(d.exchange_rate);
    if (!Number.isFinite(rate) || rate <= 0) issues.push("سعر التحويل إلى الريال غير صالح");
    if (d.currency !== "SAR" && !v?.reason?.trim()) issues.push("راجع سعر الصرف المعتمد وتاريخه");
    const factor = Number.isFinite(rate) && rate > 0 ? rate : 0;
    const sign = ["credit_note", "debit_note"].includes(d.kind) ? -1 : 1;
    const finiteAmount = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
    const base = r2(finiteAmount(d.subtotal) * factor) * sign;
    let vat = r2(finiteAmount(d.vat_total) * factor) * sign;
    if (
      ![d.subtotal, d.vat_total, d.grand_total].every(
        (x) => x !== null && x !== "" && Number.isFinite(Number(x)),
      )
    )
      issues.push("مبالغ المستند غير صالحة");
    if (
      Math.abs(
        Number(d.subtotal) +
          Number(d.vat_total) +
          Number(d.shipping || 0) +
          Number(d.other_charges || 0) -
          Number(d.discount_total || 0) -
          Number(d.grand_total),
      ) > 0.02
    )
      issues.push("عدم تطابق الوعاء والضريبة والإجمالي؛ راجع الأصل");
    if (v?.category === "reverse") vat = r2(finiteAmount(v.selfAssessedVat) * factor) * sign;
    if (v && ["zero", "exempt", "outside"].includes(v.category) && Math.abs(vat) > 0.01)
      issues.push("تصنيف بلا ضريبة مع وجود مبلغ ضريبة");
    const rates = [...new Set((d.lines || []).map((l: any) => Number(l.tax_rate)))];
    if (rates.length > 1) issues.push("نسب متعددة؛ راجع توزيع الوعاء بين بنود الإقرار");
    const eligible = issues.length === 0;
    const pct = v?.deduction === "full" ? 1 : v?.deduction === "partial" ? v.percent / 100 : 0;
    const deductible = input && eligible && inRange(effectiveDate) ? r2(vat * pct) : 0;
    // Unreviewed output tax remains visible; the report stays explicitly incomplete.
    const output =
      !input && inRange(effectiveDate)
        ? vat
        : v?.category === "reverse" && inRange(outputDate)
          ? vat
          : 0;
    rows.push({
      id: d.id,
      ref: d.doc_number,
      kind: d.kind,
      date: effectiveDate,
      input,
      base,
      vat,
      deductible,
      output,
      category: v?.category || "unreviewed",
      issues,
      source: d,
      review: v,
    });
  }
  for (const a of adjustments) {
    const v: VatReview | undefined = a.meta?.vatReview;
    const input = Math.abs(a.inputVat) > 0;
    const chosen = v ? (input && v.deduction !== "none" ? v.claimDate : v.taxDate) : a.entry_date;
    const date = validDate(chosen) ? chosen : a.entry_date;
    if (!inRange(date)) continue;
    const issues: string[] = [];
    if (!v) issues.push("تسوية دفترية تحتاج مراجعة ضريبية");
    else {
      issues.push(...validateReview(v, input));
      if (v.fingerprint !== fingerprint(a)) issues.push("تغير القيد بعد المراجعة");
    }
    if (!v?.evidence?.trim()) issues.push("يلزم مرجع التسوية والمستند المرتبط");
    const pct = v?.deduction === "full" ? 1 : v?.deduction === "partial" ? v.percent / 100 : 0;
    rows.push({
      id: a.id,
      ref: a.entry_number,
      kind: "journal_adjustment",
      date,
      input,
      base: 0,
      vat: a.inputVat || a.outputVat,
      deductible: issues.length ? 0 : r2(a.inputVat * pct),
      output: a.outputVat,
      category: "adjustment",
      issues,
      source: a,
      review: v,
      adjustment: true,
    });
  }
  const output = r2(rows.reduce((s, r) => s + r.output, 0)),
    input = r2(rows.reduce((s, r) => s + r.deductible, 0));
  const pending = rows.filter((r) => r.issues.length).length;
  return {
    rows,
    warnings,
    output,
    input,
    net: r2(output - input),
    pending,
    ready: pending === 0 && warnings.length === 0,
  };
}

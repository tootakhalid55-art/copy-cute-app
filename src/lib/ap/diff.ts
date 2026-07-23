// Compute field-level corrections between original extraction and edited values.
// Feeds the learning engine via recordCorrections.

export type Correction = { field_path: string; extracted: any; corrected: any };

const TOP_FIELDS = [
  "supplierName", "supplierVatNumber", "invoiceNumber", "invoiceDate",
  "dueDate", "currency", "subtotal", "vat", "grandTotal",
];

const norm = (v: any) => {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "";
  return String(v).trim();
};

export function diffExtraction(original: any, edited: any): Correction[] {
  const out: Correction[] = [];
  const a = original || {}, b = edited || {};
  for (const f of TOP_FIELDS) {
    if (norm(a[f]) !== norm(b[f]) && norm(b[f]) !== "") {
      out.push({ field_path: f, extracted: a[f] ?? null, corrected: b[f] ?? null });
    }
  }
  const aL = Array.isArray(a.lines) ? a.lines : [];
  const bL = Array.isArray(b.lines) ? b.lines : [];
  const n = Math.max(aL.length, bL.length);
  for (let i = 0; i < n; i++) {
    for (const k of ["description", "qty", "price", "lineTotal"]) {
      const av = aL[i]?.[k], bv = bL[i]?.[k];
      if (norm(av) !== norm(bv) && norm(bv) !== "") {
        out.push({ field_path: `lines[${i}].${k}`, extracted: av ?? null, corrected: bv ?? null });
      }
    }
  }
  return out;
}

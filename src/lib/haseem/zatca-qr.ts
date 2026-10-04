export type ZatcaQr = { raw: string; sellerName: string; vatNumber: string; timestamp: string; total: number; vat: number };
export type QrReview = { status: "decoded" | "unreadable" | "ambiguous"; data?: ZatcaQr; originalName?: string; originalVat?: string; differences?: string[]; warning?: string };

/** Decode the actual QR bytes, not AI guesses. This validates structure, not a ZATCA signature. */
export function parseZatcaQr(raw: string): ZatcaQr | undefined {
  try {
    const value = raw.trim();
    if (value.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return;
    const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
    const tags = new Map<number, Uint8Array>();
    for (let offset = 0; offset < bytes.length;) {
      if (offset + 2 > bytes.length) return;
      const tag = bytes[offset++], length = bytes[offset++];
      if (tag < 1 || tag > 9 || !length || tags.has(tag) || offset + length > bytes.length) return;
      tags.set(tag, bytes.slice(offset, offset + length)); offset += length;
    }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const text = (tag: number) => decoder.decode(tags.get(tag) ?? new Uint8Array()).trim();
    const sellerName = text(1), vatNumber = text(2), timestamp = text(3), total = text(4), vat = text(5);
    if (!sellerName || [...sellerName].some(c => c.charCodeAt(0) < 32) || !/^3\d{13}3$/.test(vatNumber)) return;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) return;
    if (![total, vat].every(v => /^\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v))) || Number(vat) > Number(total)) return;
    return { raw: value, sellerName, vatNumber, timestamp, total: Number(total), vat: Number(vat) };
  } catch { return; }
}

export function selectZatcaQr(rawCodes: string[]): QrReview {
  const valid = rawCodes.map(parseZatcaQr).filter((q): q is ZatcaQr => !!q);
  const unique = new Map(valid.map(q => [JSON.stringify([q.sellerName, q.vatNumber, q.timestamp, q.total, q.vat]), q]));
  if (unique.size > 1) return { status: "ambiguous", warning: "يوجد أكثر من رمز فاتورة مختلف؛ ارفع كل فاتورة في ملف منفصل." };
  if (!unique.size) return { status: "unreadable", warning: "لم يمكن قراءة رمز زاتكا صالح؛ راجع بيانات المورد يدويًا أو ارفع صورة أوضح." };
  return { status: "decoded", data: [...unique.values()][0] };
}

export function applyQrIdentity<T extends { supplierName: string; supplierVatNumber: string; grandTotal: number; vat: number; zatcaQr?: QrReview }>(invoice: T, review: QrReview): T {
  if (!review.data || review.status !== "decoded") return { ...invoice, zatcaQr: review };
  const q = review.data;
  const differences: string[] = [];
  if (invoice.supplierName.trim().replace(/\s+/g, " ") !== q.sellerName.replace(/\s+/g, " ")) differences.push("اسم المورد");
  if (invoice.supplierVatNumber.replace(/\s/g, "") !== q.vatNumber) differences.push("الرقم الضريبي");
  if (Math.abs(invoice.grandTotal - q.total) > 0.02) differences.push("إجمالي الفاتورة");
  if (Math.abs(invoice.vat - q.vat) > 0.02) differences.push("مبلغ الضريبة");
  return { ...invoice, supplierName: q.sellerName, supplierVatNumber: q.vatNumber,
    zatcaQr: { ...review, originalName: invoice.supplierName, originalVat: invoice.supplierVatNumber, differences } };
}

import type { PrintDocData } from "./printDoc";
import type { ScanResult } from "./scan.functions";

export function scanPreviewData(scan?: Partial<ScanResult>): PrintDocData {
  const lines = scan?.lines ?? [{ description: "صنف تجريبي / Sample item", qty: 2, price: 50, tax: 15 }];
  return { kind: "bill", title: "فاتورة مشتريات", ref: scan?.invoiceNumber ?? "PREVIEW-001", date: scan?.invoiceDate ?? "2026-10-01", dueDate: scan?.dueDate,
    party: { name: scan?.supplierName ?? "اسم المورد", taxNumber: scan?.supplierVatNumber ?? "300000000000003", address: scan?.supplierAddress, phone: scan?.supplierPhone, email: scan?.supplierEmail },
    org: { name: "المنشأة المشترية", taxNumber: "", address: "" }, partyLabel: "المورد", currency: scan?.currency ?? "SAR", lines,
    lineCalcs: lines.map(l => { const net = l.qty * l.price - (l.discount || 0); return { net, taxAmt: net * l.tax / 100, gross: net * (1 + l.tax / 100) }; }),
    subtotal: scan?.subtotal ?? 100, tax: scan?.vat ?? 15, total: scan?.grandTotal ?? 115, discAmt: scan?.discount, shipAmt: scan?.shipping, poNumber: scan?.purchaseOrderNumber,
    scanExtras: { otherCharges: scan?.otherCharges },
    tpl: { name: "معاينة", accent: "#111111", onAccent: "#ffffff", soft: "#ffffff" } };
}


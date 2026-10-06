/** One invoice appearance, independent of older per-browser or scanned templates. */
import type { InvoiceTemplate } from "./templates";
export const UNIFIED_INVOICE_TEMPLATE: InvoiceTemplate = {
  id: "canar-unified-invoice", name: "قالب كنار الموحد", builtin: true,
  desc: "قالب موحد لفواتير المبيعات والمشتريات", kinds: ["invoice", "bill"] as ("invoice" | "bill")[],
  accent: "#0f2a1d", onAccent: "#ffffff", soft: "#f2f0e8",
};
export function isUnifiedInvoice(kind?: string) { return kind === "invoice" || kind === "bill"; }
export function unifiedInvoiceAppearance<T extends { kind?: string; tpl?: unknown; structure?: string; layoutVariant?: string }>(doc: T): T {
  return isUnifiedInvoice(doc.kind) ? { ...doc, tpl: UNIFIED_INVOICE_TEMPLATE, structure: "boxed", layoutVariant: undefined } : doc;
}

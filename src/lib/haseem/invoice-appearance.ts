import { salesReferenceTemplate } from "./sales-reference-templates";
/** One invoice appearance, independent of older per-browser or scanned templates. */
import type { InvoiceTemplate } from "./templates";
export const UNIFIED_INVOICE_TEMPLATE: InvoiceTemplate = {
  id: "canar-unified-invoice", name: "قالب كنار الموحد", builtin: true,
  desc: "قالب موحد لفواتير المبيعات والمشتريات", kinds: ["invoice", "bill"] as ("invoice" | "bill")[],
  accent: "#0f2a1d", onAccent: "#ffffff", soft: "#f2f0e8",
};
export function isUnifiedInvoice(kind?: string) { return kind === "invoice" || kind === "bill"; }
export function unifiedInvoiceAppearance<T extends { kind?: string; tpl?: unknown; invoiceColor?: string; structure?: string; layoutVariant?: string }>(doc: T): T {
  const reference = doc.kind === "invoice" ? salesReferenceTemplate((doc.tpl as { id?: string } | undefined)?.id) : undefined;
  let template = reference ?? UNIFIED_INVOICE_TEMPLATE;
  if (/^#[0-9a-f]{6}$/i.test(doc.invoiceColor ?? "")) {
    const color = doc.invoiceColor!;
    const rgb = [1,3,5].map(i => parseInt(color.slice(i,i+2),16));
    const soft = "#" + rgb.map(v => Math.round(v+(255-v)*.94).toString(16).padStart(2,"0")).join("");
    const onAccent = (rgb[0]*.299+rgb[1]*.587+rgb[2]*.114)>153 ? "#0f2a1d" : "#ffffff";
    template = { ...template, accent: color, soft, onAccent };
  }
  return isUnifiedInvoice(doc.kind) ? { ...doc, tpl: template, structure: "boxed", layoutVariant: undefined } : doc;
}

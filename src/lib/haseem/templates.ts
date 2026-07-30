import { useCollection, useKV } from "./store";

export type DocKind = "invoice" | "quotation" | "credit-note" | "purchase-order" | "bill";

export const DOC_KINDS: { id: DocKind; label: string }[] = [
  { id: "invoice", label: "الفواتير" },
  { id: "quotation", label: "عروض الأسعار" },
  { id: "credit-note", label: "إشعارات دائنة" },
  { id: "purchase-order", label: "أوامر الشراء" },
  { id: "bill", label: "فواتير المشتريات" },
];

export type InvoiceTemplate = {
  id: string;
  name: string;
  desc?: string;
  accent: string;
  onAccent: string;
  soft: string;
  kinds?: DocKind[]; // which document types this template is available for. undefined = all
  builtin?: boolean;
};

export const BUILTIN_TEMPLATES: InvoiceTemplate[] = [
  // قوالب مشتركة لجميع المستندات
  { id: "classic", name: "كلاسيكي", desc: "ترويسة رسمية داكنة مع تنظيم واضح للنصوص والحقول.", accent: "#0f2a1d", onAccent: "#ffffff", soft: "#fafaf7", builtin: true },
  { id: "modern",  name: "عصري",   desc: "تصميم أزرق حديث بطابع Canar، مناسب للفواتير والعروض.", accent: "#1b6ea8", onAccent: "#ffffff", soft: "#f3f9fe", builtin: true },
  { id: "minimal", name: "بسيط",   desc: "أقل حبر، مثالي للطباعة السريعة والنسخ الداخلية.", accent: "#425466", onAccent: "#ffffff", soft: "#f8fafc", builtin: true },

  // قوالب خاصة بالفواتير
  { id: "inv-colored", name: "فاتورة ملوّنة", desc: "لمسة هادئة زرقاء مع إبراز إجمالي الضريبة وحقول ZATCA.", accent: "#1b6ea8", onAccent: "#ffffff", soft: "#eef7fd", kinds: ["invoice"], builtin: true },
  { id: "inv-zatca-clean", name: "ZATCA نظيف", desc: "فاتورة عربية متوافقة مع ZATCA مع QR واضح وتخطيط متوازن.", accent: "#124e78", onAccent: "#ffffff", soft: "#f2f8fc", kinds: ["invoice"], builtin: true },
  { id: "inv-zatca-premium", name: "ZATCA فاخر", desc: "تدرج أزرق فاخر مع ترويسة قوية للمستندات الرسمية.", accent: "#0d3b66", onAccent: "#ffffff", soft: "#eef5fb", kinds: ["invoice"], builtin: true },
  { id: "inv-zatca-bilingual", name: "ZATCA ثنائي اللغة", desc: "فاتورة عربية/إنجليزية مع حقول ضريبة وقارئ QR.", accent: "#1f2a44", onAccent: "#ffffff", soft: "#f6f8fb", kinds: ["invoice"], builtin: true },

  // قوالب خاصة بعروض الأسعار
  { id: "qt-elegant", name: "عرض سعر — أنيق", desc: "قالب راقٍ لعروض الأسعار مع صلاحية العرض ومدة التنفيذ.", accent: "#0d9488", onAccent: "#ffffff", soft: "#f0fdfa", kinds: ["quotation"], builtin: true },
  { id: "qt-royal", name: "عرض سعر — ملكي", desc: "بنفسجي عميق يعكس الفخامة، مناسب للعروض الاحترافية.", accent: "#5b21b6", onAccent: "#ffffff", soft: "#f5f3ff", kinds: ["quotation"], builtin: true },
  { id: "qt-corporate", name: "عرض سعر — مؤسسي", desc: "أزرق كحلي رسمي للعروض والمناقصات.", accent: "#1e3a8a", onAccent: "#ffffff", soft: "#eff6ff", kinds: ["quotation"], builtin: true },
  { id: "qt-warm", name: "عرض سعر — دافئ", desc: "لمسة ذهبية دافئة للعلامات التجارية والفعاليات.", accent: "#b45309", onAccent: "#ffffff", soft: "#fffbeb", kinds: ["quotation"], builtin: true },
  { id: "qt-fresh", name: "عرض سعر — منعش", desc: "أخضر زمردي عصري لعروض الخدمات.", accent: "#047857", onAccent: "#ffffff", soft: "#ecfdf5", kinds: ["quotation"], builtin: true },

  // قوالب خاصة بالإشعارات الدائنة
  { id: "cn-crimson", name: "إشعار دائن — قرمزي", desc: "أحمر داكن مميز للإشعارات الدائنة.", accent: "#9f1239", onAccent: "#ffffff", soft: "#fff1f2", kinds: ["credit-note"], builtin: true },
  { id: "cn-slate",   name: "إشعار دائن — رصاصي", desc: "رمادي داكن أنيق للإشعارات.", accent: "#334155", onAccent: "#ffffff", soft: "#f1f5f9", kinds: ["credit-note"], builtin: true },

  // قوالب المشتريات
  { id: "po-ocean", name: "أمر شراء — محيط", desc: "أزرق سماوي للشحن واللوجستيات.", accent: "#0369a1", onAccent: "#ffffff", soft: "#f0f9ff", kinds: ["purchase-order"], builtin: true },
  { id: "po-forest", name: "أمر شراء — غابة", desc: "أخضر داكن للمقاولات والزراعة.", accent: "#14532d", onAccent: "#ffffff", soft: "#f0fdf4", kinds: ["purchase-order"], builtin: true },
  { id: "bill-sand", name: "فاتورة مورد — رملي", desc: "بيج هادئ لفواتير الموردين.", accent: "#8a6a3d", onAccent: "#ffffff", soft: "#faf6ee", kinds: ["bill"], builtin: true },
  { id: "bill-mono", name: "فاتورة مورد — أحادي", desc: "أسود على أبيض بسيط ومباشر.", accent: "#111827", onAccent: "#ffffff", soft: "#f9fafb", kinds: ["bill"], builtin: true },
];

type Override = Partial<Pick<InvoiceTemplate, "name" | "desc" | "accent" | "onAccent" | "soft">>;

const DEFAULT_SELECTED: Record<DocKind, string> = {
  invoice: "inv-wafeq-default",
  quotation: "qt-elegant",
  "credit-note": "cn-crimson",
  "purchase-order": "po-ocean",
  bill: "bill-sand",
};

function templateAllowedForKind(t: InvoiceTemplate, kind?: DocKind) {
  if (!kind) return true;
  if (!t.kinds || t.kinds.length === 0) return true; // shared
  return t.kinds.includes(kind);
}

export function useInvoiceTemplates(kind?: DocKind) {
  const custom = useCollection<InvoiceTemplate>("invoice-templates");
  const [overrides, setOverrides] = useKV<Record<string, Override>>("invoice-template-overrides", {});

  const builtins = BUILTIN_TEMPLATES.map((t) => ({ ...t, ...(overrides[t.id] || {}) }));
  const allUnfiltered: InvoiceTemplate[] = [...builtins, ...custom.items];
  const all = kind ? allUnfiltered.filter((t) => templateAllowedForKind(t, kind)) : allUnfiltered;

  // Per-kind selected template (falls back to legacy "invoice-template" key for backward compat)
  const kindKey = kind ? `invoice-template:${kind}` : "invoice-template";
  const [selectedId, setSelectedId] = useKV<string>(
    kindKey,
    kind ? (DEFAULT_SELECTED[kind] ?? "classic") : "classic"
  );
  const selected =
    all.find((t) => t.id === selectedId) ??
    all.find((t) => t.id === (kind ? DEFAULT_SELECTED[kind] : "classic")) ??
    all[0] ??
    builtins[0];

  const overrideBuiltin = (id: string, patch: Override) =>
    setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  const resetBuiltin = (id: string) =>
    setOverrides((prev) => {
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  const isOverridden = (id: string) => Boolean(overrides[id]);

  return { all, custom, selected, selectedId, setSelectedId, overrideBuiltin, resetBuiltin, isOverridden };
}

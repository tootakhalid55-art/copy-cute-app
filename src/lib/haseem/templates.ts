import { useCollection, useKV } from "./store";

export type DocKind = "invoice" | "quotation" | "credit-note" | "debit-note" | "purchase-order" | "bill";

export const DOC_KINDS: { id: DocKind; label: string }[] = [
  { id: "invoice", label: "الفواتير" },
  { id: "quotation", label: "عروض الأسعار" },
  { id: "credit-note", label: "إشعارات دائنة" },
  { id: "debit-note", label: "إشعارات مدينة" },
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
  layout?: "standard" | "simplified"; // "simplified" adds the "amount in words" line used by simplified tax invoices
  // Structural layout, distinct from `layout` above (which only toggles the
  // amount-in-words line): drives which extra section/columns render.
  //  - "contracting": adds the progress-billing (مستخلص) summary block
  //  - "supply": adds a unit-of-measure column to the items table
  //  - "services": relabels Qty/Price as Hours/Rate for consulting work
  layoutVariant?: "standard" | "contracting" | "supply" | "services";
};

export const BUILTIN_TEMPLATES: InvoiceTemplate[] = [
  // قوالب مشتركة لجميع المستندات (لا تزال مستخدمة لعروض الأسعار/الإشعارات/المشتريات)
  { id: "classic", name: "كلاسيكي", desc: "ترويسة رسمية داكنة مع تنظيم واضح للنصوص والحقول.", accent: "#0f2a1d", onAccent: "#ffffff", soft: "#fafaf7", builtin: true },
  { id: "modern",  name: "عصري",   desc: "تصميم أزرق حديث بطابع Canar، مناسب للفواتير والعروض.", accent: "#1b6ea8", onAccent: "#ffffff", soft: "#f3f9fe", builtin: true },
  { id: "minimal", name: "بسيط",   desc: "أقل حبر، مثالي للطباعة السريعة والنسخ الداخلية.", accent: "#425466", onAccent: "#ffffff", soft: "#f8fafc", builtin: true },

  // ملاحظة: قوالب الفواتير الملوّنة القديمة (inv-colored/inv-zatca-*/inv-simplified)
  // أُزيلت — الفاتورة الآن تُبنى من ثلاثة محاور مستقلة: الهيكل (DOC_STRUCTURES في
  // printDoc.ts)، اللون (منتقي ألوان حر، انظر DocumentForm.tsx)، ونوع النشاط
  // (CONTENT_VARIANTS أدناه) — بدل قوالب جاهزة يتشابه أغلبها إلا في اللون.
  // سطر «المبلغ بالحروف» أصبح تلقائيًا حسب نوع الفاتورة (مبسطة/غير مبسطة) بدل
  // اعتماده على اختيار قالب يدويًا — انظر buildDocHtml.

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

  // قوالب الأنشطة المتخصصة — لفواتير المشتريات فقط الآن (لم تُهاجَر بعد لنظام
  // المحاور الثلاثة). للفواتير، استخدم CONTENT_VARIANTS أدناه بدلاً منها.
  { id: "inv-contracting", name: "المقاولات والمستخلصات", desc: "لفواتير المقاولات: نسبة الإنجاز، الدفعات المقدمة، والمحجوزات.", accent: "#78350f", onAccent: "#ffffff", soft: "#fdf6ec", kinds: ["bill"], layoutVariant: "contracting", builtin: true },
  { id: "inv-supply", name: "التوريدات والمواد", desc: "لفواتير المواد والمعدات، مع عمود وحدة القياس في جدول الأصناف.", accent: "#0e7490", onAccent: "#ffffff", soft: "#ecfeff", kinds: ["bill"], layoutVariant: "supply", builtin: true },
];

// نوع نشاط الفاتورة (Content Variant) — محور مستقل تمامًا عن اللون والهيكل،
// يقتصر أثره على المحتوى: عمود وحدة القياس، إعادة تسمية الكمية/السعر، أو
// إضافة قسم المستخلص. يُستخدم فقط لكيان "invoice" (راجع DocumentForm.tsx).
export type ContentVariant = "standard" | "contracting" | "supply" | "services";
export const CONTENT_VARIANTS: { id: ContentVariant; name: string; desc: string }[] = [
  { id: "standard", name: "قياسي", desc: "فاتورة مبيعات عادية — بلا أقسام إضافية." },
  { id: "contracting", name: "المقاولات والمستخلصات", desc: "يضيف قسم المستخلص: نسبة الإنجاز، الدفعات المقدمة، والمحجوزات." },
  { id: "supply", name: "التوريدات والمواد", desc: "يضيف عمود وحدة القياس في جدول الأصناف." },
  { id: "services", name: "الخدمات المهنية", desc: "يستبدل الكمية/السعر بالساعات/الأجر — للاستشارات والخدمات الهندسية." },
];

/** Perceptual-ish luminance check: pick black or white text for a given accent. */
export function contrastColorFor(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#ffffff";
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0f2a1d" : "#ffffff";
}

/** Mix a hex color toward white by `amount` (0..1) — used for the soft/tint background. */
export function tintColorFor(hex: string, amount = 0.94): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#fafaf7";
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const mix = (ch: number) => Math.round(ch + (255 - ch) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

type Override = Partial<Pick<InvoiceTemplate, "name" | "desc" | "accent" | "onAccent" | "soft">>;

const DEFAULT_SELECTED: Record<DocKind, string> = {
  invoice: "inv-wafeq-default",
  quotation: "qt-elegant",
  "credit-note": "cn-crimson",
  "debit-note": "cn-crimson",
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

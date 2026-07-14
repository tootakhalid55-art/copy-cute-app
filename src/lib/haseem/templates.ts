import { useCollection, useKV } from "./store";

export type InvoiceTemplate = {
  id: string;
  name: string;
  desc?: string;
  accent: string;
  onAccent: string;
  soft: string;
  builtin?: boolean;
};

export const BUILTIN_TEMPLATES: InvoiceTemplate[] = [
  // القوالب الأصلية
  { id: "classic", name: "كلاسيكي", desc: "ترويسة داكنة، بنود منظمة، مناسب لمعظم المنشآت.", accent: "#0f2a1d", onAccent: "#ffffff", soft: "#fafaf7", builtin: true },
  { id: "modern",  name: "عصري",   desc: "تصميم بألوان هادئة وحدود دقيقة.", accent: "#1e40af", onAccent: "#ffffff", soft: "#f5f7ff", builtin: true },
  { id: "minimal", name: "بسيط",   desc: "أقل حبر، مثالي للطباعة السريعة.", accent: "#525252", onAccent: "#ffffff", soft: "#fafafa", builtin: true },
  { id: "colored", name: "ملوّن",   desc: "لمسة برتقالية بارزة للعلامة.", accent: "#c65b3c", onAccent: "#ffffff", soft: "#fff7f2", builtin: true },

  // قوالب وافِق
  { id: "wafeq-default", name: "وافِق — افتراضي", desc: "قالب أبيض نظيف بحدود رمادية دقيقة، ثنائي اللغة.", accent: "#1f2937", onAccent: "#ffffff", soft: "#f9fafb", builtin: true },
  { id: "wafeq-blue",    name: "وافِق — أزرق",   desc: "نسخة زرقاء رسمية بترويسة هادئة.", accent: "#1d4ed8", onAccent: "#ffffff", soft: "#eff6ff", builtin: true },
  { id: "wafeq-emerald", name: "وافِق — زمردي",  desc: "لمسة خضراء عصرية للشركات الخدمية.", accent: "#047857", onAccent: "#ffffff", soft: "#ecfdf5", builtin: true },
  { id: "wafeq-slate",   name: "وافِق — رصاصي", desc: "رمادي داكن أنيق للمكاتب والاستشارات.", accent: "#334155", onAccent: "#ffffff", soft: "#f1f5f9", builtin: true },

  // قوالب إضافية متنوعة
  { id: "royal",    name: "ملكي",    desc: "بنفسجي عميق يعكس الفخامة.", accent: "#5b21b6", onAccent: "#ffffff", soft: "#f5f3ff", builtin: true },
  { id: "sunset",   name: "غروب",   desc: "برتقالي دافئ للمطاعم والتجزئة.", accent: "#ea580c", onAccent: "#ffffff", soft: "#fff7ed", builtin: true },
  { id: "teal",     name: "فيروزي",  desc: "لون منعش للعيادات والمراكز.", accent: "#0d9488", onAccent: "#ffffff", soft: "#f0fdfa", builtin: true },
  { id: "crimson",  name: "قرمزي",  desc: "أحمر داكن جريء للعلامات المميزة.", accent: "#9f1239", onAccent: "#ffffff", soft: "#fff1f2", builtin: true },
  { id: "midnight", name: "منتصف الليل", desc: "أسود مزرق فاخر مع تباين عالٍ.", accent: "#0b1220", onAccent: "#ffffff", soft: "#f3f4f6", builtin: true },
  { id: "sand",     name: "رملي",   desc: "بيج هادئ يوحي بالتراث والأصالة.", accent: "#8a6a3d", onAccent: "#ffffff", soft: "#faf6ee", builtin: true },
  { id: "ocean",    name: "محيط",   desc: "أزرق سماوي عميق للشحن واللوجستيات.", accent: "#0369a1", onAccent: "#ffffff", soft: "#f0f9ff", builtin: true },
  { id: "forest",   name: "غابة",   desc: "أخضر داكن للمقاولات والزراعة.", accent: "#14532d", onAccent: "#ffffff", soft: "#f0fdf4", builtin: true },
];

type Override = Partial<Pick<InvoiceTemplate, "name" | "desc" | "accent" | "onAccent" | "soft">>;

export function useInvoiceTemplates() {
  const custom = useCollection<InvoiceTemplate>("invoice-templates");
  const [overrides, setOverrides] = useKV<Record<string, Override>>("invoice-template-overrides", {});

  const builtins = BUILTIN_TEMPLATES.map((t) => ({ ...t, ...(overrides[t.id] || {}) }));
  const all: InvoiceTemplate[] = [...builtins, ...custom.items];
  const [selectedId, setSelectedId] = useKV<string>("invoice-template", "classic");
  const selected = all.find((t) => t.id === selectedId) ?? builtins[0];

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

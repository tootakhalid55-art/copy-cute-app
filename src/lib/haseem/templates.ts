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
  { id: "classic", name: "كلاسيكي", desc: "ترويسة داكنة، بنود منظمة، مناسب لمعظم المنشآت.", accent: "#0f2a1d", onAccent: "#ffffff", soft: "#fafaf7", builtin: true },
  { id: "modern",  name: "عصري",   desc: "تصميم بألوان هادئة وحدود دقيقة.",                accent: "#1e40af", onAccent: "#ffffff", soft: "#f5f7ff", builtin: true },
  { id: "minimal", name: "بسيط",   desc: "أقل حبر، مثالي للطباعة السريعة.",                 accent: "#525252", onAccent: "#ffffff", soft: "#fafafa", builtin: true },
  { id: "colored", name: "ملوّن",   desc: "لمسة برتقالية بارزة للعلامة.",                    accent: "#c65b3c", onAccent: "#ffffff", soft: "#fff7f2", builtin: true },
  // قوالب مستوحاة من Wafeq
  { id: "wafeq-standard", name: "وافِق — قياسي", desc: "قالب افتراضي بأزرق هادئ وترويسة أنيقة.", accent: "#2563eb", onAccent: "#ffffff", soft: "#eff6ff", builtin: true },
  { id: "wafeq-modern",   name: "وافِق — عصري",   desc: "تصميم نظيف بلمسة تركوازية.",             accent: "#0d9488", onAccent: "#ffffff", soft: "#f0fdfa", builtin: true },
  { id: "wafeq-classic",  name: "وافِق — كلاسيكي", desc: "أسود وأبيض احترافي للطباعة الرسمية.",   accent: "#111827", onAccent: "#ffffff", soft: "#f9fafb", builtin: true },
  { id: "wafeq-simple",   name: "وافِق — مبسّط",   desc: "بلا ألوان صاخبة، تركيز على المحتوى.",     accent: "#374151", onAccent: "#ffffff", soft: "#ffffff", builtin: true },
  { id: "wafeq-detailed", name: "وافِق — تفصيلي",  desc: "خلفية دافئة تُبرز الحقول التفصيلية.",     accent: "#7c3aed", onAccent: "#ffffff", soft: "#f5f3ff", builtin: true },
  { id: "wafeq-elegant",  name: "وافِق — راقٍ",    desc: "بورجوندي فاخر لعلامات تجارية مميزة.",    accent: "#9f1239", onAccent: "#ffffff", soft: "#fff1f2", builtin: true },
];

export function useInvoiceTemplates() {
  const custom = useCollection<InvoiceTemplate>("invoice-templates");
  const all: InvoiceTemplate[] = [...BUILTIN_TEMPLATES, ...custom.items];
  const [selectedId, setSelectedId] = useKV<string>("invoice-template", "classic");
  const selected = all.find((t) => t.id === selectedId) ?? BUILTIN_TEMPLATES[0];
  return { all, custom, selected, selectedId, setSelectedId };
}

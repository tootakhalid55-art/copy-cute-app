import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FileText } from "lucide-react";
import { Shell, PageHeader, OutlineBtn } from "@/components/haseem/Shell";
import { useKV } from "@/lib/haseem/store";

type TemplateId = "classic" | "modern" | "minimal" | "colored";
const TEMPLATES: { id: TemplateId; name: string; desc: string; accent: string }[] = [
  { id: "classic", name: "كلاسيكي", desc: "ترويسة داكنة، بنود منظمة، مناسب لمعظم المنشآت.", accent: "#0f2a1d" },
  { id: "modern", name: "عصري", desc: "تصميم بألوان هادئة وحدود دقيقة.", accent: "#1e40af" },
  { id: "minimal", name: "بسيط", desc: "أقل حبر، مثالي للطباعة السريعة.", accent: "#525252" },
  { id: "colored", name: "ملوّن", desc: "لمسة برتقالية بارزة للعلامة.", accent: "#c65b3c" },
];

export const Route = createFileRoute("/settings/templates")({
  head: () => ({ meta: [{ title: "قوالب الفواتير — حسيم" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const [selected, setSelected] = useKV<TemplateId>("invoice-template", "classic");
  return (
    <Shell>
      <PageHeader
        title="قوالب الفواتير"
        subtitle="اختر التصميم الافتراضي لطباعة الفواتير وعروض الأسعار"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {TEMPLATES.map((t) => {
          const isActive = selected === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t.id)}
              className={`text-right rounded-xl border-2 p-4 bg-white transition ${
                isActive ? "border-[#0f2a1d] shadow" : "border-[#eceae2] hover:border-[#0f2a1d]/40"
              }`}
            >
              <div
                className="rounded-lg h-32 mb-3 flex flex-col justify-between p-2"
                style={{ background: `linear-gradient(180deg, ${t.accent}0d 0%, ${t.accent}22 100%)` }}
              >
                <div className="h-3 w-16 rounded" style={{ background: t.accent }} />
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded bg-[#0f2a1d]/20" />
                  <div className="h-1.5 w-3/4 rounded bg-[#0f2a1d]/20" />
                  <div className="h-1.5 w-1/2 rounded bg-[#0f2a1d]/20" />
                </div>
                <div className="h-4 w-20 rounded self-end" style={{ background: t.accent }} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4" style={{ color: t.accent }} />
                    {t.name}
                  </div>
                  <p className="text-xs text-[#0f2a1d]/60 mt-1">{t.desc}</p>
                </div>
                {isActive && <CheckCircle2 className="w-5 h-5 text-[#0f6b3a]" />}
              </div>
            </button>
          );
        })}
      </div>
      <div className="rounded-xl bg-white border border-[#eceae2] p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm">
          القالب المختار حالياً:{" "}
          <span className="font-semibold">{TEMPLATES.find((t) => t.id === selected)?.name}</span>
        </div>
        <OutlineBtn type="button" onClick={() => setSelected("classic")}>
          استعادة الافتراضي
        </OutlineBtn>
      </div>
    </Shell>
  );
}

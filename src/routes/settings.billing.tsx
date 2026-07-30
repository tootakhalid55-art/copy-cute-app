import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn } from "@/components/haseem/Shell";
import { useKV } from "@/lib/haseem/store";
import { Check } from "lucide-react";

type Plan = "trial" | "basic" | "pro" | "enterprise";
const PLANS: { id: Plan; name: string; price: string; features: string[] }[] = [
  { id: "basic", name: "الأساسية", price: "99 ﷼ / شهر", features: ["مستخدم واحد", "100 فاتورة شهرياً", "تقارير أساسية"] },
  { id: "pro", name: "الاحترافية", price: "249 ﷼ / شهر", features: ["3 مستخدمين", "فواتير غير محدودة", "تقارير متقدمة", "ربط منصة فاتورة"] },
  { id: "enterprise", name: "المؤسسات", price: "599 ﷼ / شهر", features: ["مستخدمون غير محدودين", "دعم مخصص", "تكاملات API", "SLA"] },
];

export const Route = createFileRoute("/settings/billing")({
  head: () => ({ meta: [{ title: "الاشتراك — كنار المحاسبية" }] }),
  component: BillingPage,
});

function BillingPage() {
  const [plan, setPlan] = useKV<Plan>("plan", "trial");

  return (
    <Shell>
      <PageHeader
        title="الاشتراك"
        subtitle={plan === "trial" ? "أنت الآن في الفترة التجريبية (14 يوم)" : `الخطة الحالية: ${PLANS.find((p) => p.id === plan)?.name}`}
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((p) => {
          const active = plan === p.id;
          return (
            <div key={p.id} className={`rounded-xl border p-5 space-y-3 ${active ? "border-[#0f2a1d] bg-[#eaf5ee]" : "border-[#eceae2] bg-white"}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{p.name}</h3>
                {active && <span className="text-[11px] bg-[#0f2a1d] text-white px-2 py-0.5 rounded-full">حالية</span>}
              </div>
              <div className="text-2xl font-bold">{p.price}</div>
              <ul className="space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-[#0f6b3a]" />{f}</li>
                ))}
              </ul>
              {active ? (
                <OutlineBtn className="w-full justify-center" onClick={() => setPlan("trial")}>إلغاء الاشتراك</OutlineBtn>
              ) : (
                <PrimaryBtn className="w-full justify-center" onClick={() => setPlan(p.id)}>الاشتراك في هذه الخطة</PrimaryBtn>
              )}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}


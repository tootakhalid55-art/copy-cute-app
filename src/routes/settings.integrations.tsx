import { createFileRoute } from "@tanstack/react-router";
import { Zap, ShoppingBag, CreditCard, MessageSquare, Mail, BarChart3, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Shell, PageHeader } from "@/components/haseem/Shell";
import { useKV } from "@/lib/haseem/store";

type Integration = { id: string; name: string; desc: string; icon: LucideIcon };
const INTEGRATIONS: Integration[] = [
  { id: "zatca", name: "هيئة الزكاة والضريبة (ZATCA)", desc: "ربط الفاتورة الإلكترونية المرحلة الثانية.", icon: Zap },
  { id: "salla", name: "سلة", desc: "مزامنة المنتجات والطلبات من متجرك.", icon: ShoppingBag },
  { id: "zid", name: "زد", desc: "مزامنة الطلبات والمخزون.", icon: ShoppingBag },
  { id: "moyasar", name: "ميسر (Moyasar)", desc: "قبول مدفوعات مدى وفيزا/ماستر.", icon: CreditCard },
  { id: "tap", name: "Tap Payments", desc: "بوابة دفع خليجية شاملة.", icon: CreditCard },
  { id: "stripe", name: "Stripe", desc: "بوابة دفع دولية.", icon: CreditCard },
  { id: "whatsapp", name: "واتساب للأعمال", desc: "إرسال الفواتير وسندات القبض تلقائياً.", icon: MessageSquare },
  { id: "sendgrid", name: "SendGrid", desc: "إرسال بريد المعاملات والتذكيرات.", icon: Mail },
  { id: "ga4", name: "Google Analytics 4", desc: "تتبع أداء متجرك ولوحاتك.", icon: BarChart3 },
];

export const Route = createFileRoute("/settings/integrations")({
  head: () => ({ meta: [{ title: "التكاملات — حسيم" }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const [enabled, setEnabled] = useKV<Record<string, boolean>>("integrations", {});
  const toggle = (id: string) => setEnabled((e) => ({ ...e, [id]: !e[id] }));
  return (
    <Shell>
      <PageHeader title="التكاملات" subtitle="فعّل ما تحتاجه من خدمات خارجية" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {INTEGRATIONS.map((it) => {
          const Icon = it.icon;
          const active = !!enabled[it.id];
          return (
            <div key={it.id} className="rounded-xl bg-white border border-[#eceae2] p-4 flex flex-col">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#f2f0e8] flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-[#0f2a1d]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{it.name}</div>
                  <p className="text-xs text-[#0f2a1d]/60 mt-1">{it.desc}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                {active ? (
                  <span className="inline-flex items-center gap-1 text-xs text-[#0f6b3a] font-medium">
                    <Check className="w-3.5 h-3.5" /> مفعّل
                  </span>
                ) : (
                  <span className="text-xs text-[#0f2a1d]/50">غير مفعّل</span>
                )}
                <button
                  onClick={() => toggle(it.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                    active
                      ? "bg-white border-[#eceae2] hover:bg-[#f7f6f0]"
                      : "bg-[#0f2a1d] text-white border-[#0f2a1d] hover:bg-[#163a29]"
                  }`}
                >
                  {active ? "إيقاف" : "تفعيل"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

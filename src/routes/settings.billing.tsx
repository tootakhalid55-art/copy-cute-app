import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn } from "@/components/haseem/Shell";
import { Check } from "lucide-react";

export const Route = createFileRoute("/settings/billing")({
  head: () => ({ meta: [{ title: "الاشتراك — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="الاشتراك" subtitle="إدارة خطة اشتراكك ومدفوعاتك" />
      <div className="rounded-xl bg-[#eaf5ee] border border-[#cfe6d7] p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-sm text-[#0f2a1d]/70">الخطة الحالية</div>
          <div className="text-2xl font-bold mt-1">نسخة تجريبية</div>
          <div className="text-xs text-[#0f2a1d]/70 mt-1">14 يوم متبقي</div>
        </div>
        <PrimaryBtn>اشترك الآن</PrimaryBtn>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {n:"أساسي", p:"49", f:["فواتير غير محدودة","5 مستخدمين","تقارير أساسية"]},
          {n:"احترافي", p:"99", f:["كل ميزات الأساسي","مستخدمين غير محدودين","إدارة مخزون","تقارير متقدمة"], hi:true},
          {n:"شركات", p:"199", f:["كل ميزات الاحترافي","API مخصص","دعم أولوية","تدريب مخصص"]},
        ].map((p)=>(
          <div key={p.n} className={`rounded-xl border p-5 ${p.hi?"border-[#0f2a1d] bg-white shadow":"border-[#eceae2] bg-white"}`}>
            <div className="font-semibold">{p.n}</div>
            <div className="text-3xl font-bold mt-2">{p.p} <span className="text-sm font-normal text-[#0f2a1d]/60">﷼/شهر</span></div>
            <ul className="mt-4 space-y-2 text-sm">
              {p.f.map((x)=><li key={x} className="flex items-center gap-2"><Check className="w-4 h-4 text-[#0f2a1d]" />{x}</li>)}
            </ul>
            <PrimaryBtn className="w-full justify-center mt-4">اختيار الخطة</PrimaryBtn>
          </div>
        ))}
      </div>
    </Shell>
  ),
});

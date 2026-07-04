import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader } from "@/components/haseem/Shell";
import { BarChart3, PackageCheck, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/inventory/reports")({
  head: () => ({ meta: [{ title: "تقارير المخزون — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="تقارير المخزون" subtitle="تقارير جرد وحركات الأصناف" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {i:BarChart3,t:"رصيد المخزون",d:"عرض أرصدة الأصناف الحالية"},
          {i:PackageCheck,t:"حركات المخزون",d:"سجل الوارد والصادر"},
          {i:TrendingDown,t:"الحد الأدنى للمخزون",d:"الأصناف التي وصلت الحد الأدنى"},
        ].map((r)=>{const Icon=r.i;return (
          <div key={r.t} className="rounded-xl bg-white border border-[#eceae2] p-5 hover:border-[#0f2a1d] cursor-pointer">
            <Icon className="w-6 h-6 text-[#0f2a1d]" />
            <div className="font-semibold mt-3">{r.t}</div>
            <div className="text-xs text-[#0f2a1d]/60 mt-1">{r.d}</div>
          </div>
        );})}
      </div>
    </Shell>
  ),
});

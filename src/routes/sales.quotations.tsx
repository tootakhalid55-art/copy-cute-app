import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn } from "@/components/haseem/Shell";
import { FileText, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/sales/quotations")({
  head: () => ({ meta: [{ title: "عروض الأسعار — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader
        title="عروض الأسعار والفواتير المبدئية"
        subtitle="إنشاء عروض الأسعار ومتابعتها وتحويلها إلى فواتير"
        action={<PrimaryBtn><Plus className="w-4 h-4" />إنشاء</PrimaryBtn>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 border border-[#eceae2] rounded-lg px-3 py-2 bg-white flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-[#0f2a1d]/50" />
          <input placeholder="البحث في عروض الأسعار..." className="bg-transparent text-sm outline-none w-full" />
        </div>
        <button className="text-sm border border-[#eceae2] rounded-lg px-3 py-2 bg-white">فاتورة مبدئية</button>
        <button className="text-sm border border-[#eceae2] rounded-lg px-3 py-2 bg-white">عرض سعر</button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {["الكل (0)","مسودة (0)","صادر (0)","مقبول (0)","محوّل (0)","منتهي (0)","مرفوض (0)"].map((t, i) => (
          <button key={t} className={`px-3 py-1.5 rounded-lg border ${i===0?"bg-[#0f2a1d] text-white border-[#0f2a1d]":"bg-white border-[#eceae2]"}`}>{t}</button>
        ))}
      </div>
      <div className="rounded-xl border border-[#eaf5ee] bg-[#f7fbf8] py-16 text-center">
        <FileText className="w-8 h-8 mx-auto text-[#0f2a1d]/50" />
        <div className="mt-3 font-semibold">لا توجد عروض أسعار</div>
        <div className="text-xs text-[#0f2a1d]/60 mt-1">أنشئ أول عرض سعر وشاركه مع عميلك</div>
        <PrimaryBtn className="mt-4"><Plus className="w-4 h-4" />إنشاء</PrimaryBtn>
      </div>
    </Shell>
  ),
});

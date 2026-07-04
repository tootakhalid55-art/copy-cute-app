import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, EmptyState } from "@/components/haseem/Shell";
import { Plus, Search, FileMinus } from "lucide-react";

export const Route = createFileRoute("/sales/credit-notes")({
  head: () => ({ meta: [{ title: "الإشعارات الدائنة — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="إشعارات دائنة" subtitle="إدارة إشعارات الدائنة الصادرة للعملاء" action={<PrimaryBtn><Plus className="w-4 h-4" />إنشاء إشعار دائن</PrimaryBtn>} />
      <div className="flex flex-wrap gap-2 text-xs">
        {["الكل (0)","مسودة (0)","صادر (0)","ملغي (0)"].map((t,i)=>(
          <button key={t} className={`px-3 py-1.5 rounded-lg border ${i===0?"bg-[#0f2a1d] text-white border-[#0f2a1d]":"bg-white border-[#eceae2]"}`}>{t}</button>
        ))}
      </div>
      <EmptyState icon={FileMinus} title="لا توجد إشعارات دائنة" />
    </Shell>
  ),
});

import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn } from "@/components/haseem/Shell";
import { Plus, Search, MoreVertical } from "lucide-react";

export const Route = createFileRoute("/sales/customers")({
  head: () => ({ meta: [{ title: "العملاء — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="العملاء" subtitle="إدارة عملاء المبيعات (الزبائن)" action={<PrimaryBtn><Plus className="w-4 h-4" />إضافة عميل</PrimaryBtn>} />
      <div className="flex items-center gap-2 border border-[#eceae2] rounded-lg px-3 py-2 bg-white">
        <Search className="w-4 h-4 text-[#0f2a1d]/50" />
        <input placeholder="البحث بالاسم أو الرمز أو البريد..." className="bg-transparent text-sm outline-none w-full" />
      </div>
      <div className="rounded-xl bg-white border border-[#eceae2] divide-y divide-[#eceae2]">
        <div className="flex items-center justify-between p-4">
          <div className="text-right">
            <div className="font-semibold">شركة دار وإعمار للاستثمار و التطوير العقاري</div>
            <div className="text-xs text-[#0f2a1d]/60 mt-0.5">CLI-351328 · شركة</div>
          </div>
          <button className="p-1.5 text-[#0f2a1d]/60 hover:bg-[#f7f6f0] rounded"><MoreVertical className="w-4 h-4" /></button>
        </div>
      </div>
    </Shell>
  ),
});

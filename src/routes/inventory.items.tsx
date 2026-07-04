import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, EmptyState } from "@/components/haseem/Shell";
import { Plus, Package, Search } from "lucide-react";

export const Route = createFileRoute("/inventory/items")({
  head: () => ({ meta: [{ title: "الأصناف — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="الأصناف" subtitle="الأصناف والخدمات للفواتير" action={<PrimaryBtn><Plus className="w-4 h-4" />إضافة صنف</PrimaryBtn>} />
      <div className="flex items-center gap-2 border border-[#eceae2] rounded-lg px-3 py-2 bg-white">
        <Search className="w-4 h-4 text-[#0f2a1d]/50" />
        <input placeholder="البحث بالاسم أو رمز الصنف..." className="bg-transparent text-sm outline-none w-full" />
      </div>
      <EmptyState icon={Package} title="لا توجد أصناف بعد. أضف صنفًا لاستخدامه في الفواتير." />
    </Shell>
  ),
});

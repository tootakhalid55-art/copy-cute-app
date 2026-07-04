import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, EmptyState } from "@/components/haseem/Shell";
import { Plus, Users, Search } from "lucide-react";

export const Route = createFileRoute("/purchases/suppliers")({
  head: () => ({ meta: [{ title: "الموردون — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="الموردون" subtitle="إدارة موردي المشتريات" action={<PrimaryBtn><Plus className="w-4 h-4" />إضافة مورد</PrimaryBtn>} />
      <div className="flex items-center gap-2 border border-[#eceae2] rounded-lg px-3 py-2 bg-white">
        <Search className="w-4 h-4 text-[#0f2a1d]/50" />
        <input placeholder="ابحث بالاسم أو الرمز أو البريد..." className="bg-transparent text-sm outline-none w-full" />
      </div>
      <EmptyState icon={Users} title="لا يوجد موردون بعد" description="أضف موردًا للبدء." />
    </Shell>
  ),
});

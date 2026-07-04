import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn } from "@/components/haseem/Shell";
import { Plus, Warehouse } from "lucide-react";

export const Route = createFileRoute("/inventory/warehouses")({
  head: () => ({ meta: [{ title: "المستودعات — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="المستودعات" subtitle="إدارة مستودعات المخزون" action={<PrimaryBtn><Plus className="w-4 h-4" />إضافة مستودع</PrimaryBtn>} />
      <div className="rounded-xl bg-white border border-[#eceae2] p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#eaf5ee] flex items-center justify-center"><Warehouse className="w-5 h-5 text-[#0f2a1d]" /></div>
          <div><div className="font-semibold">المستودع الرئيسي</div><div className="text-xs text-[#0f2a1d]/60">WH-216691</div></div>
        </div>
        <span className="text-xs bg-[#eaf5ee] text-[#0f2a1d] px-2 py-0.5 rounded">افتراضي</span>
      </div>
    </Shell>
  ),
});

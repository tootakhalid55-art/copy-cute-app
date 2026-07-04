import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn } from "@/components/haseem/Shell";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "المصروفات — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="المصروفات" subtitle="تسجيل المصروفات التشغيلية وترحيلها في دفتر الأستاذ" action={<PrimaryBtn><Plus className="w-4 h-4" />مصروف جديد</PrimaryBtn>} />
      <div className="rounded-xl bg-white border border-[#eceae2] py-10 text-center text-sm text-[#0f2a1d]/70">لا توجد مصروفات</div>
    </Shell>
  ),
});

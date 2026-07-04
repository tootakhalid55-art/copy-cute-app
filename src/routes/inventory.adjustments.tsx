import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, EmptyState } from "@/components/haseem/Shell";
import { Plus, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/inventory/adjustments")({
  head: () => ({ meta: [{ title: "تسويات المخزون — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="تسويات المخزون" subtitle="تعديل الكميات وضبط الأرصدة" action={<PrimaryBtn><Plus className="w-4 h-4" />تسوية جديدة</PrimaryBtn>} />
      <EmptyState icon={ClipboardList} title="لا توجد تسويات" />
    </Shell>
  ),
});

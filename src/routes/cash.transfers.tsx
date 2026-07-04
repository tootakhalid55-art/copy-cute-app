import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, EmptyState } from "@/components/haseem/Shell";
import { Plus, ArrowRightLeft } from "lucide-react";

export const Route = createFileRoute("/cash/transfers")({
  head: () => ({ meta: [{ title: "التحويلات — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="التحويلات" subtitle="التحويلات بين الحسابات البنكية والخزائن" action={<PrimaryBtn><Plus className="w-4 h-4" />تحويل جديد</PrimaryBtn>} />
      <EmptyState icon={ArrowRightLeft} title="لا توجد تحويلات" />
    </Shell>
  ),
});

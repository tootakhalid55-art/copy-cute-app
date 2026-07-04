import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, EmptyState } from "@/components/haseem/Shell";
import { Plus, Receipt } from "lucide-react";

export const Route = createFileRoute("/cash/payments")({
  head: () => ({ meta: [{ title: "سندات الصرف — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="سندات الصرف" subtitle="إدارة سندات صرف المبالغ للموردين" action={<PrimaryBtn><Plus className="w-4 h-4" />سند صرف جديد</PrimaryBtn>} />
      <EmptyState icon={Receipt} title="لا توجد سندات صرف" />
    </Shell>
  ),
});

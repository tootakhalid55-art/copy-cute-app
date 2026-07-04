import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, EmptyState } from "@/components/haseem/Shell";
import { Plus, Receipt } from "lucide-react";

export const Route = createFileRoute("/cash/receipts")({
  head: () => ({ meta: [{ title: "سندات القبض — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="سندات القبض" subtitle="إدارة سندات قبض المبالغ من العملاء" action={<PrimaryBtn><Plus className="w-4 h-4" />سند قبض جديد</PrimaryBtn>} />
      <EmptyState icon={Receipt} title="لا توجد سندات قبض" />
    </Shell>
  ),
});

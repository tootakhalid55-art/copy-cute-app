import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, EmptyState } from "@/components/haseem/Shell";
import { Plus, LayoutGrid } from "lucide-react";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "المشاريع — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="المشاريع" subtitle="إدارة مشاريعك وتتبع تكاليفها وإيراداتها" action={<PrimaryBtn><Plus className="w-4 h-4" />إضافة مشروع</PrimaryBtn>} />
      <EmptyState icon={LayoutGrid} title="لا توجد مشاريع" />
    </Shell>
  ),
});

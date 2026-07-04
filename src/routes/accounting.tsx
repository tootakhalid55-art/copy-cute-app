import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, EmptyState } from "@/components/haseem/Shell";
import { Calculator } from "lucide-react";

export const Route = createFileRoute("/accounting")({
  head: () => ({ meta: [{ title: "المحاسبة — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="المحاسبة" subtitle="دفتر الأستاذ العام، القيود، وشجرة الحسابات" />
      <EmptyState icon={Calculator} title="لا توجد قيود محاسبية بعد" />
    </Shell>
  ),
});

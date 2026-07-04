import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, EmptyState } from "@/components/haseem/Shell";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/cash/transactions")({
  head: () => ({ meta: [{ title: "المعاملات — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="المعاملات" subtitle="سجل المعاملات النقدية والبنكية" />
      <EmptyState icon={Wallet} title="لا توجد معاملات" />
    </Shell>
  ),
});

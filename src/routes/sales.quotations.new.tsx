import { createFileRoute } from "@tanstack/react-router";
import { QuotationForm } from "@/components/haseem/QuotationForm";

export const Route = createFileRoute("/sales/quotations/new")({
  head: () => ({ meta: [{ title: "إنشاء عرض سعر — حسيم" }] }),
  component: () => <QuotationForm />,
});

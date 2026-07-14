import { createFileRoute } from "@tanstack/react-router";
import { QuotationForm } from "@/components/haseem/QuotationForm";

export const Route = createFileRoute("/sales/quotations/$id")({
  head: () => ({ meta: [{ title: "تعديل عرض سعر — حسيم" }] }),
  component: () => {
    const { id } = Route.useParams();
    return <QuotationForm docId={id} />;
  },
});

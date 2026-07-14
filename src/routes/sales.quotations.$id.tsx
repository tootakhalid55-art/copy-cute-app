import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/sales/quotations/$id")({
  head: () => ({ meta: [{ title: "تعديل عرض سعر — حسيم" }] }),
  component: () => {
    const { id } = Route.useParams();
    return (
      <DocumentForm
        storageKey="quotations"
        partyKey="customers"
        partyLabel="العميل"
        title="تعديل عرض سعر"
        backTo="/sales/quotations"
        docPrefix="QT"
      kind="quotation"
        docId={id}
      />
    );
  },
});

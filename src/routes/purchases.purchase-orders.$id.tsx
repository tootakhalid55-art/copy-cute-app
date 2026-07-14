import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/purchases/purchase-orders/$id")({
  head: () => ({ meta: [{ title: "تعديل أمر شراء — حسيم" }] }),
  component: () => {
    const { id } = Route.useParams();
    return (
      <DocumentForm
        storageKey="purchase-orders"
        partyKey="suppliers"
        partyLabel="المورد"
        title="تعديل أمر شراء"
        backTo="/purchases/purchase-orders"
        docPrefix="PO"
        docId={id}
      />
    );
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/purchases/bills/$id")({
  head: () => ({ meta: [{ title: "تعديل فاتورة شراء — حسيم" }] }),
  component: () => {
    const { id } = Route.useParams();
    return (
      <DocumentForm
        storageKey="bills"
        partyKey="suppliers"
        partyLabel="المورد"
        title="تعديل فاتورة شراء"
        backTo="/purchases/bills"
        docPrefix="BILL"
        docId={id}
      />
    );
  },
});

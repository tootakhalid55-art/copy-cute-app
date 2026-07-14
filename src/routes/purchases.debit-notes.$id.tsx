import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/purchases/debit-notes/$id")({
  head: () => ({ meta: [{ title: "تعديل إشعار مدين — حسيم" }] }),
  component: () => {
    const { id } = Route.useParams();
    return (
      <DocumentForm
        storageKey="debit-notes"
        partyKey="suppliers"
        partyLabel="المورد"
        title="تعديل إشعار مدين"
        backTo="/purchases/debit-notes"
        docPrefix="DN"
        docId={id}
      />
    );
  },
});

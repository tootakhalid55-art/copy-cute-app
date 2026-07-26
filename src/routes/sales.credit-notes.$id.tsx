import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/sales/credit-notes/$id")({
  head: () => ({ meta: [{ title: "تعديل إشعار دائن — حسيم" }] }),
  component: EditCreditNotePage,
});

function EditCreditNotePage() {
  const { id } = Route.useParams();
  return (
    <DocumentForm
      storageKey="credit-notes"
      partyKey="customers"
      partyLabel="العميل"
      title="تعديل إشعار دائن"
      backTo="/sales/credit-notes"
      docPrefix="CN"
      kind="credit-note"
      docId={id}
    />
  );
}

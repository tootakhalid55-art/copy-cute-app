import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/purchases/debit-notes/new")({
  head: () => ({ meta: [{ title: "إشعار مدين جديد — كنار المحاسبية" }] }),
  component: () => (
    <DocumentForm
      storageKey="debit-notes"
      partyKey="suppliers"
      partyLabel="المورد"
      title="إنشاء إشعار مدين"
      backTo="/purchases/debit-notes"
      docPrefix="DN"
      kind="debit-note"
    />
  ),
});


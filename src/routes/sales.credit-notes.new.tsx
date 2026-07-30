import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/sales/credit-notes/new")({
  head: () => ({ meta: [{ title: "إنشاء إشعار دائن — كنار المحاسبية" }] }),
  component: () => (
    <DocumentForm
      storageKey="credit-notes"
      partyKey="customers"
      partyLabel="العميل"
      title="إنشاء إشعار دائن"
      backTo="/sales/credit-notes"
      docPrefix="CN"
      kind="credit-note"
    />
  ),
});


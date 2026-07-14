import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/sales/quotations/new")({
  head: () => ({ meta: [{ title: "إنشاء عرض سعر — حسيم" }] }),
  component: () => (
    <DocumentForm
      storageKey="quotations"
      partyKey="customers"
      partyLabel="العميل"
      title="إنشاء عرض سعر"
      backTo="/sales/quotations"
      docPrefix="QT"
      kind="quotation"
    />
  ),
});

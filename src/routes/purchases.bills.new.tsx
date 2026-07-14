import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/purchases/bills/new")({
  head: () => ({ meta: [{ title: "إنشاء فاتورة شراء — حسيم" }] }),
  component: () => (
    <DocumentForm
      storageKey="bills"
      partyKey="suppliers"
      partyLabel="المورد"
      title="إنشاء فاتورة شراء"
      backTo="/purchases/bills"
      docPrefix="BILL"
      kind="bill"
    />
  ),
});

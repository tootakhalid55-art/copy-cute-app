import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/purchases/purchase-orders/new")({
  head: () => ({ meta: [{ title: "إنشاء أمر شراء — حسيم" }] }),
  component: () => (
    <DocumentForm
      storageKey="purchase-orders"
      partyKey="suppliers"
      partyLabel="المورد"
      title="إنشاء أمر شراء"
      backTo="/purchases/purchase-orders"
      docPrefix="PO"
      kind="purchase-order"
    />
  ),
});

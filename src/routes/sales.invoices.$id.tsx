import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/sales/invoices/$id")({
  head: () => ({ meta: [{ title: "تعديل فاتورة مبيعات — حسيم" }] }),
  component: () => {
    const { id } = Route.useParams();
    return (
      <DocumentForm
        storageKey="invoices"
        partyKey="customers"
        partyLabel="العميل"
        title="تعديل فاتورة مبيعات"
        backTo="/sales/invoices"
        docPrefix="INV"
      kind="invoice"
        docId={id}
      />
    );
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/haseem/DocumentForm";

export const Route = createFileRoute("/sales/invoices/new")({
  head: () => ({ meta: [{ title: "إنشاء فاتورة مبيعات — كنار المحاسبية" }] }),
  component: () => (
    <DocumentForm
      storageKey="invoices"
      partyKey="customers"
      partyLabel="العميل"
      title="إنشاء فاتورة مبيعات"
      subtitle="أدخل بيانات الفاتورة ثم احفظها"
      backTo="/sales/invoices"
      docPrefix="INV"
      kind="invoice"
    />
  ),
});


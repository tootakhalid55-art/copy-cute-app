import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { Badge, money, statusTone } from "@/components/haseem/Shell";
import { RecordPaymentButton } from "@/components/haseem/RecordPaymentButton";

export const Route = createFileRoute("/sales/invoices/")({
  component: () => (
    <CrudModule
      storageKey="invoices"
      title="فواتير المبيعات"
      subtitle="إدارة الفواتير وتتبع المستحقات"
      newLabel="إنشاء فاتورة"
      newPath="/sales/invoices/new"
      searchIn={["ref", "partyName", "status"]}
      fields={[]}
      columns={[
        { name: "ref", label: "الرقم" },
        { name: "date", label: "التاريخ" },
        { name: "partyName", label: "العميل" },
        { name: "dueDate", label: "الاستحقاق" },
        { name: "total", label: "الإجمالي", format: (r) => money(r.total) },
        { name: "status", label: "الحالة", format: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
      ]}
      rowActions={(row) => <RecordPaymentButton row={row} side="receivable" />}
    />
  ),
});
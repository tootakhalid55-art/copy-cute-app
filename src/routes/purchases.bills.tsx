import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { Badge, money, statusTone } from "@/components/haseem/Shell";

export const Route = createFileRoute("/purchases/bills")({
  head: () => ({ meta: [{ title: "فواتير المشتريات — حسيم" }] }),
  component: () => (
    <CrudModule
      storageKey="bills"
      title="فواتير المشتريات"
      subtitle="إدارة فواتير الموردين"
      newLabel="إنشاء فاتورة شراء"
      newPath="/purchases/bills/new"
      searchIn={["ref", "partyName"]}
      fields={[]}
      columns={[
        { name: "ref", label: "الرقم" },
        { name: "date", label: "التاريخ" },
        { name: "partyName", label: "المورد" },
        { name: "dueDate", label: "الاستحقاق" },
        { name: "total", label: "الإجمالي", format: (r) => money(r.total) },
        { name: "status", label: "الحالة", format: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
      ]}
    />
  ),
});

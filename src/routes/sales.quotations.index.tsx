import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { Badge, money, statusTone } from "@/components/haseem/Shell";

export const Route = createFileRoute("/sales/quotations/")({
  component: () => (
    <CrudModule
      storageKey="quotations"
      title="عروض الأسعار"
      subtitle="إدارة عروض الأسعار المرسلة للعملاء"
      newLabel="إنشاء عرض سعر"
      newPath="/sales/quotations/new"
      searchIn={["ref", "partyName", "status"]}
      fields={[]}
      columns={[
        { name: "ref", label: "الرقم" },
        { name: "date", label: "التاريخ" },
        { name: "partyName", label: "العميل" },
        { name: "total", label: "الإجمالي", format: (r) => money(r.total) },
        { name: "status", label: "الحالة", format: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
      ]}
    />
  ),
});
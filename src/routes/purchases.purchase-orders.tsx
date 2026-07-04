import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { Badge, money, statusTone } from "@/components/haseem/Shell";

export const Route = createFileRoute("/purchases/purchase-orders")({
  head: () => ({ meta: [{ title: "أوامر الشراء — حسيم" }] }),
  component: () => (
    <CrudModule
      storageKey="purchase-orders"
      title="أوامر الشراء"
      subtitle="طلبات الشراء المرسلة للموردين"
      newLabel="إنشاء أمر شراء"
      newPath="/purchases/purchase-orders/new"
      searchIn={["ref", "partyName"]}
      fields={[]}
      columns={[
        { name: "ref", label: "الرقم" },
        { name: "date", label: "التاريخ" },
        { name: "partyName", label: "المورد" },
        { name: "total", label: "الإجمالي", format: (r) => money(r.total) },
        { name: "status", label: "الحالة", format: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
      ]}
    />
  ),
});

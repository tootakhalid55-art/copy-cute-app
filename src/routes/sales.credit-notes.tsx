import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { Badge, money, statusTone } from "@/components/haseem/Shell";

export const Route = createFileRoute("/sales/credit-notes")({
  head: () => ({ meta: [{ title: "الإشعارات الدائنة — حسيم" }] }),
  component: () => (
    <CrudModule
      storageKey="credit-notes"
      title="الإشعارات الدائنة"
      subtitle="إشعارات دائنة للعملاء (مرتجعات ومردودات)"
      newLabel="إنشاء إشعار دائن"
      newPath="/sales/credit-notes/new"
      searchIn={["ref", "partyName"]}
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

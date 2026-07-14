import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";

export const Route = createFileRoute("/purchases/debit-notes/")({
  component: () => (
    <CrudModule
      storageKey="debit-notes"
      title="الإشعارات المدينة"
      subtitle="خصومات ومردودات على المشتريات من الموردين"
      newLabel="إضافة إشعار مدين"
      newPath="/purchases/debit-notes/new"
      searchIn={["ref", "partyName"]}
      fields={[]}
      columns={[
        { name: "ref", label: "المرجع" },
        { name: "date", label: "التاريخ" },
        { name: "partyName", label: "المورد" },
        { name: "total", label: "الإجمالي", format: (r) => `${Number(r.total || 0).toLocaleString()} ر.س` },
        { name: "status", label: "الحالة" },
      ]}
      emptyTitle="لا توجد إشعارات مدينة"
      emptyDescription="ابدأ بإصدار إشعار مدين مقابل مورد."
    />
  ),
});

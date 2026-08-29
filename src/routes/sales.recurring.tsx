import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { RecurringGenerator } from "@/components/haseem/RecurringGenerator";

export const Route = createFileRoute("/sales/recurring")({
  head: () => ({ meta: [{ title: "الفواتير المتكررة — كنار المحاسبية" }] }),
  component: () => (
    <CrudModule
      storageKey="recurring-invoices"
      title="الفواتير المتكررة"
      subtitle="جدولة إصدار فواتير تلقائية بشكل دوري"
      newLabel="إضافة فاتورة متكررة"
      searchIn={["name", "customer"]}
      fields={[
        { name: "name", label: "الاسم", required: true },
        { name: "customer", label: "العميل", required: true },
        { name: "amount", label: "المبلغ", type: "number", required: true },
        { name: "frequency", label: "التكرار", type: "select", options: ["يومي", "أسبوعي", "شهري", "ربع سنوي", "سنوي"], default: "شهري" },
        { name: "startDate", label: "تاريخ البدء", type: "date", required: true },
        { name: "endDate", label: "تاريخ الانتهاء", type: "date" },
        { name: "status", label: "الحالة", type: "select", options: ["نشط", "متوقف"], default: "نشط" },
        { name: "notes", label: "ملاحظات", type: "textarea" },
      ]}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "customer", label: "العميل" },
        { name: "amount", label: "المبلغ", format: (r) => `${Number(r.amount || 0).toLocaleString()} ر.س` },
        { name: "frequency", label: "التكرار" },
        { name: "startDate", label: "البدء" },
        { name: "status", label: "الحالة" },
      ]}
      beforeList={<RecurringGenerator />}
      emptyTitle="لا توجد فواتير متكررة"
      emptyDescription="أنشئ جدولاً لإصدار الفواتير تلقائياً."
    />
  ),
});


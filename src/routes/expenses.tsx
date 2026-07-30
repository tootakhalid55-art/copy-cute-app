import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { money } from "@/components/haseem/Shell";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "المصروفات — كنار المحاسبية" }] }),
  component: () => (
    <CrudModule
      storageKey="expenses"
      title="المصروفات"
      subtitle="سجّل المصروفات التشغيلية"
      newLabel="إضافة مصروف"
      searchIn={["category", "description", "supplier"]}
      fields={[
        { name: "date", label: "التاريخ", type: "date", required: true, default: new Date().toISOString().slice(0, 10) },
        { name: "category", label: "التصنيف", type: "select", options: ["إيجار", "رواتب", "كهرباء", "اتصالات", "صيانة", "أخرى"], required: true },
        { name: "amount", label: "المبلغ", type: "number", required: true },
        { name: "supplier", label: "الجهة / المستفيد" },
        { name: "description", label: "الوصف", type: "textarea" },
      ]}
      columns={[
        { name: "date", label: "التاريخ" },
        { name: "category", label: "التصنيف" },
        { name: "supplier", label: "الجهة" },
        { name: "amount", label: "المبلغ", format: (r) => money(r.amount) },
        { name: "description", label: "الوصف" },
      ]}
    />
  ),
});


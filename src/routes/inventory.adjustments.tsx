import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";

export const Route = createFileRoute("/inventory/adjustments")({
  head: () => ({ meta: [{ title: "تسويات المخزون — كنار المحاسبية" }] }),
  component: () => (
    <CrudModule
      storageKey="adjustments"
      title="تسويات المخزون"
      subtitle="تسجيل الجرد وفروقات المخزون"
      newLabel="تسوية جديدة"
      searchIn={["item", "warehouse", "reason"]}
      fields={[
        { name: "date", label: "التاريخ", type: "date", required: true, default: new Date().toISOString().slice(0, 10) },
        { name: "warehouse", label: "المستودع", required: true },
        { name: "item", label: "الصنف", required: true },
        { name: "type", label: "النوع", type: "select", options: ["زيادة", "نقص"], default: "زيادة" },
        { name: "qty", label: "الكمية", type: "number", required: true },
        { name: "reason", label: "السبب", type: "textarea" },
      ]}
      columns={[
        { name: "date", label: "التاريخ" },
        { name: "warehouse", label: "المستودع" },
        { name: "item", label: "الصنف" },
        { name: "type", label: "النوع" },
        { name: "qty", label: "الكمية" },
        { name: "reason", label: "السبب" },
      ]}
    />
  ),
});


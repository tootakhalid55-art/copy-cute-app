import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";

export const Route = createFileRoute("/settings/sales-reps")({
  head: () => ({ meta: [{ title: "مناديب المبيعات — حسيم" }] }),
  component: () => (
    <CrudModule
      storageKey="sales-reps"
      title="مناديب المبيعات"
      subtitle="إدارة فريق المبيعات وعمولاتهم"
      newLabel="إضافة مندوب"
      searchIn={["name", "email"]}
      fields={[
        { name: "name", label: "الاسم", required: true },
        { name: "email", label: "البريد الإلكتروني", type: "email" },
        { name: "phone", label: "الجوال", type: "tel" },
        { name: "commission", label: "نسبة العمولة %", type: "number", default: 0 },
        { name: "region", label: "المنطقة/التغطية" },
        {
          name: "status",
          label: "الحالة",
          type: "select",
          options: ["نشط", "غير نشط"],
          default: "نشط",
        },
      ]}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "phone", label: "الجوال" },
        { name: "region", label: "المنطقة" },
        { name: "commission", label: "العمولة %" },
        { name: "status", label: "الحالة" },
      ]}
    />
  ),
});

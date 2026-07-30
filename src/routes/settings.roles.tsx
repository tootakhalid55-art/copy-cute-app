import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";

export const Route = createFileRoute("/settings/roles")({
  head: () => ({ meta: [{ title: "الأدوار — كنار المحاسبية" }] }),
  component: () => (
    <CrudModule
      storageKey="roles"
      title="الأدوار والصلاحيات"
      subtitle="تعريف الأدوار وضبط الصلاحيات"
      newLabel="إضافة دور"
      searchIn={["name"]}
      fields={[
        { name: "name", label: "اسم الدور", required: true },
        { name: "description", label: "الوصف", type: "textarea" },
        {
          name: "scope",
          label: "النطاق",
          type: "select",
          options: ["كامل", "المبيعات فقط", "المشتريات فقط", "المحاسبة فقط", "قراءة فقط"],
        },
      ]}
      columns={[
        { name: "name", label: "الدور" },
        { name: "scope", label: "النطاق" },
        { name: "description", label: "الوصف" },
      ]}
    />
  ),
});


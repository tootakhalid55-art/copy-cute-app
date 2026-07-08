import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";

export const Route = createFileRoute("/settings/branches")({
  head: () => ({ meta: [{ title: "الفروع — حسيم" }] }),
  component: () => (
    <CrudModule
      storageKey="branches"
      title="الفروع"
      subtitle="إدارة فروع المنشأة"
      newLabel="إضافة فرع"
      searchIn={["name", "code", "city"]}
      fields={[
        { name: "name", label: "اسم الفرع", required: true },
        { name: "code", label: "الرمز" },
        { name: "city", label: "المدينة" },
        { name: "address", label: "العنوان", type: "textarea" },
        { name: "phone", label: "الهاتف", type: "tel" },
        { name: "manager", label: "مدير الفرع" },
      ]}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "code", label: "الرمز" },
        { name: "city", label: "المدينة" },
        { name: "phone", label: "الهاتف" },
        { name: "manager", label: "المدير" },
      ]}
    />
  ),
});

import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";

export const Route = createFileRoute("/inventory/warehouses")({
  head: () => ({ meta: [{ title: "المستودعات — كنار المحاسبية" }] }),
  component: () => (
    <CrudModule
      storageKey="warehouses"
      title="المستودعات"
      subtitle="أماكن تخزين الأصناف"
      newLabel="إضافة مستودع"
      searchIn={["name", "code", "location"]}
      fields={[
        { name: "name", label: "اسم المستودع", required: true },
        { name: "code", label: "الرمز — يُولَّد تلقائياً وقابل للتعديل", autoCode: "WH" },
        { name: "location", label: "الموقع" },
        { name: "manager", label: "المسؤول" },
      ]}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "code", label: "الرمز" },
        { name: "location", label: "الموقع" },
        { name: "manager", label: "المسؤول" },
      ]}
    />
  ),
});


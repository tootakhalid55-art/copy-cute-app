import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { money } from "@/components/haseem/Shell";

export const Route = createFileRoute("/purchases/suppliers")({
  head: () => ({ meta: [{ title: "الموردون — حسيم" }] }),
  component: () => (
    <CrudModule
      storageKey="suppliers"
      title="الموردون"
      subtitle="إدارة موردي المنشأة"
      newLabel="إضافة مورد"
      searchIn={["name", "code", "email", "phone"]}
      fields={[
        { name: "name", label: "اسم المورد", required: true },
        { name: "code", label: "الرمز", placeholder: "SUP-001" },
        { name: "taxNumber", label: "الرقم الضريبي" },
        { name: "phone", label: "الجوال", type: "tel" },
        { name: "email", label: "البريد الإلكتروني", type: "email" },
        { name: "address", label: "العنوان", type: "textarea" },
        { name: "openingBalance", label: "الرصيد الافتتاحي", type: "number", default: 0 },
      ]}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "code", label: "الرمز" },
        { name: "phone", label: "الجوال" },
        { name: "email", label: "البريد" },
        { name: "openingBalance", label: "الرصيد", format: (r) => money(r.openingBalance) },
      ]}
    />
  ),
});

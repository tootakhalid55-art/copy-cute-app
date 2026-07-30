import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { money } from "@/components/haseem/Shell";

export const Route = createFileRoute("/sales/customers")({
  head: () => ({ meta: [{ title: "العملاء — كنار المحاسبية" }] }),
  component: () => (
    <CrudModule
      storageKey="customers"
      title="العملاء"
      subtitle="إدارة عملاء المبيعات (الزبائن)"
      newLabel="إضافة عميل"
      searchIn={["name", "code", "email", "phone"]}
      fields={[
        { name: "name", label: "اسم العميل", required: true },
        { name: "code", label: "الرمز", placeholder: "CLI-001" },
        { name: "type", label: "النوع", type: "select", options: ["شركة", "فرد"], default: "شركة" },
        { name: "taxNumber", label: "الرقم الضريبي" },
        { name: "phone", label: "الجوال", type: "tel" },
        { name: "email", label: "البريد الإلكتروني", type: "email" },
        { name: "address", label: "العنوان", type: "textarea" },
        { name: "openingBalance", label: "الرصيد الافتتاحي", type: "number", default: 0 },
      ]}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "code", label: "الرمز" },
        { name: "type", label: "النوع" },
        { name: "phone", label: "الجوال" },
        { name: "email", label: "البريد" },
        { name: "openingBalance", label: "الرصيد", format: (r) => money(r.openingBalance) },
      ]}
    />
  ),
});


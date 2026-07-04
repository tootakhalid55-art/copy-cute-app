import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { money } from "@/components/haseem/Shell";

export const Route = createFileRoute("/cash/banks")({
  head: () => ({ meta: [{ title: "البنوك والخزائن — حسيم" }] }),
  component: () => (
    <CrudModule
      storageKey="banks"
      title="البنوك والخزائن"
      subtitle="إدارة الحسابات البنكية والخزائن النقدية"
      newLabel="إضافة حساب"
      searchIn={["name", "accountNumber", "currency"]}
      fields={[
        { name: "name", label: "الاسم", required: true, placeholder: "الراجحي / الخزينة الرئيسية" },
        { name: "type", label: "النوع", type: "select", options: ["بنك", "خزينة"], default: "بنك" },
        { name: "accountNumber", label: "رقم الحساب / IBAN" },
        { name: "currency", label: "العملة", default: "SAR" },
        { name: "openingBalance", label: "الرصيد الافتتاحي", type: "number", default: 0 },
      ]}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "type", label: "النوع" },
        { name: "accountNumber", label: "الرقم" },
        { name: "currency", label: "العملة" },
        { name: "openingBalance", label: "الرصيد", format: (r) => money(r.openingBalance) },
      ]}
    />
  ),
});

import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";

export const Route = createFileRoute("/settings/taxes")({
  head: () => ({ meta: [{ title: "الضرائب والربط — حسيم" }] }),
  component: () => (
    <CrudModule
      storageKey="taxes"
      title="الضرائب والربط"
      subtitle="مجموعات الضرائب وربط هيئة الزكاة (فاتورة)"
      newLabel="إضافة ضريبة"
      searchIn={["name", "code"]}
      fields={[
        { name: "name", label: "اسم الضريبة", required: true },
        { name: "code", label: "الرمز" },
        { name: "rate", label: "النسبة %", type: "number", required: true, default: 15 },
        {
          name: "type",
          label: "النوع",
          type: "select",
          options: ["مبيعات", "مشتريات", "الاثنين"],
        },
        {
          name: "kind",
          label: "التصنيف",
          type: "select",
          options: ["أساسية", "صفرية", "معفاة", "خارج النطاق"],
          default: "أساسية",
        },
        { name: "account", label: "الحساب المحاسبي" },
      ]}
      columns={[
        { name: "name", label: "الضريبة" },
        { name: "code", label: "الرمز" },
        { name: "rate", label: "النسبة %" },
        { name: "type", label: "النوع" },
        { name: "kind", label: "التصنيف" },
      ]}
    />
  ),
});

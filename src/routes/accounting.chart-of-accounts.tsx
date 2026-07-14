import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";

export const Route = createFileRoute("/accounting/chart-of-accounts")({
  head: () => ({ meta: [{ title: "دليل الحسابات — حسيم" }] }),
  component: () => (
    <CrudModule
      storageKey="accounts"
      title="دليل الحسابات"
      subtitle="شجرة الحسابات المستخدمة في القيود المحاسبية"
      newLabel="إضافة حساب"
      searchIn={["code", "name"]}
      fields={[
        { name: "code", label: "رقم الحساب", required: true, placeholder: "مثال: 1100" },
        { name: "name", label: "اسم الحساب", required: true },
        { name: "type", label: "النوع", type: "select", options: ["أصول", "التزامات", "حقوق ملكية", "إيرادات", "مصروفات"], required: true },
        { name: "subtype", label: "التصنيف الفرعي", type: "select", options: ["أصول متداولة", "أصول ثابتة", "التزامات متداولة", "التزامات طويلة الأجل", "رأس المال", "إيرادات تشغيلية", "إيرادات أخرى", "تكلفة المبيعات", "مصروفات تشغيلية", "مصروفات إدارية"] },
        { name: "openingBalance", label: "رصيد افتتاحي", type: "number", default: 0 },
        { name: "notes", label: "ملاحظات", type: "textarea" },
      ]}
      columns={[
        { name: "code", label: "الرقم" },
        { name: "name", label: "الاسم" },
        { name: "type", label: "النوع" },
        { name: "subtype", label: "التصنيف" },
        { name: "openingBalance", label: "الرصيد الافتتاحي", format: (r) => `${Number(r.openingBalance || 0).toLocaleString()} ر.س` },
      ]}
      emptyTitle="لا توجد حسابات بعد"
      emptyDescription="ابدأ ببناء دليل الحسابات الخاص بمنشأتك."
    />
  ),
});

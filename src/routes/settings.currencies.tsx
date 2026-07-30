import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";

export const Route = createFileRoute("/settings/currencies")({
  head: () => ({ meta: [{ title: "العملات وأسعار الصرف — كنار المحاسبية" }] }),
  component: () => (
    <CrudModule
      storageKey="currencies"
      title="العملات وأسعار الصرف"
      subtitle="أدر العملات المستخدمة وسعر صرفها مقابل الريال السعودي"
      newLabel="إضافة عملة"
      searchIn={["code", "name"]}
      fields={[
        { name: "code", label: "الرمز", required: true, placeholder: "USD" },
        { name: "name", label: "الاسم", required: true, placeholder: "دولار أمريكي" },
        { name: "symbol", label: "الرمز التعبيري", placeholder: "$" },
        { name: "rate", label: "سعر الصرف مقابل ر.س", type: "number", required: true, default: 1 },
        { name: "isBase", label: "عملة أساسية", type: "select", options: ["لا", "نعم"], default: "لا" },
      ]}
      columns={[
        { name: "code", label: "الرمز" },
        { name: "name", label: "الاسم" },
        { name: "symbol", label: "الرمز" },
        { name: "rate", label: "سعر الصرف" },
        { name: "isBase", label: "أساسية" },
      ]}
      emptyTitle="لا توجد عملات مضافة"
      emptyDescription="أضف عملات إضافية لدعم التعامل الدولي."
    />
  ),
});


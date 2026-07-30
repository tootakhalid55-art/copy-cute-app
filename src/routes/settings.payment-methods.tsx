import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";

export const Route = createFileRoute("/settings/payment-methods")({
  head: () => ({ meta: [{ title: "طرق الدفع — كنار المحاسبية" }] }),
  component: () => (
    <CrudModule
      storageKey="payment-methods"
      title="طرق الدفع"
      subtitle="طرق تحصيل وسداد المدفوعات المتاحة في الفواتير"
      newLabel="إضافة طريقة دفع"
      searchIn={["name"]}
      fields={[
        { name: "name", label: "الاسم", required: true, placeholder: "نقدي / تحويل بنكي / مدى..." },
        { name: "type", label: "النوع", type: "select", options: ["نقد", "تحويل بنكي", "بطاقة", "شيك", "محفظة رقمية", "أخرى"], required: true },
        { name: "account", label: "الحساب المرتبط", placeholder: "اسم البنك أو الخزينة" },
        { name: "active", label: "نشط", type: "select", options: ["نعم", "لا"], default: "نعم" },
        { name: "instructions", label: "تعليمات الدفع", type: "textarea" },
      ]}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "type", label: "النوع" },
        { name: "account", label: "الحساب" },
        { name: "active", label: "نشط" },
      ]}
      emptyTitle="لا توجد طرق دفع"
      emptyDescription="أضف طرق الدفع لتظهر في الفواتير وسندات القبض."
    />
  ),
});


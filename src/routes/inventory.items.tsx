import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { money } from "@/components/haseem/Shell";

export const Route = createFileRoute("/inventory/items")({
  head: () => ({ meta: [{ title: "الأصناف — كنار المحاسبية" }] }),
  component: () => (
    <CrudModule
      storageKey="items"
      title="الأصناف"
      subtitle="المنتجات والخدمات المتاحة للبيع والشراء"
      newLabel="إضافة صنف"
      searchIn={["name", "sku", "unit"]}
      fields={[
        { name: "name", label: "اسم الصنف", required: true },
        { name: "sku", label: "الرمز (SKU)", placeholder: "ITM-001" },
        { name: "type", label: "النوع", type: "select", options: ["منتج", "خدمة"], default: "منتج" },
        { name: "unit", label: "الوحدة", placeholder: "قطعة / كجم / ساعة" },
        { name: "price", label: "سعر البيع", type: "number", required: true },
        { name: "cost", label: "التكلفة", type: "number", default: 0 },
        { name: "stock", label: "الرصيد الحالي", type: "number", default: 0 },
        { name: "taxRate", label: "نسبة الضريبة %", type: "number", default: 15 },
      ]}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "sku", label: "الرمز" },
        { name: "type", label: "النوع" },
        { name: "unit", label: "الوحدة" },
        { name: "stock", label: "الرصيد" },
        { name: "price", label: "سعر البيع", format: (r) => money(r.price) },
        { name: "cost", label: "التكلفة", format: (r) => money(r.cost) },
      ]}
    />
  ),
});


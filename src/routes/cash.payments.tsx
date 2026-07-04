import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { money } from "@/components/haseem/Shell";
import { useCollection } from "@/lib/haseem/store";

export const Route = createFileRoute("/cash/payments")({
  head: () => ({ meta: [{ title: "سندات الصرف — حسيم" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { items: suppliers } = useCollection<any>("suppliers");
  const opts = suppliers.map((c) => ({ label: c.name, value: c.name }));
  return (
    <CrudModule
      storageKey="payments"
      title="سندات الصرف"
      subtitle="سجلات دفع المبالغ للموردين"
      newLabel="سند صرف جديد"
      searchIn={["supplier", "reference", "method"]}
      fields={[
        { name: "date", label: "التاريخ", type: "date", required: true, default: new Date().toISOString().slice(0, 10) },
        { name: "supplier", label: "المورد", type: "select", options: opts, required: true },
        { name: "amount", label: "المبلغ", type: "number", required: true },
        { name: "method", label: "طريقة الدفع", type: "select", options: ["نقدي", "تحويل بنكي", "شيك", "بطاقة"], default: "نقدي" },
        { name: "reference", label: "المرجع" },
        { name: "note", label: "ملاحظات", type: "textarea" },
      ]}
      columns={[
        { name: "date", label: "التاريخ" },
        { name: "supplier", label: "المورد" },
        { name: "method", label: "الطريقة" },
        { name: "reference", label: "المرجع" },
        { name: "amount", label: "المبلغ", format: (r) => money(r.amount) },
      ]}
    />
  );
}

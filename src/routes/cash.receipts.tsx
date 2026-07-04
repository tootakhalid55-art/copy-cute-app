import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { money } from "@/components/haseem/Shell";
import { useCollection } from "@/lib/haseem/store";

export const Route = createFileRoute("/cash/receipts")({
  head: () => ({ meta: [{ title: "سندات القبض — حسيم" }] }),
  component: ReceiptsPage,
});

function ReceiptsPage() {
  const { items: customers } = useCollection<any>("customers");
  const opts = customers.map((c) => ({ label: c.name, value: c.name }));
  return (
    <CrudModule
      storageKey="receipts"
      title="سندات القبض"
      subtitle="سجلات قبض المبالغ من العملاء"
      newLabel="سند قبض جديد"
      searchIn={["customer", "reference", "method"]}
      fields={[
        { name: "date", label: "التاريخ", type: "date", required: true, default: new Date().toISOString().slice(0, 10) },
        { name: "customer", label: "العميل", type: "select", options: opts, required: true },
        { name: "amount", label: "المبلغ", type: "number", required: true },
        { name: "method", label: "طريقة الدفع", type: "select", options: ["نقدي", "تحويل بنكي", "شيك", "بطاقة"], default: "نقدي" },
        { name: "reference", label: "المرجع" },
        { name: "note", label: "ملاحظات", type: "textarea" },
      ]}
      columns={[
        { name: "date", label: "التاريخ" },
        { name: "customer", label: "العميل" },
        { name: "method", label: "الطريقة" },
        { name: "reference", label: "المرجع" },
        { name: "amount", label: "المبلغ", format: (r) => money(r.amount) },
      ]}
    />
  );
}

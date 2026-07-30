import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { money } from "@/components/haseem/Shell";
import { useCollection } from "@/lib/haseem/store";

export const Route = createFileRoute("/cash/transfers")({
  head: () => ({ meta: [{ title: "التحويلات — كنار المحاسبية" }] }),
  component: TransfersPage,
});

function TransfersPage() {
  const { items: banks } = useCollection<any>("banks");
  const bankOptions = banks.map((b) => ({ label: b.name, value: b.name }));
  return (
    <CrudModule
      storageKey="transfers"
      title="التحويلات"
      subtitle="التحويلات بين الحسابات والخزائن"
      newLabel="تحويل جديد"
      searchIn={["from", "to", "note"]}
      fields={[
        { name: "date", label: "التاريخ", type: "date", required: true, default: new Date().toISOString().slice(0, 10) },
        { name: "from", label: "من", type: "select", options: bankOptions, required: true },
        { name: "to", label: "إلى", type: "select", options: bankOptions, required: true },
        { name: "amount", label: "المبلغ", type: "number", required: true },
        { name: "note", label: "ملاحظات", type: "textarea" },
      ]}
      columns={[
        { name: "date", label: "التاريخ" },
        { name: "from", label: "من" },
        { name: "to", label: "إلى" },
        { name: "amount", label: "المبلغ", format: (r) => money(r.amount) },
        { name: "note", label: "ملاحظات" },
      ]}
    />
  );
}


import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { money } from "@/components/haseem/Shell";
import { PartyEditorModal, nextAutoCode } from "@/components/haseem/PartyEditorModal";
import { useCollection } from "@/lib/haseem/store";

export const Route = createFileRoute("/sales/customers")({
  head: () => ({ meta: [{ title: "العملاء — كنار المحاسبية" }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const { items } = useCollection<any>("customers");
  return (
    <CrudModule
      storageKey="customers"
      title="العملاء"
      subtitle="إدارة عملاء المبيعات (الزبائن)"
      newLabel="إضافة عميل"
      searchIn={["name", "code", "email", "phone"]}
      fields={[]}
      customEditor={({ editing, onClose, onSave }) => (
        <PartyEditorModal
          partyLabel="عميل"
          initial={editing}
          autoCode={nextAutoCode(items, "code", "CLI")}
          onSave={onSave}
          onClose={onClose}
        />
      )}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "code", label: "الرمز" },
        { name: "type", label: "النوع" },
        { name: "phone", label: "الجوال" },
        { name: "email", label: "البريد" },
        { name: "openingBalance", label: "الرصيد", format: (r) => money(r.openingBalance) },
      ]}
    />
  );
}

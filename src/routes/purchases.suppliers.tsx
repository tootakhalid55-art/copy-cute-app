import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { money } from "@/components/haseem/Shell";
import { PartyEditorModal, nextAutoCode } from "@/components/haseem/PartyEditorModal";
import { useCollection } from "@/lib/haseem/store";

export const Route = createFileRoute("/purchases/suppliers")({
  head: () => ({ meta: [{ title: "الموردون — كنار المحاسبية" }] }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const { items } = useCollection<any>("suppliers");
  return (
    <CrudModule
      storageKey="suppliers"
      title="الموردون"
      subtitle="إدارة موردي المنشأة"
      newLabel="إضافة مورد"
      searchIn={["name", "code", "email", "phone"]}
      fields={[]}
      customEditor={({ editing, onClose, onSave }) => (
        <PartyEditorModal
          partyLabel="مورد"
          initial={editing}
          autoCode={nextAutoCode(items, "code", "SUP")}
          onSave={onSave}
          onClose={onClose}
        />
      )}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "code", label: "الرمز" },
        { name: "phone", label: "الجوال" },
        { name: "email", label: "البريد" },
        { name: "openingBalance", label: "الرصيد", format: (r) => money(r.openingBalance) },
      ]}
    />
  );
}

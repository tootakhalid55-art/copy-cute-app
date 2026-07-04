import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { Badge } from "@/components/haseem/Shell";
import { useKV } from "@/lib/haseem/store";
import { useCollection } from "@/lib/haseem/store";

export const Route = createFileRoute("/select-organization")({
  head: () => ({ meta: [{ title: "اختيار المنشأة — حسيم" }] }),
  component: SelectOrg,
});

function SelectOrg() {
  const [current, setCurrent] = useKV<string>("currentOrg", "شركة كنار الحديثة للمقاولات");
  const { items, add, remove } = useCollection<any>("orgs");

  // Seed default org if empty
  if (typeof window !== "undefined" && items.length === 0 && !localStorage.getItem("haseem:seededOrg")) {
    localStorage.setItem("haseem:seededOrg", "1");
    add({ name: "شركة كنار الحديثة للمقاولات", taxNumber: "312756062700003", type: "شركة" });
  }

  return (
    <CrudModule
      storageKey="orgs"
      title="اختيار / إدارة المنشآت"
      subtitle="بإمكانك إدارة منشآت متعددة تحت نفس الحساب"
      newLabel="إضافة منشأة"
      searchIn={["name", "taxNumber"]}
      fields={[
        { name: "name", label: "اسم المنشأة", required: true },
        { name: "type", label: "النوع", type: "select", options: ["شركة", "مؤسسة", "فرد"], default: "شركة" },
        { name: "taxNumber", label: "الرقم الضريبي" },
      ]}
      columns={[
        { name: "name", label: "الاسم", format: (r) => (
          <div className="flex items-center gap-2">
            <span className={current === r.name ? "font-bold" : ""}>{r.name}</span>
            {current === r.name && <Badge tone="green">الحالية</Badge>}
          </div>
        ) },
        { name: "type", label: "النوع" },
        { name: "taxNumber", label: "الرقم الضريبي" },
        { name: "actions", label: "", format: (r) => current !== r.name && (
          <button onClick={() => setCurrent(r.name)} className="text-xs bg-[#0f2a1d] text-white rounded px-2 py-1">تعيين كحالية</button>
        ) },
      ]}
    />
  );
}

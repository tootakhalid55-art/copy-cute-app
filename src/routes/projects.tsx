import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { Badge, money, statusTone } from "@/components/haseem/Shell";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "المشاريع — كنار المحاسبية" }] }),
  component: () => (
    <CrudModule
      storageKey="projects"
      title="المشاريع"
      subtitle="تتبع المشاريع والميزانيات"
      newLabel="مشروع جديد"
      searchIn={["name", "client", "status"]}
      fields={[
        { name: "name", label: "اسم المشروع", required: true },
        { name: "client", label: "العميل" },
        { name: "status", label: "الحالة", type: "select", options: ["نشط", "مغلق", "قيد الانتظار"], default: "نشط" },
        { name: "budget", label: "الميزانية", type: "number", default: 0 },
        { name: "startDate", label: "تاريخ البدء", type: "date" },
        { name: "endDate", label: "تاريخ الانتهاء", type: "date" },
        { name: "description", label: "الوصف", type: "textarea" },
      ]}
      columns={[
        { name: "name", label: "المشروع" },
        { name: "client", label: "العميل" },
        { name: "startDate", label: "البدء" },
        { name: "endDate", label: "الانتهاء" },
        { name: "budget", label: "الميزانية", format: (r) => money(r.budget) },
        { name: "status", label: "الحالة", format: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
      ]}
    />
  ),
});


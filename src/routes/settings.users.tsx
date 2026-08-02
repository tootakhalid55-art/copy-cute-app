import { createFileRoute } from "@tanstack/react-router";
import { CrudModule } from "@/components/haseem/CrudModule";
import { Badge } from "@/components/haseem/Shell";
import { RequireOrgOwner } from "@/lib/auth-guards";

export const Route = createFileRoute("/settings/users")({
  head: () => ({ meta: [{ title: "المستخدمون — كنار المحاسبية" }] }),
  component: () => (
    <RequireOrgOwner>
    <CrudModule
      storageKey="users"
      title="المستخدمون"
      subtitle="إدارة مستخدمي المنشأة وصلاحياتهم"
      newLabel="إضافة مستخدم"
      searchIn={["name", "email"]}
      fields={[
        { name: "name", label: "الاسم", required: true },
        { name: "email", label: "البريد الإلكتروني", type: "email", required: true },
        { name: "phone", label: "الجوال", type: "tel" },
        {
          name: "role",
          label: "الدور",
          type: "select",
          options: ["مدير", "محاسب", "مندوب مبيعات", "مشاهد فقط"],
        },
        {
          name: "branch",
          label: "الفرع",
          type: "select",
          options: ["الفرع الرئيسي", "فرع الرياض", "فرع جدة"],
        },
        {
          name: "status",
          label: "الحالة",
          type: "select",
          options: ["نشط", "موقوف"],
          default: "نشط",
        },
      ]}
      columns={[
        { name: "name", label: "الاسم" },
        { name: "email", label: "البريد" },
        { name: "role", label: "الدور" },
        { name: "branch", label: "الفرع" },
        {
          name: "status",
          label: "الحالة",
          format: (r) => (
            <Badge tone={r.status === "نشط" ? "green" : "red"}>
              {r.status ?? "—"}
            </Badge>
          ),
        },
      ]}
    />
    </RequireOrgOwner>
  ),
});


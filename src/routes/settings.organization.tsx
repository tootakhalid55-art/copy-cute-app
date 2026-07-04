import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, Input, Field } from "@/components/haseem/Shell";

export const Route = createFileRoute("/settings/organization")({
  head: () => ({ meta: [{ title: "إعدادات المنشأة — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="إعدادات المنشأة" subtitle="بيانات المنشأة وربطها بمنصة فاتورة" />
      <div className="rounded-xl bg-white border border-[#eceae2] p-6 space-y-4">
        <h3 className="font-semibold">البيانات الأساسية</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="اسم المنشأة"><Input defaultValue="شركة كنار الحديثة للمقاولات العامة" /></Field>
          <Field label="الرقم الضريبي"><Input defaultValue="312756062700003" /></Field>
          <Field label="السجل التجاري"><Input defaultValue="7043264105" /></Field>
          <Field label="العنوان"><Input defaultValue="طريق الملك فهد، جدة، مشرفة، 23336" /></Field>
        </div>
        <PrimaryBtn>حفظ التغييرات</PrimaryBtn>
      </div>
    </Shell>
  ),
});

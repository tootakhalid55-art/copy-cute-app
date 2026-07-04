import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, Input, Field } from "@/components/haseem/Shell";
import { useKV } from "@/lib/haseem/store";
import { useState, useEffect } from "react";

type Org = {
  name: string;
  taxNumber: string;
  cr: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
};

const DEFAULT: Org = {
  name: "شركة كنار الحديثة للمقاولات",
  taxNumber: "312756062700003",
  cr: "7043264105",
  address: "طريق الملك فهد، جدة، مشرفة، 23336",
  phone: "+966533693887",
  email: "info@canarmodern.com",
  currency: "SAR",
};

export const Route = createFileRoute("/settings/organization")({
  head: () => ({ meta: [{ title: "إعدادات المنشأة — حسيم" }] }),
  component: OrgSettings,
});

function OrgSettings() {
  const [org, setOrg] = useKV<Org>("org", DEFAULT);
  const [form, setForm] = useState<Org>(org);
  const [saved, setSaved] = useState(false);

  useEffect(() => setForm(org), [org]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setOrg(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const bind = (k: keyof Org) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <Shell>
      <PageHeader title="إعدادات المنشأة" subtitle="بيانات المنشأة الأساسية" />
      <form onSubmit={submit} className="rounded-xl bg-white border border-[#eceae2] p-6 space-y-4">
        <h3 className="font-semibold">البيانات الأساسية</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="اسم المنشأة"><Input required {...bind("name")} /></Field>
          <Field label="الرقم الضريبي"><Input {...bind("taxNumber")} /></Field>
          <Field label="السجل التجاري"><Input {...bind("cr")} /></Field>
          <Field label="العنوان"><Input {...bind("address")} /></Field>
          <Field label="الجوال"><Input {...bind("phone")} /></Field>
          <Field label="البريد الإلكتروني"><Input type="email" {...bind("email")} /></Field>
          <Field label="العملة"><Input {...bind("currency")} /></Field>
        </div>
        <div className="flex items-center gap-3">
          <PrimaryBtn type="submit">حفظ التغييرات</PrimaryBtn>
          {saved && <span className="text-xs text-[#0f6b3a]">تم الحفظ ✓</span>}
        </div>
      </form>
    </Shell>
  );
}

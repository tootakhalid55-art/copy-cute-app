import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, Input, Field } from "@/components/haseem/Shell";
import { useKV } from "@/lib/haseem/store";
import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";

export type BankAccount = {
  id: string;
  bankName: string;
  accountName: string;
  iban: string;
  accountNumber: string;
};

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
  head: () => ({ meta: [{ title: "إعدادات المنشأة — كنار المحاسبية" }] }),
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

      <BankAccountsSettings />
    </Shell>
  );
}

// Bank accounts are managed here and picked per-quotation from the
// quotation form. Stored org-wide; edits apply everywhere instantly.
function BankAccountsSettings() {
  const [accounts, setAccounts] = useKV<BankAccount[]>("bank-accounts", []);

  // Older entries (pre-settings-page) were saved without ids — assign once.
  useEffect(() => {
    if (accounts.length && accounts.some((a) => !a.id)) {
      setAccounts(accounts.map((a) => (a.id ? a : { ...a, id: crypto.randomUUID() })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  const set = (id: string, patch: Partial<BankAccount>) =>
    setAccounts((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  return (
    <div className="rounded-xl bg-white border border-[#eceae2] p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">الحسابات البنكية</h3>
          <p className="text-[11px] text-[#0f2a1d]/60">
            تُعرض في عروض الأسعار — من نموذج العرض تختار أي الحسابات تُرفق في كل عرض.
          </p>
        </div>
        <PrimaryBtn
          type="button"
          onClick={() => setAccounts((as) => [...as, { id: crypto.randomUUID(), bankName: "", accountName: "", iban: "", accountNumber: "" }])}
        >
          <Plus className="w-4 h-4" /> إضافة حساب بنكي
        </PrimaryBtn>
      </div>
      {accounts.length === 0 ? (
        <div className="text-xs text-[#0f2a1d]/50 border border-dashed border-[#eceae2] rounded-lg p-4 text-center">
          لا توجد حسابات بنكية بعد.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((b) => (
            <div key={b.id} className="border border-[#eceae2] rounded-lg p-3 space-y-2 bg-[#fafaf7]">
              <div className="flex items-center gap-1">
                <input
                  value={b.bankName}
                  onChange={(e) => set(b.id, { bankName: e.target.value })}
                  placeholder="اسم البنك *"
                  className="border border-[#eceae2] rounded px-2 py-1.5 text-sm font-semibold flex-1 bg-white"
                />
                <button
                  type="button"
                  onClick={() => confirm("حذف هذا الحساب البنكي؟") && setAccounts((as) => as.filter((x) => x.id !== b.id))}
                  className="p-1.5 rounded text-red-500 hover:bg-red-50"
                  title="حذف الحساب"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                value={b.accountName}
                onChange={(e) => set(b.id, { accountName: e.target.value })}
                placeholder="اسم صاحب الحساب"
                className="border border-[#eceae2] rounded px-2 py-1.5 text-sm w-full bg-white"
              />
              <input
                value={b.iban}
                onChange={(e) => set(b.id, { iban: e.target.value })}
                placeholder="IBAN — SAxxxxxxxxxxxxxxxxxxxxxx"
                dir="ltr"
                className="border border-[#eceae2] rounded px-2 py-1.5 text-sm w-full bg-white font-mono"
              />
              <input
                value={b.accountNumber}
                onChange={(e) => set(b.id, { accountNumber: e.target.value })}
                placeholder="رقم الحساب (اختياري)"
                dir="ltr"
                className="border border-[#eceae2] rounded px-2 py-1.5 text-sm w-full bg-white font-mono"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


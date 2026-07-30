import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, Input, Field } from "@/components/haseem/Shell";
import { useAuth } from "@/lib/haseem/auth";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "ملفي الشخصي — كنار المحاسبية" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, logout, updateName } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => setName(user?.name ?? ""), [user]);

  return (
    <Shell>
      <PageHeader title="ملفك الشخصي" subtitle="بيانات المستخدم وإعدادات الجلسة" />
      <div className="rounded-xl bg-white border border-[#eceae2] p-6 space-y-4">
        <h3 className="font-semibold">معلومات الحساب</h3>
        <form
          onSubmit={(e) => { e.preventDefault(); updateName(name); setSaved(true); setTimeout(() => setSaved(false), 2000); }}
          className="space-y-4"
        >
          <Field label="الاسم"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="البريد الإلكتروني"><Input value={user?.email ?? ""} readOnly className="bg-[#f7f6f0]" /></Field>
          <div className="flex items-center gap-3">
            <PrimaryBtn type="submit">حفظ</PrimaryBtn>
            {saved && <span className="text-xs text-[#0f6b3a]">تم الحفظ ✓</span>}
          </div>
        </form>
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-6 space-y-3">
        <h3 className="font-semibold">الجلسة</h3>
        <div className="flex gap-2">
          <OutlineBtn onClick={() => { logout(); navigate({ to: "/auth" }); }}>تسجيل الخروج</OutlineBtn>
          <button
            onClick={() => { if (confirm("سيتم مسح جميع البيانات المحلية (فواتير، عملاء، إلخ). المتابعة؟")) { Object.keys(localStorage).filter(k => k.startsWith("haseem:") && k !== "haseem:auth").forEach(k => localStorage.removeItem(k)); location.reload(); } }}
            className="inline-flex items-center gap-2 bg-[#c65b3c] text-white rounded-lg px-4 py-2 text-sm hover:bg-[#a94a2f]"
          >
            مسح البيانات المحلية
          </button>
        </div>
      </div>
    </Shell>
  );
}


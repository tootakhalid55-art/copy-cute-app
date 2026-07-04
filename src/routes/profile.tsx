import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, Input, Field } from "@/components/haseem/Shell";
import { Pencil, Shield } from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "ملفي الشخصي — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="ملفك الشخصي" subtitle="من سيقوم بإدارة هذا الحساب؟" />
      <div className="rounded-xl bg-white border border-[#eceae2] p-6 space-y-4">
        <h3 className="font-semibold">معلومات المستخدم</h3>
        <div className="flex items-center justify-between border border-[#eceae2] rounded-lg p-3">
          <div><div className="text-xs text-[#0f2a1d]/60">البريد الإلكتروني</div><div className="font-medium mt-0.5">info@canarmodern.com</div></div>
          <div className="flex items-center gap-2"><span className="text-xs bg-[#fef3c7] text-[#92400e] px-2 py-0.5 rounded">غير مُفعّل</span><button className="p-1.5 border border-[#eceae2] rounded"><Pencil className="w-3.5 h-3.5" /></button><button className="p-1.5 border border-[#eceae2] rounded"><Shield className="w-3.5 h-3.5" /></button></div>
        </div>
        <div className="flex items-center justify-between border border-[#eceae2] rounded-lg p-3">
          <div><div className="text-xs text-[#0f2a1d]/60">رقم الجوال</div><div className="font-medium mt-0.5" dir="ltr">+966533693887</div></div>
          <div className="flex items-center gap-2"><span className="text-xs bg-[#fef3c7] text-[#92400e] px-2 py-0.5 rounded">غير مُفعّل</span><button className="p-1.5 border border-[#eceae2] rounded"><Pencil className="w-3.5 h-3.5" /></button><button className="p-1.5 border border-[#eceae2] rounded"><Shield className="w-3.5 h-3.5" /></button></div>
        </div>
        <div className="text-sm"><div className="text-xs text-[#0f2a1d]/60">تاريخ إنشاء الحساب</div><div>١٩ محرم ١٤٤٨ هـ</div></div>
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-6 space-y-3">
        <h3 className="font-semibold">تغيير كلمة المرور</h3>
        <Field label="كلمة المرور الحالية"><Input type="password" /></Field>
        <Field label="كلمة المرور الجديدة"><Input type="password" /></Field>
        <div className="text-xs text-[#0f2a1d]/60">يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل</div>
        <Field label="تأكيد كلمة المرور الجديدة"><Input type="password" /></Field>
        <PrimaryBtn>تغيير كلمة المرور</PrimaryBtn>
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-6 space-y-3">
        <h3 className="font-semibold">إعدادات الحساب</h3>
        <div className="flex gap-2"><OutlineBtn>تسجيل الخروج</OutlineBtn><button className="inline-flex items-center gap-2 bg-[#c65b3c] text-white rounded-lg px-4 py-2 text-sm">تسجيل الخروج من جميع الجلسات</button></div>
      </div>
    </Shell>
  ),
});

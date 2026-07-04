import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, FiltersBar, Field, Select, Input, StatCard } from "@/components/haseem/Shell";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/purchases/bills")({
  head: () => ({ meta: [{ title: "فواتير المشتريات — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="الدفع" subtitle="تتبع الفواتير والمصروفات والمستحقات" action={<Link to="/purchases/bills/new"><PrimaryBtn><Plus className="w-4 h-4" />إنشاء فاتورة مشتريات</PrimaryBtn></Link>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="فواتير مشتريات غير مدفوعة" value="0" />
        <StatCard label="متأخر" value="0" valueClass="text-[#c65b3c]" />
        <StatCard label="مستحق هذا الأسبوع" value="0" />
        <StatCard label="هذا الشهر" value="0" />
      </div>
      <FiltersBar>
        <Field label="بحث"><Input placeholder="بحث" /></Field>
        <Field label="الحالة"><Select placeholder="الحالة" /></Field>
        <Field label="الموردون"><Select placeholder="الموردون" /></Field>
        <Field label="من"><Input type="date" defaultValue="2026-07-01" /></Field>
        <Field label="إلى"><Input type="date" defaultValue="2026-07-31" /></Field>
      </FiltersBar>
      <div className="rounded-xl bg-white border border-[#eceae2] py-16 text-center text-sm text-[#0f2a1d]/70">لا توجد فواتير مشتريات</div>
    </Shell>
  ),
});

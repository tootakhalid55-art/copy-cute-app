import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, FiltersBar, Field, Select, Input } from "@/components/haseem/Shell";
import { Plus, Settings2 } from "lucide-react";

export const Route = createFileRoute("/sales/invoices")({
  head: () => ({ meta: [{ title: "فواتير المبيعات — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader
        title="استلام المستحقات"
        subtitle="إدارة الفواتير وتتبع المستحقات"
        action={<Link to="/sales/invoices/new"><PrimaryBtn><Plus className="w-4 h-4" />إنشاء فاتورة مبيعات</PrimaryBtn></Link>}
      />
      <div className="flex gap-6 border-b border-[#eceae2] text-sm">
        <button className="pb-2 border-b-2 border-[#0f2a1d] font-semibold">استلام المستحقات</button>
        <button className="pb-2 text-[#0f2a1d]/60">الفواتير المجدولة</button>
      </div>
      <FiltersBar>
        <Field label="بحث"><Input placeholder="البحث في الفواتير..." className="min-w-[220px]" /></Field>
        <Field label="الحالة"><Select placeholder="الحالة" /></Field>
        <Field label="العميل"><Select placeholder="العميل" /></Field>
        <Field label="من"><Input type="date" defaultValue="2026-07-01" /></Field>
        <Field label="إلى"><Input type="date" defaultValue="2026-07-31" /></Field>
      </FiltersBar>
      <div className="flex items-center justify-between text-sm">
        <Select placeholder="التاريخ: الأحدث أولاً" />
        <button className="inline-flex items-center gap-1 text-xs border border-[#eceae2] rounded-lg px-3 py-1.5 bg-white"><Settings2 className="w-3.5 h-3.5" />مزيد من الفلاتر</button>
      </div>
      <div className="rounded-xl border border-[#eaf5ee] bg-[#f7fbf8] py-16 text-center">
        <div className="font-semibold">ابدأ بتحصيل مستحقاتك</div>
        <div className="text-xs text-[#0f2a1d]/60 mt-1">أنشئ فاتورتك الأولى في دقائق وأرسلها لعميلك — الخطوة الأولى لتحسين التدفق النقدي.</div>
        <Link to="/sales/invoices/new"><PrimaryBtn className="mt-4"><Plus className="w-4 h-4" />إنشاء فاتورة مبيعات</PrimaryBtn></Link>
      </div>
    </Shell>
  ),
});

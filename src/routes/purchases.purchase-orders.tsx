import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, FiltersBar, Field, Select, Input, StatCard, EmptyState } from "@/components/haseem/Shell";
import { Plus, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/purchases/purchase-orders")({
  head: () => ({ meta: [{ title: "أوامر الشراء — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="أوامر الشراء" subtitle="إدارة طلبات الشراء والاستلام والتحويل إلى فواتير مشتريات" action={<PrimaryBtn><Plus className="w-4 h-4" />إنشاء أمر شراء</PrimaryBtn>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="الإجمالي" value="0" />
        <StatCard label="المفتوحة" value="0" />
        <StatCard label="قيمة الالتزام" value="0" />
        <StatCard label="المحوّلة إلى فواتير" value="0" />
      </div>
      <FiltersBar>
        <Field label="بحث"><Input placeholder="بحث" /></Field>
        <Field label="الحالة"><Select placeholder="الحالة" /></Field>
        <Field label="الموردون"><Select placeholder="الموردون" /></Field>
        <Field label="من"><Input type="date" defaultValue="2026-07-01" /></Field>
        <Field label="إلى"><Input type="date" defaultValue="2026-07-31" /></Field>
      </FiltersBar>
      <EmptyState icon={ShoppingBag} title="لا توجد أوامر شراء" />
    </Shell>
  ),
});

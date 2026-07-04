import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, FiltersBar, Field, Select, Input } from "@/components/haseem/Shell";

export const Route = createFileRoute("/reports/sales-report")({
  head: () => ({ meta: [{ title: "تقرير المبيعات — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="تقرير المبيعات" subtitle="عرض تفصيلي لأداء المبيعات خلال الفترة" />
      <FiltersBar>
        <Field label="من"><Input type="date" defaultValue="2026-07-01" /></Field>
        <Field label="إلى"><Input type="date" defaultValue="2026-07-31" /></Field>
        <Field label="العميل"><Select placeholder="كل العملاء" /></Field>
        <Field label="الحالة"><Select placeholder="كل الحالات" /></Field>
      </FiltersBar>
      <div className="rounded-xl bg-white border border-[#eceae2] p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[{l:"إجمالي المبيعات",v:"0"},{l:"عدد الفواتير",v:"0"},{l:"متوسط الفاتورة",v:"0"},{l:"الضريبة المحصّلة",v:"0"}].map((s)=>(
            <div key={s.l}><div className="text-xs text-[#0f2a1d]/60">{s.l}</div><div className="text-xl font-bold mt-1">{s.v} <span className="text-xs font-normal">﷼</span></div></div>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-white border border-[#eceae2] py-16 text-center text-sm text-[#0f2a1d]/60">لا توجد بيانات لعرضها ضمن الفترة المحددة</div>
    </Shell>
  ),
});

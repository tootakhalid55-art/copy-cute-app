import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, StatCard, money } from "@/components/haseem/Shell";
import { useCollection } from "@/lib/haseem/store";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/reports/sales-report")({
  head: () => ({ meta: [{ title: "تقرير المبيعات — حسيم" }] }),
  component: SalesReport,
});

function SalesReport() {
  const { items: invoices } = useCollection<any>("invoices");
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const filtered = useMemo(
    () => invoices.filter((i) => (!from || i.date >= from) && (!to || i.date <= to)),
    [invoices, from, to]
  );

  const total = filtered.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalTax = filtered.reduce((s, i) => s + Number(i.tax || 0), 0);
  const byCustomer = filtered.reduce<Record<string, number>>((acc, i) => {
    const k = i.partyName || "—";
    acc[k] = (acc[k] || 0) + Number(i.total || 0);
    return acc;
  }, {});

  return (
    <Shell>
      <PageHeader title="تقرير المبيعات" subtitle="ملخص فواتير المبيعات ضمن فترة محددة" />
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs text-[#0f2a1d]/70 flex flex-col gap-1">من<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm" /></label>
        <label className="text-xs text-[#0f2a1d]/70 flex flex-col gap-1">إلى<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm" /></label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="عدد الفواتير" value={String(filtered.length)} />
        <StatCard label="إجمالي المبيعات" value={money(total).replace(" ﷼", "")} />
        <StatCard label="الضريبة المستحقة" value={money(totalTax).replace(" ﷼", "")} />
      </div>
      <div className="rounded-xl bg-white border border-[#eceae2] p-5">
        <h3 className="font-semibold mb-3">التوزيع حسب العميل</h3>
        {Object.keys(byCustomer).length === 0 ? (
          <div className="text-sm text-[#0f2a1d]/60 py-6 text-center border border-dashed border-[#eceae2] rounded-lg">لا توجد فواتير في الفترة المحددة.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-[#0f2a1d]/60 text-right"><tr><th className="py-2">العميل</th><th>الإجمالي</th></tr></thead>
            <tbody className="divide-y divide-[#eceae2]">
              {Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <tr key={k} className="text-right"><td className="py-2">{k}</td><td className="font-semibold">{money(v)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

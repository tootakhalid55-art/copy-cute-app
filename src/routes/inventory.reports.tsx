import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, StatCard, money } from "@/components/haseem/Shell";
import { useCollection } from "@/lib/haseem/store";

export const Route = createFileRoute("/inventory/reports")({
  head: () => ({ meta: [{ title: "تقارير المخزون — حسيم" }] }),
  component: InventoryReports,
});

function InventoryReports() {
  const { items } = useCollection<any>("items");
  const totalItems = items.length;
  const totalStock = items.reduce((s, i) => s + Number(i.stock || 0), 0);
  const totalValue = items.reduce((s, i) => s + Number(i.stock || 0) * Number(i.cost || 0), 0);
  const lowStock = items.filter((i) => Number(i.stock || 0) < 5);

  return (
    <Shell>
      <PageHeader title="تقارير المخزون" subtitle="نظرة سريعة على حالة الأصناف والمخازن" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="عدد الأصناف" value={String(totalItems)} />
        <StatCard label="إجمالي الكميات" value={String(totalStock)} />
        <StatCard label="قيمة المخزون (تكلفة)" value={money(totalValue).replace(" ﷼", "")} />
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-5">
        <h3 className="font-semibold mb-3">أصناف منخفضة الرصيد (أقل من 5)</h3>
        {lowStock.length === 0 ? (
          <div className="text-sm text-[#0f2a1d]/60 py-6 text-center border border-dashed border-[#eceae2] rounded-lg">لا توجد أصناف منخفضة الرصيد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-[#0f2a1d]/60 text-right">
              <tr><th className="py-2">الصنف</th><th>الرمز</th><th>الرصيد</th></tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {lowStock.map((i) => (
                <tr key={i.id} className="text-right"><td className="py-2">{i.name}</td><td>{i.sku ?? "—"}</td><td className="text-red-600 font-semibold">{i.stock}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

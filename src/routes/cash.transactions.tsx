import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, StatCard, money, Badge } from "@/components/haseem/Shell";
import { useCollection } from "@/lib/haseem/store";
import { useMemo } from "react";

export const Route = createFileRoute("/cash/transactions")({
  head: () => ({ meta: [{ title: "المعاملات النقدية — حسيم" }] }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { items: receipts } = useCollection<any>("receipts");
  const { items: payments } = useCollection<any>("payments");
  const { items: transfers } = useCollection<any>("transfers");
  const { items: expenses } = useCollection<any>("expenses");

  const rows = useMemo(() => {
    const list: any[] = [];
    receipts.forEach((r) => list.push({ id: `r-${r.id}`, date: r.date, type: "قبض", account: r.method, party: r.customer, amount: Number(r.amount || 0), sign: 1 }));
    payments.forEach((p) => list.push({ id: `p-${p.id}`, date: p.date, type: "صرف", account: p.method, party: p.supplier, amount: Number(p.amount || 0), sign: -1 }));
    transfers.forEach((t) => list.push({ id: `t-${t.id}`, date: t.date, type: "تحويل", account: `${t.from} → ${t.to}`, party: "—", amount: Number(t.amount || 0), sign: 0 }));
    expenses.forEach((e) => list.push({ id: `e-${e.id}`, date: e.date, type: "مصروف", account: e.category, party: e.supplier ?? "—", amount: Number(e.amount || 0), sign: -1 }));
    return list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [receipts, payments, transfers, expenses]);

  const inflow = rows.filter((r) => r.sign > 0).reduce((s, r) => s + r.amount, 0);
  const outflow = rows.filter((r) => r.sign < 0).reduce((s, r) => s + r.amount, 0);

  return (
    <Shell>
      <PageHeader title="المعاملات النقدية" subtitle="جميع الحركات النقدية (قبض/صرف/تحويلات/مصروفات)" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="نقد داخل" value={money(inflow).replace(" ﷼", "")} valueClass="text-[#0f6b3a]" />
        <StatCard label="نقد خارج" value={money(outflow).replace(" ﷼", "")} valueClass="text-[#c65b3c]" />
        <StatCard label="الصافي" value={money(inflow - outflow).replace(" ﷼", "")} />
      </div>
      <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#0f2a1d]/60">لا توجد حركات بعد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f7f6f0] text-xs text-[#0f2a1d]/70 text-right">
              <tr><th className="py-2.5 px-3">التاريخ</th><th>النوع</th><th>الحساب</th><th>الطرف</th><th>المبلغ</th></tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {rows.map((r) => (
                <tr key={r.id} className="text-right">
                  <td className="py-2 px-3">{r.date}</td>
                  <td><Badge tone={r.sign > 0 ? "green" : r.sign < 0 ? "red" : "blue"}>{r.type}</Badge></td>
                  <td>{r.account}</td>
                  <td>{r.party}</td>
                  <td className={r.sign > 0 ? "text-[#0f6b3a]" : r.sign < 0 ? "text-[#c65b3c]" : ""}>{r.sign < 0 ? "-" : ""}{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

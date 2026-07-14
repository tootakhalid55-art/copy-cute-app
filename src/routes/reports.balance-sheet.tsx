import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/reports/balance-sheet")({
  head: () => ({ meta: [{ title: "الميزانية العمومية — حسيم" }] }),
  component: BS,
});

function BS() {
  const { items: banks } = useCollection<any>("banks");
  const { items: invoices } = useCollection<any>("invoices");
  const { items: bills } = useCollection<any>("bills");
  const { items: receipts } = useCollection<any>("receipts");
  const { items: payments } = useCollection<any>("payments");
  const { items: expenses } = useCollection<any>("expenses");
  const { items: items } = useCollection<any>("items");

  const totals = useMemo(() => {
    const cash = banks.reduce((s, b) => s + Number(b.opening || 0), 0)
      + receipts.reduce((s, r) => s + Number(r.amount || 0), 0)
      - payments.reduce((s, p) => s + Number(p.amount || 0), 0)
      - expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const receivable = invoices.reduce((s, i) => s + Number(i.total || 0), 0)
      - receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
    const payable = bills.reduce((s, b) => s + Number(b.total || 0), 0)
      - payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const inventory = items.reduce((s, i) => s + (Number(i.stock || 0) * Number(i.cost || 0)), 0);
    return { cash, receivable, payable, inventory };
  }, [banks, invoices, bills, receipts, payments, expenses, items]);

  const assets = totals.cash + Math.max(0, totals.receivable) + totals.inventory;
  const liab = Math.max(0, totals.payable);
  const equity = assets - liab;

  return (
    <ReportShell title="الميزانية العمومية" subtitle="حتى اليوم"
      exportRows={() => ({ headers: ["البند", "القيمة"], rows: [["النقد", totals.cash], ["الذمم المدينة", totals.receivable], ["المخزون", totals.inventory], ["الذمم الدائنة", totals.payable], ["حقوق الملكية", equity]] })}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReportTable headers={["الأصول", "القيمة"]}
          rows={[["النقد والبنوك", money(totals.cash)], ["الذمم المدينة", money(Math.max(0, totals.receivable))], ["المخزون", money(totals.inventory)]]}
          totalsRow={["إجمالي الأصول", money(assets)]} />
        <ReportTable headers={["الالتزامات وحقوق الملكية", "القيمة"]}
          rows={[["الذمم الدائنة", money(liab)], ["حقوق الملكية", money(equity)]]}
          totalsRow={["الإجمالي", money(liab + equity)]} />
      </div>
    </ReportShell>
  );
}

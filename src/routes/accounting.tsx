import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, StatCard, money } from "@/components/haseem/Shell";
import { useCollection } from "@/lib/haseem/store";

export const Route = createFileRoute("/accounting")({
  head: () => ({ meta: [{ title: "المحاسبة — كنار المحاسبية" }] }),
  component: AccountingPage,
});

function AccountingPage() {
  const { items: invoices } = useCollection<any>("invoices");
  const { items: bills } = useCollection<any>("bills");
  const { items: expenses } = useCollection<any>("expenses");
  const { items: receipts } = useCollection<any>("receipts");
  const { items: payments } = useCollection<any>("payments");

  const revenue = invoices.reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const cogs = bills.reduce((s, b) => s + Number(b.subtotal || 0), 0);
  const opex = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const cashIn = receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
  const cashOut = payments.reduce((s, p) => s + Number(p.amount || 0), 0) + opex;
  const netProfit = revenue - cogs - opex;

  return (
    <Shell>
      <PageHeader title="المحاسبة" subtitle="نظرة عامة على القوائم المالية المبسّطة" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="الإيرادات" value={money(revenue).replace(" ﷼", "")} valueClass="text-[#0f6b3a]" />
        <StatCard label="تكلفة المشتريات" value={money(cogs).replace(" ﷼", "")} />
        <StatCard label="المصروفات" value={money(opex).replace(" ﷼", "")} />
        <StatCard label="صافي الربح" value={money(netProfit).replace(" ﷼", "")} valueClass={netProfit >= 0 ? "text-[#0f6b3a]" : "text-[#c65b3c]"} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white border border-[#eceae2] p-5">
          <h3 className="font-semibold mb-3">قائمة الدخل المبسّطة</h3>
          <Row label="إجمالي المبيعات" value={money(revenue)} />
          <Row label="( - ) تكلفة المشتريات" value={money(cogs)} />
          <Row label="مجمل الربح" value={money(revenue - cogs)} bold />
          <Row label="( - ) المصروفات التشغيلية" value={money(opex)} />
          <Row label="صافي الربح" value={money(netProfit)} bold className={netProfit >= 0 ? "text-[#0f6b3a]" : "text-[#c65b3c]"} />
        </div>
        <div className="rounded-xl bg-white border border-[#eceae2] p-5">
          <h3 className="font-semibold mb-3">التدفقات النقدية</h3>
          <Row label="النقد الداخل (قبض)" value={money(cashIn)} />
          <Row label="النقد الخارج (صرف + مصروفات)" value={money(cashOut)} />
          <Row label="صافي التدفق النقدي" value={money(cashIn - cashOut)} bold className={cashIn - cashOut >= 0 ? "text-[#0f6b3a]" : "text-[#c65b3c]"} />
        </div>
      </div>
    </Shell>
  );
}

function Row({ label, value, bold, className = "" }: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between py-2 border-b border-[#f2f0e8] text-sm last:border-0 ${bold ? "font-bold text-base" : ""} ${className}`}>
      <span className="text-[#0f2a1d]/70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}


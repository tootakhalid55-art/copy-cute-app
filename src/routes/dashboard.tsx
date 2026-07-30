import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell, PrimaryBtn, OutlineBtn, money } from "@/components/haseem/Shell";
import { useCollection, useKV } from "@/lib/haseem/store";
import { useAuth } from "@/lib/haseem/auth";
import { Plus, TrendingUp, FileText, Receipt } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "لوحة المعلومات — كنار المحاسبية" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const [org] = useKV<{ name: string }>("org", { name: "منشأتك" });
  const { items: invoices } = useCollection<any>("invoices");
  const { items: bills } = useCollection<any>("bills");
  const { items: receipts } = useCollection<any>("receipts");
  const { items: payments } = useCollection<any>("payments");
  const { items: expenses } = useCollection<any>("expenses");
  const { items: customers } = useCollection<any>("customers");
  const { items: items_ } = useCollection<any>("items");

  const salesTotal = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const outstandingSales = invoices.filter((i) => i.status !== "مدفوع").reduce((s, i) => s + Number(i.total || 0), 0);
  const purchasesTotal = bills.reduce((s, b) => s + Number(b.total || 0), 0);
  const cashIn = receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
  const cashOut = payments.reduce((s, p) => s + Number(p.amount || 0), 0) + expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netCash = cashIn - cashOut;
  const netProfit = salesTotal - purchasesTotal - expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  const recent = [
    ...invoices.slice(0, 3).map((i) => ({ id: `i-${i.id}`, label: `فاتورة مبيعات ${i.ref}`, date: i.date, amount: i.total, to: "/sales/invoices" as const })),
    ...bills.slice(0, 3).map((b) => ({ id: `b-${b.id}`, label: `فاتورة شراء ${b.ref}`, date: b.date, amount: b.total, to: "/purchases/bills" as const })),
    ...receipts.slice(0, 3).map((r) => ({ id: `r-${r.id}`, label: `سند قبض ${r.customer ?? ""}`, date: r.date, amount: r.amount, to: "/cash/receipts" as const })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 6);

  return (
    <Shell>
      <section className="rounded-xl bg-[#eaf5ee] border border-[#cfe6d7] p-6">
        <div className="text-right">
          <h1 className="text-2xl font-bold">هلا، <span className="text-[#0f2a1d]">{user?.name}</span></h1>
          <p className="text-sm text-[#0f2a1d]/70 mt-1">{org.name} — لوحة مؤشرات مباشرة من بياناتك</p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 justify-start">
          <Chip>عملاء: {customers.length}</Chip>
          <Chip>أصناف: {items_.length}</Chip>
          <Chip>فواتير مبيعات: {invoices.length}</Chip>
          <Chip>فواتير مشتريات: {bills.length}</Chip>
          <Chip>مستحقات: {money(outstandingSales)}</Chip>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KPI label="النقد الصافي" value={money(netCash)} tone={netCash >= 0 ? "text-[#0f6b3a]" : "text-[#c65b3c]"} />
        <KPI label="المستحقات على العملاء" value={money(outstandingSales)} />
        <KPI label="إجمالي المبيعات" value={money(salesTotal)} />
        <KPI label="صافي الربح" value={money(netProfit)} tone={netProfit >= 0 ? "text-[#0f6b3a]" : "text-[#c65b3c]"} />
      </section>

      {invoices.length === 0 && bills.length === 0 && (
        <section className="rounded-xl bg-[#fdfcf4] border border-dashed border-[#d9d3b8] p-6 space-y-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4" /> ابدأ في 3 خطوات</h2>
            <p className="text-xs text-[#0f2a1d]/60 mt-1">أضف بيانات لتظهر مؤشراتك المالية.</p>
          </div>
          <div className="space-y-2">
            <Link to="/sales/invoices/new"><PrimaryBtn className="w-full justify-center py-3"><Plus className="w-4 h-4" /> أنشئ أول فاتورة</PrimaryBtn></Link>
            <Link to="/purchases/bills/new"><OutlineBtn className="w-full justify-center py-3"><Receipt className="w-4 h-4" /> سجّل أول فاتورة شراء</OutlineBtn></Link>
            <Link to="/cash/receipts"><OutlineBtn className="w-full justify-center py-3"><FileText className="w-4 h-4" /> سجّل أول حركة نقدية</OutlineBtn></Link>
          </div>
        </section>
      )}

      <section className="rounded-xl bg-white border border-[#eceae2] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">النشاط الأخير</h3>
            <p className="text-xs text-[#0f2a1d]/60 mt-0.5">آخر الحركات المسجلة</p>
          </div>
          <Link to="/cash/transactions" className="text-xs border border-[#eceae2] rounded-lg px-3 py-1.5">عرض الكل</Link>
        </div>
        <div className="mt-3">
          {recent.length === 0 ? (
            <div className="border border-dashed border-[#eceae2] rounded-lg py-8 text-center text-xs text-[#0f2a1d]/50">لا توجد حركات بعد.</div>
          ) : (
            <ul className="divide-y divide-[#eceae2]">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link to={r.to} className="flex items-center justify-between py-3 hover:bg-[#fafaf7] px-2 rounded-lg">
                    <div>
                      <div className="text-sm font-medium">{r.label}</div>
                      <div className="text-xs text-[#0f2a1d]/60">{r.date}</div>
                    </div>
                    <div className="font-semibold text-sm">{money(r.amount)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Shell>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="text-xs bg-white/70 border border-[#cfe6d7] rounded-full px-3 py-1.5">{children}</span>;
}
function KPI({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-white border border-[#eceae2] p-4">
      <div className="text-xs text-[#0f2a1d]/60">{label}</div>
      <div className={`text-lg font-bold mt-1 tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}


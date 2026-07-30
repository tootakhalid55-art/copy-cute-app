import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/sales/statements")({
  head: () => ({ meta: [{ title: "كشوف حساب العملاء — كنار المحاسبية" }] }),
  component: StatementsPage,
});

function StatementsPage() {
  const { items: customers } = useCollection<any>("customers");
  const { items: invoices } = useCollection<any>("invoices");
  const { items: receipts } = useCollection<any>("receipts");
  const { items: credits } = useCollection<any>("credit-notes");
  const [customerId, setCustomerId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);

  const rows = useMemo(() => {
    if (!customerId) return [];
    const name = customers.find((c) => c.id === customerId)?.name;
    const inR = (d: string) => (!from || d >= from) && (!to || d <= to);
    const items: { date: string; ref: string; type: string; debit: number; credit: number }[] = [];
    invoices.filter((i) => i.partyId === customerId && inR(i.date))
      .forEach((i) => items.push({ date: i.date, ref: i.ref, type: "فاتورة", debit: Number(i.total || 0), credit: 0 }));
    credits.filter((c) => c.partyId === customerId && inR(c.date))
      .forEach((c) => items.push({ date: c.date, ref: c.ref, type: "إشعار دائن", debit: 0, credit: Number(c.total || 0) }));
    receipts.filter((r) => (r.partyId === customerId || r.customer === name) && inR(r.date))
      .forEach((r) => items.push({ date: r.date, ref: r.ref || "—", type: "سند قبض", debit: 0, credit: Number(r.amount || 0) }));
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [customerId, invoices, credits, receipts, customers, from, to]);

  let running = 0;
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const custName = customers.find((c) => c.id === customerId)?.name || "";

  return (
    <ReportShell
      title="كشوف حساب العملاء"
      subtitle={custName ? `العميل: ${custName}` : "اختر عميلاً لعرض حركاته"}
      filters={<>
        <label className="text-xs text-[#0f2a1d]/70 flex flex-col gap-1">العميل
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
            className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm bg-white min-w-[220px]">
            <option value="">— اختر عميلاً —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-[#0f2a1d]/70 flex flex-col gap-1">من
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-[#0f2a1d]/70 flex flex-col gap-1">إلى
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
        </label>
      </>}
      exportRows={() => ({
        headers: ["التاريخ", "المرجع", "النوع", "مدين", "دائن", "الرصيد"],
        rows: (() => { let r = 0; return rows.map((x) => { r += x.debit - x.credit; return [x.date, x.ref, x.type, x.debit, x.credit, r]; }); })(),
      })}
    >
      <ReportTable
        headers={["التاريخ", "المرجع", "النوع", "مدين", "دائن", "الرصيد"]}
        rows={rows.map((r) => { running += r.debit - r.credit; return [r.date, r.ref, r.type, money(r.debit), money(r.credit), money(running)]; })}
        totalsRow={["الإجمالي", "", "", money(totalDebit), money(totalCredit), <strong key="b">{money(totalDebit - totalCredit)}</strong>]}
      />
    </ReportShell>
  );
}


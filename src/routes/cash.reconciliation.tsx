import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";

export const Route = createFileRoute("/cash/reconciliation")({
  head: () => ({ meta: [{ title: "التسويات البنكية — حسيم" }] }),
  component: ReconPage,
});

function ReconPage() {
  const { items: banks } = useCollection<any>("banks");
  const { items: receipts, update: updR } = useCollection<any>("receipts");
  const { items: payments, update: updP } = useCollection<any>("payments");
  const { items: transfers, update: updT } = useCollection<any>("transfers");
  const [bankId, setBankId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);
  const bank = banks.find((b) => b.id === bankId);

  const inR = (d: string) => (!from || d >= from) && (!to || d <= to);
  type Txn = { id: string; kind: "receipt" | "payment" | "transfer-in" | "transfer-out"; date: string; ref: string; label: string; amount: number; reconciled: boolean };
  const txns: Txn[] = useMemo(() => {
    if (!bank) return [];
    const arr: Txn[] = [];
    receipts.filter((r) => r.bank === bank.name && inR(r.date))
      .forEach((r) => arr.push({ id: r.id, kind: "receipt", date: r.date, ref: r.ref || "—", label: r.customer || r.partyName || "قبض", amount: Number(r.amount || 0), reconciled: !!r.reconciled }));
    payments.filter((p) => p.bank === bank.name && inR(p.date))
      .forEach((p) => arr.push({ id: p.id, kind: "payment", date: p.date, ref: p.ref || "—", label: p.supplier || p.partyName || "صرف", amount: -Number(p.amount || 0), reconciled: !!p.reconciled }));
    transfers.filter((t) => inR(t.date)).forEach((t) => {
      if (t.to === bank.name) arr.push({ id: t.id + "-in", kind: "transfer-in", date: t.date, ref: t.ref || "—", label: `تحويل من ${t.from}`, amount: Number(t.amount || 0), reconciled: !!t.reconciled });
      if (t.from === bank.name) arr.push({ id: t.id + "-out", kind: "transfer-out", date: t.date, ref: t.ref || "—", label: `تحويل إلى ${t.to}`, amount: -Number(t.amount || 0), reconciled: !!t.reconciled });
    });
    return arr.sort((a, b) => a.date.localeCompare(b.date));
  }, [bank, receipts, payments, transfers, from, to]);

  const toggle = (t: Txn) => {
    if (t.kind === "receipt") { const r = receipts.find((x) => x.id === t.id); if (r) updR(r.id, { reconciled: !r.reconciled }); }
    else if (t.kind === "payment") { const p = payments.find((x) => x.id === t.id); if (p) updP(p.id, { reconciled: !p.reconciled }); }
    else { const id = t.id.replace(/-in$|-out$/, ""); const tr = transfers.find((x) => x.id === id); if (tr) updT(tr.id, { reconciled: !tr.reconciled }); }
  };

  const reconciled = txns.filter((t) => t.reconciled).reduce((s, t) => s + t.amount, 0);
  const unreconciled = txns.filter((t) => !t.reconciled).reduce((s, t) => s + t.amount, 0);
  const opening = Number(bank?.opening || 0);
  const bookBalance = opening + reconciled + unreconciled;
  const stmtBalance = opening + reconciled;

  return (
    <ReportShell
      title="التسويات البنكية"
      subtitle="مطابقة الحركات مع كشف الحساب البنكي"
      filters={<>
        <label className="text-xs text-[#0f2a1d]/70 flex flex-col gap-1">الحساب البنكي
          <select value={bankId} onChange={(e) => setBankId(e.target.value)}
            className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm bg-white min-w-[200px]">
            <option value="">— اختر —</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </>}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi label="رصيد الافتتاح" value={money(opening)} />
        <Kpi label="رصيد الكشف (مطابَق)" value={money(stmtBalance)} tone="green" />
        <Kpi label="الرصيد الدفتري" value={money(bookBalance)} />
      </div>
      <ReportTable
        headers={["", "التاريخ", "المرجع", "البيان", "المبلغ", "الحالة"]}
        rows={txns.map((t) => [
          <input key={t.id} type="checkbox" checked={t.reconciled} onChange={() => toggle(t)} />,
          t.date, t.ref, t.label,
          <span key="a" className={t.amount < 0 ? "text-red-600" : "text-[#0f6b3a]"}>{money(t.amount)}</span>,
          t.reconciled ? <span key="r" className="text-[10px] px-2 py-0.5 rounded-full bg-[#eaf5ee] text-[#0f6b3a]">مطابَق</span> : <span key="r" className="text-[10px] px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">قيد المطابقة</span>,
        ])}
      />
    </ReportShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <div className="rounded-xl bg-white border border-[#eceae2] p-4">
      <div className="text-xs text-[#0f2a1d]/60">{label}</div>
      <div className={`text-lg font-bold mt-1 ${tone === "green" ? "text-[#0f6b3a]" : ""}`}>{value}</div>
    </div>
  );
}

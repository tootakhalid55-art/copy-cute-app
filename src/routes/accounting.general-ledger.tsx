import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/haseem/store";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";
import { normalizeJournalLines } from "@/lib/accounting/ledger";

export const Route = createFileRoute("/accounting/general-ledger")({
  head: () => ({ meta: [{ title: "الأستاذ العام — كنار المحاسبية" }] }),
  component: GLPage,
});

function GLPage() {
  const { items: accounts } = useCollection<any>("accounts");
  const { items: entries } = useCollection<any>("journal-entries");
  const [accountCode, setAccountCode] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today);

  const acc = accounts.find((a) => a.code === accountCode);
  const inR = (d: string) => (!from || d >= from) && (!to || d <= to);

  const lines = useMemo(() => {
    if (!accountCode) return [];
    const arr: { date: string; ref: string; memo: string; debit: number; credit: number }[] = [];
    entries.filter((e) => inR(e.date)).forEach((e) => {
      normalizeJournalLines(e).forEach((l) => {
        if (l.accountCode === accountCode) arr.push({ date: e.date, ref: e.ref, memo: l.description || e.memo || "", debit: Number(l.debit || 0), credit: Number(l.credit || 0) });
      });
    });
    return arr.sort((a, b) => a.date.localeCompare(b.date));
  }, [accountCode, entries, from, to]);

  const opening = Number(acc?.openingBalance || 0);
  let running = opening;
  const totalDr = lines.reduce((s, l) => s + l.debit, 0);
  const totalCr = lines.reduce((s, l) => s + l.credit, 0);

  return (
    <ReportShell
      title="الأستاذ العام"
      subtitle={acc ? `${acc.code} · ${acc.name}` : "اختر حساباً لعرض حركاته"}
      filters={<>
        <label className="text-xs text-[#0f2a1d]/70 flex flex-col gap-1">الحساب
          <select value={accountCode} onChange={(e) => setAccountCode(e.target.value)}
            className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm bg-white min-w-[240px]">
            <option value="">— اختر —</option>
            {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}
          </select>
        </label>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </>}
    >
      <ReportTable
        headers={["التاريخ", "المرجع", "البيان", "مدين", "دائن", "الرصيد"]}
        rows={[
          ["", "", <em key="o">رصيد افتتاحي</em>, "", "", money(opening)],
          ...lines.map((l) => { running += l.debit - l.credit; return [l.date, l.ref, l.memo, money(l.debit), money(l.credit), money(running)]; }),
        ]}
        totalsRow={["الإجمالي", "", "", money(totalDr), money(totalCr), <strong key="b">{money(opening + totalDr - totalCr)}</strong>]}
      />
    </ReportShell>
  );
}


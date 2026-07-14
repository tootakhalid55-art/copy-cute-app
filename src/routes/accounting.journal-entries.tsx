import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Trash2, X, Save } from "lucide-react";
import { useCollection } from "@/lib/haseem/store";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, EmptyState } from "@/components/haseem/Shell";

export const Route = createFileRoute("/accounting/journal-entries")({
  head: () => ({ meta: [{ title: "القيود اليومية — حسيم" }] }),
  component: JournalPage,
});

type Line = { accountCode: string; description: string; debit: number; credit: number };

function JournalPage() {
  const { items: entries, add, remove } = useCollection<any>("journal-entries");
  const { items: accounts } = useCollection<any>("accounts");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <Shell>
      <PageHeader
        title="القيود اليومية"
        subtitle="سجل القيود اليدوية بالضغط المزدوج"
        action={<PrimaryBtn onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> قيد جديد</PrimaryBtn>}
      />
      {entries.length === 0 ? (
        <EmptyState title="لا توجد قيود بعد" description="أنشئ أول قيد يومي." action={<PrimaryBtn onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> قيد جديد</PrimaryBtn>} />
      ) : (
        <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f7f6f0] text-xs">
              <tr className="text-right"><th className="p-2.5">المرجع</th><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {entries.map((e) => {
                const dr = (e.lines || []).reduce((s: number, l: Line) => s + Number(l.debit || 0), 0);
                const cr = (e.lines || []).reduce((s: number, l: Line) => s + Number(l.credit || 0), 0);
                return (
                  <tr key={e.id} className="text-right hover:bg-[#fafaf7]">
                    <td className="p-2.5 font-mono">{e.ref}</td>
                    <td className="p-2.5">{e.date}</td>
                    <td className="p-2.5">{e.memo || "—"}</td>
                    <td className="p-2.5 tabular-nums">{dr.toLocaleString()}</td>
                    <td className="p-2.5 tabular-nums">{cr.toLocaleString()}</td>
                    <td className="p-2.5"><button onClick={() => confirm("حذف؟") && remove(e.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <EntryModal accounts={accounts} onClose={() => setOpen(false)} onSave={(v) => { add(v); setOpen(false); }} nextRef={`JE-${String(entries.length + 1).padStart(5, "0")}`} />}
    </Shell>
  );
}

function EntryModal({ accounts, onClose, onSave, nextRef }: { accounts: any[]; onClose: () => void; onSave: (v: any) => void; nextRef: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [ref, setRef] = useState(nextRef);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { accountCode: "", description: "", debit: 0, credit: 0 },
    { accountCode: "", description: "", debit: 0, credit: 0 },
  ]);
  const totals = useMemo(() => ({
    dr: lines.reduce((s, l) => s + Number(l.debit || 0), 0),
    cr: lines.reduce((s, l) => s + Number(l.credit || 0), 0),
  }), [lines]);
  const balanced = totals.dr === totals.cr && totals.dr > 0;

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setLines((ls) => [...ls, { accountCode: "", description: "", debit: 0, credit: 0 }]);
  const removeLine = (i: number) => setLines((ls) => ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#eceae2] bg-[#fafaf7]">
          <h3 className="font-bold">قيد يومي جديد</h3>
          <button onClick={onClose} className="p-2 rounded hover:bg-[#eceae2]"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <label className="flex flex-col gap-1"><span className="text-xs">المرجع</span>
              <input value={ref} onChange={(e) => setRef(e.target.value)} className="border border-[#eceae2] rounded-lg px-3 py-2" /></label>
            <label className="flex flex-col gap-1"><span className="text-xs">التاريخ</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-[#eceae2] rounded-lg px-3 py-2" /></label>
            <label className="flex flex-col gap-1"><span className="text-xs">البيان</span>
              <input value={memo} onChange={(e) => setMemo(e.target.value)} className="border border-[#eceae2] rounded-lg px-3 py-2" placeholder="سبب القيد..." /></label>
          </div>
          <div className="rounded-lg border border-[#eceae2] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#faf9f4] text-xs"><tr className="text-right"><th className="p-2">الحساب</th><th className="p-2">البيان</th><th className="p-2 w-28">مدين</th><th className="p-2 w-28">دائن</th><th className="p-2 w-10"></th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-[#eceae2]">
                    <td className="p-2">
                      <select value={l.accountCode} onChange={(e) => update(i, { accountCode: e.target.value })}
                        className="border border-[#eceae2] rounded px-2 py-1.5 w-full bg-white">
                        <option value="">— اختر حساباً —</option>
                        {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}
                      </select>
                    </td>
                    <td className="p-2"><input value={l.description} onChange={(e) => update(i, { description: e.target.value })} className="border border-[#eceae2] rounded px-2 py-1.5 w-full" /></td>
                    <td className="p-2"><input type="number" min={0} step="0.01" value={l.debit || ""} onChange={(e) => update(i, { debit: Number(e.target.value), credit: 0 })} className="border border-[#eceae2] rounded px-2 py-1.5 w-full text-center" /></td>
                    <td className="p-2"><input type="number" min={0} step="0.01" value={l.credit || ""} onChange={(e) => update(i, { credit: Number(e.target.value), debit: 0 })} className="border border-[#eceae2] rounded px-2 py-1.5 w-full text-center" /></td>
                    <td className="p-2"><button onClick={() => removeLine(i)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#faf9f4] text-xs font-bold">
                <tr><td colSpan={2} className="p-2 text-left">الإجمالي</td><td className="p-2 text-center tabular-nums">{totals.dr.toLocaleString()}</td><td className="p-2 text-center tabular-nums">{totals.cr.toLocaleString()}</td><td></td></tr>
              </tfoot>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <OutlineBtn onClick={addLine}><Plus className="w-4 h-4" /> إضافة سطر</OutlineBtn>
            <div className={`text-xs px-3 py-1.5 rounded-full ${balanced ? "bg-[#eaf5ee] text-[#0f6b3a]" : "bg-red-50 text-red-600"}`}>
              {balanced ? "القيد متوازن" : `فرق: ${(totals.dr - totals.cr).toLocaleString()}`}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-[#eceae2] bg-[#fafaf7]">
          <OutlineBtn onClick={onClose}>إلغاء</OutlineBtn>
          <PrimaryBtn disabled={!balanced} onClick={() => onSave({ ref, date, memo, lines })}
            className={!balanced ? "opacity-50 cursor-not-allowed" : ""}>
            <Save className="w-4 h-4" /> حفظ القيد
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

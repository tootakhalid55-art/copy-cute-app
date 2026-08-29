// Generates the invoices that are due from recurring templates. Templates
// live in the local "recurring-invoices" collection; generated invoices are
// real cloud documents (draft sales invoices) created through the adapter.
import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { useCollection } from "@/lib/haseem/store";
import { PrimaryBtn } from "./Shell";

const FREQ_MONTHS: Record<string, number> = { "شهري": 1, "ربع سنوي": 3, "سنوي": 12 };
const FREQ_DAYS: Record<string, number> = { "يومي": 1, "أسبوعي": 7 };

function addOccurrence(date: Date, frequency: string): Date {
  const d = new Date(date);
  if (FREQ_DAYS[frequency]) d.setDate(d.getDate() + FREQ_DAYS[frequency]);
  else d.setMonth(d.getMonth() + (FREQ_MONTHS[frequency] ?? 1));
  return d;
}

/** All due dates after lastRun (or startDate) up to today, capped for safety. */
function dueOccurrences(tpl: any, today: Date): string[] {
  const out: string[] = [];
  if (tpl.status === "متوقف" || !tpl.startDate) return out;
  let cursor = new Date(tpl.lastGenerated ? addOccurrence(new Date(tpl.lastGenerated), tpl.frequency ?? "شهري") : tpl.startDate);
  const end = tpl.endDate ? new Date(tpl.endDate) : null;
  while (cursor <= today && out.length < 24) {
    if (end && cursor > end) break;
    out.push(cursor.toISOString().slice(0, 10));
    cursor = addOccurrence(cursor, tpl.frequency ?? "شهري");
  }
  return out;
}

export function RecurringGenerator() {
  const { items: templates, update } = useCollection<any>("recurring-invoices");
  const { items: customers } = useCollection<any>("customers");
  const { addAsync } = useCollection<any>("invoices");
  const [busy, setBusy] = useState(false);

  const due = useMemo(() => {
    const today = new Date();
    return templates
      .map((t) => ({ tpl: t, dates: dueOccurrences(t, today) }))
      .filter((x) => x.dates.length > 0);
  }, [templates]);

  const generate = async () => {
    setBusy(true);
    let created = 0;
    try {
      for (const { tpl, dates } of due) {
        const party = customers.find((c) => c.id === tpl.customerId || c.name === tpl.customer);
        for (const date of dates) {
          const amount = Number(tpl.amount || 0);
          await addAsync({
            ref: `REC-${(tpl.name || "INV").replace(/\s+/g, "-").slice(0, 12)}-${date.replaceAll("-", "")}`,
            date,
            partyId: party?.id,
            partyName: tpl.customer,
            notes: tpl.notes ?? `فاتورة متكررة: ${tpl.name}`,
            status: "مسودة",
            lines: [{ description: tpl.name || "اشتراك دوري", qty: 1, price: amount, tax: 15 }],
            subtotal: amount,
            tax: Math.round(amount * 15) / 100,
            total: Math.round(amount * 115) / 100,
            recurringTemplateId: tpl.id,
          } as any);
          created++;
        }
        update(tpl.id, { lastGenerated: dates[dates.length - 1] } as any);
      }
      toast.success(created ? `أُنشئت ${created} فاتورة (مسودات) — راجعها ثم أكّدها` : "لا فواتير مستحقة");
    } catch (e: any) {
      toast.error(`توقف التوليد بعد ${created} فاتورة: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const dueCount = due.reduce((s, x) => s + x.dates.length, 0);
  if (!templates.length) return null;
  return (
    <div className="rounded-xl border border-[#eceae2] bg-[#fdfcf4] p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-2 text-sm">
        <CalendarClock className="w-4 h-4 text-[#0f6b3a]" />
        {dueCount > 0
          ? <span>يوجد <strong>{dueCount}</strong> فاتورة مستحقة التوليد من {due.length} جدول</span>
          : <span className="text-[#0f2a1d]/60">كل الجداول النشطة مولّدة حتى اليوم</span>}
      </div>
      {dueCount > 0 && (
        <PrimaryBtn onClick={generate} disabled={busy}>
          {busy ? "جارٍ التوليد…" : "توليد الفواتير المستحقة"}
        </PrimaryBtn>
      )}
    </div>
  );
}

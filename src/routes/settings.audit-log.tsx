import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Shell, PageHeader } from "@/components/haseem/Shell";
import { useCollection } from "@/lib/haseem/store";

export const Route = createFileRoute("/settings/audit-log")({
  head: () => ({ meta: [{ title: "سجل التدقيق — كنار المحاسبية" }] }),
  component: AuditPage,
});

function AuditPage() {
  // Aggregate all record IDs with createdAt/updatedAt timestamps if present
  const collections = ["invoices", "quotations", "credit-notes", "bills", "purchase-orders", "expenses", "receipts", "payments", "customers", "suppliers", "items", "journal-entries", "accounts"];
  const { items: invoices } = useCollection<any>("invoices");
  const { items: quotations } = useCollection<any>("quotations");
  const { items: credits } = useCollection<any>("credit-notes");
  const { items: bills } = useCollection<any>("bills");
  const { items: pos } = useCollection<any>("purchase-orders");
  const { items: expenses } = useCollection<any>("expenses");
  const all = useMemo(() => {
    const labels: Record<string, string> = {
      invoices: "فاتورة مبيعات", quotations: "عرض سعر", "credit-notes": "إشعار دائن",
      bills: "فاتورة مشتريات", "purchase-orders": "أمر شراء", expenses: "مصروف",
    };
    const entries: { when: string; type: string; ref: string; note: string }[] = [];
    ([["invoices", invoices], ["quotations", quotations], ["credit-notes", credits], ["bills", bills], ["purchase-orders", pos], ["expenses", expenses]] as const)
      .forEach(([key, arr]) => arr.forEach((r) => entries.push({
        when: r.createdAt || r.date || "",
        type: labels[key] || key,
        ref: r.ref || r.id.slice(0, 8),
        note: r.partyName ? `للطرف: ${r.partyName}` : (r.description || "—"),
      })));
    return entries.sort((a, b) => b.when.localeCompare(a.when));
  }, [invoices, quotations, credits, bills, pos, expenses]);
  const [q, setQ] = useState("");
  const filtered = all.filter((e) => !q || [e.type, e.ref, e.note].some((x) => x.toLowerCase().includes(q.toLowerCase())));
  return (
    <Shell>
      <PageHeader title="سجل التدقيق" subtitle="عرض تسلسلي لآخر العمليات في النظام" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث..." className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm w-full max-w-sm" />
      <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f7f6f0] text-xs"><tr className="text-right"><th className="p-3">التاريخ</th><th className="p-3">النوع</th><th className="p-3">المرجع</th><th className="p-3">التفاصيل</th></tr></thead>
          <tbody className="divide-y divide-[#eceae2]">
            {filtered.length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-[#0f2a1d]/50 text-xs">لا توجد سجلات</td></tr> :
              filtered.slice(0, 200).map((e, i) => (
                <tr key={i} className="text-right hover:bg-[#fafaf7]">
                  <td className="p-3 text-[#0f2a1d]/70 tabular-nums text-xs">{(e.when || "").slice(0, 19).replace("T", " ")}</td>
                  <td className="p-3"><span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f2f0e8]">{e.type}</span></td>
                  <td className="p-3 font-mono text-xs">{e.ref}</td>
                  <td className="p-3 text-[#0f2a1d]/80">{e.note}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}


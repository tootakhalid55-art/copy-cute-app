// Reusable allocation UI for receipts / payments / credit notes.
// - Shows open documents (invoices / bills / debit notes)
// - Supports auto-FIFO, manual per-row entry, partial allocation
// - Live preview: remaining payment, remaining balance per row, total allocated

import { useEffect, useMemo, useState } from "react";
import { listOpenDocuments, type DocumentOpenBalance } from "@/lib/accounting/settlement";
import { money } from "@/components/haseem/Shell";

export type AllocationRow = {
  target_kind: string;
  target_document_id: string;
  amount: number;
};

export function AllocationPanel(props: {
  orgId: string;
  partyId: string;
  totalAmount: number;
  side: "AR" | "AP"; // AR = receipts against invoices/debit_notes; AP = payments against bills
  value: AllocationRow[];
  onChange: (rows: AllocationRow[]) => void;
}) {
  const { orgId, partyId, totalAmount, side, value, onChange } = props;
  const [open, setOpen] = useState<DocumentOpenBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const kinds = side === "AR" ? ["invoice", "debit_note"] : ["bill", "debit_note"];

  useEffect(() => {
    if (!orgId || !partyId) { setOpen([]); return; }
    setLoading(true);
    listOpenDocuments({ orgId, partyId, kinds })
      .then(setOpen)
      .catch(() => setOpen([]))
      .finally(() => setLoading(false));
     
  }, [orgId, partyId, side]);

  const byId = useMemo(() => {
    const m = new Map<string, number>();
    value.forEach((v) => m.set(v.target_document_id, v.amount));
    return m;
  }, [value]);

  const allocated = value.reduce((s, r) => s + Number(r.amount || 0), 0);
  const remaining = Math.max(0, Math.round((totalAmount - allocated) * 100) / 100);

  const update = (doc: DocumentOpenBalance, raw: string) => {
    const n = Math.max(0, Math.min(Number(raw) || 0, doc.open_as_target));
    const next = value.filter((v) => v.target_document_id !== doc.document_id);
    if (n > 0) next.push({ target_kind: doc.kind, target_document_id: doc.document_id, amount: n });
    onChange(next);
  };

  const autoFifo = () => {
    let left = totalAmount;
    const rows: AllocationRow[] = [];
    for (const d of open) {
      if (left <= 0) break;
      const take = Math.min(left, d.open_as_target);
      if (take > 0) rows.push({ target_kind: d.kind, target_document_id: d.document_id, amount: Math.round(take * 100) / 100 });
      left -= take;
    }
    onChange(rows);
  };

  return (
    <div className="border rounded-md">
      <div className="flex items-center justify-between p-3 bg-muted/40 border-b">
        <div className="text-sm">
          <div>المبلغ الإجمالي: <b>{money(totalAmount)}</b></div>
          <div>المُخصص: <b>{money(allocated)}</b> — المتبقي (سلفة): <b>{money(remaining)}</b></div>
        </div>
        <button type="button" onClick={autoFifo} className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground">
          تخصيص تلقائي (FIFO)
        </button>
      </div>
      <div className="max-h-72 overflow-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">جاري التحميل…</div>
        ) : open.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">لا توجد مستندات مفتوحة لهذا الطرف.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-start p-2">المستند</th>
                <th className="text-start p-2">النوع</th>
                <th className="text-start p-2">التاريخ</th>
                <th className="text-end p-2">المفتوح</th>
                <th className="text-end p-2 w-40">مبلغ التخصيص</th>
              </tr>
            </thead>
            <tbody>
              {open.map((d) => {
                const cur = byId.get(d.document_id) ?? 0;
                return (
                  <tr key={d.document_id} className="border-t">
                    <td className="p-2 font-mono text-xs">{d.document_id.slice(0, 8)}</td>
                    <td className="p-2">{d.kind}</td>
                    <td className="p-2">{d.issue_date ?? "—"}</td>
                    <td className="p-2 text-end">{money(d.open_as_target)}</td>
                    <td className="p-2 text-end">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={d.open_as_target}
                        value={cur || ""}
                        onChange={(e) => update(d, e.target.value)}
                        className="w-32 px-2 py-1 border rounded text-end"
                        placeholder="0.00"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

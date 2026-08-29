// Quick "record payment" action for invoice/bill rows. Opens a compact
// modal, defaults the amount to the document's open balance, and creates a
// receipt (invoices) or payment (bills) voucher allocated to that document
// through the settlement engine RPCs.
import { useEffect, useMemo, useState } from "react";
import { Banknote, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/db/org";
import { createReceipt, createPayment } from "@/lib/accounting/receipts";
import { getDocumentOpenBalance } from "@/lib/accounting/settlement";
import { money, PrimaryBtn, OutlineBtn } from "./Shell";

type Side = "receivable" | "payable";
type CashAccount = { id: string; name: string; kind: string };

const PAYABLE_STATUSES = new Set(["مرحل", "مؤكد", "معتمد", "مدفوع جزئياً"]);

export function RecordPaymentButton({ row, side }: { row: any; side: Side }) {
  const { currentOrgId } = useOrg();
  const [open, setOpen] = useState(false);
  if (!currentOrgId || !row?.partyId || !PAYABLE_STATUSES.has(String(row.status))) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 hover:bg-emerald-50 text-emerald-700 rounded"
        aria-label="تسجيل دفعة"
        title="تسجيل دفعة"
      >
        <Banknote className="w-3.5 h-3.5" />
      </button>
      {open && (
        <PaymentModal row={row} side={side} orgId={currentOrgId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function PaymentModal({ row, side, orgId, onClose }: { row: any; side: Side; orgId: string; onClose: () => void }) {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [openBalance, setOpenBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("cash_bank_accounts")
      .select("id,name,kind")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        const rows = (data ?? []) as CashAccount[];
        setAccounts(rows);
        if (rows.length === 1) setAccountId(rows[0].id);
      });
    getDocumentOpenBalance(orgId, row.id)
      .then((v) => {
        setOpenBalance(v);
        setAmount(v > 0 ? v : Number(row.total || 0));
      })
      .catch(() => setAmount(Number(row.total || 0)));
  }, [orgId, row.id, row.total]);

  const targetKind = useMemo(
    () => (side === "receivable" ? "invoice" : "bill") as "invoice" | "bill",
    [side],
  );

  const submit = async () => {
    if (!accountId) { toast.error("اختر حساب النقدية/البنك"); return; }
    if (!(amount > 0)) { toast.error("أدخل مبلغاً صالحاً"); return; }
    if (openBalance != null && amount > openBalance + 0.005) {
      toast.error(`المبلغ يتجاوز المتبقي (${money(openBalance)})`);
      return;
    }
    setBusy(true);
    try {
      const input = {
        party_id: row.partyId,
        cash_bank_account_id: accountId,
        amount,
        date,
        memo: `${side === "receivable" ? "سداد فاتورة" : "سداد فاتورة مشتريات"} ${row.ref}`,
        allocations: [{ target_kind: targetKind, target_document_id: row.id, amount }],
      };
      if (side === "receivable") await createReceipt(orgId, input as any);
      else await createPayment(orgId, input as any);
      toast.success("تم تسجيل الدفعة وإنشاء السند والقيد");
      window.dispatchEvent(new CustomEvent("haseem:collection-changed", { detail: {} }));
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل تسجيل الدفعة");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#eceae2] bg-[#fafaf7] rounded-t-xl">
          <h3 className="font-bold text-sm">تسجيل دفعة — {row.ref}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[#eceae2]"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="flex justify-between text-xs bg-[#f7f6f0] rounded-lg px-3 py-2">
            <span>{side === "receivable" ? "العميل" : "المورد"}: <strong>{row.partyName || "—"}</strong></span>
            <span>المتبقي: <strong>{openBalance == null ? "…" : money(openBalance)}</strong></span>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs">الحساب (نقدية / بنك)</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="border border-[#eceae2] rounded-lg px-3 py-2">
              <option value="">— اختر —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs">المبلغ</span>
              <input type="number" min={0} step="0.01" value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="border border-[#eceae2] rounded-lg px-3 py-2 tabular-nums" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs">التاريخ</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="border border-[#eceae2] rounded-lg px-3 py-2" />
            </label>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <OutlineBtn onClick={onClose}>إلغاء</OutlineBtn>
            <PrimaryBtn onClick={submit} disabled={busy}>{busy ? "جارٍ الحفظ…" : "تسجيل الدفعة"}</PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/db/org";
import { money } from "@/components/haseem/Shell";
import { AllocationPanel, type AllocationRow } from "@/components/haseem/AllocationPanel";
import { createReceipt, checkCredit, type CreditCheckResult } from "@/lib/accounting/receipts";
import { toast } from "sonner";

export const Route = createFileRoute("/cash/receipts")({
  head: () => ({
    meta: [
      { title: "سندات القبض — حسيم" },
      { name: "description", content: "إنشاء سندات قبض من العملاء مع تخصيص تلقائي على الفواتير المفتوحة." },
    ],
  }),
  component: ReceiptsPage,
});

type Party = { id: string; name: string; type: string };
type Account = { id: string; name: string; kind: string; currency: string };
type Doc = { id: string; doc_number: string; issue_date: string; party_id: string; grand_total: number; financial_state: string; currency: string; kind: string };

function ReceiptsPage() {
  const { currentOrgId } = useOrg();
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [receipts, setReceipts] = useState<Doc[]>([]);
  const [showNew, setShowNew] = useState(false);

  const refresh = async () => {
    if (!currentOrgId) return;
    const [{ data: pty }, { data: acc }, { data: rec }] = await Promise.all([
      supabase.from("parties").select("id,name,type").eq("org_id", currentOrgId).in("type", ["customer", "both"]).order("name"),
      supabase.from("cash_bank_accounts").select("id,name,kind,currency").eq("org_id", currentOrgId).eq("is_active", true).order("name"),
      supabase.from("documents").select("id,doc_number,issue_date,party_id,grand_total,financial_state,currency,kind").eq("org_id", currentOrgId).eq("kind", "receipt_voucher").order("issue_date", { ascending: false }).limit(50),
    ]);
    setParties((pty as Party[]) ?? []);
    setAccounts((acc as Account[]) ?? []);
    setReceipts((rec as Doc[]) ?? []);
  };

  useEffect(() => { refresh(); }, [currentOrgId]);

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">سندات القبض</h1>
          <p className="text-sm text-muted-foreground">قيد آلي + تخصيص على الفواتير المفتوحة</p>
        </div>
        <button onClick={() => setShowNew(true)} className="px-4 py-2 rounded bg-primary text-primary-foreground">
          + سند قبض جديد
        </button>
      </div>

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-start p-2">الرقم</th>
              <th className="text-start p-2">التاريخ</th>
              <th className="text-start p-2">العميل</th>
              <th className="text-end p-2">المبلغ</th>
              <th className="text-start p-2">الحالة المالية</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-mono">{r.doc_number}</td>
                <td className="p-2">{r.issue_date}</td>
                <td className="p-2">{partyName(r.party_id)}</td>
                <td className="p-2 text-end">{money(r.grand_total)}</td>
                <td className="p-2"><FinancialStateBadge state={r.financial_state} /></td>
              </tr>
            ))}
            {receipts.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد سندات بعد.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && currentOrgId && (
        <NewReceiptDialog
          orgId={currentOrgId}
          parties={parties}
          accounts={accounts}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); refresh(); }}
        />
      )}
    </div>
  );
}

function FinancialStateBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    fully_settled: "bg-green-100 text-green-800",
    partially_settled: "bg-amber-100 text-amber-800",
    advance_available: "bg-blue-100 text-blue-800",
    open: "bg-muted",
    written_off: "bg-red-100 text-red-800",
    refunded: "bg-purple-100 text-purple-800",
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${map[state] ?? "bg-muted"}`}>{state}</span>;
}

function NewReceiptDialog(props: {
  orgId: string; parties: Party[]; accounts: Account[]; onClose: () => void; onSaved: () => void;
}) {
  const [partyId, setPartyId] = useState("");
  const [bankId, setBankId] = useState(props.accounts[0]?.id ?? "");
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [autoFifo, setAutoFifo] = useState(true);
  const [manualAlloc, setManualAlloc] = useState<AllocationRow[]>([]);
  const [credit, setCredit] = useState<CreditCheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!partyId) { setCredit(null); return; }
    checkCredit(props.orgId, partyId, 0).then(setCredit).catch(() => setCredit(null));
  }, [partyId, props.orgId]);

  const totalAlloc = useMemo(() => manualAlloc.reduce((s, r) => s + Number(r.amount || 0), 0), [manualAlloc]);

  const submit = async () => {
    if (!partyId || !bankId || amount <= 0) { toast.error("يرجى إكمال البيانات"); return; }
    if (!autoFifo && totalAlloc > amount + 0.005) { toast.error("قيمة التخصيص تتجاوز المبلغ"); return; }
    setBusy(true);
    try {
      await createReceipt(props.orgId, {
        party_id: partyId, cash_bank_account_id: bankId, amount, date, reference, memo,
        auto_fifo: autoFifo,
        allocations: autoFifo ? [] : manualAlloc.filter((r) => r.amount > 0).map((r) => ({ ...r, target_kind: r.target_kind as "invoice" | "bill" | "credit_note" | "debit_note" | "advance" })),
      });
      toast.success("تم إنشاء سند القبض والقيد وتخصيصه.");
      props.onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الإنشاء");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-bold">سند قبض جديد</h3>
          <button onClick={props.onClose} className="text-muted-foreground">✕</button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-sm">العميل</span>
              <select className="w-full border rounded px-2 py-1.5" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">— اختر —</option>
                {props.parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm">الحساب النقدي / البنكي</span>
              <select className="w-full border rounded px-2 py-1.5" value={bankId} onChange={(e) => setBankId(e.target.value)}>
                {props.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm">التاريخ</span>
              <input type="date" className="w-full border rounded px-2 py-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm">المبلغ</span>
              <input type="number" step="0.01" className="w-full border rounded px-2 py-1.5" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm">المرجع</span>
              <input className="w-full border rounded px-2 py-1.5" value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm">ملاحظات</span>
              <input className="w-full border rounded px-2 py-1.5" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </label>
          </div>

          {credit && credit.credit_limit > 0 && (
            <div className={`text-sm rounded p-2 ${credit.credit_hold ? "bg-red-100 text-red-800" : "bg-muted"}`}>
              حد الائتمان: {money(credit.credit_limit)} — الرصيد المستحق: {money(credit.exposure)} — المتبقي: {money(credit.remaining)}
              {credit.credit_hold && <b> — العميل موقوف ائتمانياً</b>}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoFifo} onChange={(e) => setAutoFifo(e.target.checked)} />
              تخصيص تلقائي (الأقدم أولاً)
            </label>
          </div>

          {!autoFifo && partyId && (
            <AllocationPanel
              orgId={props.orgId} partyId={partyId} totalAmount={amount}
              side="AR" value={manualAlloc} onChange={setManualAlloc}
            />
          )}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={props.onClose} className="px-4 py-2 rounded border">إلغاء</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50">
            {busy ? "…" : "حفظ + قيد + تخصيص"}
          </button>
        </div>
      </div>
    </div>
  );
}

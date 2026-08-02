import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/db/org";
import { money } from "@/components/haseem/Shell";
import { AllocationPanel, type AllocationRow } from "@/components/haseem/AllocationPanel";
import { createReceipt, checkCredit, type CreditCheckResult, type CreateReceiptInput } from "@/lib/accounting/receipts";
import { listOpenDocuments } from "@/lib/accounting/settlement";
import { toast } from "sonner";
import { useCollectionChangedListener } from "@/lib/db/collection-events";
import { amountToWordsArabic } from "@/lib/haseem/amountWords";

export const Route = createFileRoute("/cash/receipts")({
  head: () => ({
    meta: [
      { title: "سندات القبض — كنار المحاسبية" },
      { name: "description", content: "إنشاء سندات قبض من العملاء مع تخصيص تلقائي على الفواتير المفتوحة." },
    ],
  }),
  component: ReceiptsPage,
});

type Party = { id: string; name: string; type: string };
type Account = { id: string; name: string; kind: string; currency: string };
type Doc = { id: string; doc_number: string; issue_date: string; party_id: string; grand_total: number; financial_state: string; currency: string; kind: string };
type PendingInvoice = { id: string; doc_number: string; grand_total: number; issue_date: string; open_as_target: number };

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "pos", label: "POS" },
];

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
  useCollectionChangedListener(["customers"], refresh);

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
  const [accountId, setAccountId] = useState(props.accounts[0]?.id ?? "");
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherNo] = useState(() => `RV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [memo, setMemo] = useState("");
  const [autoFifo, setAutoFifo] = useState(true);
  const [manualAlloc, setManualAlloc] = useState<AllocationRow[]>([]);
  const [credit, setCredit] = useState<CreditCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cashAccounts = useMemo(
    () => props.accounts.filter((a) => ["cash", "bank", "safe", "bank_account", "cash_account"].includes(a.kind)),
    [props.accounts]
  );
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);

  useEffect(() => {
    if (!partyId) {
      setPendingInvoices([]);
      return;
    }
    listOpenDocuments({ orgId: props.orgId, partyId, kinds: ["invoice"] })
      .then((rows) => setPendingInvoices(rows.map((r) => ({
        id: r.document_id,
        doc_number: r.document_id.slice(0, 8),
        grand_total: Number(r.original_amount || 0),
        issue_date: r.issue_date || "",
        open_as_target: Number(r.open_as_target || 0),
      }))))
      .catch(() => setPendingInvoices([]));
  }, [partyId, props.orgId]);

  useEffect(() => {
    if (!partyId) { setCredit(null); return; }
    checkCredit(props.orgId, partyId, 0).then(setCredit).catch(() => setCredit(null));
  }, [partyId, props.orgId]);

  const totalAlloc = useMemo(() => manualAlloc.reduce((s, r) => s + Number(r.amount || 0), 0), [manualAlloc]);
  const amountWords = useMemo(() => amountToWordsArabic(amount), [amount]);

  const submit = async () => {
    if (!partyId || !accountId || amount <= 0) { toast.error("يرجى إكمال البيانات"); return; }
    if (!autoFifo && totalAlloc > amount + 0.005) { toast.error("قيمة التخصيص تتجاوز المبلغ"); return; }
    setBusy(true);
    try {
      let attachment: CreateReceiptInput["attachment"] = null;
      if (attachmentFile) {
        const safeName = attachmentFile.name.replace(/[^\w.-]+/g, "_");
        const storagePath = `${props.orgId}/receipt-vouchers/${voucherNo}-${Date.now()}-${safeName}`;
        const { error: uploadErr } = await supabase.storage.from("attachments").upload(storagePath, attachmentFile, {
          upsert: false,
          contentType: attachmentFile.type || "application/octet-stream",
        });
        if (uploadErr) throw uploadErr;
        attachment = {
          bucket: "attachments",
          storage_path: storagePath,
          filename: attachmentFile.name,
          mime_type: attachmentFile.type || null,
          size_bytes: attachmentFile.size,
        };
      }
      await createReceipt(props.orgId, {
        party_id: partyId, cash_bank_account_id: accountId, amount, date, reference: reference || voucherNo, memo: `${memo}${attachmentName ? `\nمرفق: ${attachmentName}` : ""}`,
        auto_fifo: autoFifo,
        allocations: invoiceId
          ? [{ target_kind: "invoice", target_document_id: invoiceId, amount: Math.min(amount, pendingInvoices.find((p) => p.id === invoiceId)?.open_as_target ?? amount) }]
          : autoFifo ? [] : manualAlloc.filter((r) => r.amount > 0).map((r) => ({ ...r, target_kind: r.target_kind as "invoice" | "bill" | "credit_note" | "debit_note" | "advance" })),
        attachment,
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
              <span className="text-sm">رقم السند</span>
              <input className="w-full border rounded px-2 py-1.5 bg-muted/30 font-mono" value={voucherNo} readOnly />
            </label>
            <label className="space-y-1">
              <span className="text-sm">العميل / Received From</span>
              <select className="w-full border rounded px-2 py-1.5" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">— اختر —</option>
                {props.parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm">Deposit to Account</span>
              <select className="w-full border rounded px-2 py-1.5" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">— اختر —</option>
                {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm">التاريخ</span>
              <input type="date" className="w-full border rounded px-2 py-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm">المبلغ بالأرقام</span>
              <input type="number" step="0.01" className="w-full border rounded px-2 py-1.5" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Amount in words</span>
              <input className="w-full border rounded px-2 py-1.5 bg-muted/30" value={amountWords} readOnly />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Payment Method</span>
              <select className="w-full border rounded px-2 py-1.5" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm">Reference Number</span>
              <input className="w-full border rounded px-2 py-1.5" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque / Transfer ID" />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-sm">Link to Invoice</span>
              <select className="w-full border rounded px-2 py-1.5" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                <option value="">— لا يوجد تخصيص مباشر —</option>
                {pendingInvoices.map((d) => (
                  <option key={d.id} value={d.id}>{d.doc_number} · {money(d.grand_total)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-sm">Description</span>
              <textarea className="w-full border rounded px-2 py-1.5 min-h-[80px]" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </label>
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">Attachments</span>
                <button type="button" onClick={() => fileRef.current?.click()} className="text-xs px-3 py-1 rounded border hover:bg-muted">Upload transfer slip</button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setAttachmentFile(f);
                  setAttachmentName(f.name);
                }}
              />
              {attachmentName && <div className="text-xs text-muted-foreground mt-1">Selected: {attachmentName}</div>}
            </div>
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

          {invoiceId && (
            <div className="rounded border bg-muted/20 p-3 text-sm">
              <div className="font-semibold mb-1">Invoice allocation</div>
              <div className="text-muted-foreground text-xs">This receipt is linked to a specific invoice selection. Use the allocation panel below to split across invoices if needed.</div>
            </div>
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




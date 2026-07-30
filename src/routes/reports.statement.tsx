import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/db/org";
import { money } from "@/components/haseem/Shell";
import { getStatement, summarizeStatement, type StatementAccountKind, type StatementLine } from "@/lib/accounting/statement";

export const Route = createFileRoute("/reports/statement")({
  head: () => ({
    meta: [
      { title: "كشف حساب موحّد — كنار المحاسبية" },
      { name: "description", content: "محرّك كشوف الحسابات الموحّد للعملاء والموردين وحسابات النقدية والبنوك." },
    ],
  }),
  component: StatementPage,
});

type Option = { id: string; name: string; kind?: string };

function StatementPage() {
  const { currentOrgId } = useOrg();
  const [accountKind, setAccountKind] = useState<StatementAccountKind>("customer");
  const [options, setOptions] = useState<Option[]>([]);
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [loading, setLoading] = useState(false);

  // Load account options
  useEffect(() => {
    if (!currentOrgId) return;
    (async () => {
      if (accountKind === "cash_account") {
        const { data } = await supabase.from("cash_bank_accounts").select("id,name,kind").eq("org_id", currentOrgId).order("name");
        setOptions((data as Option[]) ?? []);
      } else {
        const typeFilter: ("customer" | "supplier" | "both")[] = accountKind === "customer" ? ["customer", "both"] : ["supplier", "both"];
        const { data } = await supabase.from("parties").select("id,name,type").eq("org_id", currentOrgId).in("type", typeFilter).order("name");
        setOptions((data as any[])?.map((p) => ({ id: p.id, name: p.name })) ?? []);
      }
      setAccountId("");
      setLines([]);
    })();
  }, [currentOrgId, accountKind]);

  const run = async () => {
    if (!currentOrgId || !accountId) return;
    setLoading(true);
    try {
      const rows = await getStatement({ orgId: currentOrgId, accountKind, accountId, from, to });
      setLines(rows);
    } finally { setLoading(false); }
  };

  const s = summarizeStatement(lines);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">كشف الحساب</h1>
        <p className="text-sm text-muted-foreground">محرّك موحّد للعملاء والموردين وحسابات النقدية والبنوك — يعمل مباشرة من محرك التسويات (المصدر الوحيد للأرصدة).</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end border rounded p-3 bg-muted/30">
        <label className="space-y-1 col-span-1">
          <span className="text-sm">نوع الحساب</span>
          <select className="w-full border rounded px-2 py-1.5" value={accountKind} onChange={(e) => setAccountKind(e.target.value as StatementAccountKind)}>
            <option value="customer">عميل</option>
            <option value="supplier">مورد</option>
            <option value="cash_account">حساب نقدي/بنكي</option>
          </select>
        </label>
        <label className="space-y-1 col-span-2">
          <span className="text-sm">الحساب</span>
          <select className="w-full border rounded px-2 py-1.5" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">— اختر —</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="text-sm">من</span>
          <input type="date" className="w-full border rounded px-2 py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="space-y-1"><span className="text-sm">إلى</span>
          <input type="date" className="w-full border rounded px-2 py-1.5" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="col-span-2 md:col-span-5">
          <button onClick={run} disabled={!accountId || loading} className="px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50">
            {loading ? "…" : "استخراج الكشف"}
          </button>
        </div>
      </div>

      {lines.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-2 text-sm">
            <Stat label="الرصيد الافتتاحي" value={money(s.opening)} />
            <Stat label="إجمالي المدين" value={money(s.totalDebit)} />
            <Stat label="إجمالي الدائن" value={money(s.totalCredit)} />
            <Stat label="الرصيد الختامي" value={money(s.closing)} highlight />
          </div>

          <div className="border rounded overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-start p-2">التاريخ</th>
                  <th className="text-start p-2">المستند</th>
                  <th className="text-start p-2">النوع</th>
                  <th className="text-start p-2">البيان</th>
                  <th className="text-end p-2">مدين</th>
                  <th className="text-end p-2">دائن</th>
                  <th className="text-end p-2">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.doc_id ?? "op"}-${i}`} className={`border-t ${l.is_opening ? "bg-muted/20 font-semibold" : ""}`}>
                    <td className="p-2">{l.txn_date ?? "—"}</td>
                    <td className="p-2 font-mono">{l.doc_number ?? "—"}</td>
                    <td className="p-2">{l.doc_kind}</td>
                    <td className="p-2">{l.description}</td>
                    <td className="p-2 text-end">{l.debit ? money(l.debit) : ""}</td>
                    <td className="p-2 text-end">{l.credit ? money(l.credit) : ""}</td>
                    <td className="p-2 text-end">{money(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`border rounded p-3 ${highlight ? "bg-primary/10 border-primary/40" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}


import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/db/org";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn } from "@/components/haseem/Shell";
import { listDeterminations, upsertDetermination, type DeterminationRow } from "@/lib/accounting/determination";
import { DETERMINATION_KEYS } from "@/lib/accounting/types";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Save } from "lucide-react";

export const Route = createFileRoute("/settings/determinations")({
  head: () => ({ meta: [{ title: "تحديد الحسابات — كنار" }] }),
  component: DeterminationsPage,
});

type Branch = { id: string; name: string };
type Account = { code: string; name: string; is_header: boolean; is_active: boolean };

function DeterminationsPage() {
  const { currentOrgId } = useOrg();
  const [rows, setRows] = useState<DeterminationRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ key: string; account_code: string; branch_id: string; doc_kind: string; description: string }>({
    key: DETERMINATION_KEYS[0], account_code: "", branch_id: "", doc_kind: "", description: "",
  });

  const reload = useCallback(async () => {
    if (!currentOrgId) return;
    const [d, b, a] = await Promise.all([
      listDeterminations(currentOrgId),
      supabase.from("branches").select("id,name").eq("org_id", currentOrgId).eq("is_active", true).order("name"),
      supabase.from("chart_of_accounts").select("code,name,is_header,is_active").eq("org_id", currentOrgId).eq("is_active", true).eq("is_header", false).order("code"),
    ]);
    setRows(d);
    setBranches((b.data ?? []) as Branch[]);
    setAccounts((a.data ?? []) as Account[]);
  }, [currentOrgId]);

  useEffect(() => { void reload(); }, [reload]);

  async function save() {
    if (!currentOrgId || !draft.account_code) { setMsg("اختر حساباً"); return; }
    setBusy(true); setMsg(null);
    try {
      await upsertDetermination({
        org_id: currentOrgId,
        key: draft.key,
        account_code: draft.account_code,
        branch_id: draft.branch_id || null,
        doc_kind: draft.doc_kind || null,
        description: draft.description || null,
        is_active: true,
      });
      setDraft({ key: DETERMINATION_KEYS[0], account_code: "", branch_id: "", doc_kind: "", description: "" });
      await reload();
      setMsg("تم الحفظ");
    } catch (e) {
      setMsg("خطأ: " + (e instanceof Error ? e.message : String(e)));
    } finally { setBusy(false); }
  }

  async function toggleActive(id: string, next: boolean) {
    await supabase.from("account_determinations").update({ is_active: next }).eq("id", id);
    await reload();
  }

  return (
    <Shell>
      <PageHeader
        title="تحديد الحسابات (Account Determination)"
        subtitle="اربط كل عملية محاسبية بحساب معين. يمكن تخصيص المستوى: عام أو حسب الفرع أو حسب نوع المستند."
      />
      {msg && <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}

      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="mb-2 text-sm font-semibold">إضافة / تحديث ربط</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select className="rounded-md border px-2 py-1.5 text-sm" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })}>
            {DETERMINATION_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className="rounded-md border px-2 py-1.5 text-sm" value={draft.account_code} onChange={(e) => setDraft({ ...draft, account_code: e.target.value })}>
            <option value="">-- اختر حساب --</option>
            {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
          </select>
          <select className="rounded-md border px-2 py-1.5 text-sm" value={draft.branch_id} onChange={(e) => setDraft({ ...draft, branch_id: e.target.value })}>
            <option value="">(كل الفروع)</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="rounded-md border px-2 py-1.5 text-sm" value={draft.doc_kind} onChange={(e) => setDraft({ ...draft, doc_kind: e.target.value })}>
            <option value="">(كل الأنواع)</option>
            <option value="invoice">فاتورة مبيعات</option>
            <option value="bill">فاتورة مشتريات</option>
            <option value="credit_note">إشعار دائن</option>
            <option value="debit_note">إشعار مدين</option>
            <option value="receipt">سند قبض</option>
            <option value="payment">سند صرف</option>
          </select>
          <input className="rounded-md border px-2 py-1.5 text-sm" placeholder="وصف اختياري" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </div>
        <div className="mt-3">
          <PrimaryBtn onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
          </PrimaryBtn>
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-2 text-start">المفتاح</th>
              <th className="p-2 text-start">الحساب</th>
              <th className="p-2 text-start">الفرع</th>
              <th className="p-2 text-start">نوع المستند</th>
              <th className="p-2 text-start">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-gray-500">لا توجد روابط بعد. أنشئ الأساس المحاسبي من صفحة الأساس.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-mono">{r.key}</td>
                <td className="p-2">{r.account_code}</td>
                <td className="p-2">{r.branch_id ? branches.find((b) => b.id === r.branch_id)?.name ?? "—" : "الكل"}</td>
                <td className="p-2">{r.doc_kind ?? "الكل"}</td>
                <td className="p-2">
                  <OutlineBtn onClick={() => toggleActive(r.id, !r.is_active)}>
                    {r.is_active ? "نشط" : "متوقف"}
                  </OutlineBtn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

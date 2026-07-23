import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/db/org";
import { seedAccountingFoundation, DEFAULT_COA, DEFAULT_POSTING_RULES } from "@/lib/accounting/defaults";
import { reverseJournal } from "@/lib/accounting/posting-engine";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn } from "@/components/haseem/Shell";
import { Loader2, RotateCcw, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/settings/accounting-foundation")({
  head: () => ({ meta: [{ title: "الأساس المحاسبي — كنار" }] }),
  component: AccountingFoundationPage,
});

type Row = Record<string, unknown>;

function AccountingFoundationPage() {
  const { currentOrgId } = useOrg();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"coa" | "rules" | "periods" | "journals">("coa");
  const [coa, setCoa] = useState<Row[]>([]);
  const [rules, setRules] = useState<Row[]>([]);
  const [periods, setPeriods] = useState<Row[]>([]);
  const [journals, setJournals] = useState<Row[]>([]);

  const reload = useCallback(async () => {
    if (!currentOrgId) return;
    const [c, r, p, j] = await Promise.all([
      supabase.from("chart_of_accounts").select("*").eq("org_id", currentOrgId).order("code"),
      supabase.from("posting_rules").select("*").eq("org_id", currentOrgId).order("event_type"),
      supabase
        .from("accounting_periods")
        .select("*, fiscal_years(name)")
        .eq("org_id", currentOrgId)
        .order("start_date", { ascending: false }),
      supabase
        .from("journal_entries")
        .select("*")
        .eq("org_id", currentOrgId)
        .order("entry_date", { ascending: false })
        .limit(50),
    ]);
    setCoa(c.data || []);
    setRules(r.data || []);
    setPeriods(p.data || []);
    setJournals(j.data || []);
  }, [currentOrgId]);

  useEffect(() => { void reload(); }, [reload]);

  async function seed() {
    if (!currentOrgId) return;
    setBusy(true); setMsg(null);
    try {
      const res = await seedAccountingFoundation(currentOrgId);
      setMsg(`تم زرع ${res.coa.inserted} حساباً و ${res.rules.inserted} قاعدة ترحيل. السنة المالية جاهزة.`);
      await reload();
    } catch (e) {
      setMsg("خطأ: " + (e instanceof Error ? e.message : String(e)));
    } finally { setBusy(false); }
  }

  async function reverseEntry(id: string) {
    if (!currentOrgId) return;
    if (!confirm("إنشاء قيد عكسي؟")) return;
    setBusy(true);
    try {
      await reverseJournal(currentOrgId, id);
      await reload();
    } catch (e) {
      alert("فشل: " + (e instanceof Error ? e.message : String(e)));
    } finally { setBusy(false); }
  }

  async function togglePeriod(id: string, status: string) {
    if (!currentOrgId) return;
    const fn = status === "open" ? "close_accounting_period" : "reopen_accounting_period";
    const { error } = await supabase.rpc(fn, { _org: currentOrgId, _period_id: id });
    if (error) alert(error.message);
    else await reload();
  }

  return (
    <Shell>
      <PageHeader
        title="الأساس المحاسبي"
        subtitle="دليل الحسابات · قواعد الترحيل · الفترات · قيود اليومية"
        action={
          <PrimaryBtn onClick={seed} disabled={busy || !currentOrgId}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            زرع الإعداد الافتراضي
          </PrimaryBtn>
        }
      />
      {msg && <div className="mb-4 rounded-lg bg-[#eaf5ee] text-[#0f6b3a] px-4 py-2 text-sm">{msg}</div>}

      <div className="flex gap-2 mb-4">
        {(["coa","rules","periods","journals"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab===t ? "bg-[#0f2a1d] text-white" : "bg-white border border-[#eceae2]"}`}>
            {t==="coa"?"دليل الحسابات":t==="rules"?"قواعد الترحيل":t==="periods"?"الفترات":"القيود"}
          </button>
        ))}
      </div>

      {tab === "coa" && (
        <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
          <div className="px-4 py-2 text-xs text-[#0f2a1d]/70 bg-[#faf9f4]">
            {coa.length} حساباً — الافتراضي {DEFAULT_COA.length}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#f7f6f0] text-xs"><tr className="text-right">
              <th className="p-2.5">الرمز</th><th>الاسم</th><th>النوع</th><th>التصنيف</th><th>عملة</th><th>حالة</th>
            </tr></thead>
            <tbody className="divide-y divide-[#eceae2]">
              {coa.map((a) => (
                <tr key={a.id as string} className="text-right hover:bg-[#fafaf7]">
                  <td className="p-2.5 font-mono">{a.code as string}</td>
                  <td className="p-2.5">{a.name as string}{a.is_header ? <span className="ms-2 text-[10px] text-[#c69432]">رأس</span> : null}</td>
                  <td className="p-2.5">{a.type as string}</td>
                  <td className="p-2.5 text-xs">{(a.category as string) || "—"}</td>
                  <td className="p-2.5">{a.currency as string}</td>
                  <td className="p-2.5">{a.is_active ? "نشط" : "معطل"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "rules" && (
        <div className="space-y-3">
          {rules.map((r) => (
            <div key={r.id as string} className="rounded-xl bg-white border border-[#eceae2] p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold">{r.name as string}</div>
                  <div className="text-xs text-[#0f2a1d]/60 mt-1">{r.event_type as string}</div>
                  <div className="text-sm mt-1">{r.description as string}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${r.is_active ? "bg-[#eaf5ee] text-[#0f6b3a]" : "bg-red-50 text-red-600"}`}>
                  {r.is_active ? "فعّال" : "معطل"}
                </span>
              </div>
              <pre className="mt-3 text-xs bg-[#faf9f4] p-3 rounded overflow-auto">{JSON.stringify(r.config, null, 2)}</pre>
            </div>
          ))}
          {rules.length === 0 && <div className="text-sm text-[#0f2a1d]/60">لا توجد قواعد. اضغط زر الزرع لإنشاء القواعد الافتراضية.</div>}
          <div className="text-xs text-[#0f2a1d]/60">الافتراضي: {DEFAULT_POSTING_RULES.length} قاعدة</div>
        </div>
      )}

      {tab === "periods" && (
        <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f7f6f0] text-xs"><tr className="text-right">
              <th className="p-2.5">الفترة</th><th>السنة</th><th>من</th><th>إلى</th><th>الحالة</th><th></th>
            </tr></thead>
            <tbody className="divide-y divide-[#eceae2]">
              {periods.map((p) => {
                const fy = (p.fiscal_years as { name?: string } | null)?.name;
                return (
                  <tr key={p.id as string} className="text-right">
                    <td className="p-2.5">{p.name as string}</td>
                    <td className="p-2.5">{fy || "—"}</td>
                    <td className="p-2.5">{p.start_date as string}</td>
                    <td className="p-2.5">{p.end_date as string}</td>
                    <td className="p-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${p.status==="open"?"bg-[#eaf5ee] text-[#0f6b3a]":p.status==="closed"?"bg-amber-50 text-amber-700":"bg-red-50 text-red-600"}`}>
                        {p.status === "open" ? "مفتوحة" : p.status === "closed" ? "مغلقة" : "مقفلة"}
                      </span>
                    </td>
                    <td className="p-2.5">
                      {p.status !== "locked" && (
                        <OutlineBtn onClick={() => togglePeriod(p.id as string, p.status as string)}>
                          {p.status === "open" ? "إغلاق" : "إعادة فتح"}
                        </OutlineBtn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "journals" && (
        <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f7f6f0] text-xs"><tr className="text-right">
              <th className="p-2.5">الرقم</th><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الحالة</th><th></th>
            </tr></thead>
            <tbody className="divide-y divide-[#eceae2]">
              {journals.map((j) => (
                <tr key={j.id as string} className="text-right hover:bg-[#fafaf7]">
                  <td className="p-2.5 font-mono">{j.entry_number as string}</td>
                  <td className="p-2.5">{j.entry_date as string}</td>
                  <td className="p-2.5">{(j.memo as string) || "—"}</td>
                  <td className="p-2.5 tabular-nums">{Number(j.total_debit || 0).toLocaleString()}</td>
                  <td className="p-2.5 tabular-nums">{Number(j.total_credit || 0).toLocaleString()}</td>
                  <td className="p-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded ${j.status==="posted"?"bg-[#eaf5ee] text-[#0f6b3a]":j.status==="reversed"?"bg-red-50 text-red-600":"bg-amber-50 text-amber-700"}`}>
                      {j.status === "posted" ? "مرحّل" : j.status === "reversed" ? "معكوس" : "مسودة"}
                    </span>
                  </td>
                  <td className="p-2.5">
                    {j.status === "posted" && (
                      <button onClick={() => reverseEntry(j.id as string)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="عكس">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {journals.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-[#0f2a1d]/60">لا توجد قيود بعد</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

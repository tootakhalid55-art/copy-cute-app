import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, RotateCcw, RefreshCw, CalendarClock } from "lucide-react";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, EmptyState, StatCard, Badge, money } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { previewDepreciation, postDepreciationRun, reverseDepreciationRun, listDepreciationRuns, type PreviewRow } from "@/lib/assets/depreciation.functions";
import { listCategories } from "@/lib/assets/registry.functions";

export const Route = createFileRoute("/assets/depreciation")({
  head: () => ({ meta: [
    { title: "دورة الإهلاك — الأصول الثابتة — حسيم" },
    { name: "description", content: "معاينة وترحيل قيد إهلاك الأصول الثابتة الشهري وعكسه عند الحاجة." },
    { property: "og:title", content: "دورة الإهلاك — حسيم" },
    { property: "og:description", content: "محرك إهلاك الأصول الثابتة الشهري." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

function lastDayOfMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function Page() {
  const { currentOrg: org } = useOrg();
  const orgId = org?.id;

  const previewFn = useServerFn(previewDepreciation);
  const postFn = useServerFn(postDepreciationRun);
  const reverseFn = useServerFn(reverseDepreciationRun);
  const runsFn = useServerFn(listDepreciationRuns);
  const catsFn = useServerFn(listCategories);

  const today = new Date();
  const defaultPeriod = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10);

  const [periodEnd, setPeriodEnd] = useState<string>(defaultPeriod);
  const [categoryId, setCategoryId] = useState<string>("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [memo, setMemo] = useState("");

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const pe = lastDayOfMonth(periodEnd);
      const [r, rs, cs] = await Promise.all([
        previewFn({ data: { orgId, periodEnd: pe, categoryId: categoryId || undefined } }),
        runsFn({ data: { orgId } }),
        catsFn({ data: { orgId } }),
      ]);
      setRows(r as PreviewRow[]);
      setRuns(rs as any[]);
      setCats(cs as any[]);
    } finally { setLoading(false); }
  }, [orgId, periodEnd, categoryId, previewFn, runsFn, catsFn]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const eligible = rows.filter((r) => r.depreciation > 0 && !r.already_posted);
    return {
      eligible: eligible.length,
      totalDep: eligible.reduce((s, r) => s + Number(r.depreciation || 0), 0),
      skipped: rows.length - eligible.length,
    };
  }, [rows]);

  const runPost = async () => {
    if (!orgId) return;
    if (!confirm(`ترحيل إهلاك ${periodEnd} لعدد ${totals.eligible} أصل بإجمالي ${money(totals.totalDep)}؟`)) return;
    setPosting(true);
    try {
      const res = await postFn({ data: { orgId, periodEnd: lastDayOfMonth(periodEnd), memo: memo || undefined } });
      if ((res as any).runId) alert("تم الترحيل بنجاح");
      else alert("لا توجد أصول مؤهلة لهذا الشهر");
      setMemo("");
      load();
    } catch (e: any) { alert(e.message || "فشل الترحيل"); }
    finally { setPosting(false); }
  };

  const runReverse = async (runId: string) => {
    if (!confirm("عكس هذه الدورة؟ سيتم إنشاء قيد عكسي وتعديل مجمع الإهلاك.")) return;
    try {
      await reverseFn({ data: { runId } });
      load();
    } catch (e: any) { alert(e.message || "فشل العكس"); }
  };

  return (
    <Shell>
      <PageHeader
        title="دورة إهلاك الأصول الثابتة"
        subtitle="معاينة الإهلاك الشهري لكل أصل، ترحيل قيد مجمّع لكل مركز تكلفة، وإمكانية العكس."
        action={
          <div className="flex gap-2">
            <Link to="/assets"><OutlineBtn>سجل الأصول</OutlineBtn></Link>
            <OutlineBtn onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</OutlineBtn>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="أصول مؤهلة" value={String(totals.eligible)} />
        <StatCard label="إجمالي الإهلاك الشهري" value={money(totals.totalDep)} />
        <StatCard label="مستبعدة" value={String(totals.skipped)} />
        <StatCard label="دورات سابقة" value={String(runs.length)} />
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[#0f2a1d]/60">نهاية الفترة</label>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full border border-[#eceae2] rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-[#0f2a1d]/60">الفئة</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border border-[#eceae2] rounded px-3 py-2 text-sm">
              <option value="">جميع الفئات</option>
              {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs text-[#0f2a1d]/60">مذكرة</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)}
              placeholder="اختياري - يظهر على القيد"
              className="w-full border border-[#eceae2] rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <PrimaryBtn onClick={runPost} disabled={posting || totals.eligible === 0}>
              <Play className="w-4 h-4" /> ترحيل الإهلاك
            </PrimaryBtn>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] overflow-x-auto mb-6">
        <div className="p-3 border-b border-[#eceae2] text-sm font-medium">معاينة الفترة {lastDayOfMonth(periodEnd)}</div>
        {loading ? (
          <div className="p-8 text-center text-sm text-[#0f2a1d]/60">جاري التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="p-8"><EmptyState title="لا توجد أصول" description="لا توجد أصول ضمن الفلترة الحالية." /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs text-[#0f2a1d]/70">
              <tr className="text-right">
                <th className="p-2">الكود</th><th className="p-2">الاسم</th>
                <th className="p-2">الفئة</th><th className="p-2">الطريقة</th>
                <th className="p-2">القيمة الدفترية الافتتاحية</th>
                <th className="p-2">الإهلاك الشهري</th>
                <th className="p-2">الختامية</th>
                <th className="p-2">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {rows.map((r) => (
                <tr key={r.asset_id} className="text-right hover:bg-[#faf9f4]">
                  <td className="p-2 font-mono text-xs">{r.code}</td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.category_name || "—"}</td>
                  <td className="p-2 text-xs">{r.method}</td>
                  <td className="p-2 tabular-nums">{money(r.opening_nbv)}</td>
                  <td className="p-2 tabular-nums font-medium">{money(r.depreciation)}</td>
                  <td className="p-2 tabular-nums">{money(r.closing_nbv)}</td>
                  <td className="p-2">
                    {r.already_posted ? <Badge tone="green">مُرحّل</Badge>
                      : r.reason ? <Badge tone="amber">{r.reason}</Badge>
                      : r.depreciation > 0 ? <Badge tone="blue">مؤهل</Badge>
                      : <Badge>—</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] overflow-x-auto">
        <div className="p-3 border-b border-[#eceae2] text-sm font-medium">دورات الإهلاك السابقة</div>
        {runs.length === 0 ? (
          <div className="p-8"><EmptyState title="لا توجد دورات بعد" description="بعد الترحيل الأول ستظهر هنا." /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs text-[#0f2a1d]/70">
              <tr className="text-right">
                <th className="p-2">الفترة</th><th className="p-2">عدد الأصول</th>
                <th className="p-2">الإجمالي</th><th className="p-2">الحالة</th>
                <th className="p-2">مذكرة</th><th className="p-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {runs.map((r) => (
                <tr key={r.id} className="text-right">
                  <td className="p-2">{r.period_end}</td>
                  <td className="p-2 tabular-nums">{r.asset_count}</td>
                  <td className="p-2 tabular-nums font-medium">{money(r.total_depreciation)}</td>
                  <td className="p-2">
                    {r.status === "posted" ? <Badge tone="green">مُرحّل</Badge> : <Badge tone="red">عُكس</Badge>}
                  </td>
                  <td className="p-2 text-xs text-[#0f2a1d]/70">{r.memo || "—"}</td>
                  <td className="p-2">
                    {r.status === "posted" && (
                      <button onClick={() => runReverse(r.id)}
                        className="inline-flex items-center gap-1 text-xs text-red-700 hover:bg-red-50 rounded px-2 py-1">
                        <RotateCcw className="w-3 h-3" /> عكس
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Lock, Unlock, CheckCircle2, AlertCircle } from "lucide-react";
import { Shell, PageHeader, OutlineBtn, Badge, money } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { listCalendar, reopenPeriod } from "@/lib/assets/depreciation.functions";

export const Route = createFileRoute("/assets/calendar")({
  head: () => ({ meta: [
    { title: "تقويم الإهلاك — الأصول الثابتة — حسيم" },
    { name: "description", content: "حالة ترحيل الإهلاك لكل شهر خلال السنة المالية." },
    { property: "og:title", content: "تقويم الإهلاك — حسيم" },
    { property: "og:description", content: "متابعة الفترات المرحّلة والمقفلة والمفتوحة." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

function Page() {
  const { currentOrg: org } = useOrg();
  const orgId = org?.id;
  const calFn = useServerFn(listCalendar);
  const reopenFn = useServerFn(reopenPeriod);

  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const r = await calFn({ data: { orgId, year } });
      setRows(r as any[]);
    } finally { setLoading(false); }
  }, [orgId, year, calFn]);

  useEffect(() => { load(); }, [load]);

  const doReopen = async (periodEnd: string) => {
    const reason = prompt("سبب إعادة فتح فترة الإهلاك؟");
    if (!reason) return;
    if (!orgId) return;
    try {
      await reopenFn({ data: { orgId, periodEnd, reason } });
      load();
    } catch (e: any) { alert(e.message || "فشل"); }
  };

  return (
    <Shell>
      <PageHeader
        title="تقويم الإهلاك"
        subtitle="حالة كل شهر خلال السنة المالية: مرحّل، مقفل، مفتوح، أو تم عكسه."
        action={
          <div className="flex gap-2">
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="border border-[#eceae2] rounded px-3 py-2 text-sm w-28" min={2000} max={2100} />
            <Link to="/assets/depreciation"><OutlineBtn>دورة الإهلاك</OutlineBtn></Link>
            <OutlineBtn onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</OutlineBtn>
          </div>
        }
      />

      <div className="rounded-xl bg-white border border-[#eceae2] overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#0f2a1d]/60">جاري التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#0f2a1d]/60">لا توجد فترات محاسبية معرَّفة لهذه السنة.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs text-[#0f2a1d]/70">
              <tr className="text-right">
                <th className="p-2">الفترة</th>
                <th className="p-2">من</th>
                <th className="p-2">إلى</th>
                <th className="p-2">حالة الفترة</th>
                <th className="p-2">إهلاك الأصول</th>
                <th className="p-2">الإجمالي المرحّل</th>
                <th className="p-2">دورات مُعكوسة</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {rows.map((r: any) => (
                <tr key={r.period_id} className="text-right hover:bg-[#faf9f4]">
                  <td className="p-2 font-medium">{r.period_name}</td>
                  <td className="p-2 text-xs">{r.start_date}</td>
                  <td className="p-2 text-xs">{r.end_date}</td>
                  <td className="p-2">
                    {r.period_status === "closed"
                      ? <Badge tone="red">مغلقة</Badge>
                      : <Badge tone="green">مفتوحة</Badge>}
                  </td>
                  <td className="p-2">
                    {r.fa_locked
                      ? <span className="inline-flex items-center gap-1 text-xs text-green-700"><Lock className="w-3 h-3" /> مقفلة (مُرحّلة)</span>
                      : Number(r.posted_runs) > 0
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="w-3 h-3" /> مرحّلة</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-amber-700"><AlertCircle className="w-3 h-3" /> غير مرحّلة</span>}
                  </td>
                  <td className="p-2 tabular-nums">{money(Number(r.posted_total || 0))}</td>
                  <td className="p-2 tabular-nums text-xs">{r.reversed_runs || 0}</td>
                  <td className="p-2">
                    {r.fa_locked && (
                      <button onClick={() => doReopen(r.end_date)}
                        className="inline-flex items-center gap-1 text-xs text-amber-700 hover:bg-amber-50 rounded px-2 py-1">
                        <Unlock className="w-3 h-3" /> إعادة فتح
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

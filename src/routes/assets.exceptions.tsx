import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Shell, PageHeader, OutlineBtn, StatCard, Badge, money, EmptyState } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { listExceptions } from "@/lib/assets/depreciation.functions";

export const Route = createFileRoute("/assets/exceptions")({
  head: () => ({ meta: [
    { title: "استثناءات الأصول — كنار المحاسبية" },
    { name: "description", content: "لوحة تشخيص الأصول المحتاجة تدخّل قبل ترحيل الإهلاك." },
    { property: "og:title", content: "استثناءات الأصول — كنار المحاسبية" },
    { property: "og:description", content: "أصول ناقصة الحسابات، بدون عمر إنتاجي، جاهزة ولم تبدأ، أو مستهلكة بالكامل." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

const LABELS: Record<string, { ar: string; tone: "red" | "amber" | "blue" }> = {
  missing_gl_accounts: { ar: "حسابات GL ناقصة", tone: "red" },
  missing_useful_life: { ar: "عمر إنتاجي غير محدد", tone: "red" },
  invalid_salvage: { ar: "قيمة متبقية غير منطقية", tone: "amber" },
  ready_not_started: { ar: "جاهز ولم يبدأ الإهلاك", tone: "amber" },
  fully_depreciated_active: { ar: "مستهلك بالكامل — نشط", tone: "blue" },
};

function Page() {
  const { currentOrg: org } = useOrg();
  const orgId = org?.id;
  const excFn = useServerFn(listExceptions);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("");

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const r = await excFn({ data: { orgId } });
      setRows(r as any[]);
    } finally { setLoading(false); }
  }, [orgId, excFn]);

  useEffect(() => { load(); }, [load]);

  const buckets = useMemo(() => {
    const b: Record<string, number> = {};
    rows.forEach((r) => { b[r.exception_type] = (b[r.exception_type] || 0) + 1; });
    return b;
  }, [rows]);

  const filtered = useMemo(() =>
    filter ? rows.filter((r) => r.exception_type === filter) : rows,
    [rows, filter]);

  return (
    <Shell>
      <PageHeader
        title="لوحة استثناءات الأصول"
        subtitle="أصول تحتاج معالجة قبل الترحيل الشهري للإهلاك."
        action={
          <div className="flex gap-2">
            <Link to="/assets/depreciation"><OutlineBtn>دورة الإهلاك</OutlineBtn></Link>
            <OutlineBtn onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</OutlineBtn>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <button onClick={() => setFilter("")} className="text-right">
          <StatCard label="الكل" value={String(rows.length)} />
        </button>
        {Object.entries(LABELS).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)} className="text-right">
            <StatCard label={v.ar} value={String(buckets[k] || 0)} />
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#0f2a1d]/60">جاري التحميل…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8"><EmptyState title="لا توجد استثناءات" description="جميع الأصول ضمن الفلترة الحالية جاهزة للترحيل." /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs text-[#0f2a1d]/70">
              <tr className="text-right">
                <th className="p-2">الكود</th>
                <th className="p-2">الاسم</th>
                <th className="p-2">التكلفة</th>
                <th className="p-2">العمر (شهر)</th>
                <th className="p-2">الطريقة</th>
                <th className="p-2">تاريخ التشغيل</th>
                <th className="p-2">الاستثناء</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {filtered.map((r: any) => {
                const info = LABELS[r.exception_type] || { ar: r.exception_type, tone: "amber" as const };
                return (
                  <tr key={r.asset_id} className="text-right hover:bg-[#faf9f4]">
                    <td className="p-2 font-mono text-xs">{r.code}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 tabular-nums">{money(Number(r.acquisition_cost || 0))}</td>
                    <td className="p-2 tabular-nums">{r.useful_life_months ?? "—"}</td>
                    <td className="p-2 text-xs">{r.method || "—"}</td>
                    <td className="p-2 text-xs">{r.in_service_date || "—"}</td>
                    <td className="p-2">
                      <Badge tone={info.tone}>
                        <AlertTriangle className="w-3 h-3 inline ml-1" />
                        {info.ar}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <Link to="/assets" className="text-xs text-[#0f2a1d]/70 hover:underline">فتح</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}


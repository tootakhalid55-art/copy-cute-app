import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useOrg } from "@/lib/db/org";
import { CHECK_LABELS, loadLatestHealth, runHealthCheck, type HealthCheck } from "@/lib/accounting/health";
import { timed } from "@/lib/obs";

export const Route = createFileRoute("/settings/finance-health")({
  head: () => ({
    meta: [
      { title: "الحالة المالية والفحص التلقائي — حسيم" },
      { name: "description", content: "لوحة فحص سلامة القيود المحاسبية والتسويات والأرصدة المفتوحة." },
    ],
  }),
  component: FinanceHealthPage,
});

function severityColor(s: string) {
  return s === "ok" ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : s === "warn" ? "bg-amber-50 text-amber-900 border-amber-200"
    : "bg-red-50 text-red-800 border-red-200";
}

function FinanceHealthPage() {
  const { currentOrgId } = useOrg();
  const [rows, setRows] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const load = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try { setRows(await timed("health.load_latest", () => loadLatestHealth(currentOrgId))); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentOrgId]);

  const runNow = async () => {
    if (!currentOrgId) return;
    setRunning(true);
    try {
      const fresh = await timed("health.run_now", () => runHealthCheck(currentOrgId));
      setRows(fresh);
    } finally { setRunning(false); }
  };

  const totalIssues = rows.reduce((s, r) => s + (r.severity !== "ok" ? r.issue_count : 0), 0);
  const worst = rows.some(r => r.severity === "error") ? "error" : rows.some(r => r.severity === "warn") ? "warn" : "ok";
  const ORDER = Object.keys(CHECK_LABELS);
  const sorted = [...rows].sort((a,b) => ORDER.indexOf(a.check_name) - ORDER.indexOf(b.check_name));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">لوحة سلامة النظام المالي</h1>
          <p className="text-sm text-muted-foreground">فحوصات دورية لضمان توازن القيود، سلامة التسويات، والأرصدة المفتوحة.</p>
        </div>
        <button onClick={runNow} disabled={running || !currentOrgId}
          className="px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50">
          {running ? "جاري التنفيذ…" : "تشغيل الفحص الآن"}
        </button>
      </div>

      <div className={`border rounded-lg p-4 ${severityColor(worst)}`}>
        <div className="text-sm">الحالة الإجمالية</div>
        <div className="text-2xl font-bold">
          {worst === "ok" ? "سليم" : worst === "warn" ? `تحذيرات (${totalIssues})` : `أخطاء (${totalIssues})`}
        </div>
        <div className="text-xs opacity-80 mt-1">
          آخر تحديث: {rows[0]?.ran_at ? new Date(rows[0].ran_at).toLocaleString() : "—"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ORDER.map((name) => {
          const r = sorted.find(x => x.check_name === name);
          const sev = r?.severity ?? "ok";
          const isOpen = openRow === name;
          return (
            <div key={name} className={`border rounded-lg p-4 ${severityColor(sev)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm opacity-80">{CHECK_LABELS[name]}</div>
                  <div className="text-2xl font-bold">{r?.issue_count ?? 0}</div>
                </div>
                <div className="text-xs uppercase tracking-wide">{sev}</div>
              </div>
              {r && r.issue_count > 0 && (
                <button className="mt-2 text-xs underline"
                  onClick={() => setOpenRow(isOpen ? null : name)}>
                  {isOpen ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                </button>
              )}
              {isOpen && r && (
                <pre className="mt-2 max-h-56 overflow-auto text-xs bg-white/50 rounded p-2">
                  {JSON.stringify(r.details?.rows ?? [], null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {loading && <div className="text-sm text-muted-foreground">جاري التحميل…</div>}

      <div className="text-xs text-muted-foreground pt-2 border-t">
        يعمل الفحص التلقائي يومياً في الساعة 02:15 UTC ويُدوّن اللقطات في جدول <code>finance_health_snapshots</code>.
      </div>
    </div>
  );
}

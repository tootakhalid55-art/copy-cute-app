import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Bot, RefreshCw } from "lucide-react";
import { Shell, PageHeader, OutlineBtn, EmptyState } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { listCopilotDecisions } from "@/lib/ap/copilot.functions";

export const Route = createFileRoute("/purchases/ap-copilot")({
  head: () => ({ meta: [
    { title: "سجل قرارات مساعد الذكاء المالي — حسيم" },
    { name: "description", content: "كل قرار وشرح وتوصية من مساعد الذكاء المالي على فواتير الموردين." },
  ]}),
  component: Page,
});

const KIND_LABEL: Record<string, string> = {
  supplier_match: "مطابقة المورد",
  duplicate: "فحص التكرار",
  vat_validation: "فحص الضريبة",
  suggest_posting: "اقتراح الترحيل",
  confidence: "شرح الثقة",
  summary: "ملخص",
  anomalies: "شذوذ",
  recommend_approval: "توصية اعتماد",
  chat: "محادثة",
};

function Page() {
  const { org } = useOrg();
  const list = useServerFn(listCopilotDecisions);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("");

  async function load() {
    if (!org?.id) return;
    setLoading(true);
    try {
      const r = await list({ data: { orgId: org.id, limit: 200 } }) as any[];
      setRows(r);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [org?.id]);

  const shown = filter ? rows.filter((r) => r.kind === filter) : rows;

  return (
    <Shell>
      <div className="p-6 space-y-4">
        <PageHeader
          icon={<Bot className="w-5 h-5" />}
          title="سجل قرارات مساعد الذكاء المالي"
          subtitle="كل توصية وشرح موقّع بالوقت — للتدقيق."
          actions={<OutlineBtn onClick={load}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> تحديث</OutlineBtn>}
        />

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter("")}
            className={`text-xs px-2 py-1 rounded-full border ${!filter ? "bg-[#0f2a1d] text-white border-[#0f2a1d]" : "border-[#eceae2]"}`}>الكل</button>
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`text-xs px-2 py-1 rounded-full border ${filter === k ? "bg-[#0f2a1d] text-white border-[#0f2a1d]" : "border-[#eceae2]"}`}>{v}</button>
          ))}
        </div>

        {shown.length === 0 ? (
          <EmptyState title="لا توجد قرارات بعد" subtitle="ابدأ باستخدام المساعد من صفحة مراجعة الفواتير." />
        ) : (
          <div className="space-y-2">
            {shown.map((r) => (
              <div key={r.id} className="rounded-lg border border-[#eceae2] bg-white p-3">
                <div className="flex items-center justify-between text-xs text-[#0f2a1d]/60 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f7f6f0] font-medium text-[#0f2a1d]">
                      <Bot className="w-3 h-3" /> {KIND_LABEL[r.kind] || r.kind}
                    </span>
                    {r.recommendation && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{r.recommendation}</span>
                    )}
                    {r.confidence != null && <span>ثقة {Math.round(r.confidence)}%</span>}
                    {r.language && <span className="uppercase">{r.language}</span>}
                  </div>
                  <span>{new Date(r.created_at).toLocaleString("ar-SA")}</span>
                </div>
                {r.question && <div className="text-xs mb-1 text-[#0f2a1d]/80">س: {r.question}</div>}
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{r.answer}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

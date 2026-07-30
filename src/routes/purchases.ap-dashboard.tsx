// AP intake dashboard — queue depth, OCR accuracy, processing time, duplicates,
// per-supplier extraction quality. Read-only, realtime.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/db/org";
import { Shell } from "@/components/haseem/Shell";
import { useCollectionChangedListener } from "@/lib/db/collection-events";

export const Route = createFileRoute("/purchases/ap-dashboard")({
  component: ApDashboard,
  head: () => ({
    meta: [
      { title: "لوحة معالجة فواتير الموردين | كنار المحاسبية" },
      { name: "description", content: "مؤشرات جودة استخراج الذكاء الاصطناعي وطابور المعالجة" },
    ],
  }),
});

type Metrics = {
  total: number; review_queue: number; auto_drafted: number; duplicates: number;
  failed: number; posted: number; avg_confidence: number | null; avg_processing_ms: number | null;
};

function ApDashboard() {
  const { currentOrg } = useOrg();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [queue, setQueue] = useState<{ status: string; count: number }[]>([]);
  const [bySupplier, setBySupplier] = useState<any[]>([]);

  useEffect(() => {
    if (!currentOrg?.id) return;
    const load = async () => {
      const { data: m } = await supabase
        .from("ap_intake_metrics")
        .select("*")
        .eq("org_id", currentOrg.id)
        .maybeSingle();
      if (m) setMetrics(m as any);

      const { data: q } = await supabase
        .from("ap_intake_queue")
        .select("status")
        .eq("org_id", currentOrg.id);
      const agg: Record<string, number> = {};
      (q || []).forEach((r: any) => { agg[r.status] = (agg[r.status] || 0) + 1; });
      setQueue(Object.entries(agg).map(([status, count]) => ({ status, count })));

      const { data: sup } = await supabase
        .from("ap_intake_documents")
        .select("matched_party_id, confidence, processing_time_ms, status")
        .eq("org_id", currentOrg.id)
        .not("matched_party_id", "is", null)
        .limit(500);
      const groups: Record<string, { n: number; sc: number; st: number; posted: number }> = {};
      (sup || []).forEach((r: any) => {
        const k = r.matched_party_id;
        groups[k] ||= { n: 0, sc: 0, st: 0, posted: 0 };
        groups[k].n++;
        if (r.confidence) groups[k].sc += r.confidence;
        if (r.processing_time_ms) groups[k].st += r.processing_time_ms;
        if (r.status === "posted") groups[k].posted++;
      });
      const ids = Object.keys(groups);
      if (ids.length) {
        const { data: parties } = await supabase
          .from("parties").select("id, name").in("id", ids);
        setBySupplier((parties || []).map((p: any) => ({
          name: p.name, n: groups[p.id].n,
          avg_conf: groups[p.id].sc / Math.max(1, groups[p.id].n),
          avg_ms: groups[p.id].st / Math.max(1, groups[p.id].n),
          posted: groups[p.id].posted,
        })).sort((a, b) => b.n - a.n).slice(0, 15));
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [currentOrg?.id]);
  useCollectionChangedListener(["suppliers"], () => {
    if (currentOrg?.id) {
      void (async () => {
        const { data: m } = await supabase
          .from("ap_intake_documents")
          .select("id")
          .eq("org_id", currentOrg.id);
        const { data: sup } = await supabase
          .from("ap_intake_documents")
          .select("matched_party_id, confidence, processing_time_ms, status")
          .eq("org_id", currentOrg.id)
          .not("matched_party_id", "is", null);
        const agg: Record<string, { n: number; sc: number; st: number; posted: number }> = {};
        (sup || []).forEach((r: any) => {
          const k = String(r.matched_party_id);
          if (!agg[k]) agg[k] = { n: 0, sc: 0, st: 0, posted: 0 };
          agg[k].n++;
          agg[k].sc += Number(r.confidence || 0);
          if (r.processing_time_ms) agg[k].st += r.processing_time_ms;
          if (r.status === "posted") agg[k].posted++;
        });
        setMetrics({
          queue: (m || []).length,
          matched: (sup || []).length,
        } as any);
        const ids = Object.keys(agg);
        if (ids.length) {
          const { data: parties } = await supabase
            .from("parties").select("id, name").in("id", ids);
          setBySupplier((parties || []).map((p: any) => ({
            name: p.name,
            n: agg[p.id].n,
            avg_conf: agg[p.id].sc / Math.max(1, agg[p.id].n),
            avg_ms: agg[p.id].st / Math.max(1, agg[p.id].n),
            posted: agg[p.id].posted,
          })).sort((a, b) => b.n - a.n).slice(0, 15));
        }
      })();
    }
  });

  return (
    <Shell>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">لوحة معالجة الفواتير</h1>
          <p className="text-sm text-[#0f2a1d]/60">مؤشرات الذكاء الاصطناعي والطابور</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["الإجمالي", metrics?.total ?? 0],
            ["للمراجعة", metrics?.review_queue ?? 0],
            ["مسودات تلقائية", metrics?.auto_drafted ?? 0],
            ["مكررة", metrics?.duplicates ?? 0],
            ["فاشلة", metrics?.failed ?? 0],
            ["مرحّلة", metrics?.posted ?? 0],
            ["دقة OCR (%)", metrics?.avg_confidence != null ? Math.round(metrics.avg_confidence * 100) : "—"],
            ["زمن المعالجة (ثوانٍ)", metrics?.avg_processing_ms != null ? Math.round(metrics.avg_processing_ms / 1000) : "—"],
          ].map(([l, v]) => (
            <div key={String(l)} className="rounded-xl bg-white border border-[#eceae2] p-3">
              <div className="text-xs text-[#0f2a1d]/60">{l}</div>
              <div className="text-2xl font-bold tabular-nums">{v as any}</div>
            </div>
          ))}
        </div>

        <section className="rounded-xl bg-white border border-[#eceae2] p-4">
          <h2 className="font-semibold mb-3">طابور المعالجة</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {["queued", "processing", "done", "failed", "dead"].map((k) => {
              const r = queue.find((q) => q.status === k);
              return (
                <div key={k} className="rounded-lg bg-[#faf9f4] p-3">
                  <div className="text-xs text-[#0f2a1d]/60">{k}</div>
                  <div className="text-xl font-bold tabular-nums">{r?.count || 0}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
          <h2 className="font-semibold p-4 border-b border-[#eceae2]">جودة الاستخراج حسب المورد</h2>
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs">
              <tr className="text-right">
                <th className="p-2.5">المورد</th>
                <th>الفواتير</th>
                <th>متوسط الثقة</th>
                <th>متوسط الزمن</th>
                <th>مرحّلة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {bySupplier.length === 0 && (
                <tr><td className="p-6 text-center text-[#0f2a1d]/60" colSpan={5}>لا توجد بيانات بعد</td></tr>
              )}
              {bySupplier.map((s) => (
                <tr key={s.name} className="text-right">
                  <td className="p-2.5">{s.name}</td>
                  <td className="p-2.5 tabular-nums">{s.n}</td>
                  <td className="p-2.5 tabular-nums">{Math.round(s.avg_conf * 100)}%</td>
                  <td className="p-2.5 tabular-nums">{Math.round(s.avg_ms / 1000)} ث</td>
                  <td className="p-2.5 tabular-nums">{s.posted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}


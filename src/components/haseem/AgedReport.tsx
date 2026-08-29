// Shared aged-balances report backed by the settlement engine
// (get_aging_buckets over document_open_balances), replacing the old
// name-matched localStorage approximation.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/db/org";
import { getAgingBuckets, type AgingRow } from "@/lib/accounting/settlement";
import { ReportShell, ReportTable, money } from "./ReportShell";

export function AgedReport({
  partyType,
  title,
  subtitle,
  partyLabel,
}: {
  partyType: "customer" | "supplier";
  title: string;
  subtitle: string;
  partyLabel: string;
}) {
  const { currentOrgId } = useOrg();
  const [asof, setAsof] = useState(new Date().toISOString().slice(0, 10));
  const [aging, setAging] = useState<AgingRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    Promise.all([
      getAgingBuckets({ orgId: currentOrgId, partyType, asof }),
      supabase.from("parties").select("id,name").eq("org_id", currentOrgId).then(({ data }) => data ?? []),
    ])
      .then(([rows, parties]) => {
        setAging(rows);
        setNames(Object.fromEntries((parties as any[]).map((p) => [p.id, p.name])));
      })
      .catch(() => setAging([]))
      .finally(() => setLoading(false));
  }, [currentOrgId, partyType, asof]);

  const rows = useMemo(
    () =>
      aging
        .map((r) => ({ ...r, name: names[r.party_id] ?? "—" }))
        .filter((r) => Number(r.total) > 0.009)
        .sort((a, b) => Number(b.total) - Number(a.total)),
    [aging, names],
  );
  const t = rows.reduce(
    (s, r) => ({
      cur: s.cur + Number(r.current_amt || 0),
      a: s.a + Number(r.d1_30 || 0),
      b: s.b + Number(r.d31_60 || 0),
      c: s.c + Number(r.d61_90 || 0),
      d: s.d + Number(r.d91_plus || 0),
      total: s.total + Number(r.total || 0),
    }),
    { cur: 0, a: 0, b: 0, c: 0, d: 0, total: 0 },
  );

  return (
    <ReportShell
      title={title}
      subtitle={subtitle}
      filters={
        <label className="flex items-center gap-2 text-xs">
          <span>حتى تاريخ</span>
          <input type="date" value={asof} onChange={(e) => setAsof(e.target.value)}
            className="border border-[#eceae2] rounded-lg px-2 py-1.5" />
        </label>
      }
      exportRows={() => ({
        headers: [partyLabel, "غير مستحق", "1-30", "31-60", "61-90", "أكثر من 90", "الإجمالي"],
        rows: rows.map((r) => [r.name, r.current_amt, r.d1_30, r.d31_60, r.d61_90, r.d91_plus, r.total]),
      })}
    >
      {loading ? (
        <div className="text-sm text-[#0f2a1d]/60 p-4">جارٍ التحميل…</div>
      ) : (
        <ReportTable
          headers={[partyLabel, "غير مستحق", "1-30 يوم", "31-60", "61-90", "أكثر من 90", "الإجمالي"]}
          rows={rows.map((r) => [
            r.name,
            money(Number(r.current_amt)),
            money(Number(r.d1_30)),
            money(Number(r.d31_60)),
            money(Number(r.d61_90)),
            money(Number(r.d91_plus)),
            <strong key="t">{money(Number(r.total))}</strong>,
          ])}
          totalsRow={["الإجمالي", money(t.cur), money(t.a), money(t.b), money(t.c), money(t.d), money(t.total)]}
        />
      )}
      <div className="text-xs text-[#0f2a1d]/50 mt-2">
        الأرصدة محسوبة من محرك التسويات (المستندات المرحّلة مطروحاً منها التخصيصات) حسب تاريخ الاستحقاق.
      </div>
    </ReportShell>
  );
}

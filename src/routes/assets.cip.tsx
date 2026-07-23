import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Wrench, ArrowRight } from "lucide-react";
import { Shell, PageHeader, OutlineBtn, PrimaryBtn, EmptyState, Badge, money } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { listAssets, upsertAsset } from "@/lib/assets/registry.functions";

export const Route = createFileRoute("/assets/cip")({
  head: () => ({ meta: [
    { title: "أصول تحت الإنشاء (CIP) — حسيم" },
    { name: "description", content: "متابعة الأصول تحت الإنشاء وترقيتها إلى أصول نشطة عند التشغيل." },
    { property: "og:title", content: "أصول تحت الإنشاء — حسيم" },
    { property: "og:description", content: "متابعة الأصول تحت الإنشاء (CIP)." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

function Page() {
  const { currentOrg: org } = useOrg();
  const orgId = org?.id;
  const listFn = useServerFn(listAssets);
  const saveFn = useServerFn(upsertAsset);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [inService, setInService] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const r = await listFn({ data: { orgId, cip: true } }) as any[];
      setRows(r);
    } finally { setLoading(false); }
  }, [orgId, listFn]);

  useEffect(() => { load(); }, [load]);

  const activate = async (row: any) => {
    if (!orgId) return;
    const date = inService[row.id] || new Date().toISOString().slice(0, 10);
    await saveFn({ data: {
      id: row.id, orgId,
      name: row.name, code: row.code, is_cip: false,
      in_service_date: date, status: "active",
      acquisition_cost: row.acquisition_cost, residual_value: row.residual_value,
      useful_life_months: row.useful_life_months, method: row.method,
      currency: row.currency,
    }});
    load();
  };

  return (
    <Shell>
      <PageHeader
        title="أصول تحت الإنشاء (CIP)"
        subtitle="بمجرد تشغيل الأصل، أدخل تاريخ التشغيل لترقيته إلى أصل نشط يخضع للإهلاك."
        action={<Link to="/assets"><OutlineBtn>سجل الأصول</OutlineBtn></Link>}
      />

      {loading ? (
        <div className="p-10 text-center text-sm text-[#0f2a1d]/60">جاري التحميل…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Wrench} title="لا توجد أصول تحت الإنشاء"
          description="سجّل أصلًا وحدّد خانة (CIP) لظهوره هنا حتى اكتمال التشغيل." />
      ) : (
        <div className="rounded-xl bg-white border border-[#eceae2] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs text-[#0f2a1d]/70">
              <tr className="text-right">
                <th className="p-3">الكود</th><th className="p-3">الاسم</th>
                <th className="p-3">التكلفة</th><th className="p-3">المورد</th>
                <th className="p-3">تاريخ التشغيل</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {rows.map((r) => (
                <tr key={r.id} className="text-right hover:bg-[#faf9f4]">
                  <td className="p-3 font-mono text-xs">{r.code}</td>
                  <td className="p-3">
                    <div className="font-medium">{r.name}</div>
                    <Badge tone="amber">تحت الإنشاء</Badge>
                  </td>
                  <td className="p-3 tabular-nums">{money(r.acquisition_cost)}</td>
                  <td className="p-3">{r.supplier_name || "—"}</td>
                  <td className="p-3">
                    <input type="date"
                      value={inService[r.id] || ""}
                      onChange={(e) => setInService((s) => ({ ...s, [r.id]: e.target.value }))}
                      className="border border-[#eceae2] rounded px-2 py-1 text-sm" />
                  </td>
                  <td className="p-3">
                    <PrimaryBtn onClick={() => activate(r)}>
                      <ArrowRight className="w-4 h-4" /> تشغيل الأصل
                    </PrimaryBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

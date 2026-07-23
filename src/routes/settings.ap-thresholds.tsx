import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, EmptyState } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { supabase } from "@/integrations/supabase/client";
import { listThresholds, upsertThreshold, deleteThreshold } from "@/lib/ap/thresholds.functions";

export const Route = createFileRoute("/settings/ap-thresholds")({
  head: () => ({ meta: [
    { title: "حدود اعتماد فواتير الموردين — حسيم" },
    { name: "description", content: "إدارة قواعد الاعتماد التلقائية بحسب المبلغ والمورد والفرع" },
  ]}),
  component: Page,
});

type Row = {
  id: string; name: string; min_amount: number; max_amount: number | null;
  party_id: string | null; branch_id: string | null;
  required_levels: number; auto_post: boolean; active: boolean; priority: number;
};

function Page() {
  const { currentOrg: org } = useOrg();
  const list = useServerFn(listThresholds);
  const save = useServerFn(upsertThreshold);
  const del = useServerFn(deleteThreshold);
  const [rows, setRows] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!org?.id) return;
    setLoading(true);
    const [r, s, b] = await Promise.all([
      list({ data: { orgId: org.id } }) as Promise<Row[]>,
      supabase.from("parties").select("id, name").eq("org_id", org.id).eq("type", "supplier").order("name"),
      supabase.from("branches").select("id, name").eq("org_id", org.id).order("name"),
    ]);
    setRows(r as Row[]);
    setSuppliers((s.data as any) || []);
    setBranches((b.data as any) || []);
    setLoading(false);
  }, [org?.id, list]);

  useEffect(() => { load(); }, [load]);

  const addRow = () => setRows((r) => [
    { id: "", name: "قاعدة جديدة", min_amount: 0, max_amount: null, party_id: null,
      branch_id: null, required_levels: 1, auto_post: false, active: true, priority: 100 },
    ...r,
  ]);

  const update = (idx: number, patch: Partial<Row>) =>
    setRows((r) => r.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const persist = async (row: Row) => {
    if (!org?.id) return;
    await save({ data: { ...row, orgId: org.id, id: row.id || undefined } });
    load();
  };

  const remove = async (row: Row) => {
    if (!row.id) { setRows((r) => r.filter((x) => x !== row)); return; }
    if (!confirm("حذف القاعدة؟")) return;
    await del({ data: { id: row.id } });
    load();
  };

  return (
    <Shell>
      <PageHeader
        title="حدود اعتماد الفواتير"
        subtitle="قواعد الاعتماد التلقائية بحسب المبلغ والمورد والفرع — الأولوية الأقل رقمًا تُطبق أولًا"
        action={<PrimaryBtn onClick={addRow}><Plus className="w-4 h-4" /> قاعدة جديدة</PrimaryBtn>}
      />
      <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#0f2a1d]/60">جاري التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="p-8"><EmptyState title="لا توجد قواعد" description="أضف قاعدة اعتماد لتفعيل الترحيل التلقائي" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs">
              <tr className="text-right">
                <th className="p-2">الاسم</th><th>من</th><th>إلى</th>
                <th>المورد</th><th>الفرع</th><th>المستويات</th>
                <th>ترحيل تلقائي</th><th>مفعّل</th><th>الأولوية</th><th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {rows.map((r, i) => (
                <tr key={r.id || `new-${i}`} className="text-right">
                  <td className="p-2"><input value={r.name} onChange={(e) => update(i, { name: e.target.value })}
                    className="w-full border border-[#eceae2] rounded px-2 py-1 text-sm" /></td>
                  <td className="p-2"><input type="number" value={r.min_amount}
                    onChange={(e) => update(i, { min_amount: Number(e.target.value) })}
                    className="w-24 border border-[#eceae2] rounded px-2 py-1 text-sm tabular-nums" /></td>
                  <td className="p-2"><input type="number" value={r.max_amount ?? ""}
                    placeholder="∞"
                    onChange={(e) => update(i, { max_amount: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-24 border border-[#eceae2] rounded px-2 py-1 text-sm tabular-nums" /></td>
                  <td className="p-2">
                    <select value={r.party_id || ""} onChange={(e) => update(i, { party_id: e.target.value || null })}
                      className="border border-[#eceae2] rounded px-2 py-1 text-sm">
                      <option value="">كل الموردين</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <select value={r.branch_id || ""} onChange={(e) => update(i, { branch_id: e.target.value || null })}
                      className="border border-[#eceae2] rounded px-2 py-1 text-sm">
                      <option value="">كل الفروع</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2"><input type="number" min={1} max={5} value={r.required_levels}
                    onChange={(e) => update(i, { required_levels: Number(e.target.value) })}
                    className="w-16 border border-[#eceae2] rounded px-2 py-1 text-sm tabular-nums" /></td>
                  <td className="p-2 text-center"><input type="checkbox" checked={r.auto_post}
                    onChange={(e) => update(i, { auto_post: e.target.checked })} /></td>
                  <td className="p-2 text-center"><input type="checkbox" checked={r.active}
                    onChange={(e) => update(i, { active: e.target.checked })} /></td>
                  <td className="p-2"><input type="number" value={r.priority}
                    onChange={(e) => update(i, { priority: Number(e.target.value) })}
                    className="w-16 border border-[#eceae2] rounded px-2 py-1 text-sm tabular-nums" /></td>
                  <td className="p-2 whitespace-nowrap">
                    <button onClick={() => persist(r)}
                      className="p-1.5 rounded hover:bg-emerald-50 text-emerald-700"><Save className="w-4 h-4" /></button>
                    <button onClick={() => remove(r)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-700"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="text-xs text-[#0f2a1d]/60 mt-3">
        القاعدة الأولى المطابقة (بحسب الأولوية) هي التي تُطبق. اترك "المورد" و"الفرع" فارغين للتطبيق العام.
      </div>
    </Shell>
  );
}

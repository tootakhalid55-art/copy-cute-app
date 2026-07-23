import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, EmptyState } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { listCategories, upsertCategory, deleteCategory } from "@/lib/assets/registry.functions";

export const Route = createFileRoute("/assets/categories")({
  head: () => ({ meta: [
    { title: "فئات الأصول الثابتة — حسيم" },
    { name: "description", content: "إدارة تصنيفات الأصول الثابتة وافتراضات الإهلاك ونموذج التقييم." },
    { property: "og:title", content: "فئات الأصول الثابتة — حسيم" },
    { property: "og:description", content: "افتراضات الإهلاك ونموذج التقييم لكل فئة." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

type Row = {
  id: string; code: string; name: string; name_en: string | null;
  default_useful_life_months: number | null; default_method: string;
  default_salvage_pct: number; revaluation_model: string; is_active: boolean;
};

function Page() {
  const { currentOrg: org } = useOrg();
  const orgId = org?.id;
  const listFn = useServerFn(listCategories);
  const saveFn = useServerFn(upsertCategory);
  const delFn = useServerFn(deleteCategory);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const r = await listFn({ data: { orgId } }) as Row[];
      setRows(r);
    } finally { setLoading(false); }
  }, [orgId, listFn]);

  useEffect(() => { load(); }, [load]);

  const addRow = () => setRows((r) => [
    { id: "", code: "", name: "فئة جديدة", name_en: "", default_useful_life_months: 60,
      default_method: "straight_line", default_salvage_pct: 0, revaluation_model: "cost", is_active: true },
    ...r,
  ]);

  const upd = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const persist = async (r: Row) => {
    if (!orgId || !r.code || !r.name) { alert("الكود والاسم مطلوبان"); return; }
    await saveFn({ data: { ...r, orgId, id: r.id || undefined } });
    load();
  };

  const remove = async (r: Row) => {
    if (!r.id) { setRows((rows) => rows.filter((x) => x !== r)); return; }
    if (!confirm("حذف الفئة؟")) return;
    await delFn({ data: { id: r.id } });
    load();
  };

  return (
    <Shell>
      <PageHeader
        title="فئات الأصول الثابتة"
        subtitle="افتراضات العمر الإنتاجي وطريقة الإهلاك ونموذج التقييم — تُطبّق على الأصول الجديدة داخل الفئة."
        action={
          <div className="flex gap-2">
            <Link to="/assets"><OutlineBtn>سجل الأصول</OutlineBtn></Link>
            <PrimaryBtn onClick={addRow}><Plus className="w-4 h-4" /> فئة جديدة</PrimaryBtn>
          </div>
        }
      />

      <div className="rounded-xl bg-white border border-[#eceae2] overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#0f2a1d]/60">جاري التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="p-8"><EmptyState title="لا توجد فئات بعد" description="أضف فئة لتوحيد افتراضات الإهلاك." /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs">
              <tr className="text-right">
                <th className="p-2">الكود</th><th>الاسم</th><th>Name (EN)</th>
                <th>العمر (شهور)</th><th>طريقة الإهلاك</th>
                <th>نسبة القيمة المتبقية</th><th>نموذج التقييم</th><th>مفعّل</th><th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {rows.map((r, i) => (
                <tr key={r.id || `n-${i}`} className="text-right">
                  <td className="p-2"><input value={r.code} onChange={(e) => upd(i, { code: e.target.value })} className="w-24 ip" /></td>
                  <td className="p-2"><input value={r.name} onChange={(e) => upd(i, { name: e.target.value })} className="ip" /></td>
                  <td className="p-2"><input value={r.name_en || ""} onChange={(e) => upd(i, { name_en: e.target.value })} className="ip" /></td>
                  <td className="p-2"><input type="number" value={r.default_useful_life_months ?? ""} onChange={(e) => upd(i, { default_useful_life_months: e.target.value === "" ? null : Number(e.target.value) })} className="w-20 ip tabular-nums" /></td>
                  <td className="p-2">
                    <select value={r.default_method} onChange={(e) => upd(i, { default_method: e.target.value })} className="ip">
                      <option value="straight_line">قسط ثابت</option>
                      <option value="declining_balance">متناقص</option>
                      <option value="double_declining">متناقص مضاعف</option>
                      <option value="units_of_production">وحدات إنتاج</option>
                      <option value="manual">يدوي</option>
                      <option value="none">بدون</option>
                    </select>
                  </td>
                  <td className="p-2"><input type="number" step="0.001" value={r.default_salvage_pct} onChange={(e) => upd(i, { default_salvage_pct: Number(e.target.value) })} className="w-20 ip tabular-nums" /></td>
                  <td className="p-2">
                    <select value={r.revaluation_model} onChange={(e) => upd(i, { revaluation_model: e.target.value })} className="ip">
                      <option value="cost">التكلفة</option>
                      <option value="revaluation">إعادة التقييم</option>
                    </select>
                  </td>
                  <td className="p-2 text-center"><input type="checkbox" checked={r.is_active} onChange={(e) => upd(i, { is_active: e.target.checked })} /></td>
                  <td className="p-2 whitespace-nowrap">
                    <button onClick={() => persist(r)} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-700"><Save className="w-4 h-4" /></button>
                    <button onClick={() => remove(r)} className="p-1.5 rounded hover:bg-red-50 text-red-700"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <style>{`.ip{border:1px solid #eceae2;border-radius:6px;padding:4px 8px;font-size:13px;background:white}`}</style>
      </div>
    </Shell>
  );
}

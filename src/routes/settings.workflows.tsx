import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Plus, Save, Trash2, GripVertical } from "lucide-react";
import { Shell } from "@/components/haseem/Shell";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/db/org";

export const Route = createFileRoute("/settings/workflows")({
  head: () => ({
    meta: [
      { title: "سير الاعتماد — الإعدادات" },
      { name: "description", content: "إدارة قواعد اعتماد المستندات (المبلغ، الدور، المستخدم، تسلسلي/متوازي)." },
    ],
  }),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const { currentOrgId } = useOrg();
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [steps, setSteps] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    const { data } = await supabase
      .from("approval_workflows")
      .select("*")
      .eq("org_id", currentOrgId)
      .order("created_at", { ascending: true });
    setRows(data ?? []);
  }, [currentOrgId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadSteps = useCallback(async (wfId: string) => {
    const { data } = await supabase
      .from("approval_steps")
      .select("*")
      .eq("workflow_id", wfId)
      .order("step_order");
    setSteps(data ?? []);
  }, []);

  const create = async () => {
    if (!currentOrgId) return;
    const { data } = await (supabase.from("approval_workflows") as any)
      .insert({
        org_id: currentOrgId,
        name: "سير جديد",
        entity_type: "document",
        is_active: true,
        auto_post_on_final: false,
        meta: { mode: "sequential", auto: false },
      })
      .select("*")
      .single();
    if (data) {
      await load();
      setSelected(data);
      setSteps([]);
    }
  };

  const save = async () => {
    if (!selected) return;
    await (supabase.from("approval_workflows") as any)
      .update({
        name: selected.name,
        doc_kind: selected.doc_kind,
        min_amount: selected.min_amount,
        max_amount: selected.max_amount,
        is_active: selected.is_active,
        auto_post_on_final: selected.auto_post_on_final,
        meta: selected.meta,
      })
      .eq("id", selected.id);
    // upsert steps
    await supabase.from("approval_steps").delete().eq("workflow_id", selected.id);
    if (steps.length) {
      await (supabase.from("approval_steps") as any).insert(
        steps.map((s, i) => ({
          org_id: currentOrgId,
          workflow_id: selected.id,
          step_order: i + 1,
          name: s.name || `الخطوة ${i + 1}`,
          approver_role: s.approver_role || null,
          approver_user_id: s.approver_user_id || null,
          required: s.required ?? true,
          meta: s.meta ?? {},
        })),
      );
    }
    await load();
    await loadSteps(selected.id);
  };

  const removeWf = async (id: string) => {
    if (!confirm("حذف سير الاعتماد؟")) return;
    await supabase.from("approval_workflows").delete().eq("id", id);
    setSelected(null);
    setSteps([]);
    await load();
  };

  return (
    <Shell>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" dir="rtl">
        <div className="md:col-span-1 bg-white border border-[#eceae2] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-[#0f2a1d]">قواعد الاعتماد</h2>
            <button onClick={create} className="text-xs px-2 py-1 rounded bg-[#0f2a1d] text-[#d4f24a] inline-flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> جديد
            </button>
          </div>
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => {
                    setSelected(r);
                    loadSteps(r.id);
                  }}
                  className={`w-full text-right text-sm px-2 py-1.5 rounded hover:bg-[#f7f5ec] ${selected?.id === r.id ? "bg-[#f7f5ec]" : ""}`}
                >
                  <div className="font-medium">{r.name}</div>
                  <div className="text-[11px] text-[#0f2a1d]/60">
                    {r.doc_kind ?? "كل الأنواع"} · {(r.meta as any)?.mode ?? "sequential"}
                  </div>
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="text-xs text-[#0f2a1d]/60">لا توجد قواعد بعد.</li>}
          </ul>
        </div>

        <div className="md:col-span-2 bg-white border border-[#eceae2] rounded-xl p-4">
          {!selected ? (
            <div className="text-sm text-[#0f2a1d]/60 text-center py-8">اختر سير عمل من القائمة أو أنشئ جديدًا.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs">
                  <span className="block mb-1">الاسم</span>
                  <input
                    value={selected.name}
                    onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                    className="w-full border border-[#eceae2] rounded px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs">
                  <span className="block mb-1">نوع المستند</span>
                  <select
                    value={selected.doc_kind ?? ""}
                    onChange={(e) => setSelected({ ...selected, doc_kind: e.target.value || null })}
                    className="w-full border border-[#eceae2] rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">كل الأنواع</option>
                    <option value="invoice">فاتورة مبيعات</option>
                    <option value="quotation">عرض سعر</option>
                    <option value="purchase_order">أمر شراء</option>
                    <option value="bill">فاتورة مشتريات</option>
                    <option value="credit_note">إشعار دائن</option>
                    <option value="debit_note">إشعار مدين</option>
                    <option value="payment">سند صرف</option>
                    <option value="receipt">سند قبض</option>
                    <option value="expense">مصروف</option>
                  </select>
                </label>
                <label className="text-xs">
                  <span className="block mb-1">أقل مبلغ</span>
                  <input
                    type="number"
                    value={selected.min_amount ?? ""}
                    onChange={(e) => setSelected({ ...selected, min_amount: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full border border-[#eceae2] rounded px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs">
                  <span className="block mb-1">أعلى مبلغ</span>
                  <input
                    type="number"
                    value={selected.max_amount ?? ""}
                    onChange={(e) => setSelected({ ...selected, max_amount: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full border border-[#eceae2] rounded px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs">
                  <span className="block mb-1">نمط التنفيذ</span>
                  <select
                    value={(selected.meta as any)?.mode ?? "sequential"}
                    onChange={(e) => setSelected({ ...selected, meta: { ...(selected.meta ?? {}), mode: e.target.value } })}
                    className="w-full border border-[#eceae2] rounded px-2 py-1.5 text-sm"
                  >
                    <option value="sequential">تسلسلي</option>
                    <option value="parallel">متوازي</option>
                  </select>
                </label>
                <label className="text-xs flex items-center gap-2 mt-5">
                  <input
                    type="checkbox"
                    checked={(selected.meta as any)?.auto ?? false}
                    onChange={(e) => setSelected({ ...selected, meta: { ...(selected.meta ?? {}), auto: e.target.checked } })}
                  />
                  اعتماد تلقائي
                </label>
                <label className="text-xs flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.auto_post_on_final ?? false}
                    onChange={(e) => setSelected({ ...selected, auto_post_on_final: e.target.checked })}
                  />
                  ترحيل تلقائي بعد الاعتماد النهائي
                </label>
                <label className="text-xs flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.is_active ?? true}
                    onChange={(e) => setSelected({ ...selected, is_active: e.target.checked })}
                  />
                  فعال
                </label>
              </div>

              <div className="border-t border-[#eceae2] pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">خطوات الاعتماد</h3>
                  <button
                    onClick={() => setSteps([...steps, { name: `الخطوة ${steps.length + 1}`, approver_role: null, approver_user_id: null, required: true }])}
                    className="text-xs px-2 py-1 rounded bg-[#f7f5ec] inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> إضافة خطوة
                  </button>
                </div>
                <ul className="space-y-2">
                  {steps.map((s, i) => (
                    <li key={i} className="grid grid-cols-12 gap-2 items-center bg-[#faf9f3] rounded-lg p-2">
                      <GripVertical className="col-span-1 w-4 h-4 text-[#0f2a1d]/40" />
                      <input
                        value={s.name}
                        onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                        className="col-span-4 border border-[#eceae2] rounded px-2 py-1 text-xs"
                        placeholder="اسم الخطوة"
                      />
                      <select
                        value={s.approver_role ?? ""}
                        onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, approver_role: e.target.value || null } : x)))}
                        className="col-span-3 border border-[#eceae2] rounded px-2 py-1 text-xs"
                      >
                        <option value="">أي دور</option>
                        <option value="owner">مالك</option>
                        <option value="admin">مسؤول</option>
                        <option value="manager">مدير</option>
                        <option value="accountant">محاسب</option>
                        <option value="staff">موظف</option>
                      </select>
                      <input
                        value={s.approver_user_id ?? ""}
                        onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, approver_user_id: e.target.value || null } : x)))}
                        placeholder="user_id (اختياري)"
                        className="col-span-3 border border-[#eceae2] rounded px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                        className="col-span-1 text-red-600 hover:bg-red-50 rounded p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-end gap-2 border-t border-[#eceae2] pt-3">
                <button onClick={() => removeWf(selected.id)} className="text-xs px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> حذف
                </button>
                <button onClick={save} className="text-xs px-3 py-2 rounded-lg bg-[#0f2a1d] text-[#d4f24a] font-semibold inline-flex items-center gap-1">
                  <Save className="w-3.5 h-3.5" /> حفظ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

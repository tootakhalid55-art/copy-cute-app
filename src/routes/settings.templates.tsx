import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FileText, Plus, Pencil, Trash2, Eye, X, Save } from "lucide-react";
import { Shell, PageHeader, OutlineBtn, PrimaryBtn } from "@/components/haseem/Shell";
import {
  useInvoiceTemplates,
  DOC_KINDS,
  type DocKind,
  type InvoiceTemplate,
} from "@/lib/haseem/templates";

export const Route = createFileRoute("/settings/templates")({
  head: () => ({ meta: [{ title: "قوالب المستندات — كنار المحاسبية" }] }),
  component: TemplatesPage,
});

type Draft = Omit<InvoiceTemplate, "id" | "builtin"> & { id?: string };

const EMPTY_DRAFT: Draft = {
  name: "",
  desc: "",
  accent: "#0f2a1d",
  onAccent: "#ffffff",
  soft: "#fafaf7",
};

function TemplatesPage() {
  const [activeKind, setActiveKind] = useState<DocKind>("invoice");
  const { all, custom, selectedId, setSelectedId, overrideBuiltin, resetBuiltin, isOverridden } = useInvoiceTemplates(activeKind);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingBuiltinId, setEditingBuiltinId] = useState<string | null>(null);
  const previewTpl = all.find((t) => t.id === previewId);

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setEditingBuiltinId(null);
    setEditorOpen(true);
  };
  const openEdit = (t: InvoiceTemplate) => {
    setDraft({ id: t.id, name: t.name, desc: t.desc ?? "", accent: t.accent, onAccent: t.onAccent, soft: t.soft });
    setEditingBuiltinId(t.builtin ? t.id : null);
    setEditorOpen(true);
  };
  const saveDraft = () => {
    const name = draft.name.trim();
    if (!name) return;
    const payload = { name, desc: draft.desc?.trim() || "", accent: draft.accent, onAccent: draft.onAccent, soft: draft.soft };
    if (editingBuiltinId) {
      overrideBuiltin(editingBuiltinId, payload);
    } else if (draft.id && custom.items.some((c) => c.id === draft.id)) {
      custom.update(draft.id, payload);
    } else {
      const rec = custom.add(payload as any);
      setSelectedId(rec.id);
    }
    setEditorOpen(false);
    setEditingBuiltinId(null);
  };
  const removeCustom = (id: string) => {
    if (!confirm("حذف هذا القالب؟")) return;
    custom.remove(id);
    if (selectedId === id) setSelectedId(all[0]?.id ?? "classic");
  };
  const duplicate = (t: InvoiceTemplate) => {
    setDraft({
      name: `${t.name} — نسخة`,
      desc: t.desc ?? "",
      accent: t.accent,
      onAccent: t.onAccent,
      soft: t.soft,
    });
    setEditingBuiltinId(null);
    setEditorOpen(true);
  };

  return (
    <Shell>
      <PageHeader
        title="قوالب المستندات"
        subtitle="لكل نوع مستند قوالبه الخاصة — اختر النوع ثم عدّل أو أنشئ قالباً"
        action={
          <PrimaryBtn onClick={openCreate}>
            <Plus className="w-4 h-4" /> قالب جديد
          </PrimaryBtn>
        }
      />

      <div className="flex flex-wrap gap-2 border-b border-[#eceae2] pb-2">
        {DOC_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setActiveKind(k.id)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition ${
              activeKind === k.id
                ? "bg-[#0f2a1d] text-white border-[#0f2a1d]"
                : "bg-white border-[#eceae2] hover:bg-[#f7f6f0]"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {all.map((t) => {
          const isActive = selectedId === t.id;
          return (
            <div
              key={t.id}
              className={`text-right rounded-xl border-2 p-4 bg-white transition ${
                isActive ? "border-[#0f2a1d] shadow" : "border-[#eceae2] hover:border-[#0f2a1d]/40"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedId(t.id)}
                className="w-full text-right"
                title="اختيار كافتراضي"
              >
                <div
                  className="rounded-lg h-32 mb-3 flex flex-col justify-between p-2"
                  style={{ background: `linear-gradient(180deg, ${t.accent}0d 0%, ${t.accent}22 100%)` }}
                >
                  <div className="h-3 w-16 rounded" style={{ background: t.accent }} />
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded bg-[#0f2a1d]/20" />
                    <div className="h-1.5 w-3/4 rounded bg-[#0f2a1d]/20" />
                    <div className="h-1.5 w-1/2 rounded bg-[#0f2a1d]/20" />
                  </div>
                  <div className="h-4 w-20 rounded self-end" style={{ background: t.accent }} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold flex items-center gap-2">
                      <FileText className="w-4 h-4" style={{ color: t.accent }} />
                      <span className="truncate">{t.name}</span>
                      {t.builtin && (
                        <span className="text-[10px] bg-[#f2f0e8] text-[#0f2a1d]/70 px-1.5 py-0.5 rounded">افتراضي</span>
                      )}
                    </div>
                    {t.desc && <p className="text-xs text-[#0f2a1d]/60 mt-1 line-clamp-2">{t.desc}</p>}
                  </div>
                  {isActive && <CheckCircle2 className="w-5 h-5 text-[#0f6b3a] shrink-0" />}
                </div>
              </button>
              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-[#eceae2]">
                <button
                  type="button"
                  onClick={() => setPreviewId(t.id)}
                  className="flex-1 inline-flex items-center justify-center gap-1 border border-[#eceae2] rounded px-2 py-1.5 text-xs hover:bg-[#f7f6f0]"
                >
                  <Eye className="w-3.5 h-3.5" /> استعراض
                </button>
                {t.builtin ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="flex-1 inline-flex items-center justify-center gap-1 border border-[#eceae2] rounded px-2 py-1.5 text-xs hover:bg-[#f7f6f0]"
                      title="تعديل ألوان القالب"
                    >
                      <Pencil className="w-3.5 h-3.5" /> تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicate(t)}
                      className="flex-1 inline-flex items-center justify-center gap-1 border border-[#eceae2] rounded px-2 py-1.5 text-xs hover:bg-[#f7f6f0]"
                      title="إنشاء نسخة قابلة للتعديل"
                    >
                      <FileText className="w-3.5 h-3.5" /> نسخ
                    </button>
                    {isOverridden(t.id) && (
                      <button
                        type="button"
                        onClick={() => resetBuiltin(t.id)}
                        className="inline-flex items-center justify-center border border-[#eceae2] rounded px-2 py-1.5 text-xs hover:bg-[#f7f6f0]"
                        title="إعادة تعيين"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="flex-1 inline-flex items-center justify-center gap-1 border border-[#eceae2] rounded px-2 py-1.5 text-xs hover:bg-[#f7f6f0]"
                    >
                      <Pencil className="w-3.5 h-3.5" /> تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCustom(t.id)}
                      className="inline-flex items-center justify-center border border-red-200 text-red-600 rounded px-2 py-1.5 text-xs hover:bg-red-50"
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm">
          القالب الافتراضي لـ <span className="font-semibold">{DOC_KINDS.find((k) => k.id === activeKind)?.label}</span>:{" "}
          <span className="font-semibold">{all.find((t) => t.id === selectedId)?.name}</span>
        </div>
        <OutlineBtn type="button" onClick={() => setSelectedId(all[0]?.id ?? "classic")}>
          استعادة الافتراضي
        </OutlineBtn>
      </div>

      {editorOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto"
          onClick={() => setEditorOpen(false)}
        >
          <div className="bg-white rounded-xl w-full max-w-2xl my-6 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#eceae2] bg-[#fafaf7]">
              <h2 className="text-base font-bold">{draft.id ? "تعديل القالب" : "قالب جديد"}</h2>
              <button onClick={() => setEditorOpen(false)} className="p-2 rounded hover:bg-[#eceae2]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="md:col-span-2 flex flex-col gap-1">
                <span className="text-xs text-[#0f2a1d]/70">اسم القالب *</span>
                <input
                  autoFocus
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="border border-[#eceae2] rounded-lg px-3 py-2"
                  placeholder="مثلاً: قالب الفرع الرئيسي"
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-1">
                <span className="text-xs text-[#0f2a1d]/70">وصف مختصر</span>
                <input
                  maxLength={120}
                  value={draft.desc}
                  onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))}
                  className="border border-[#eceae2] rounded-lg px-3 py-2"
                />
              </div>
              <ColorField label="اللون الأساسي" value={draft.accent} onChange={(v) => setDraft((d) => ({ ...d, accent: v }))} />
              <ColorField label="لون النص على الأساسي" value={draft.onAccent} onChange={(v) => setDraft((d) => ({ ...d, onAccent: v }))} />
              <ColorField label="خلفية البطاقات" value={draft.soft} onChange={(v) => setDraft((d) => ({ ...d, soft: v }))} />

              <div className="md:col-span-2">
                <div className="text-xs text-[#0f2a1d]/70 mb-2">معاينة سريعة</div>
                <MiniPreview tpl={{ ...draft, id: "draft", name: draft.name || "قالب" }} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-3 border-t border-[#eceae2] bg-[#fafaf7]">
              <OutlineBtn type="button" onClick={() => setEditorOpen(false)}>
                إلغاء
              </OutlineBtn>
              <PrimaryBtn onClick={saveDraft}>
                <Save className="w-4 h-4" /> حفظ
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {previewTpl && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto"
          onClick={() => setPreviewId(null)}
        >
          <div className="bg-white rounded-xl w-full max-w-3xl my-6 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#eceae2] bg-[#fafaf7]">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold">استعراض القالب</h2>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: previewTpl.soft, color: previewTpl.accent, border: `1px solid ${previewTpl.accent}33` }}
                >
                  {previewTpl.name}
                </span>
              </div>
              <div className="flex gap-2">
                {selectedId !== previewTpl.id && (
                  <PrimaryBtn onClick={() => { setSelectedId(previewTpl.id); setPreviewId(null); }}>
                    <CheckCircle2 className="w-4 h-4" /> تعيين كافتراضي
                  </PrimaryBtn>
                )}
                <button onClick={() => setPreviewId(null)} className="p-2 rounded hover:bg-[#eceae2]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <FullPreview tpl={previewTpl} />
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[#0f2a1d]/70">{label}</span>
      <div className="flex items-center gap-2 border border-[#eceae2] rounded-lg px-2 py-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-9 rounded cursor-pointer" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 text-sm bg-transparent outline-none tabular-nums"
          maxLength={9}
        />
      </div>
    </div>
  );
}

function MiniPreview({ tpl }: { tpl: InvoiceTemplate }) {
  return (
    <div className="rounded-lg border border-[#eceae2] overflow-hidden">
      <div className="flex justify-between items-start p-3" style={{ borderBottom: `3px solid ${tpl.accent}` }}>
        <div>
          <div className="font-bold text-sm" style={{ color: tpl.accent }}>شركتك</div>
          <div className="text-[10px] text-[#0f2a1d]/60">الرقم الضريبي: 3XXXXXXXXXXXX</div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: tpl.accent, color: tpl.onAccent }}>INV-000123</span>
      </div>
      <div className="p-3 space-y-2 text-[11px]" style={{ background: tpl.soft }}>
        <div className="flex justify-between border-b border-[#eceae2] pb-1"><span>المجموع الفرعي</span><span>1,000.00 ر.س</span></div>
        <div className="flex justify-between border-b border-[#eceae2] pb-1"><span>ضريبة القيمة المضافة (15%)</span><span>150.00 ر.س</span></div>
        <div className="flex justify-between px-2 py-1.5 rounded font-bold" style={{ background: tpl.accent, color: tpl.onAccent }}>
          <span>الإجمالي</span><span>1,150.00 ر.س</span>
        </div>
      </div>
    </div>
  );
}

function FullPreview({ tpl }: { tpl: InvoiceTemplate }) {
  const rows = [
    { d: "استشارات فنية", q: 10, p: 50 },
    { d: "خدمة تركيب", q: 2, p: 250 },
  ];
  const subtotal = rows.reduce((s, r) => s + r.q * r.p, 0);
  const tax = +(subtotal * 0.15).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div dir="rtl" className="text-sm">
      <div className="flex justify-between items-start pb-4 mb-5" style={{ borderBottom: `3px solid ${tpl.accent}` }}>
        <div>
          <h1 className="text-xl font-bold m-0" style={{ color: tpl.accent }}>شركة كنار الحديثة للمقاولات</h1>
          <p className="text-xs text-[#0f2a1d]/70 mt-1">الرقم الضريبي: 312756062700003</p>
        </div>
        <div className="text-left">
          <h2 className="text-lg font-bold m-0" style={{ color: tpl.accent }}>فاتورة ضريبية</h2>
          <span className="inline-block mt-1 px-3 py-1 rounded text-xs" style={{ background: tpl.accent, color: tpl.onAccent }}>INV-000123</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="border border-[#eceae2] rounded-lg p-3" style={{ background: tpl.soft }}>
          <div className="text-[11px] text-[#0f2a1d]/60 font-semibold mb-1">العميل</div>
          <div className="font-semibold">عميل تجريبي</div>
          <div className="text-xs text-[#0f2a1d]/70">الرقم الضريبي: 300000000000003</div>
        </div>
        <div className="border border-[#eceae2] rounded-lg p-3" style={{ background: tpl.soft }}>
          <div className="text-[11px] text-[#0f2a1d]/60 font-semibold mb-1">بيانات المستند</div>
          <div className="text-xs">التاريخ: <strong>2026-07-08</strong></div>
          <div className="text-xs">الاستحقاق: <strong>2026-07-22</strong></div>
        </div>
      </div>
      <table className="w-full border-collapse text-xs mb-4">
        <thead>
          <tr style={{ background: tpl.accent, color: tpl.onAccent }}>
            {["#", "الوصف", "الكمية", "السعر", "المبلغ"].map((h) => (
              <th key={h} className="p-2 text-right" style={{ border: `1px solid ${tpl.accent}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={i % 2 ? { background: tpl.soft } : undefined}>
              <td className="border border-[#d4d0c4] p-2">{i + 1}</td>
              <td className="border border-[#d4d0c4] p-2">{r.d}</td>
              <td className="border border-[#d4d0c4] p-2">{r.q}</td>
              <td className="border border-[#d4d0c4] p-2 tabular-nums">{fmt(r.p)}</td>
              <td className="border border-[#d4d0c4] p-2 tabular-nums">{fmt(r.q * r.p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-[1fr_260px] gap-4">
        <div className="text-xs rounded p-3" style={{ background: tpl.soft, borderRight: `3px solid ${tpl.accent}` }}>
          <strong>ملاحظات:</strong><br />شكراً لتعاملكم معنا.
        </div>
        <div className="space-y-1">
          <div className="flex justify-between py-1.5 border-b border-[#eceae2]"><span>المجموع الفرعي</span><span className="tabular-nums">{fmt(subtotal)} ر.س</span></div>
          <div className="flex justify-between py-1.5 border-b border-[#eceae2]"><span>ضريبة القيمة المضافة (15%)</span><span className="tabular-nums">{fmt(tax)} ر.س</span></div>
          <div className="flex justify-between px-3 py-2.5 rounded font-bold mt-1" style={{ background: tpl.accent, color: tpl.onAccent }}>
            <span>الإجمالي شامل الضريبة</span><span className="tabular-nums">{fmt(total)} ر.س</span>
          </div>
        </div>
      </div>
    </div>
  );
}



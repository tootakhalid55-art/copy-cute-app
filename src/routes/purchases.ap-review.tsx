import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Sparkles, Wand2, Layers } from "lucide-react";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, EmptyState } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { supabase } from "@/integrations/supabase/client";
import {
  createIntakeFromUpload, runIntakeExtraction, createBillFromIntake, rejectIntake,
} from "@/lib/ap/intake.functions";
import { submitApproval, listApprovals } from "@/lib/ap/workflow.functions";
import { resolveThreshold } from "@/lib/ap/thresholds.functions";
import { preprocessImage } from "@/lib/ap/preprocess";
import { CopilotPanel } from "@/components/haseem/CopilotPanel";

export const Route = createFileRoute("/purchases/ap-review")({
  head: () => ({ meta: [
    { title: "مراجعة فواتير الموردين بالذكاء الاصطناعي — حسيم" },
    { name: "description", content: "استخراج تلقائي ومطابقة الموردين واعتماد الفواتير الواردة" },
  ]}),
  component: ApReviewPage,
});

const MAX_SIZE = 8 * 1024 * 1024;

type Intake = {
  id: string; org_id: string; channel: string; sender: string | null; subject: string | null;
  status: string; confidence: number | null; match_confidence: number | null;
  matched_party_id: string | null; matched_bill_id: string | null;
  extraction: any; error_message: string | null; created_at: string;
  raw_payload?: any;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  received:     { label: "مستلم",         cls: "bg-gray-100 text-gray-700" },
  extracting:   { label: "جاري الاستخراج", cls: "bg-blue-50 text-blue-700" },
  extracted:    { label: "منخفض الثقة",   cls: "bg-amber-50 text-amber-800" },
  review:       { label: "بحاجة لمراجعة",  cls: "bg-amber-50 text-amber-800" },
  auto_drafted: { label: "مسودة تلقائية",  cls: "bg-emerald-50 text-emerald-700" },
  duplicate:    { label: "مكرر",           cls: "bg-orange-50 text-orange-700" },
  posted:       { label: "تم الترحيل",     cls: "bg-emerald-50 text-emerald-700" },
  rejected:     { label: "مرفوض",          cls: "bg-red-50 text-red-700" },
  failed:       { label: "فشل",            cls: "bg-red-50 text-red-700" },
};

function fileToDataURL(f: File) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

function ApReviewPage() {
  const { currentOrg: org } = useOrg();
  const createIntake = useServerFn(createIntakeFromUpload);
  const runExtraction = useServerFn(runIntakeExtraction);
  const createBill = useServerFn(createBillFromIntake);
  const reject = useServerFn(rejectIntake);

  const [rows, setRows] = useState<Intake[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Intake | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [enhance, setEnhance] = useState(true);
  const [batchMode, setBatchMode] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!org?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("ap_intake_documents").select("*")
      .eq("org_id", org.id).order("created_at", { ascending: false }).limit(100);
    setRows((data as any) || []);
    setLoading(false);
  }, [org?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!org?.id) return;
    const ch = supabase
      .channel(`ap-intake-${org.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ap_intake_documents", filter: `org_id=eq.${org.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [org?.id, load]);

  const upload = useCallback(async (files: FileList | File[]) => {
    if (!org?.id) return;
    for (const raw of Array.from(files)) {
      if (raw.size > MAX_SIZE) { alert(`${raw.name}: يتجاوز 8MB`); continue; }
      try {
        setBusy(raw.name);
        const f = enhance ? await preprocessImage(raw).catch(() => raw) : raw;
        const dataUrl = await fileToDataURL(f);
        const { intakeId } = await createIntake({ data: { orgId: org.id, filename: f.name, fileDataUrl: dataUrl } });
        await runExtraction({ data: { intakeId, fileDataUrl: dataUrl, filename: f.name } });
      } catch (e: any) {
        alert(`فشل الرفع: ${e?.message || e}`);
      } finally { setBusy(null); }
    }
    load();
  }, [org?.id, createIntake, runExtraction, load, enhance]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const toggleCheck = (id: string) => setChecked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const bulkApprove = async () => {
    const targets = rows.filter((r) => checked.has(r.id) && r.matched_party_id && ["review", "auto_drafted"].includes(r.status));
    if (!targets.length) { alert("لا توجد فواتير قابلة للاعتماد ضمن المحدد"); return; }
    if (!confirm(`اعتماد ${targets.length} فاتورة كمسودات؟`)) return;
    for (const t of targets) {
      try { await createBill({ data: { intakeId: t.id, partyId: t.matched_party_id, newParty: null } }); }
      catch (e: any) { console.warn("bulk approve failed for", t.id, e?.message); }
    }
    setChecked(new Set()); load();
  };

  return (
    <Shell>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
        }}
        className={dragOver ? "ring-2 ring-emerald-400 ring-offset-2 rounded-xl" : ""}
      >
      <PageHeader
        title="مراجعة فواتير الموردين (AI)"
        subtitle="رفع، معالجة، مراجعة، واعتماد الفواتير الواردة بالذكاء الاصطناعي"
        action={
          <div className="flex gap-2 flex-wrap">
            <label className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[#eceae2] cursor-pointer">
              <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
              <Wand2 className="w-3.5 h-3.5" /> تحسين الصورة
            </label>
            <OutlineBtn onClick={() => setBatchMode((v) => !v)}>
              <Layers className="w-4 h-4" /> {batchMode ? "إنهاء التحديد" : "وضع الدفعة"}
            </OutlineBtn>
            {batchMode && checked.size > 0 && (
              <PrimaryBtn onClick={bulkApprove}>
                <CheckCircle2 className="w-4 h-4" /> اعتماد {checked.size}
              </PrimaryBtn>
            )}
            <PrimaryBtn onClick={() => fileRef.current?.click()} disabled={!org?.id || !!busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} رفع
            </PrimaryBtn>
            <OutlineBtn onClick={() => cameraRef.current?.click()} disabled={!org?.id || !!busy}>📷</OutlineBtn>
            <OutlineBtn onClick={load}><RefreshCw className="w-4 h-4" /></OutlineBtn>
          </div>
        }
      />
      <input ref={fileRef} type="file" hidden accept="application/pdf,image/*" multiple
        onChange={(e) => e.target.files && upload(e.target.files)} />
      <input ref={cameraRef} type="file" hidden accept="image/*" capture="environment"
        onChange={(e) => e.target.files && upload(e.target.files)} />

      {dragOver && (
        <div className="rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-50 p-8 text-center text-emerald-800 my-3">
          أفلت الملفات هنا للمعالجة الفورية
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[["all", "الكل"], ["review", "للمراجعة"], ["auto_drafted", "مسودات"],
          ["duplicate", "مكرر"], ["failed", "فشل"]].map(([k, l]) => (
          <div key={k} className="rounded-xl bg-white border border-[#eceae2] p-3">
            <div className="text-xs text-[#0f2a1d]/60">{l}</div>
            <div className="text-2xl font-bold tabular-nums">{counts[k] || 0}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-[#0f2a1d]/60"><Loader2 className="w-4 h-4 animate-spin inline" /> جاري التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="p-10"><EmptyState icon={Sparkles} title="لا توجد فواتير واردة بعد"
            description="ارفع فاتورة PDF أو صورة وسيقوم الذكاء الاصطناعي بالاستخراج ومطابقة المورد" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs">
              <tr className="text-right">
                {batchMode && <th className="p-2.5 w-8"></th>}
                <th className="p-2.5">المستند</th><th>المورد</th><th>الرقم</th>
                <th>الإجمالي</th><th>الثقة</th><th>المطابقة</th><th>الحالة</th><th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {rows.map((r) => {
                const ex = r.extraction || {};
                const S = STATUS[r.status] || { label: r.status, cls: "bg-gray-100 text-gray-700" };
                return (
                  <tr key={r.id} className="text-right hover:bg-[#fafaf7]">
                    {batchMode && <td className="p-2.5">
                      <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggleCheck(r.id)} />
                    </td>}
                    <td className="p-2.5 max-w-[200px] truncate">{r.subject || r.sender || r.id.slice(0, 8)}</td>
                    <td className="p-2.5">{ex.supplierName || "—"}</td>
                    <td className="p-2.5">{ex.invoiceNumber || "—"}</td>
                    <td className="p-2.5 tabular-nums">{ex.grandTotal ? `${Number(ex.grandTotal).toLocaleString()} ر.س` : "—"}</td>
                    <td className="p-2.5 tabular-nums">
                      {r.confidence != null ? (
                        <span className={r.confidence >= 0.9 ? "text-emerald-700" : r.confidence >= 0.7 ? "text-amber-700" : "text-red-700"}>
                          {Math.round(r.confidence * 100)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-2.5 text-xs">
                      {r.matched_party_id ? <span className="text-emerald-700">مطابق ({Math.round((r.match_confidence || 0) * 100)}%)</span>
                        : <span className="text-[#0f2a1d]/60">—</span>}
                    </td>
                    <td className="p-2.5"><span className={`text-xs px-2 py-0.5 rounded-full ${S.cls}`}>{S.label}</span></td>
                    <td className="p-2.5">
                      <button onClick={() => setSelected(r)}
                        className="text-xs px-2 py-1 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">فتح</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <ReviewDrawer
          intake={selected}
          onClose={() => setSelected(null)}
          onApprove={async (partyId, newParty, edited) => {
            try {
              await createBill({ data: { intakeId: selected.id, partyId, newParty, editedExtraction: edited } });
              setSelected(null); load();
            } catch (e: any) { alert(e?.message || "فشل الإنشاء"); }
          }}
          onReject={async (reason) => {
            try { await reject({ data: { intakeId: selected.id, reason } }); setSelected(null); load(); }
            catch (e: any) { alert(e?.message || "فشل الرفض"); }
          }}
          orgId={org?.id || ""}
        />
      )}
      </div>
    </Shell>
  );
}

// Confidence color for heatmap
function confClass(c: number | undefined): string {
  if (c == null) return "border-[#eceae2]";
  if (c >= 85) return "border-emerald-400 bg-emerald-50/40";
  if (c >= 70) return "border-amber-400 bg-amber-50/40";
  return "border-red-400 bg-red-50/40";
}

function ReviewDrawer({
  intake, onClose, onApprove, onReject, orgId,
}: {
  intake: Intake;
  onClose: () => void;
  onApprove: (partyId: string | null, newParty: any, edited: any) => void;
  onReject: (reason: string) => void;
  orgId: string;
}) {
  const listAppr = useServerFn(listApprovals);
  const submitAppr = useServerFn(submitApproval);
  const resolve = useServerFn(resolveThreshold);

  const [ex, setEx] = useState<any>(intake.extraction || {});
  const originalRef = useRef<any>(intake.extraction || {});
  const [partyId, setPartyId] = useState<string | null>(intake.matched_party_id);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; vat_number: string | null }>>([]);
  const [creating, setCreating] = useState(false);
  const [newParty, setNewParty] = useState({
    name: ex.supplierName || "", vat_number: ex.supplierVatNumber || "", email: "", phone: "",
  });
  const [rejectReason, setRejectReason] = useState("");
  const [approvals, setApprovals] = useState<any[]>([]);
  const [threshold, setThreshold] = useState<any>(null);
  const [comment, setComment] = useState("");
  const conf = ex.confidence || {};

  const preview = useMemo(() => {
    const raw = intake.raw_payload;
    if (!raw?.filename) return null;
    return null; // preview data not stored; upload endpoint keeps only metadata
  }, [intake]);

  useEffect(() => {
    (async () => {
      if (!orgId) return;
      const [s, appr] = await Promise.all([
        supabase.from("parties").select("id, name, vat_number").eq("org_id", orgId).eq("type", "supplier").order("name").limit(200),
        listAppr({ data: { intakeId: intake.id } }) as Promise<any[]>,
      ]);
      setSuppliers((s.data as any) || []);
      setApprovals(appr as any[]);
      const t = await resolve({ data: {
        orgId, amount: Number(ex.grandTotal) || 0,
        partyId: intake.matched_party_id, branchId: null,
      }});
      setThreshold(t);
    })();
  }, [orgId, intake.id, listAppr, resolve, ex.grandTotal, intake.matched_party_id]);

  const submit = async (decision: "approved" | "rejected" | "commented") => {
    const level = (approvals.filter((a) => a.decision === "approved").length) + 1;
    await submitAppr({ data: { intakeId: intake.id, decision, comment, level } });
    setComment("");
    const next = await listAppr({ data: { intakeId: intake.id } }) as any[];
    setApprovals(next);
  };

  const approvedCount = approvals.filter((a) => a.decision === "approved").length;
  const requiredLevels = threshold?.required_levels ?? 1;
  const canPost = approvedCount >= requiredLevels && (partyId || (creating && newParty.name));

  const setF = (k: string, v: any) => setEx((e: any) => ({ ...e, [k]: v }));
  const setLine = (i: number, k: string, v: any) => setEx((e: any) => {
    const lines = [...(e.lines || [])];
    lines[i] = { ...lines[i], [k]: v };
    return { ...e, lines };
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#eceae2] flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="font-bold text-lg">مراجعة الفاتورة</div>
            <div className="text-xs text-[#0f2a1d]/60 flex gap-3 flex-wrap">
              <span>الثقة الإجمالية: {intake.confidence != null ? Math.round(intake.confidence * 100) + "%" : "—"}</span>
              <span>الحالة: {STATUS[intake.status]?.label}</span>
              {threshold && <span>قاعدة الاعتماد: {threshold.name} — {requiredLevels} مستوى</span>}
              <span>الاعتمادات: {approvedCount}/{requiredLevels}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">✕</button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 p-5">
          {/* Left: editable extraction with heatmap */}
          <div className="space-y-3">
            {intake.error_message && (
              <div className="flex gap-2 rounded-lg bg-red-50 text-red-700 p-3 text-sm">
                <AlertTriangle className="w-4 h-4" /> {intake.error_message}
              </div>
            )}
            <div className="text-xs text-[#0f2a1d]/60 flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400" /> ≥85%</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400" /> 70–85%</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400" /> &lt;70%</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <EditField label="اسم المورد" conf={conf.supplierName} value={ex.supplierName || ""} onChange={(v) => setF("supplierName", v)} />
              <EditField label="الرقم الضريبي" value={ex.supplierVatNumber || ""} onChange={(v) => setF("supplierVatNumber", v)} />
              <EditField label="رقم الفاتورة" conf={conf.invoiceNumber} value={ex.invoiceNumber || ""} onChange={(v) => setF("invoiceNumber", v)} />
              <EditField label="التاريخ" conf={conf.invoiceDate} value={ex.invoiceDate || ""} onChange={(v) => setF("invoiceDate", v)} type="date" />
              <EditField label="الصافي" value={ex.subtotal ?? ""} onChange={(v) => setF("subtotal", Number(v))} type="number" />
              <EditField label="الضريبة" conf={conf.vat} value={ex.vat ?? ""} onChange={(v) => setF("vat", Number(v))} type="number" />
              <EditField label="الإجمالي" conf={conf.grandTotal} value={ex.grandTotal ?? ""} onChange={(v) => setF("grandTotal", Number(v))} type="number" />
              <EditField label="العملة" value={ex.currency || "SAR"} onChange={(v) => setF("currency", v)} />
            </div>

            {Array.isArray(ex.lines) && ex.lines.length > 0 && (
              <div>
                <div className="text-sm font-semibold mb-2">البنود</div>
                <div className={`rounded-lg border ${confClass(conf.lines)} p-2 space-y-1`}>
                  {ex.lines.map((l: any, i: number) => (
                    <div key={i} className="grid grid-cols-12 gap-1 text-xs">
                      <input value={l.description || ""} onChange={(e) => setLine(i, "description", e.target.value)}
                        className="col-span-6 border border-[#eceae2] rounded px-2 py-1" />
                      <input type="number" value={l.qty ?? ""} onChange={(e) => setLine(i, "qty", Number(e.target.value))}
                        className="col-span-2 border border-[#eceae2] rounded px-2 py-1 tabular-nums" />
                      <input type="number" value={l.price ?? ""} onChange={(e) => setLine(i, "price", Number(e.target.value))}
                        className="col-span-2 border border-[#eceae2] rounded px-2 py-1 tabular-nums" />
                      <input type="number" value={l.lineTotal ?? l.total ?? ""} onChange={(e) => setLine(i, "lineTotal", Number(e.target.value))}
                        className="col-span-2 border border-[#eceae2] rounded px-2 py-1 tabular-nums" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: supplier match, approvals, actions */}
          <div className="space-y-3">
            <div className="rounded-lg border border-[#eceae2] p-3">
              <div className="text-sm font-semibold mb-2">المورد</div>
              {!creating ? (
                <>
                  <select value={partyId || ""} onChange={(e) => setPartyId(e.target.value || null)}
                    className="w-full border border-[#eceae2] rounded-lg px-3 py-2 text-sm">
                    <option value="">— اختر مورد —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.vat_number ? ` — ${s.vat_number}` : ""}</option>
                    ))}
                  </select>
                  <button onClick={() => setCreating(true)}
                    className="mt-2 text-xs text-blue-700 hover:underline">+ إنشاء مورد من الفاتورة</button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="الاسم" value={newParty.name} onChange={(e) => setNewParty({ ...newParty, name: e.target.value })}
                    className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm col-span-2" />
                  <input placeholder="الرقم الضريبي" value={newParty.vat_number} onChange={(e) => setNewParty({ ...newParty, vat_number: e.target.value })}
                    className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
                  <input placeholder="الهاتف" value={newParty.phone} onChange={(e) => setNewParty({ ...newParty, phone: e.target.value })}
                    className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
                  <input placeholder="البريد" value={newParty.email} onChange={(e) => setNewParty({ ...newParty, email: e.target.value })}
                    className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm col-span-2" />
                  <button onClick={() => setCreating(false)} className="text-xs text-[#0f2a1d]/60 col-span-2 text-right">إلغاء</button>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-[#eceae2] p-3">
              <div className="text-sm font-semibold mb-2">الاعتمادات ({approvedCount}/{requiredLevels})</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
                {approvals.length === 0 ? (
                  <div className="text-[#0f2a1d]/60">لا توجد اعتمادات بعد</div>
                ) : approvals.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 border border-[#eceae2] rounded px-2 py-1">
                    <span className={a.decision === "approved" ? "text-emerald-700" : a.decision === "rejected" ? "text-red-700" : "text-[#0f2a1d]/70"}>
                      {a.decision === "approved" ? "✓" : a.decision === "rejected" ? "✕" : "•"} مستوى {a.level}
                    </span>
                    <span className="flex-1 truncate">{a.comment || "—"}</span>
                    <span className="text-[#0f2a1d]/50">{new Date(a.created_at).toLocaleDateString("ar-SA")}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input placeholder="تعليق (اختياري)" value={comment} onChange={(e) => setComment(e.target.value)}
                  className="flex-1 border border-[#eceae2] rounded px-2 py-1.5 text-sm" />
                <button onClick={() => submit("approved")}
                  className="text-xs px-2 py-1.5 rounded bg-emerald-600 text-white hover:opacity-90">اعتماد</button>
                <button onClick={() => submit("rejected")}
                  className="text-xs px-2 py-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50">رفض</button>
              </div>
            </div>

            <div className="rounded-lg border border-[#eceae2] p-3 space-y-2">
              <input placeholder="سبب الرفض (اختياري)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                className="w-full border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={() => onReject(rejectReason)}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm hover:bg-red-50">
                  <XCircle className="w-4 h-4" /> رفض نهائي
                </button>
                <button onClick={() => onApprove(partyId, creating && newParty.name ? newParty : null, ex)}
                  disabled={!canPost}
                  title={!canPost ? `يلزم ${requiredLevels} اعتماد${requiredLevels > 1 ? "ات" : ""} ومورد` : ""}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-[#0f2a1d] text-white text-sm hover:opacity-90 disabled:opacity-40">
                  <CheckCircle2 className="w-4 h-4" /> إنشاء مسودة
                </button>
              </div>
              {!canPost && (
                <div className="text-xs text-amber-700">
                  {approvedCount < requiredLevels ? `يلزم ${requiredLevels - approvedCount} اعتماد إضافي` : "اختر مورد أو أنشئ مورد جديد"}
                </div>
              )}
          </div>

          {/* Copilot column */}
          <div className="md:col-span-1">
            <CopilotPanel orgId={orgId} intakeId={intake.id} />
          </div>
        </div>
      </div>
    </div>
      </div>
    </div>
  );
}

function EditField({
  label, value, onChange, conf, type = "text",
}: {
  label: string; value: any; onChange: (v: any) => void;
  conf?: number; type?: string;
}) {
  return (
    <div>
      <div className="text-xs text-[#0f2a1d]/60 mb-0.5 flex justify-between">
        <span>{label}</span>
        {conf != null && <span className="tabular-nums">{Math.round(conf)}%</span>}
      </div>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm ${confClass(conf)}`} />
    </div>
  );
}

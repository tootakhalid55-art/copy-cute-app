import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, FileText, Sparkles } from "lucide-react";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, EmptyState } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { supabase } from "@/integrations/supabase/client";
import {
  createIntakeFromUpload,
  runIntakeExtraction,
  createBillFromIntake,
  rejectIntake,
} from "@/lib/ap/intake.functions";

export const Route = createFileRoute("/purchases/ap-review")({
  head: () => ({ meta: [
    { title: "مراجعة فواتير الموردين بالذكاء الاصطناعي — حسيم" },
    { name: "description", content: "استخراج تلقائي ومطابقة الموردين واعتماد الفواتير الواردة" },
  ]}),
  component: ApReviewPage,
});

const MAX_SIZE = 8 * 1024 * 1024;

type Intake = {
  id: string;
  org_id: string;
  channel: string;
  sender: string | null;
  subject: string | null;
  status: string;
  confidence: number | null;
  match_confidence: number | null;
  matched_party_id: string | null;
  matched_bill_id: string | null;
  extraction: any;
  error_message: string | null;
  created_at: string;
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
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!org?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ap_intake_documents")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error) setRows((data as any) || []);
    setLoading(false);
  }, [org?.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime updates
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
    for (const f of Array.from(files)) {
      if (f.size > MAX_SIZE) { alert(`${f.name}: يتجاوز 8MB`); continue; }
      try {
        setBusy(f.name);
        const dataUrl = await fileToDataURL(f);
        const { intakeId } = await createIntake({ data: { orgId: org.id, filename: f.name, fileDataUrl: dataUrl } });
        await runExtraction({ data: { intakeId, fileDataUrl: dataUrl, filename: f.name } });
      } catch (e: any) {
        alert(`فشل الرفع: ${e?.message || e}`);
      } finally { setBusy(null); }
    }
    load();
  }, [org?.id, createIntake, runExtraction, load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

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
        subtitle="ارفع فاتورة، ويتولى النظام الاستخراج ومطابقة المورد واقتراح المسودة"
        action={
          <div className="flex gap-2">
            <PrimaryBtn onClick={() => fileRef.current?.click()} disabled={!org?.id || !!busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} رفع فاتورة
            </PrimaryBtn>
            <OutlineBtn onClick={() => cameraRef.current?.click()} disabled={!org?.id || !!busy}>
              📷 كاميرا
            </OutlineBtn>
            <OutlineBtn onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</OutlineBtn>
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
        {[
          ["all", "الكل"], ["review", "للمراجعة"], ["auto_drafted", "مسودات تلقائية"],
          ["duplicate", "مكرر"], ["failed", "فشل"],
        ].map(([k, l]) => (
          <div key={k} className="rounded-xl bg-white border border-[#eceae2] p-3">
            <div className="text-xs text-[#0f2a1d]/60">{l}</div>
            <div className="text-2xl font-bold tabular-nums">{counts[k] || 0}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-[#0f2a1d]/60"><Loader2 className="w-4 h-4 animate-spin inline" /> جاري التحميل...</div>
        ) : rows.length === 0 ? (
          <div className="p-10">
            <EmptyState icon={Sparkles} title="لا توجد فواتير واردة بعد"
              description="ارفع فاتورة PDF أو صورة وسيقوم الذكاء الاصطناعي بالاستخراج ومطابقة المورد" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#faf9f4] text-xs">
              <tr className="text-right">
                <th className="p-2.5">المستند</th>
                <th>المورد المستخرج</th>
                <th>الرقم</th>
                <th>الإجمالي</th>
                <th>الثقة</th>
                <th>مطابقة المورد</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceae2]">
              {rows.map((r) => {
                const ex = r.extraction || {};
                const S = STATUS[r.status] || { label: r.status, cls: "bg-gray-100 text-gray-700" };
                return (
                  <tr key={r.id} className="text-right hover:bg-[#fafaf7]">
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
                      {r.matched_party_id ? (
                        <span className="text-emerald-700">
                          مطابق ({Math.round((r.match_confidence || 0) * 100)}%)
                        </span>
                      ) : <span className="text-[#0f2a1d]/60">لم يتم المطابقة</span>}
                    </td>
                    <td className="p-2.5"><span className={`text-xs px-2 py-0.5 rounded-full ${S.cls}`}>{S.label}</span></td>
                    <td className="p-2.5">
                      <button onClick={() => setSelected(r)}
                        className="text-xs px-2 py-1 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">
                        فتح
                      </button>
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
          onApprove={async (partyId, newParty) => {
            try {
              await createBill({ data: { intakeId: selected.id, partyId, newParty } });
              setSelected(null);
              load();
            } catch (e: any) { alert(e?.message || "فشل الإنشاء"); }
          }}
          onReject={async (reason) => {
            try {
              await reject({ data: { intakeId: selected.id, reason } });
              setSelected(null);
              load();
            } catch (e: any) { alert(e?.message || "فشل الرفض"); }
          }}
          orgId={org?.id || ""}
        />
      )}
      </div>
    </Shell>
  );
}

function ReviewDrawer({
  intake, onClose, onApprove, onReject, orgId,
}: {
  intake: Intake;
  onClose: () => void;
  onApprove: (partyId: string | null, newParty: any) => void;
  onReject: (reason: string) => void;
  orgId: string;
}) {
  const ex = intake.extraction || {};
  const [partyId, setPartyId] = useState<string | null>(intake.matched_party_id);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; vat_number: string | null }>>([]);
  const [creating, setCreating] = useState(false);
  const [newParty, setNewParty] = useState({
    name: ex.supplierName || "",
    vat_number: ex.supplierVatNumber || "",
    email: "", phone: "",
  });
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    (async () => {
      if (!orgId) return;
      const { data } = await supabase
        .from("parties")
        .select("id, name, vat_number")
        .eq("org_id", orgId)
        .in("type", ["supplier"])
        .order("name")
        .limit(200);
      setSuppliers((data as any) || []);
    })();
  }, [orgId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#eceae2] flex items-center justify-between sticky top-0 bg-white">
          <div>
            <div className="font-bold text-lg">مراجعة الفاتورة</div>
            <div className="text-xs text-[#0f2a1d]/60">
              الثقة: {intake.confidence != null ? Math.round(intake.confidence * 100) + "%" : "—"} · الحالة: {STATUS[intake.status]?.label}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {intake.error_message && (
            <div className="flex gap-2 rounded-lg bg-red-50 text-red-700 p-3 text-sm">
              <AlertTriangle className="w-4 h-4" /> {intake.error_message}
            </div>
          )}

          <section className="grid grid-cols-2 gap-3 text-sm">
            <Field label="اسم المورد">{ex.supplierName || "—"}</Field>
            <Field label="الرقم الضريبي">{ex.supplierVatNumber || "—"}</Field>
            <Field label="رقم الفاتورة">{ex.invoiceNumber || "—"}</Field>
            <Field label="التاريخ">{ex.invoiceDate || "—"}</Field>
            <Field label="الصافي">{ex.subtotal ? Number(ex.subtotal).toLocaleString() : "—"}</Field>
            <Field label="الضريبة">{ex.vat ? Number(ex.vat).toLocaleString() : "—"}</Field>
            <Field label="الإجمالي">{ex.grandTotal ? Number(ex.grandTotal).toLocaleString() + " ر.س" : "—"}</Field>
            <Field label="العملة">{ex.currency || "SAR"}</Field>
          </section>

          {Array.isArray(ex.lines) && ex.lines.length > 0 && (
            <section>
              <div className="text-sm font-semibold mb-2">البنود</div>
              <table className="w-full text-xs border border-[#eceae2] rounded-lg">
                <thead className="bg-[#faf9f4]">
                  <tr className="text-right">
                    <th className="p-2">الوصف</th><th className="p-2">الكمية</th>
                    <th className="p-2">السعر</th><th className="p-2">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {ex.lines.map((l: any, i: number) => (
                    <tr key={i} className="border-t border-[#eceae2] text-right">
                      <td className="p-2">{l.description}</td>
                      <td className="p-2 tabular-nums">{l.qty}</td>
                      <td className="p-2 tabular-nums">{l.unitPrice ?? l.price}</td>
                      <td className="p-2 tabular-nums">{l.total ?? l.lineTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="rounded-lg border border-[#eceae2] p-3">
            <div className="text-sm font-semibold mb-2">مطابقة المورد</div>
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
                  className="mt-2 text-xs text-blue-700 hover:underline">+ إنشاء مورد جديد من الفاتورة</button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="اسم المورد" value={newParty.name}
                  onChange={(e) => setNewParty({ ...newParty, name: e.target.value })}
                  className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm col-span-2" />
                <input placeholder="الرقم الضريبي" value={newParty.vat_number}
                  onChange={(e) => setNewParty({ ...newParty, vat_number: e.target.value })}
                  className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
                <input placeholder="الهاتف" value={newParty.phone}
                  onChange={(e) => setNewParty({ ...newParty, phone: e.target.value })}
                  className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
                <input placeholder="البريد" value={newParty.email}
                  onChange={(e) => setNewParty({ ...newParty, email: e.target.value })}
                  className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm col-span-2" />
                <button onClick={() => setCreating(false)} className="text-xs text-[#0f2a1d]/60 col-span-2 text-right">إلغاء</button>
              </div>
            )}
          </section>

          <section className="flex gap-2 items-center">
            <input placeholder="سبب الرفض (اختياري)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              className="flex-1 border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => onReject(rejectReason)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm hover:bg-red-50">
              <XCircle className="w-4 h-4" /> رفض
            </button>
            <button onClick={() => onApprove(partyId, creating && newParty.name ? newParty : null)}
              disabled={!partyId && !(creating && newParty.name)}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-[#0f2a1d] text-white text-sm hover:opacity-90 disabled:opacity-50">
              <CheckCircle2 className="w-4 h-4" /> إنشاء فاتورة مسودة
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-[#0f2a1d]/60 mb-0.5">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}

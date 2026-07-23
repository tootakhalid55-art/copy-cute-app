// Unified side panel for a document: header stats (status / approval step /
// attachment count / related documents), inline approval controls, drag-drop
// attachment uploader, and an activity timeline built from the notifications
// audit trail. Handles the "not yet in cloud" state with a one-click enable.
import { useCallback, useEffect, useState } from "react";
import {
  Clock, CloudUpload, FileText, Link as LinkIcon, Loader2, Paperclip, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ApprovalPanel } from "./ApprovalPanel";
import { AttachmentUploader } from "./AttachmentUploader";

type Props = {
  orgId: string | null;
  dbDocId: string | null;
  enabling?: boolean;
  onEnable?: () => Promise<void> | void;
  onUploadingChange?: (v: boolean) => void;
  onChange?: () => void;
};

type TimelineItem = {
  id: string;
  title: string;
  body?: string | null;
  event_type: string;
  user_id?: string | null;
  created_at: string;
};

const EVENT_LABELS: Record<string, { label: string; tone: string }> = {
  "document.created": { label: "تم الإنشاء", tone: "bg-blue-100 text-blue-700" },
  "document.updated": { label: "تم التعديل", tone: "bg-slate-100 text-slate-700" },
  "document.submitted": { label: "أُرسل للاعتماد", tone: "bg-amber-100 text-amber-700" },
  "document.approved": { label: "تم الاعتماد", tone: "bg-green-100 text-green-700" },
  "document.rejected": { label: "مرفوض", tone: "bg-red-100 text-red-700" },
  "document.posted": { label: "مرحّل", tone: "bg-emerald-100 text-emerald-700" },
  "document.cancelled": { label: "ملغى", tone: "bg-gray-100 text-gray-700" },
  "attachment.uploaded": { label: "رفع مرفق", tone: "bg-indigo-100 text-indigo-700" },
  "attachment.replaced": { label: "استبدال مرفق", tone: "bg-purple-100 text-purple-700" },
  "attachment.deleted": { label: "حذف مرفق", tone: "bg-rose-100 text-rose-700" },
};

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  pending_approval: "بانتظار الاعتماد",
  approved: "معتمد",
  posted: "مرحّل",
  cancelled: "ملغى",
  issued: "صادر",
  paid: "مدفوع",
  partially_paid: "مدفوع جزئياً",
  archived: "مؤرشف",
};

export function DocumentSidePanel({
  orgId, dbDocId, enabling, onEnable, onUploadingChange, onChange,
}: Props) {
  const [doc, setDoc] = useState<any>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [attachmentCount, setAttachmentCount] = useState(0);
  const [relationsCount, setRelationsCount] = useState(0);
  const [workflowStep, setWorkflowStep] = useState<{ current: number; total: number; status: string } | null>(null);

  const reload = useCallback(async () => {
    if (!orgId || !dbDocId) return;
    const [d, notes, atts, rels, wf] = await Promise.all([
      supabase.from("documents").select("id,status,doc_number,grand_total,kind").eq("id", dbDocId).eq("org_id", orgId).maybeSingle(),
      supabase.from("notifications").select("id,title,body,event_type,user_id,created_at").eq("org_id", orgId).eq("document_id", dbDocId).order("created_at", { ascending: false }).limit(30),
      supabase.from("attachments").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity_type", "document").eq("entity_id", dbDocId),
      supabase.from("document_relations").select("id", { count: "exact", head: true }).eq("org_id", orgId).or(`source_id.eq.${dbDocId},target_id.eq.${dbDocId}`),
      supabase.from("approval_requests").select("current_step,workflow_id,status").eq("org_id", orgId).eq("document_id", dbDocId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setDoc(d.data);
    setTimeline((notes.data as any) ?? []);
    setAttachmentCount(atts.count ?? 0);
    setRelationsCount(rels.count ?? 0);
    if (wf.data?.workflow_id) {
      const { data: steps } = await supabase.from("approval_steps").select("id").eq("workflow_id", wf.data.workflow_id);
      setWorkflowStep({ current: wf.data.current_step ?? 0, total: steps?.length ?? 0, status: wf.data.status ?? "—" });
    } else {
      setWorkflowStep(null);
    }
    onChange?.();
  }, [orgId, dbDocId, onChange]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!orgId) {
    return (
      <div className="rounded-xl bg-white border border-[#eceae2] p-4 text-sm text-[#0f2a1d]/70">
        اختر منشأة لتفعيل المرفقات وسير الاعتماد.
      </div>
    );
  }

  if (!dbDocId) {
    return (
      <div className="rounded-xl bg-white border border-dashed border-[#eceae2] p-6 text-center space-y-3">
        <CloudUpload className="w-8 h-8 text-[#0f2a1d]/50 mx-auto" />
        <div>
          <div className="text-sm font-semibold text-[#0f2a1d]">المرفقات وسير الاعتماد</div>
          <p className="text-xs text-[#0f2a1d]/60 mt-1">
            فعّل التخزين السحابي لهذا المستند لرفع المرفقات، متابعة الاعتماد، وسجل الأحداث.
          </p>
        </div>
        {onEnable && (
          <button
            disabled={enabling}
            onClick={() => onEnable()}
            className="text-xs px-3 py-2 rounded-lg bg-[#0f2a1d] text-[#d4f24a] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {enabling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
            تفعيل التخزين السحابي
          </button>
        )}
      </div>
    );
  }

  const statusLabel = doc?.status ? (STATUS_LABEL[doc.status] ?? doc.status) : "—";
  const approvalLabel = workflowStep
    ? workflowStep.status === "approved"
      ? "معتمد"
      : workflowStep.status === "rejected"
      ? "مرفوض"
      : "قيد المعالجة"
    : doc?.status === "approved" || doc?.status === "posted" ? "معتمد" : "—";

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-[#eceae2] p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <HeaderStat icon={<FileText className="w-3.5 h-3.5" />} label="الحالة" value={statusLabel} />
        <HeaderStat
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          label="خطوة الاعتماد"
          value={workflowStep ? `${workflowStep.current} / ${workflowStep.total}` : approvalLabel}
        />
        <HeaderStat icon={<Paperclip className="w-3.5 h-3.5" />} label="عدد المرفقات" value={String(attachmentCount)} />
        <HeaderStat icon={<LinkIcon className="w-3.5 h-3.5" />} label="مستندات مرتبطة" value={String(relationsCount)} />
      </div>

      <ApprovalPanel documentId={dbDocId} orgId={orgId} status={doc?.status ?? "draft"} onChange={reload} />

      <AttachmentUploader
        orgId={orgId}
        entityType="document"
        entityId={dbDocId}
        onUploadingChange={onUploadingChange}
      />

      <div className="rounded-xl bg-white border border-[#eceae2] p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-bold text-[#0f2a1d]">
          <Clock className="w-4 h-4" /> سجل الأحداث
        </div>
        {timeline.length === 0 ? (
          <div className="text-xs text-[#0f2a1d]/60">لا توجد أحداث بعد.</div>
        ) : (
          <ol className="space-y-2">
            {timeline.map((n) => {
              const meta = EVENT_LABELS[n.event_type] ?? { label: n.event_type, tone: "bg-slate-100 text-slate-700" };
              const d = new Date(n.created_at);
              return (
                <li key={n.id} className="flex items-start gap-3 text-xs border-b border-[#eceae2]/50 last:border-b-0 pb-2 last:pb-0">
                  <span className={`px-2 py-0.5 rounded ${meta.tone} whitespace-nowrap`}>{meta.label}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{n.title}</div>
                    {n.body && <div className="text-[11px] text-[#0f2a1d]/60 mt-0.5">{n.body}</div>}
                    <div className="text-[10px] text-[#0f2a1d]/50 mt-0.5">
                      {d.toLocaleDateString("ar-SA")} · {d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                      {n.user_id ? ` · ${n.user_id.slice(0, 8)}` : ""}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function HeaderStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f7f6f0] p-2.5">
      <div className="flex items-center gap-1 text-[10px] text-[#0f2a1d]/60">{icon}{label}</div>
      <div className="text-sm font-semibold text-[#0f2a1d] mt-0.5">{value}</div>
    </div>
  );
}

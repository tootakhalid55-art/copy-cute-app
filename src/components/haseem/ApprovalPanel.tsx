// Inline approval panel for any document. Shows workflow steps, current step,
// past actions, and Submit / Approve / Reject buttons.
import { useCallback, useEffect, useState } from "react";
import { Check, X, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { submitForApproval, actOnApproval } from "@/lib/db/workflow";

type Props = { documentId: string; orgId: string; status: string; onChange?: () => void };

export function ApprovalPanel({ documentId, orgId, status, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [request, setRequest] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);

  const load = useCallback(async () => {
    const { data: req } = await supabase
      .from("approval_requests")
      .select("*")
      .eq("document_id", documentId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRequest(req);
    if (req?.workflow_id) {
      const [{ data: s }, { data: a }] = await Promise.all([
        supabase.from("approval_steps").select("*").eq("workflow_id", req.workflow_id).order("step_order"),
        supabase.from("approval_actions").select("*").eq("request_id", req.id).order("created_at"),
      ]);
      setSteps(s ?? []);
      setActions(a ?? []);
    } else {
      setSteps([]);
      setActions([]);
    }
  }, [documentId, orgId]);

  useEffect(() => {
    load();
  }, [load, status]);

  const submit = async () => {
    setBusy(true);
    try {
      await submitForApproval(documentId, orgId);
      onChange?.();
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: "approve" | "reject") => {
    if (!request) return;
    setBusy(true);
    try {
      await actOnApproval(request.id, orgId, action, { comment });
      setComment("");
      onChange?.();
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-[#eceae2] rounded-xl bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-[#0f2a1d]">سير الاعتماد</div>
        <span className="text-[11px] px-2 py-0.5 rounded bg-[#f7f5ec]">{status}</span>
      </div>

      {status === "draft" && (
        <button
          disabled={busy}
          onClick={submit}
          className="text-xs px-3 py-2 rounded-lg bg-[#0f2a1d] text-[#d4f24a] font-semibold inline-flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          إرسال للاعتماد
        </button>
      )}

      {request && steps.length > 0 && (
        <ol className="space-y-2 mt-2">
          {steps.map((s) => {
            const acted = actions.find((a) => a.step_order === s.step_order);
            const isCurrent = request.current_step === s.step_order && request.status === "in_progress";
            return (
              <li key={s.id} className="flex items-center gap-2 text-xs">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${acted?.action === "approve" ? "bg-green-100 text-green-700" : acted?.action === "reject" ? "bg-red-100 text-red-700" : isCurrent ? "bg-[#0f2a1d] text-[#d4f24a]" : "bg-[#f7f5ec] text-[#0f2a1d]/60"}`}
                >
                  {s.step_order}
                </span>
                <div className="flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-[10px] text-[#0f2a1d]/60">
                    {s.approver_role ? `دور: ${s.approver_role}` : s.approver_user_id ? "مستخدم محدد" : "أي مستخدم"}
                    {acted?.comment ? ` · ${acted.comment}` : ""}
                  </div>
                </div>
                {acted && (acted.action === "approve" ? <Check className="w-4 h-4 text-green-600" /> : <X className="w-4 h-4 text-red-600" />)}
              </li>
            );
          })}
        </ol>
      )}

      {status === "pending_approval" && request?.status === "in_progress" && (
        <div className="mt-3 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="تعليق (اختياري)"
            className="w-full text-xs border border-[#eceae2] rounded-lg p-2"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => act("approve")}
              className="text-xs px-3 py-2 rounded-lg bg-green-600 text-white font-semibold inline-flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> اعتماد
            </button>
            <button
              disabled={busy}
              onClick={() => act("reject")}
              className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white font-semibold inline-flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" /> رفض
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

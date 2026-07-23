// Approval workflow engine.
//
// Supports:
//  - unlimited approval levels (steps ordered by step_order)
//  - amount-based rules (workflow.min_amount / max_amount)
//  - user-based approvers (step.approver_user_id)
//  - role-based approvers (step.approver_role)
//  - parallel or sequential execution (workflow.meta.mode = "parallel" | "sequential")
//  - auto approval (workflow.meta.auto = true — auto-approves at creation)
//  - auto-post on final approval (workflow.auto_post_on_final)
import { supabase } from "@/integrations/supabase/client";
import { transitionStatus } from "./documents";
import { emitDocEvent } from "./events";
import { enqueueNotification } from "./notifications";

export type WorkflowMode = "sequential" | "parallel";

export async function findMatchingWorkflow(orgId: string, docKind: string, amount: number) {
  const { data, error } = await supabase
    .from("approval_workflows")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .or(`doc_kind.eq.${docKind},doc_kind.is.null`);
  if (error) throw error;
  const candidates = (data ?? []).filter((w) => {
    const min = w.min_amount == null ? -Infinity : Number(w.min_amount);
    const max = w.max_amount == null ? Infinity : Number(w.max_amount);
    return amount >= min && amount <= max;
  });
  // Prefer the most specific workflow (kind match beats null, tighter amount range wins).
  candidates.sort((a, b) => {
    const specA = (a.doc_kind ? 2 : 0) + (a.min_amount != null || a.max_amount != null ? 1 : 0);
    const specB = (b.doc_kind ? 2 : 0) + (b.min_amount != null || b.max_amount != null ? 1 : 0);
    return specB - specA;
  });
  return candidates[0] ?? null;
}

export async function submitForApproval(documentId: string, orgId: string) {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id,kind,grand_total,doc_number,status")
    .eq("id", documentId)
    .eq("org_id", orgId)
    .single();
  if (error) throw error;

  const wf = await findMatchingWorkflow(orgId, doc.kind, Number(doc.grand_total ?? 0));
  if (!wf) {
    // no workflow → straight to approved
    await transitionStatus(documentId, orgId, "approved", { comment: "no workflow configured" });
    return { autoApproved: true };
  }

  const auto = (wf.meta as any)?.auto === true;
  if (auto) {
    await transitionStatus(documentId, orgId, "approved", { comment: `auto-approved by ${wf.name}` });
    if (wf.auto_post_on_final) await transitionStatus(documentId, orgId, "posted");
    return { autoApproved: true };
  }

  const { data: uid } = await supabase.auth.getUser();
  const { data: req, error: rErr } = await (supabase.from("approval_requests") as any)
    .insert({
      org_id: orgId,
      workflow_id: wf.id,
      document_id: documentId,
      entity_type: "document",
      entity_id: documentId,
      status: "in_progress",
      current_step: 1,
      requested_by: uid.user?.id ?? null,
      meta: { mode: (wf.meta as any)?.mode ?? "sequential" },
    })
    .select("*")
    .single();
  if (rErr) throw rErr;

  await transitionStatus(documentId, orgId, "pending_approval");
  await enqueueNotification({
    orgId,
    event_type: "document.submitted",
    entity_type: "document",
    entity_id: documentId,
    document_id: documentId,
    title: `مستند ${doc.doc_number} بانتظار الاعتماد`,
  });
  return { request: req, workflow: wf };
}

async function canActOnStep(orgId: string, step: any, userId: string) {
  if (step.approver_user_id) return step.approver_user_id === userId;
  if (step.approver_role) {
    const { data } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    return data?.role === step.approver_role;
  }
  return true; // no restriction
}

export async function actOnApproval(
  requestId: string,
  orgId: string,
  action: "approve" | "reject",
  opts?: { comment?: string; stepId?: string },
) {
  const { data: uid } = await supabase.auth.getUser();
  const userId = uid.user?.id;
  if (!userId) throw new Error("not signed in");

  const { data: req, error } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("id", requestId)
    .eq("org_id", orgId)
    .single();
  if (error) throw error;
  if (req.status !== "in_progress") throw new Error("request is not open");

  const { data: wf } = await supabase.from("approval_workflows").select("*").eq("id", req.workflow_id!).single();
  const { data: steps } = await supabase
    .from("approval_steps")
    .select("*")
    .eq("workflow_id", req.workflow_id!)
    .order("step_order", { ascending: true });
  if (!steps || steps.length === 0) throw new Error("workflow has no steps");

  const mode: WorkflowMode = ((req.meta as any)?.mode ?? "sequential") as WorkflowMode;
  const targetStep = opts?.stepId
    ? steps.find((s) => s.id === opts.stepId)
    : mode === "sequential"
      ? steps.find((s) => s.step_order === req.current_step)
      : steps[0];
  if (!targetStep) throw new Error("no step to act on");
  const authorized = await canActOnStep(orgId, targetStep, userId);
  if (!authorized) throw new Error("not authorized for this step");

  await (supabase.from("approval_actions") as any).insert({
    org_id: orgId,
    request_id: requestId,
    step_id: targetStep.id,
    step_order: targetStep.step_order,
    action,
    actor_id: userId,
    comment: opts?.comment ?? null,
  });

  if (action === "reject") {
    await (supabase.from("approval_requests") as any)
      .update({ status: "rejected", completed_at: new Date().toISOString() })
      .eq("id", requestId);
    if (req.document_id) {
      await transitionStatus(req.document_id, orgId, "draft", { comment: `rejected: ${opts?.comment ?? ""}` });
      await emitDocEvent({
        type: "document.rejected",
        orgId,
        entityType: "document",
        entityId: req.document_id,
        actorId: userId,
        payload: { requestId, comment: opts?.comment },
      });
    }
    return { done: true, outcome: "rejected" };
  }

  // approve → check completion
  const { data: actions } = await supabase
    .from("approval_actions")
    .select("step_order,action,actor_id")
    .eq("request_id", requestId);
  const approvedSteps = new Set(
    (actions ?? []).filter((a) => a.action === "approve").map((a) => a.step_order),
  );

  const remaining = steps.filter((s) => s.required && !approvedSteps.has(s.step_order));

  if (remaining.length === 0) {
    await (supabase.from("approval_requests") as any)
      .update({ status: "approved", completed_at: new Date().toISOString() })
      .eq("id", requestId);
    if (req.document_id) {
      await transitionStatus(req.document_id, orgId, "approved", { comment: opts?.comment });
      if (wf?.auto_post_on_final) {
        await transitionStatus(req.document_id, orgId, "posted");
      }
    }
    return { done: true, outcome: "approved" };
  }

  if (mode === "sequential") {
    const next = steps.find((s) => s.step_order > (targetStep.step_order ?? 0) && s.required);
    if (next) {
      await (supabase.from("approval_requests") as any)
        .update({ current_step: next.step_order })
        .eq("id", requestId);
    }
  }
  return { done: false };
}

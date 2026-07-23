// Multi-level approvals, corrections learning, background queue, PO/GRN validation.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Approvals ----------
export const submitApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { intakeId?: string; decision?: string; comment?: string; level?: number };
    if (!i?.intakeId) throw new Error("intakeId is required");
    if (!i?.decision) throw new Error("decision is required");
    return {
      intakeId: i.intakeId,
      decision: i.decision as "approved" | "rejected" | "commented",
      comment: i.comment || "",
      level: Number(i.level) || 1,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: intake, error } = await supabase
      .from("ap_intake_documents")
      .select("id, org_id, status")
      .eq("id", data.intakeId)
      .single();
    if (error || !intake) throw new Error("Intake not found");

    await supabase.from("ap_intake_approvals").insert({
      intake_id: intake.id,
      org_id: intake.org_id,
      level: data.level,
      decision: data.decision,
      comment: data.comment,
      actor_id: userId,
    });

    // Track in audit trail
    await supabase.from("ap_intake_events").insert({
      intake_id: intake.id,
      org_id: intake.org_id,
      event_type: `approval_${data.decision}`,
      actor_id: userId,
      payload: { level: data.level, comment: data.comment },
    });

    if (data.decision === "rejected") {
      await supabase
        .from("ap_intake_documents")
        .update({ status: "rejected", error_message: data.comment || null })
        .eq("id", intake.id);
    }

    return { ok: true };
  });

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { intakeId?: string };
    if (!i?.intakeId) throw new Error("intakeId is required");
    return { intakeId: i.intakeId };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("ap_intake_approvals")
      .select("*")
      .eq("intake_id", data.intakeId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows || [];
  });

// ---------- Corrections (learning) ----------
export const recordCorrections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as {
      intakeId?: string;
      partyId?: string | null;
      corrections?: Array<{ field_path: string; extracted: any; corrected: any }>;
    };
    if (!i?.intakeId) throw new Error("intakeId is required");
    if (!Array.isArray(i.corrections) || i.corrections.length === 0) return { intakeId: i.intakeId, partyId: null, corrections: [] };
    return { intakeId: i.intakeId, partyId: i.partyId || null, corrections: i.corrections };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.corrections.length) return { ok: true, count: 0 };

    const { data: intake } = await supabase
      .from("ap_intake_documents")
      .select("org_id")
      .eq("id", data.intakeId)
      .single();
    if (!intake) throw new Error("Intake not found");

    const rows = data.corrections.map((c) => ({
      org_id: intake.org_id,
      intake_id: data.intakeId,
      party_id: data.partyId,
      field_path: c.field_path,
      extracted_value: c.extracted ?? null,
      corrected_value: c.corrected ?? null,
      actor_id: userId,
    }));
    const { error } = await supabase.from("ap_intake_corrections").insert(rows as any);
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

// ---------- Validation on demand ----------
export const validateIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { intakeId?: string };
    if (!i?.intakeId) throw new Error("intakeId is required");
    return { intakeId: i.intakeId };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("ap_intake_documents")
      .select("id, org_id, extraction, matched_party_id")
      .eq("id", data.intakeId)
      .single();
    if (error || !row) throw new Error("Intake not found");

    const { validateExtraction, matchPurchaseOrderAndGrn } = await import("./validation.server");
    const validation = validateExtraction(row.extraction || {});
    const { poId, grnId } = await matchPurchaseOrderAndGrn(
      supabase,
      row.org_id,
      row.matched_party_id,
      Number((row.extraction as any)?.grandTotal || 0),
      (row.extraction as any)?.invoiceDate || null,
    );

    await supabase
      .from("ap_intake_documents")
      .update({
        validation: validation as any,
        po_document_id: poId,
        grn_document_id: grnId,
      })
      .eq("id", row.id);

    return { validation, poId, grnId };
  });

// ---------- Queue: enqueue + process ----------
export const enqueueIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { intakeId?: string; payload?: Record<string, any> };
    if (!i?.intakeId) throw new Error("intakeId is required");
    return { intakeId: i.intakeId, payload: i.payload || {} };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("ap_intake_documents")
      .select("org_id")
      .eq("id", data.intakeId)
      .single();
    if (!row) throw new Error("Intake not found");

    const { data: q, error } = await supabase
      .from("ap_intake_queue")
      .insert({ org_id: row.org_id, intake_id: data.intakeId, payload: data.payload })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { queueId: q.id };
  });

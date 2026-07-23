// Configurable approval thresholds: pick the matching rule for an intake
// based on amount range, supplier, and branch (business unit).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listThresholds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string };
    if (!i?.orgId) throw new Error("orgId is required");
    return { orgId: i.orgId };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("ap_approval_thresholds")
      .select("*")
      .eq("org_id", data.orgId)
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const upsertThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as any;
    if (!i?.orgId) throw new Error("orgId is required");
    if (!i?.name) throw new Error("name is required");
    return {
      id: i.id || null,
      orgId: i.orgId,
      name: String(i.name),
      min_amount: Number(i.min_amount) || 0,
      max_amount: i.max_amount == null || i.max_amount === "" ? null : Number(i.max_amount),
      party_id: i.party_id || null,
      branch_id: i.branch_id || null,
      required_levels: Math.max(1, Number(i.required_levels) || 1),
      auto_post: !!i.auto_post,
      active: i.active !== false,
      priority: Number(i.priority) || 100,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload = {
      org_id: data.orgId, name: data.name,
      min_amount: data.min_amount, max_amount: data.max_amount,
      party_id: data.party_id, branch_id: data.branch_id,
      required_levels: data.required_levels, auto_post: data.auto_post,
      active: data.active, priority: data.priority,
    };
    if (data.id) {
      const { error } = await supabase.from("ap_approval_thresholds").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("ap_approval_thresholds").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { id?: string };
    if (!i?.id) throw new Error("id is required");
    return { id: i.id };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("ap_approval_thresholds").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Resolve the matching threshold for an intake — used by the review UI to
// show "N approvals needed" and by the intake pipeline for auto-post gating.
export const resolveThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string; amount?: number; partyId?: string | null; branchId?: string | null };
    if (!i?.orgId) throw new Error("orgId is required");
    return {
      orgId: i.orgId, amount: Number(i.amount) || 0,
      partyId: i.partyId || null, branchId: i.branchId || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("ap_approval_thresholds")
      .select("*")
      .eq("org_id", data.orgId)
      .eq("active", true)
      .order("priority", { ascending: true });
    const match = (rows || []).find((r: any) =>
      (r.party_id == null || r.party_id === data.partyId) &&
      (r.branch_id == null || r.branch_id === data.branchId) &&
      data.amount >= Number(r.min_amount) &&
      (r.max_amount == null || data.amount <= Number(r.max_amount)),
    );
    return match || { required_levels: 1, auto_post: false, name: "افتراضي" };
  });

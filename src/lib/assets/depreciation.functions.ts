// Phase C2B — Depreciation Engine server functions
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PreviewRow = {
  asset_id: string;
  code: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  cost_center_id: string | null;
  method: string;
  opening_nbv: number;
  depreciation: number;
  closing_nbv: number;
  already_posted: boolean;
  reason: string | null;
};

export const previewDepreciation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId: string; periodEnd: string; categoryId?: string; branchId?: string };
    if (!i?.orgId || !i?.periodEnd) throw new Error("orgId and periodEnd are required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any).rpc("fa_preview_depreciation", {
      _org: data.orgId,
      _period_end: data.periodEnd,
      _category_id: data.categoryId ?? null,
      _branch_id: data.branchId ?? null,
    });
    if (error) throw new Error(error.message);
    return (rows || []) as PreviewRow[];
  });

export const postDepreciationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId: string; periodEnd: string; memo?: string };
    if (!i?.orgId || !i?.periodEnd) throw new Error("orgId and periodEnd are required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: runId, error } = await (context.supabase as any).rpc("fa_post_depreciation_run", {
      _org: data.orgId,
      _period_end: data.periodEnd,
      _memo: data.memo ?? null,
    });
    if (error) throw new Error(error.message);
    return { runId: runId as string | null };
  });

export const reverseDepreciationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { runId: string; memo?: string };
    if (!i?.runId) throw new Error("runId is required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: runId, error } = await (context.supabase as any).rpc("fa_reverse_depreciation_run", {
      _run_id: data.runId,
      _memo: data.memo ?? null,
    });
    if (error) throw new Error(error.message);
    return { runId: runId as string };
  });

export const listDepreciationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId: string };
    if (!i?.orgId) throw new Error("orgId is required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("fixed_asset_runs")
      .select("*")
      .eq("org_id", data.orgId)
      .order("period_end", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const listAssetSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { assetId: string };
    if (!i?.assetId) throw new Error("assetId is required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("fixed_asset_schedules")
      .select("*")
      .eq("asset_id", data.assetId)
      .order("period_end", { ascending: true });
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const forecastAssetDepreciation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { assetId: string; months?: number };
    if (!i?.assetId) throw new Error("assetId is required");
    return { assetId: i.assetId, months: Math.min(Math.max(i.months || 60, 1), 240) };
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any).rpc("fa_depreciation_forecast", {
      _asset_id: data.assetId,
      _months: data.months,
    });
    if (error) throw new Error(error.message);
    return (rows || []) as Array<{
      period_end: string;
      opening_nbv: number;
      depreciation: number;
      accumulated: number;
      closing_nbv: number;
    }>;
  });

export const upsertMethodParams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as {
      orgId: string; assetId: string;
      total_units?: number | null; units_this_period?: number | null;
      ddb_factor?: number | null; manual_monthly_amount?: number | null;
    };
    if (!i?.orgId || !i?.assetId) throw new Error("orgId and assetId are required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("fixed_asset_method_params")
      .upsert({
        org_id: data.orgId,
        asset_id: data.assetId,
        total_units: data.total_units ?? null,
        units_this_period: data.units_this_period ?? null,
        ddb_factor: data.ddb_factor ?? 2.0,
        manual_monthly_amount: data.manual_monthly_amount ?? null,
      }, { onConflict: "asset_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Phase C2B Hardening ----------
export const simulateDepreciationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId: string; periodEnd: string; categoryId?: string };
    if (!i?.orgId || !i?.periodEnd) throw new Error("orgId and periodEnd are required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase as any).rpc("fa_simulate_run", {
      _org: data.orgId,
      _period_end: data.periodEnd,
      _category_id: data.categoryId ?? null,
    });
    if (error) throw new Error(error.message);
    return result as {
      summary: { asset_count: number; total_depreciation: number; skipped: number };
      journal_lines: Array<{ category: string; debit_expense: number; credit_accum: number }>;
      blocking_errors: Array<{ code: string; message: string }>;
      can_post: boolean;
      preview: PreviewRow[];
    };
  });

export const explainSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { scheduleId: string };
    if (!i?.scheduleId) throw new Error("scheduleId is required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: r, error } = await (context.supabase as any).rpc("fa_explain_schedule", {
      _schedule_id: data.scheduleId,
    });
    if (error) throw new Error(error.message);
    return r as Record<string, any>;
  });

export const listExceptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId: string };
    if (!i?.orgId) throw new Error("orgId is required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("v_fixed_asset_exceptions")
      .select("*")
      .eq("org_id", data.orgId)
      .not("exception_type", "is", null)
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows || []) as Array<{
      asset_id: string; code: string; name: string; status: string;
      exception_type: string; acquisition_cost: number; residual_value: number | null;
      useful_life_months: number | null; method: string | null; in_service_date: string | null;
    }>;
  });

export const listCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId: string; year?: number };
    if (!i?.orgId) throw new Error("orgId is required");
    return { orgId: i.orgId, year: i.year || new Date().getFullYear() };
  })
  .handler(async ({ data, context }) => {
    const from = `${data.year}-01-01`;
    const to = `${data.year}-12-31`;
    const { data: rows, error } = await (context.supabase as any)
      .from("v_fa_calendar")
      .select("*")
      .eq("org_id", data.orgId)
      .gte("start_date", from)
      .lte("end_date", to)
      .order("start_date", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows || []) as Array<{
      period_id: string; period_name: string; start_date: string; end_date: string;
      period_status: string; fa_locked: boolean; posted_run_id: string | null;
      posted_runs: number; reversed_runs: number; posted_total: number;
    }>;
  });

export const reopenPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId: string; periodEnd: string; reason: string };
    if (!i?.orgId || !i?.periodEnd || !i?.reason) throw new Error("orgId, periodEnd, reason required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: r, error } = await (context.supabase as any).rpc("fa_reopen_period", {
      _org: data.orgId,
      _period_end: data.periodEnd,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return r as { ok: boolean };
  });

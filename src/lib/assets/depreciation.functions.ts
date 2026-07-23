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

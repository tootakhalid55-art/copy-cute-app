// Fixed Assets lifecycle server functions — thin wrappers around fa_* RPCs.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Method = "sale" | "scrap" | "donation";

async function callRpc(ctx: any, name: string, args: Record<string, unknown>) {
  const { data, error } = await ctx.supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export const disposeAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string; method: Method; proceeds: number; date: string; notes?: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_dispose", {
    _asset_id: data.assetId, _method: data.method, _proceeds: data.proceeds, _date: data.date, _notes: data.notes ?? null,
  }));

export const transferAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string; toBranch?: string; toCostCenter?: string; custodianUser?: string; custodianName?: string; location?: string; date: string; notes?: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_transfer", {
    _asset_id: data.assetId, _to_branch: data.toBranch ?? null, _to_cost_center: data.toCostCenter ?? null,
    _custodian_user: data.custodianUser ?? null, _custodian_name: data.custodianName ?? null,
    _location: data.location ?? null, _date: data.date, _notes: data.notes ?? null,
  }));

export const revalueAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string; newFairValue: number; date: string; notes?: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_revalue", {
    _asset_id: data.assetId, _new_fair_value: data.newFairValue, _date: data.date, _notes: data.notes ?? null,
  }));

export const impairAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string; recoverableAmount: number; date: string; reason?: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_impair", {
    _asset_id: data.assetId, _recoverable_amount: data.recoverableAmount, _date: data.date, _reason: data.reason ?? null,
  }));

export const reverseAssetImpairment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string; recoverableAmount: number; date: string; reason?: string; idempotencyKey?: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_reverse_impairment", {
    _asset_id: data.assetId,
    _recoverable_amount: data.recoverableAmount,
    _date: data.date,
    _reason: data.reason ?? null,
    _idempotency_key: data.idempotencyKey ?? null,
  }));

export const improveAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string; amount: number; extendLifeMonths?: number; date: string; notes?: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_improve", {
    _asset_id: data.assetId, _amount: data.amount, _extend_life_months: data.extendLifeMonths ?? 0,
    _date: data.date, _notes: data.notes ?? null,
  }));

export const retireAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string; date: string; notes?: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_retire", { _asset_id: data.assetId, _date: data.date, _notes: data.notes ?? null }));

export const reactivateAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string; date: string; notes?: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_reactivate", { _asset_id: data.assetId, _date: data.date, _notes: data.notes ?? null }));

export const splitAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string; splits: Array<{ name: string; code?: string; pct: number }>; date: string; notes?: string; idempotencyKey?: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_split", {
    _asset_id: data.assetId, _splits: data.splits, _date: data.date, _notes: data.notes ?? null,
    _idempotency_key: data.idempotencyKey ?? null,
  }));

export const mergeAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; assetIds: string[]; targetName: string; targetCode: string; date: string; notes?: string; idempotencyKey?: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_merge", {
    _org: data.orgId, _asset_ids: data.assetIds, _target_name: data.targetName, _target_code: data.targetCode,
    _date: data.date, _notes: data.notes ?? null,
    _idempotency_key: data.idempotencyKey ?? null,
  }));

export const reverseAssetEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { eventId: string; reason: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_reverse_event", { _event_id: data.eventId, _reason: data.reason }));

export const getAssetTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("v_asset_timeline")
      .select("*")
      .eq("asset_id", data.assetId)
      .order("event_date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getAssetHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_calculate_health_score", {
    _asset_id: data.assetId,
  }));

export const refreshAssetHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string }) => d)
  .handler(({ data, context }) => callRpc(context, "fa_refresh_health_score", {
    _asset_id: data.assetId,
  }));

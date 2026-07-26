import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAssetReportsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const value = input as { orgId?: string; from?: string; to?: string };
    if (!value?.orgId) throw new Error("orgId required");
    return {
      orgId: value.orgId,
      from: value.from || `${new Date().getFullYear()}-01-01`,
      to: value.to || new Date().toISOString().slice(0, 10),
    };
  })
  .handler(async ({ data, context }) => {
    const [assetsResult, eventsResult] = await Promise.all([
      context.supabase
        .from("fixed_assets")
        .select("id,code,name,status,is_cip,category_id,category:fixed_asset_categories(name),acquisition_cost,residual_value,accumulated_depreciation,revaluation_surplus,impairment_loss,acquisition_date,in_service_date,disposed_at,disposal_method,branch_id,cost_center_id,department,custodian_name,location_text,currency,health_score,health_tier,created_at")
        .eq("org_id", data.orgId)
        .order("code"),
      context.supabase
        .from("fixed_asset_events")
        .select("id,asset_id,event_type,status,effective_date,amount,payload,journal_id,notes,created_at")
        .eq("org_id", data.orgId)
        .gte("effective_date", data.from)
        .lte("effective_date", data.to)
        .order("effective_date", { ascending: false })
        .limit(2000),
    ]);
    if (assetsResult.error) throw new Error(assetsResult.error.message);
    if (eventsResult.error) throw new Error(eventsResult.error.message);
    return { assets: assetsResult.data || [], events: eventsResult.data || [] };
  });

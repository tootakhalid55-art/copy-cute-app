// Phase C2A — Fixed Assets Registry server functions
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Settings ----------
export const getAssetSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string };
    if (!i?.orgId) throw new Error("orgId is required");
    return { orgId: i.orgId };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("fixed_asset_settings")
      .select("*")
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateAssetSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as any;
    if (!i?.orgId) throw new Error("orgId is required");
    return {
      orgId: i.orgId,
      capitalization_threshold: Number(i.capitalization_threshold) || 5000,
      default_currency: i.default_currency || "SAR",
      default_convention: i.default_convention || "full_month",
      default_method: i.default_method || "straight_line",
      default_useful_life_months: Number(i.default_useful_life_months) || 60,
    };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("fixed_asset_settings")
      .upsert({
        org_id: data.orgId,
        capitalization_threshold: data.capitalization_threshold,
        default_currency: data.default_currency,
        default_convention: data.default_convention,
        default_method: data.default_method,
        default_useful_life_months: data.default_useful_life_months,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Categories ----------
export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string };
    if (!i?.orgId) throw new Error("orgId is required");
    return { orgId: i.orgId };
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("fixed_asset_categories")
      .select("*")
      .eq("org_id", data.orgId)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as any;
    if (!i?.orgId || !i?.code || !i?.name) throw new Error("orgId, code, name required");
    return {
      id: i.id || null,
      orgId: i.orgId,
      parent_id: i.parent_id || null,
      code: String(i.code),
      name: String(i.name),
      name_en: i.name_en || null,
      default_useful_life_months: i.default_useful_life_months == null ? null : Number(i.default_useful_life_months),
      default_method: i.default_method || "straight_line",
      default_salvage_pct: Number(i.default_salvage_pct) || 0,
      revaluation_model: i.revaluation_model || "cost",
      is_active: i.is_active !== false,
    };
  })
  .handler(async ({ data, context }) => {
    const { id, orgId, ...rest } = data;
    const payload = { org_id: orgId, ...rest };
    if (id) {
      const { error } = await context.supabase.from("fixed_asset_categories").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await context.supabase
      .from("fixed_asset_categories").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { id?: string };
    if (!i?.id) throw new Error("id required");
    return { id: i.id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("fixed_asset_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Groups ----------
export const listGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string };
    if (!i?.orgId) throw new Error("orgId required");
    return { orgId: i.orgId };
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("fixed_asset_groups").select("*").eq("org_id", data.orgId).order("code");
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const upsertGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as any;
    if (!i?.orgId || !i?.code || !i?.name) throw new Error("orgId, code, name required");
    return {
      id: i.id || null, orgId: i.orgId,
      code: String(i.code), name: String(i.name), name_en: i.name_en || null,
      description: i.description || null, is_active: i.is_active !== false,
    };
  })
  .handler(async ({ data, context }) => {
    const { id, orgId, ...rest } = data;
    const payload = { org_id: orgId, ...rest };
    if (id) {
      const { error } = await context.supabase.from("fixed_asset_groups").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await context.supabase
      .from("fixed_asset_groups").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { id?: string };
    if (!i?.id) throw new Error("id required");
    return { id: i.id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("fixed_asset_groups").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Assets ----------
export const listAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string; status?: string; cip?: boolean; search?: string };
    if (!i?.orgId) throw new Error("orgId required");
    return { orgId: i.orgId, status: i.status || null, cip: i.cip ?? null, search: i.search || "" };
  })
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("fixed_assets_overview")
      .select("*")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status as any);
    if (data.cip === true) q = q.eq("is_cip", true);
    if (data.cip === false) q = q.eq("is_cip", false);
    if (data.search) q = q.or(`name.ilike.%${data.search}%,code.ilike.%${data.search}%,serial_number.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const getAsset = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { id?: string };
    if (!i?.id) throw new Error("id required");
    return { id: i.id };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("fixed_assets").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as any;
    if (!i?.orgId) throw new Error("orgId required");
    if (!i?.name) throw new Error("name required");
    return { id: i.id || null, orgId: i.orgId, payload: i };
  })
  .handler(async ({ data, context }) => {
    const p = data.payload;
    const row: any = {
      org_id: data.orgId,
      code: p.code, name: p.name, name_en: p.name_en || null, description: p.description || null,
      category_id: p.category_id || null, group_id: p.group_id || null,
      parent_asset_id: p.parent_asset_id || null, is_component: !!p.is_component,
      barcode: p.barcode || null, qr_payload: p.qr_payload || null, rfid_tag: p.rfid_tag || null,
      serial_number: p.serial_number || null, manufacturer: p.manufacturer || null, model: p.model || null,
      warranty_from: p.warranty_from || null, warranty_to: p.warranty_to || null,
      supplier_party_id: p.supplier_party_id || null,
      purchase_order_id: p.purchase_order_id || null, bill_document_id: p.bill_document_id || null,
      branch_id: p.branch_id || null, department: p.department || null,
      cost_center_id: p.cost_center_id || null, project: p.project || null,
      custodian_user_id: p.custodian_user_id || null, custodian_name: p.custodian_name || null,
      location_text: p.location_text || null,
      gps_lat: p.gps_lat == null || p.gps_lat === "" ? null : Number(p.gps_lat),
      gps_lng: p.gps_lng == null || p.gps_lng === "" ? null : Number(p.gps_lng),
      acquisition_cost: Number(p.acquisition_cost) || 0,
      residual_value: Number(p.residual_value) || 0,
      useful_life_months: p.useful_life_months == null || p.useful_life_months === "" ? null : Number(p.useful_life_months),
      method: p.method || "straight_line",
      acquisition_date: p.acquisition_date || null,
      in_service_date: p.in_service_date || null,
      currency: p.currency || "SAR",
      status: p.status || "draft",
      is_cip: !!p.is_cip,
      notes: p.notes || null,
      custom: p.custom || {},
    };
    if (!row.code) {
      row.code = `FA-${Date.now().toString(36).toUpperCase()}`;
    }
    if (data.id) {
      const { error } = await context.supabase.from("fixed_assets").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("fixed_assets").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { id?: string };
    if (!i?.id) throw new Error("id required");
    return { id: i.id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("fixed_assets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Capitalize from an AP bill using the SQL RPC
export const capitalizeFromBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as any;
    if (!i?.orgId || !i?.billId) throw new Error("orgId, billId required");
    return { orgId: i.orgId, billId: i.billId, payload: i.payload || {} };
  })
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("capitalize_asset_from_bill", {
      _org: data.orgId, _bill: data.billId, _payload: data.payload,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

// List bills that could be capitalized (posted purchase bills that are not linked to an asset yet)
export const listCapitalizableBills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string; minAmount?: number };
    if (!i?.orgId) throw new Error("orgId required");
    return { orgId: i.orgId, minAmount: Number(i.minAmount) || 0 };
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("documents")
      .select("id, doc_number, issue_date, grand_total, currency, party_id, party_snapshot")
      .eq("org_id", data.orgId)
      .in("kind", ["purchase_invoice"])
      .gte("grand_total", data.minAmount)
      .order("issue_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const bills = rows || [];
    if (bills.length === 0) return [];
    const { data: linked } = await context.supabase
      .from("fixed_assets")
      .select("bill_document_id")
      .eq("org_id", data.orgId)
      .in("bill_document_id", bills.map((b) => b.id));
    const linkedSet = new Set((linked || []).map((r) => r.bill_document_id));
    return bills.filter((b) => !linkedSet.has(b.id));
  });

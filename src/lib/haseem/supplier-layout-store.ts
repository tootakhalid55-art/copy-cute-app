import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Optimistic concurrency protects templates and OCR hints from lost updates. */
export const SCAN_TEMPLATES_KEY = "canarVisualTemplatesV1";
export async function editSupplierHints(client: SupabaseClient<Database>, orgId: string, partyId: string, edit: (hints: Record<string, unknown>) => Record<string, unknown>, incrementSamples = false) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await client.from("ap_supplier_layouts").select("id,hints,updated_at,sample_count").eq("org_id", orgId).eq("party_id", partyId).maybeSingle();
    if (error) throw error;
    const hints = edit((data?.hints ?? {}) as Record<string, unknown>) as Database["public"]["Tables"]["ap_supplier_layouts"]["Row"]["hints"];
    const learning = incrementSamples ? { sample_count: (data?.sample_count ?? 0) + 1, last_seen_at: new Date().toISOString() } : {};
    if (data) {
      const result = await client.from("ap_supplier_layouts").update({ hints, ...learning }).eq("id", data.id).eq("org_id", orgId).eq("updated_at", data.updated_at).select("id");
      if (result.error) throw result.error;
      if (result.data?.length) return;
    } else {
      const result = await client.from("ap_supplier_layouts").insert({ org_id: orgId, party_id: partyId, hints, ...learning });
      if (!result.error) return;
      if (result.error.code !== "23505") throw result.error;
    }
  }
  throw new Error("تغيّرت القوالب أثناء الحفظ؛ أعد المحاولة");
}

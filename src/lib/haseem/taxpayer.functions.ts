import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { lookupTaxpayer } from "./taxpayer.server";
import { compareTaxpayer } from "./taxpayer";
import { vatDigits } from "./vat";

export const verifyTaxpayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const value = input as { vatNumber?: unknown; orgId?: unknown };
    if (typeof value?.vatNumber !== "string" || value.vatNumber.length > 50 || typeof value.orgId !== "string") throw new Error("بيانات التحقق غير صحيحة");
    return { vatNumber: value.vatNumber, orgId: value.orgId };
  })
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase.from("organizations").select("id").eq("id", data.orgId).single();
    if (error || !org) throw new Error("لا توجد صلاحية للوصول إلى المنشأة");
    return lookupTaxpayer(data.vatNumber);
  });

// Only the server may write evidence used by the database posting guard.
export const verifyPurchaseForPosting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const value = input as { orgId?: unknown; documentId?: unknown };
    if (typeof value?.orgId !== "string" || typeof value.documentId !== "string") throw new Error("invalid_document");
    return { orgId: value.orgId, documentId: value.documentId };
  })
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase.from("documents").select("id,org_id,kind,party_id,meta,party_snapshot")
      .eq("id", data.documentId).eq("org_id", data.orgId).single();
    if (error || !doc) throw new Error("document_not_found");
    if (doc.kind !== "purchase_invoice") return { ok: true };
    const { data: party, error: partyError } = await context.supabase.from("parties").select("id,name,vat_number")
      .eq("id", doc.party_id ?? "").eq("org_id", data.orgId).single();
    if (partyError || !party) throw new Error("اختر المورد قبل التحقق");
    const meta = (doc.meta ?? {}) as Record<string, unknown>;
    const snapshot = (doc.party_snapshot ?? {}) as Record<string, unknown>;
    const vat = String(meta.supplierVatNumber ?? party.vat_number ?? "");
    const name = String(meta.supplierInvoiceName ?? snapshot.name ?? party.name ?? "");
    if (vatDigits(party.vat_number) !== vatDigits(vat)) throw new Error("رقم الفاتورة الضريبي لا يطابق سجل المورد؛ احفظ مسودة للمراجعة");
    const result = await lookupTaxpayer(vat);
    const match = compareTaxpayer(result, vat, name);
    const partyMatch = compareTaxpayer(result, vat, party.name);
    if (!match.matches || !partyMatch.matches) throw new Error(!match.matches ? match.message : partyMatch.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: saveError } = await (supabaseAdmin as any).from("taxpayer_posting_checks").upsert({
      document_id: doc.id, org_id: doc.org_id, party_id: party.id,
      invoice_vat: vat, invoice_name: name, party_vat: party.vat_number, party_name: party.name,
      checked_at: result.checkedAt, checked_by: context.userId, result,
    }, { onConflict: "document_id" });
    if (saveError) throw new Error("تعذر حفظ دليل التحقق؛ تأكد من تطبيق ترقية قاعدة البيانات");
    return { ok: true };
  });

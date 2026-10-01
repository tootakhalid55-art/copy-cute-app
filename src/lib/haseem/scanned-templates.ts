import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/db/org";
import type { InvoiceTemplate } from "./templates";
import { parseScannedLayout } from "./scanned-layout";
import { editSupplierHints, SCAN_TEMPLATES_KEY } from "./supplier-layout-store";

export type ScannedTemplate = InvoiceTemplate & { supplierId: string; source: "scan"; createdAt: string };
export function readScannedTemplates(hints: Record<string, unknown>, supplierId: string): ScannedTemplate[] {
  const rows = hints[SCAN_TEMPLATES_KEY];
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    if (!row || typeof row.id !== "string" || !row.id.startsWith("scan-") || typeof row.name !== "string") return [];
    const scannedLayout = parseScannedLayout(row.scannedLayout);
    if (!scannedLayout) return [];
    return [{ id: row.id, name: row.name.slice(0, 100), desc: String(row.desc ?? "").slice(0, 300), accent: scannedLayout.table.headerBackground, onAccent: scannedLayout.table.headerColor, soft: scannedLayout.table.stripe, kinds: ["bill"], supplierId, source: "scan", createdAt: String(row.createdAt ?? ""), scannedLayout } as ScannedTemplate];
  });
}

export function useScannedTemplates() {
  const { currentOrgId } = useOrg();
  const qc = useQueryClient();
  const key = ["scanned-templates", currentOrgId];
  const query = useQuery({ queryKey: key, enabled: !!currentOrgId, queryFn: async () => {
    const all: ScannedTemplate[] = [];
    for (let offset = 0; ; offset += 200) {
      const { data, error } = await supabase.from("ap_supplier_layouts").select("party_id,hints").eq("org_id", currentOrgId!).order("id").range(offset, offset + 199);
      if (error) throw error;
      for (const row of data ?? []) all.push(...readScannedTemplates((row.hints ?? {}) as Record<string, unknown>, row.party_id));
      if (!data || data.length < 200) return all;
    }
  } });
  const save = async (template: ScannedTemplate) => {
    if (!currentOrgId) throw new Error("اختر المنشأة قبل حفظ القالب");
    const clean = readScannedTemplates({ [SCAN_TEMPLATES_KEY]: [template] }, template.supplierId)[0];
    if (!clean) throw new Error("قالب المسح غير صالح");
    // Verify that a supplier reference is in this organization, not just a FK.
    const { data: party, error } = await supabase.from("parties").select("id").eq("org_id", currentOrgId).eq("id", clean.supplierId).single();
    if (error || !party) throw new Error("المورد غير متاح في هذه المنشأة");
    await editSupplierHints(supabase, currentOrgId, clean.supplierId, hints => {
      const items = readScannedTemplates(hints, clean.supplierId).filter(t => t.id !== clean.id);
      if (items.length >= 50) throw new Error("وصل المورد إلى 50 قالبًا؛ احذف قالبًا غير مستخدم ثم أعد المحاولة");
      return { ...hints, [SCAN_TEMPLATES_KEY]: [...items, clean] };
    });
    await qc.invalidateQueries({ queryKey: key });
    return clean;
  };
  const remove = async (template: ScannedTemplate) => {
    if (!currentOrgId) throw new Error("اختر المنشأة");
    await editSupplierHints(supabase, currentOrgId, template.supplierId, hints => ({ ...hints, [SCAN_TEMPLATES_KEY]: readScannedTemplates(hints, template.supplierId).filter(t => t.id !== template.id) }));
    await qc.invalidateQueries({ queryKey: key });
  };
  return { items: query.data ?? [], error: query.error, loading: query.isLoading, save, remove };
}

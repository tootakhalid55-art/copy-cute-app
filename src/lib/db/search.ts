// Global search — hits documents.search_text (populated by trigger), tags,
// parties (customers + suppliers), and attachment filenames. OCR searchable_text
// column is already indexed; when Batch 2C wires the OCR worker, results here
// will begin including OCR matches automatically.
import { supabase } from "@/integrations/supabase/client";

export type SearchHit = {
  type: "document" | "tag" | "party" | "attachment";
  id: string;
  title: string;
  subtitle?: string | null;
  meta?: Record<string, any>;
};

export async function globalSearch(orgId: string, query: string, limit = 8): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const like = `%${q}%`;

  const [docs, tags, parties, atts] = await Promise.all([
    supabase
      .from("documents")
      .select("id,doc_number,kind,party_snapshot,grand_total,search_text")
      .eq("org_id", orgId)
      .ilike("search_text", like)
      .limit(limit),
    supabase.from("tags").select("id,name,color").eq("org_id", orgId).ilike("name", like).limit(limit),
    supabase
      .from("parties")
      .select("id,name,type,vat_number")
      .eq("org_id", orgId)
      .or(`name.ilike.${like},vat_number.ilike.${like}`)
      .limit(limit),
    supabase
      .from("attachments")
      .select("id,filename,entity_type,entity_id,searchable_text")
      .eq("org_id", orgId)
      .or(`filename.ilike.${like},searchable_text.ilike.${like}`)
      .limit(limit),
  ]);

  const hits: SearchHit[] = [];
  for (const d of docs.data ?? []) {
    hits.push({
      type: "document",
      id: d.id,
      title: `${d.doc_number} · ${d.kind}`,
      subtitle: (d.party_snapshot as any)?.name ?? null,
      meta: { grand_total: d.grand_total },
    });
  }
  for (const t of tags.data ?? []) hits.push({ type: "tag", id: t.id, title: t.name, meta: { color: t.color } });
  for (const p of parties.data ?? []) hits.push({ type: "party", id: p.id, title: p.name, subtitle: p.vat_number ?? p.type });
  for (const a of atts.data ?? [])
    hits.push({ type: "attachment", id: a.id, title: a.filename, subtitle: a.entity_type, meta: { entity_id: a.entity_id } });
  return hits;
}

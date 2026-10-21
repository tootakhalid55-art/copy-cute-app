/** Advance the trailing numeric part while retaining the current prefix and width. */
export function incrementInvoiceNumber(previous?: string | null): string {
  const match = previous?.match(/^(.*?)(\d+)$/);
  if (!match) return "INV-000001";
  return match[1] + (BigInt(match[2]) + 1n).toString().padStart(match[2].length, "0");
}

/** The unique (org_id, kind, doc_number) constraint arbitrates concurrent inserts. */
export async function insertSequentialInvoice(db: any, payload: any) {
  const {data: latest, error} = await db.from("documents").select("doc_number")
    .eq("org_id", payload.org_id).eq("kind", payload.kind)
    .order("created_at", {ascending:false}).order("id", {ascending:false}).limit(1);
  if (error) throw error;
  let candidate = incrementInvoiceNumber(latest?.[0]?.doc_number);
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await db.from("documents").insert({...payload, doc_number:candidate}).select("*").single();
    if (!result.error) return result.data;
    if (result.error.code !== "23505" || !/documents_org_id_kind_doc_number/.test(result.error.message ?? "")) throw result.error;
    candidate = incrementInvoiceNumber(candidate);
  }
  throw new Error("تعذر تخصيص رقم فاتورة متاح؛ أعد المحاولة");
}

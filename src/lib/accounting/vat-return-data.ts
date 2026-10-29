import { supabase } from "@/integrations/supabase/client";
import { fingerprint, validateReview, type VatReview } from "./vat-return";
export async function allVatPages(makeQuery: () => any) {
  const result: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery()
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    result.push(...data);
    if (data.length < 500) return result;
  }
}
export async function loadVatData(orgId: string) {
  if (!orgId) throw Error("اختر المنشأة");
  const query = (table: string) => () =>
    (supabase.from(table as any) as any).select("*").eq("org_id", orgId);
  const [docs, entries, lines, accounts, determinations] = await Promise.all(
    [
      "documents",
      "journal_entries",
      "journal_lines",
      "chart_of_accounts",
      "account_determinations",
    ].map((t) => allVatPages(query(t))),
  );
  // Fetch lines independently: embedded PostgREST relationships can truncate large documents.
  const documentLines = await allVatPages(() =>
    (supabase.from("document_lines") as any)
      .select("*, documents!inner(org_id)")
      .eq("documents.org_id", orgId),
  );
  const docMap = new Map(docs.map((d) => [d.id, d]));
  const warnings: string[] = [];
  for (const d of docs) d.lines = documentLines.filter((l) => l.document_id === d.id);
  const ids = (keys: string[]) =>
    new Set(
      determinations
        .filter((d) => d.is_active && keys.includes(d.key))
        .flatMap((d) =>
          accounts
            .filter((a) => a.code === d.account_code || a.id === d.account_id)
            .map((a) => a.id),
        ),
    );
  const inputIds = ids(["vat_recoverable", "vat_reverse_charge_recoverable"]);
  const outputIds = ids(["vat_payable", "vat_reverse_charge_payable"]);
  if (!inputIds.size || !outputIds.size)
    warnings.push("ربط حسابات ضريبة المدخلات أو المخرجات غير مكتمل؛ المطابقة غير متاحة");
  if ([...inputIds].some((id) => outputIds.has(id)))
    warnings.push("حساب ضريبي مربوط بالمدخلات والمخرجات معًا؛ يجب تصحيح الربط");
  const ledger: any[] = [],
    adjustments: any[] = [];
  for (const e of entries.filter((e) => ["posted", "reversed"].includes(e.status))) {
    const ls = lines.filter((l) => l.entry_id === e.id);
    const inputVat = ls
      .filter((l) => inputIds.has(l.account_id))
      .reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    const outputVat = ls
      .filter((l) => outputIds.has(l.account_id))
      .reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0);
    const row = { ...e, inputVat, outputVat };
    ledger.push(row);
    const source = docMap.get(e.source_document_id);
    const reversal =
      !!e.reverses_entry_id ||
      e.event_type === "document_cancelled" ||
      e.event_type === "reversal" ||
      /reversal|إلغاء/i.test(e.memo || "");
    if (source && !reversal) {
      source.wasPosted = true;
      source.ledgerDate = e.entry_date;
    }
    if (
      (Math.abs(inputVat) > 0.001 || Math.abs(outputVat) > 0.001) &&
      (!source ||
        reversal ||
        ![
          "sales_invoice",
          "standard_tax_invoice",
          "simplified_tax_invoice",
          "invoice",
          "purchase_invoice",
          "bill",
          "credit_note",
          "debit_note",
          "expense_voucher",
        ].includes(source.kind))
    )
      adjustments.push(row);
  }
  return { docs, ledger, adjustments, warnings };
}
export async function saveVatReview(orgId: string, row: any, review: VatReview) {
  const errors = validateReview(review, row.input);
  if (errors.length) throw Error(errors.join("؛ "));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw Error("سجل الدخول");
  const table = row.adjustment ? "journal_entries" : "documents";
  const source = row.source;
  const saved = {
    ...review,
    fingerprint: fingerprint(source),
    reviewedBy: user.id,
    reviewedAt: new Date().toISOString(),
  };
  const history = Array.isArray(source.meta?.vatReviewHistory) ? source.meta.vatReviewHistory : [];
  const meta = {
    ...source.meta,
    vatReview: saved,
    vatReviewHistory: [...history, ...(source.meta?.vatReview ? [source.meta.vatReview] : [])],
  };
  let q = (supabase.from(table) as any).update({ meta }).eq("id", row.id).eq("org_id", orgId);
  if (source.updated_at) q = q.eq("updated_at", source.updated_at);
  const { data, error } = await q.select("id").single();
  if (error || !data) throw Error("تعذر حفظ المراجعة أو تغير المستند؛ حدّث التقرير وأعد المحاولة");
}

// ERP-wide Finance Copilot server functions (Phase C1.2).
// Bilingual (AR/EN), conversation-scoped, citation-aware.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callLovableAI, type GatewayMessage } from "@/lib/ai-gateway.server";

const MODEL = "google/gemini-3.6-flash";

type Lang = "ar" | "en";
export type Citation = {
  kind: string;            // documents | parties | journal_entries | payments | items | ap_intake_documents ...
  id: string;
  label: string;           // short human title
  subtitle?: string | null;
  amount?: number | null;
  ref?: string | null;
  href?: string | null;    // in-app route
  meta?: any;
};

// ─────────────── AI helpers ───────────────
function langInstruction(lang: Lang) {
  return lang === "ar"
    ? "أجب بالعربية بأسلوب محاسبي احترافي موجز. استخدم النقاط عند الحاجة. لا تختلق أي أرقام."
    : "Answer in concise professional English. Use bullets when helpful. Never fabricate figures.";
}

async function ask(system: string, user: string, lang: Lang, temperature = 0.2): Promise<string> {
  return await callLovableAI({
    model: MODEL, temperature,
    messages: [
      { role: "system", content: `${system}\n\n${langInstruction(lang)}` },
      { role: "user", content: user },
    ],
  });
}

async function askJSON<T = any>(system: string, user: string, lang: Lang): Promise<T> {
  const raw = await callLovableAI({
    model: MODEL, temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${system}\n\n${langInstruction(lang)}\nReturn ONLY valid JSON.` },
      { role: "user", content: user },
    ],
  });
  try { return JSON.parse(raw) as T; } catch { return {} as T; }
}

// ─────────────── Persistence ───────────────
async function recordDecision(ctx: any, payload: {
  orgId: string; conversationId?: string | null;
  kind: string; module?: string | null;
  question?: string | null; answer: string; language: Lang;
  input?: any; evidence?: any; explainability?: any;
  citations?: Citation[]; follow_ups?: string[];
  confidence?: number | null; recommendation?: string | null;
}) {
  try {
    await ctx.supabase.from("ai_copilot_decisions").insert({
      org_id: payload.orgId,
      conversation_id: payload.conversationId ?? null,
      user_id: ctx.userId ?? null,
      module: payload.module ?? null,
      kind: payload.kind,
      question: payload.question ?? null,
      answer: payload.answer,
      language: payload.language,
      model: MODEL,
      confidence: payload.confidence ?? null,
      recommendation: payload.recommendation ?? null,
      input: payload.input ?? {},
      evidence: payload.evidence ?? {},
      explainability: payload.explainability ?? {},
      citations: payload.citations ?? [],
      follow_ups: payload.follow_ups ?? [],
    });
    if (payload.conversationId) {
      await ctx.supabase.from("ai_copilot_conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", payload.conversationId);
    }
  } catch (e) {
    console.warn("[copilot] record failed", e);
  }
}

// ─────────────── Conversation CRUD ───────────────
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; limit?: number })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_copilot_conversations")
      .select("id, title, language, module, last_message_at, created_at")
      .eq("org_id", data.orgId)
      .order("last_message_at", { ascending: false })
      .limit(Math.min(data.limit ?? 50, 200));
    if (error) throw error;
    return rows ?? [];
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; title?: string; language?: Lang; module?: string })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ai_copilot_conversations")
      .insert({
        org_id: data.orgId, user_id: context.userId ?? null,
        title: data.title || (data.language === "en" ? "New chat" : "محادثة جديدة"),
        language: data.language ?? "ar",
        module: data.module ?? null,
      })
      .select().single();
    if (error) throw error;
    return row;
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { conversationId: string; title: string })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_copilot_conversations")
      .update({ title: data.title.slice(0, 200) })
      .eq("id", data.conversationId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { conversationId: string })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_copilot_conversations")
      .delete().eq("id", data.conversationId);
    if (error) throw error;
    return { ok: true };
  });

export const loadConversationMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { conversationId: string })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_copilot_decisions")
      .select("id, kind, question, answer, language, citations, follow_ups, explainability, confidence, recommendation, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

// ─────────────── ERP Search (natural language) ───────────────
export const erpSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; query: string; limit?: number })
  .handler(async ({ data, context }) => {
    const q = data.query.trim();
    const limit = Math.min(data.limit ?? 8, 25);
    if (!q) return { hits: [] as Citation[] };
    const like = `%${q.toLowerCase()}%`;
    const sb = context.supabase;

    const [docs, parties, items, journals, payments] = await Promise.all([
      sb.from("documents")
        .select("id, doc_number, kind, issue_date, grand_total, party_snapshot")
        .eq("org_id", data.orgId).ilike("search_text", like).limit(limit),
      sb.from("parties")
        .select("id, name, type, vat_number, email, phone")
        .eq("org_id", data.orgId)
        .or(`name.ilike.${like},vat_number.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
        .limit(limit),
      sb.from("items")
        .select("id, sku, name, name_ar, sale_price")
        .eq("org_id", data.orgId)
        .or(`name.ilike.${like},name_ar.ilike.${like},sku.ilike.${like}`)
        .limit(limit),
      sb.from("journal_entries")
        .select("id, entry_number, entry_date, memo, total_debit")
        .eq("org_id", data.orgId)
        .or(`entry_number.ilike.${like},memo.ilike.${like}`)
        .limit(limit),
      sb.from("cash_bank_transactions")
        .select("id, reference, txn_date, amount, direction, memo")
        .eq("org_id", data.orgId)
        .or(`reference.ilike.${like},memo.ilike.${like}`)
        .limit(limit),
    ]);

    const hits: Citation[] = [];
    for (const d of docs.data ?? []) hits.push({
      kind: "documents", id: d.id,
      label: `${d.doc_number} · ${d.kind}`,
      subtitle: (d.party_snapshot as any)?.name ?? null,
      amount: Number(d.grand_total) || null, ref: d.doc_number,
      href: `/sales/invoices/${d.id}`,
      meta: { kind: d.kind, issue_date: d.issue_date },
    });
    for (const p of parties.data ?? []) hits.push({
      kind: "parties", id: p.id, label: p.name,
      subtitle: p.vat_number ?? p.type, meta: { type: p.type, email: p.email, phone: p.phone },
    });
    for (const it of items.data ?? []) hits.push({
      kind: "items", id: it.id, label: it.name_ar || it.name,
      subtitle: it.sku ?? null, amount: Number(it.sale_price) || null,
    });
    for (const j of journals.data ?? []) hits.push({
      kind: "journal_entries", id: j.id,
      label: `${j.entry_number} · ${j.memo ?? ""}`.trim(),
      subtitle: j.entry_date, amount: Number(j.total_debit) || null,
      href: `/accounting/journal-entries`,
    });
    for (const p of payments.data ?? []) hits.push({
      kind: "cash_bank_transactions", id: p.id,
      label: `${p.direction === "in" ? "قبض" : "صرف"} · ${p.reference ?? ""}`.trim(),
      subtitle: p.txn_date, amount: Number(p.amount) || null,
      meta: { direction: p.direction, memo: p.memo },
    });
    return { hits };
  });

// ─────────────── Explain a Journal Entry ───────────────
export const explainJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; journalId: string; language?: Lang; conversationId?: string })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const { data: entry } = await context.supabase
      .from("journal_entries").select("*").eq("id", data.journalId).maybeSingle();
    if (!entry) throw new Error("journal not found");
    const { data: lines } = await context.supabase
      .from("journal_lines")
      .select("line_number, account_code, description, debit, credit, cost_center_code, party_id, currency")
      .eq("journal_entry_id", data.journalId)
      .order("line_number");

    const codes = Array.from(new Set((lines ?? []).map((l) => l.account_code).filter(Boolean)));
    const { data: accounts } = codes.length
      ? await context.supabase.from("chart_of_accounts")
          .select("code, name, name_ar, account_type")
          .eq("org_id", data.orgId).in("code", codes)
      : { data: [] as any[] };
    const accountMap = Object.fromEntries((accounts ?? []).map((a: any) => [a.code, a]));

    const evidence = {
      entry: {
        number: entry.entry_number, date: entry.entry_date,
        memo: entry.memo, source: entry.source_module, event: entry.event_type,
        total_debit: entry.total_debit, total_credit: entry.total_credit,
        status: entry.status, currency: entry.currency,
      },
      lines: (lines ?? []).map((l) => ({
        ...l,
        account_name: accountMap[l.account_code]?.name ?? null,
        account_name_ar: accountMap[l.account_code]?.name_ar ?? null,
        account_type: accountMap[l.account_code]?.account_type ?? null,
      })),
    };

    const answer = await ask(
      "You are a Finance Copilot. Explain this journal entry line-by-line in plain business language. State: what event triggered it, why each account is debited or credited (using account type semantics), how it affects the financial statements, and whether the entry looks balanced/reasonable.",
      JSON.stringify(evidence), lang,
    );

    const citations: Citation[] = [{
      kind: "journal_entries", id: entry.id,
      label: `${entry.entry_number} · ${entry.memo ?? ""}`.trim(),
      subtitle: entry.entry_date, amount: Number(entry.total_debit) || null,
      href: `/accounting/journal-entries`,
    }];

    await recordDecision(context, {
      orgId: data.orgId, conversationId: data.conversationId,
      kind: "explain_journal", module: "accounting",
      answer, language: lang, evidence, citations,
    });
    return { answer, evidence, citations };
  });

// ─────────────── Collection priorities (AR aging + payment behavior) ───────────────
export const recommendCollectionPriorities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; language?: Lang; conversationId?: string; limit?: number })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const limit = Math.min(data.limit ?? 15, 50);
    const { data: openBalances } = await context.supabase
      .from("document_open_balances")
      .select("document_id, party_id, party_name, kind, issue_date, due_date, grand_total, open_amount, currency")
      .eq("org_id", data.orgId)
      .eq("kind", "sales_invoice")
      .gt("open_amount", 0)
      .order("due_date", { ascending: true })
      .limit(300);

    const today = Date.now();
    const bucketed = (openBalances ?? []).map((b: any) => {
      const due = b.due_date ? new Date(b.due_date).getTime() : new Date(b.issue_date).getTime();
      const daysOverdue = Math.floor((today - due) / 86400000);
      return { ...b, daysOverdue };
    });

    // party rollup
    const byParty: Record<string, any> = {};
    for (const b of bucketed) {
      const key = b.party_id || b.party_name;
      byParty[key] ??= { party_id: b.party_id, name: b.party_name, total: 0, max_days: 0, count: 0, invoices: [] };
      byParty[key].total += Number(b.open_amount) || 0;
      byParty[key].max_days = Math.max(byParty[key].max_days, b.daysOverdue);
      byParty[key].count++;
      byParty[key].invoices.push(b);
    }
    const parties = Object.values(byParty).sort((a: any, b: any) => (b.total * (1 + b.max_days / 30)) - (a.total * (1 + a.max_days / 30))).slice(0, limit);

    const parsed = await askJSON<{
      priorities: Array<{ party: string; priority: "urgent" | "high" | "medium" | "low"; reason: string; suggested_action: string; }>;
      overall: string;
    }>(
      "You are a Finance Copilot. Rank customers by collection priority. Weight overdue days heavily, absolute exposure, and count of overdue invoices. Suggest a concrete action per party (call, reminder, dunning, legal). Return JSON: { priorities: [{party, priority, reason, suggested_action}], overall }.",
      JSON.stringify(parties.map((p: any) => ({
        party: p.name, total_open: p.total, max_days_overdue: p.max_days, invoice_count: p.count,
      }))),
      lang,
    );

    const citations: Citation[] = parties.slice(0, 10).map((p: any) => ({
      kind: "parties", id: p.party_id ?? p.name,
      label: p.name, subtitle: `${p.count} فاتورة · ${p.max_days} يوم تأخير`,
      amount: p.total,
    }));
    const answer = (parsed.overall || "") + "\n\n" +
      (parsed.priorities ?? []).map((p, i) => `${i + 1}. [${p.priority}] ${p.party} — ${p.reason}\n   → ${p.suggested_action}`).join("\n\n");

    await recordDecision(context, {
      orgId: data.orgId, conversationId: data.conversationId,
      kind: "collection_priorities", module: "ar",
      answer, language: lang, evidence: { parties }, citations,
      follow_ups: [
        lang === "ar" ? "أظهر تفاصيل فواتير أعلى عميل" : "Show top customer's invoice details",
        lang === "ar" ? "اكتب مسودة تذكير للسداد" : "Draft a payment reminder email",
      ],
    });
    return { answer, priorities: parsed.priorities ?? [], citations };
  });

// ─────────────── Supplier payment priorities ───────────────
export const recommendPaymentPriorities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; language?: Lang; conversationId?: string; cashAvailable?: number })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const { data: openBills } = await context.supabase
      .from("document_open_balances")
      .select("document_id, party_id, party_name, kind, issue_date, due_date, open_amount, grand_total")
      .eq("org_id", data.orgId)
      .eq("kind", "purchase_invoice")
      .gt("open_amount", 0)
      .order("due_date", { ascending: true })
      .limit(200);

    const today = Date.now();
    const rows = (openBills ?? []).map((b: any) => {
      const due = b.due_date ? new Date(b.due_date).getTime() : new Date(b.issue_date).getTime();
      const daysToDue = Math.floor((due - today) / 86400000);
      return { ...b, daysToDue };
    });

    // cash position
    const { data: banks } = await context.supabase
      .from("cash_bank_accounts").select("current_balance, currency").eq("org_id", data.orgId);
    const cashPos = (banks ?? []).reduce((s: number, b: any) => s + (Number(b.current_balance) || 0), 0);

    const parsed = await askJSON<{
      priorities: Array<{ supplier: string; priority: "urgent" | "high" | "medium" | "low"; amount: number; reason: string; capture_discount?: boolean }>;
      overall: string;
    }>(
      "You are a Finance Copilot. Given open supplier bills and cash position, recommend which to pay first. Prioritize: overdue bills, bills losing early-payment discounts, critical suppliers. Respect the cash cap if provided. Return JSON: { priorities: [{supplier, priority, amount, reason, capture_discount}], overall }.",
      JSON.stringify({
        cash_available: data.cashAvailable ?? cashPos,
        bills: rows.map((r: any) => ({
          supplier: r.party_name, open: r.open_amount,
          days_to_due: r.daysToDue, doc_id: r.document_id,
        })),
      }),
      lang,
    );

    const citations: Citation[] = rows.slice(0, 10).map((r: any) => ({
      kind: "documents", id: r.document_id,
      label: r.party_name, subtitle: `مستحق: ${r.due_date ?? "—"}`,
      amount: Number(r.open_amount) || null,
    }));
    const answer = (parsed.overall || "") + "\n\n" +
      (parsed.priorities ?? []).map((p, i) => `${i + 1}. [${p.priority}] ${p.supplier} — ${p.amount}\n   ${p.reason}${p.capture_discount ? " · ✓ خصم دفع مبكر" : ""}`).join("\n\n");

    await recordDecision(context, {
      orgId: data.orgId, conversationId: data.conversationId,
      kind: "payment_priorities", module: "ap",
      answer, language: lang, evidence: { rows, cash_available: data.cashAvailable ?? cashPos }, citations,
    });
    return { answer, priorities: parsed.priorities ?? [], citations };
  });

// ─────────────── Month-end checklist ───────────────
export const monthEndChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; period: string; language?: Lang; conversationId?: string })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    // pull a snapshot of period health
    const [openDocs, pendingApprovals, pendingIntake] = await Promise.all([
      context.supabase.from("documents").select("id", { count: "exact", head: true })
        .eq("org_id", data.orgId).eq("status", "draft"),
      context.supabase.from("approval_requests").select("id", { count: "exact", head: true })
        .eq("org_id", data.orgId).eq("status", "pending"),
      context.supabase.from("ap_intake_documents").select("id", { count: "exact", head: true })
        .eq("org_id", data.orgId).in("status", ["pending_review", "processing"]),
    ]);
    const snapshot = {
      period: data.period,
      draft_documents: openDocs.count ?? 0,
      pending_approvals: pendingApprovals.count ?? 0,
      pending_ap_intake: pendingIntake.count ?? 0,
    };

    const answer = await ask(
      "You are a Finance Copilot. Produce a KSA/ZATCA month-end closing checklist tailored to the snapshot. Include: bank reconciliation, AR/AP aging review, VAT return prep, accruals, FX revaluation, inventory count, payroll, closing draft docs, approvals, journal reversal review, and management reports. Mark items that are blocked by the snapshot (e.g. drafts still open).",
      JSON.stringify(snapshot), lang,
    );
    await recordDecision(context, {
      orgId: data.orgId, conversationId: data.conversationId,
      kind: "month_end_checklist", module: "accounting",
      answer, language: lang, evidence: snapshot,
    });
    return { answer, snapshot };
  });

// ─────────────── Executive summary for a period ───────────────
export const executiveSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; from: string; to: string; language?: Lang; conversationId?: string })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const [salesInv, purchInv, receipts, payments] = await Promise.all([
      context.supabase.from("documents").select("grand_total, vat_total, currency")
        .eq("org_id", data.orgId).eq("kind", "sales_invoice")
        .gte("issue_date", data.from).lte("issue_date", data.to),
      context.supabase.from("documents").select("grand_total, vat_total, currency")
        .eq("org_id", data.orgId).eq("kind", "purchase_invoice")
        .gte("issue_date", data.from).lte("issue_date", data.to),
      context.supabase.from("cash_bank_transactions").select("amount")
        .eq("org_id", data.orgId).eq("direction", "in")
        .gte("txn_date", data.from).lte("txn_date", data.to),
      context.supabase.from("cash_bank_transactions").select("amount")
        .eq("org_id", data.orgId).eq("direction", "out")
        .gte("txn_date", data.from).lte("txn_date", data.to),
    ]);
    const sum = (rows: any[] | null, k = "grand_total") => (rows ?? []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const snapshot = {
      period: { from: data.from, to: data.to },
      sales: { count: salesInv.data?.length ?? 0, total: sum(salesInv.data, "grand_total"), vat: sum(salesInv.data, "vat_total") },
      purchases: { count: purchInv.data?.length ?? 0, total: sum(purchInv.data, "grand_total"), vat: sum(purchInv.data, "vat_total") },
      cash: { inflow: sum(receipts.data, "amount"), outflow: sum(payments.data, "amount") },
      gross_margin_approx: sum(salesInv.data, "grand_total") - sum(purchInv.data, "grand_total"),
    };
    const answer = await ask(
      "You are a Finance Copilot briefing the CFO. Write an executive summary of the period covering revenue, purchases, gross margin trend, cash inflow vs outflow, VAT posture, notable risks, and 3 recommended actions.",
      JSON.stringify(snapshot), lang,
    );
    await recordDecision(context, {
      orgId: data.orgId, conversationId: data.conversationId,
      kind: "executive_summary", module: "reports",
      answer, language: lang, evidence: snapshot,
    });
    return { answer, snapshot };
  });

// ─────────────── Duplicate detection across master data ───────────────
export const detectDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; scope: "parties" | "items"; language?: Lang; conversationId?: string })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const rows = data.scope === "parties"
      ? (await context.supabase.from("parties").select("id, name, name_ar, vat_number, email, phone, type").eq("org_id", data.orgId).limit(1000)).data ?? []
      : (await context.supabase.from("items").select("id, sku, name, name_ar, barcode").eq("org_id", data.orgId).limit(2000)).data ?? [];

    // cheap prefilter: group by normalized keys
    const norm = (s: string) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
    const groups: Record<string, any[]> = {};
    for (const r of rows) {
      const keys = data.scope === "parties"
        ? [norm(r.name), norm(r.name_ar), r.vat_number, r.email, r.phone].filter(Boolean)
        : [norm(r.name), norm(r.name_ar), r.sku, r.barcode].filter(Boolean);
      for (const k of keys) (groups[String(k)] ??= []).push(r);
    }
    const candidates = Object.values(groups).filter((g) => g.length > 1).slice(0, 30);

    if (!candidates.length) return { answer: lang === "ar" ? "لم يتم اكتشاف أي تكرارات واضحة." : "No obvious duplicates detected.", groups: [], citations: [] };

    const parsed = await askJSON<{ groups: Array<{ ids: string[]; label: string; confidence: number; reason: string }>; }>(
      "You are a Finance Copilot. Given candidate duplicate groups, decide which are real duplicates vs coincidental. Return JSON: { groups: [{ids, label, confidence(0-100), reason}] }.",
      JSON.stringify(candidates.map((g) => g.map((r: any) => ({ id: r.id, ...r })))),
      lang,
    );

    const citations: Citation[] = (parsed.groups ?? []).flatMap((g) => g.ids.map((id) => {
      const row: any = rows.find((r) => r.id === id);
      return {
        kind: data.scope, id, label: row?.name_ar || row?.name || id,
        subtitle: row?.vat_number ?? row?.sku ?? null,
      };
    }));
    const answer = (parsed.groups ?? []).map((g, i) =>
      `${i + 1}. ${g.label} (ثقة ${g.confidence}%)\n   ${g.reason}\n   IDs: ${g.ids.join(", ")}`
    ).join("\n\n") || (lang === "ar" ? "لا تكرارات مؤكدة." : "No confirmed duplicates.");

    await recordDecision(context, {
      orgId: data.orgId, conversationId: data.conversationId,
      kind: `duplicates_${data.scope}`, module: data.scope,
      answer, language: lang, evidence: { candidates }, citations,
    });
    return { answer, groups: parsed.groups ?? [], citations };
  });

// ─────────────── Cash-flow forecast explanation ───────────────
export const explainCashFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; horizonDays?: number; language?: Lang; conversationId?: string })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const horizon = data.horizonDays ?? 60;
    const [banks, arOpen, apOpen] = await Promise.all([
      context.supabase.from("cash_bank_accounts").select("name, current_balance, currency").eq("org_id", data.orgId),
      context.supabase.from("document_open_balances")
        .select("party_name, due_date, open_amount").eq("org_id", data.orgId).eq("kind", "sales_invoice").gt("open_amount", 0),
      context.supabase.from("document_open_balances")
        .select("party_name, due_date, open_amount").eq("org_id", data.orgId).eq("kind", "purchase_invoice").gt("open_amount", 0),
    ]);
    const evidence = {
      horizon_days: horizon,
      cash_balances: banks.data ?? [],
      ar_open: arOpen.data ?? [], ap_open: apOpen.data ?? [],
    };
    const answer = await ask(
      "You are a Finance Copilot. Forecast cash position for the horizon based on expected AR receipts and AP payments by due date. Explain drivers, weekly buckets, worst-case scenarios, and 2-3 recommendations.",
      JSON.stringify(evidence), lang,
    );
    await recordDecision(context, {
      orgId: data.orgId, conversationId: data.conversationId,
      kind: "cash_flow_forecast", module: "cash",
      answer, language: lang, evidence,
    });
    return { answer, evidence };
  });

// ─────────────── ERP chat ("router") ───────────────
export const erpChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as {
    orgId: string;
    conversationId?: string | null;
    language?: Lang;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const lastUser = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";

    // Optionally enrich with a search over ERP records
    const searchHits = lastUser
      ? (await erpSearchInternal(context, data.orgId, lastUser, 6))
      : [];

    const sys =
      "You are the ERP-wide Finance Copilot for a KSA/ZATCA accounting system (Haseem). You have access to search results from the user's live ERP: customers, suppliers, invoices, journals, payments, inventory. Answer accountant-level questions grounded in the provided records. Cite the specific record IDs when relevant. Never fabricate numbers. If you need more data, ask a clarifying question or suggest a follow-up.";

    const enriched = searchHits.length
      ? `\n\nRelevant ERP records (top ${searchHits.length}):\n${JSON.stringify(searchHits)}`
      : "";

    const messages: GatewayMessage[] = [
      { role: "system", content: `${sys}\n\n${langInstruction(lang)}${enriched}` },
      ...data.messages.map((m) => ({ role: m.role, content: m.content } as GatewayMessage)),
    ];
    const answer = await callLovableAI({ model: MODEL, messages, temperature: 0.3 });

    // Ask model for follow-ups (best-effort, cheap)
    let follow_ups: string[] = [];
    try {
      const fu = await askJSON<{ follow_ups: string[] }>(
        "Given the last accountant answer, propose 3 short follow-up questions the user is likely to ask next. Return JSON: { follow_ups: [strings] }.",
        JSON.stringify({ last_question: lastUser, last_answer: answer }),
        lang,
      );
      follow_ups = (fu.follow_ups ?? []).slice(0, 3);
    } catch { /* ignore */ }

    await recordDecision(context, {
      orgId: data.orgId, conversationId: data.conversationId ?? null,
      kind: "chat", module: "erp",
      question: lastUser, answer, language: lang,
      citations: searchHits, follow_ups,
    });
    return { answer, citations: searchHits, follow_ups };
  });

async function erpSearchInternal(context: any, orgId: string, query: string, limit = 6): Promise<Citation[]> {
  const like = `%${query.trim().toLowerCase()}%`;
  const sb = context.supabase;
  const [docs, parties] = await Promise.all([
    sb.from("documents")
      .select("id, doc_number, kind, issue_date, grand_total, party_snapshot")
      .eq("org_id", orgId).ilike("search_text", like).limit(limit),
    sb.from("parties")
      .select("id, name, type, vat_number")
      .eq("org_id", orgId).or(`name.ilike.${like},vat_number.ilike.${like}`).limit(limit),
  ]);
  const hits: Citation[] = [];
  for (const d of docs.data ?? []) hits.push({
    kind: "documents", id: d.id, label: `${d.doc_number} · ${d.kind}`,
    subtitle: (d.party_snapshot as any)?.name ?? null, amount: Number(d.grand_total) || null,
  });
  for (const p of parties.data ?? []) hits.push({
    kind: "parties", id: p.id, label: p.name, subtitle: p.vat_number ?? p.type,
  });
  return hits;
}

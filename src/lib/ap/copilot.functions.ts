// AI Finance Copilot — server functions.
// Bilingual (Arabic/English) reasoning over AP intake + supplier history.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callLovableAI, type GatewayMessage } from "@/lib/ai-gateway.server";

const MODEL = "google/gemini-3.6-flash";

type Lang = "ar" | "en";

type Persist = {
  orgId: string;
  intakeId?: string | null;
  documentId?: string | null;
  kind: string;
  question?: string | null;
  answer: string;
  language: Lang;
  input?: any;
  evidence?: any;
  confidence?: number | null;
  recommendation?: string | null;
  meta?: any;
};

async function record(ctx: any, p: Persist) {
  const { supabase, userId } = ctx;
  try {
    await supabase.from("ai_copilot_decisions").insert({
      org_id: p.orgId,
      user_id: userId ?? null,
      intake_id: p.intakeId ?? null,
      document_id: p.documentId ?? null,
      kind: p.kind,
      question: p.question ?? null,
      answer: p.answer,
      language: p.language,
      model: MODEL,
      confidence: p.confidence ?? null,
      recommendation: p.recommendation ?? null,
      input: p.input ?? {},
      evidence: p.evidence ?? {},
      meta: p.meta ?? {},
    });
  } catch (e) {
    console.warn("[copilot] record failed", e);
  }
}

function langInstruction(lang: Lang) {
  return lang === "ar"
    ? "أجب باللغة العربية بأسلوب محاسبي مهني موجز، مع نقاط عند الحاجة."
    : "Answer in concise professional English, use bullet points when useful.";
}

async function ask(system: string, userText: string, lang: Lang): Promise<string> {
  const messages: GatewayMessage[] = [
    { role: "system", content: `${system}\n\n${langInstruction(lang)}` },
    { role: "user", content: userText },
  ];
  return await callLovableAI({ model: MODEL, messages, temperature: 0.2 });
}

async function askJSON<T = any>(system: string, userText: string, lang: Lang): Promise<T> {
  const messages: GatewayMessage[] = [
    { role: "system", content: `${system}\n\n${langInstruction(lang)}\nReturn ONLY valid JSON.` },
    { role: "user", content: userText },
  ];
  const raw = await callLovableAI({
    model: MODEL, messages, temperature: 0.1,
    response_format: { type: "json_object" },
  });
  try { return JSON.parse(raw) as T; } catch { return {} as T; }
}

// ─────────── helpers to load context

async function loadIntake(supabase: any, intakeId: string) {
  const { data } = await supabase.from("ap_intake_documents").select("*").eq("id", intakeId).maybeSingle();
  return data;
}

async function loadSupplierHistory(supabase: any, orgId: string, partyId: string | null, limit = 20) {
  if (!partyId) return [];
  const { data } = await supabase
    .from("documents")
    .select("id, doc_number, issue_date, grand_total, vat_total, currency")
    .eq("org_id", orgId).eq("party_id", partyId).eq("kind", "purchase_invoice")
    .order("issue_date", { ascending: false }).limit(limit);
  return data ?? [];
}

async function loadCoa(supabase: any, orgId: string) {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("code, name, name_ar, account_type")
    .eq("org_id", orgId).eq("is_active", true).order("code").limit(400);
  return data ?? [];
}

async function loadCostCenters(supabase: any, orgId: string) {
  const { data } = await supabase
    .from("cost_centers").select("code, name").eq("org_id", orgId).limit(200);
  return data ?? [];
}

// ═════════════════════ Public server functions ═════════════════════

// 1) Explain supplier match
export const explainSupplierMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { intakeId: string; orgId: string; language?: Lang })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const intake = await loadIntake(context.supabase, data.intakeId);
    if (!intake) throw new Error("intake not found");

    let matched: any = null;
    if (intake.matched_party_id) {
      const { data: p } = await context.supabase
        .from("parties").select("id, name, name_ar, vat_number, iban, email, phone")
        .eq("id", intake.matched_party_id).maybeSingle();
      matched = p;
    }
    const ex = intake.extraction || {};
    const evidence = {
      extracted: { name: ex.supplierName, vat: ex.supplierVatNumber, iban: ex.iban, email: ex.email, phone: ex.phone },
      matched, match_confidence: intake.match_confidence,
    };

    const answer = await ask(
      "You are a Finance Copilot. Explain the supplier match to an auditor: which fields matched (VAT, IBAN, email, phone, name similarity), how strong each signal is, and if the match should be trusted. Be specific.",
      JSON.stringify(evidence),
      lang,
    );

    await record(context, {
      orgId: data.orgId, intakeId: data.intakeId, kind: "supplier_match",
      answer, language: lang, evidence,
      confidence: intake.match_confidence ?? null,
    });
    return { answer, evidence };
  });

// 2) Explain duplicate detection
export const explainDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { intakeId: string; orgId: string; language?: Lang })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const intake = await loadIntake(context.supabase, data.intakeId);
    if (!intake) throw new Error("intake not found");
    const ex = intake.extraction || {};

    let existing: any = null;
    if (intake.matched_bill_id) {
      const { data: b } = await context.supabase
        .from("documents")
        .select("id, doc_number, issue_date, grand_total, party_id, ref")
        .eq("id", intake.matched_bill_id).maybeSingle();
      existing = b;
    }
    // Also look at any bills with same ref / total in past 90 days
    const { data: siblings } = await context.supabase
      .from("documents")
      .select("id, doc_number, ref, issue_date, grand_total, party_id")
      .eq("org_id", data.orgId).eq("kind", "purchase_invoice")
      .or(`ref.eq.${ex.invoiceNumber || "__none__"},doc_number.eq.${ex.invoiceNumber || "__none__"}`)
      .limit(5);

    const evidence = {
      extracted: { ref: ex.invoiceNumber, total: ex.grandTotal, date: ex.invoiceDate, party: ex.supplierName },
      matched_bill: existing, siblings: siblings ?? [],
    };
    const answer = await ask(
      "You are a Finance Copilot. Explain WHY this incoming invoice was flagged as a possible duplicate. Compare invoice number, date, total, and supplier. State whether the flag is likely correct.",
      JSON.stringify(evidence),
      lang,
    );
    await record(context, { orgId: data.orgId, intakeId: data.intakeId, kind: "duplicate", answer, language: lang, evidence });
    return { answer, evidence };
  });

// 3) Explain VAT validation failure
export const explainVat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { intakeId: string; orgId: string; language?: Lang })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const intake = await loadIntake(context.supabase, data.intakeId);
    if (!intake) throw new Error("intake not found");
    const ex = intake.extraction || {};
    const v = (intake as any).validation || {};
    const evidence = {
      subtotal: ex.subtotal, vat: ex.vat, grand_total: ex.grandTotal,
      currency: ex.currency ?? "SAR", issues: v.issues ?? [],
      expected_vat_15pct: Math.round((Number(ex.subtotal) || 0) * 0.15 * 100) / 100,
    };
    const answer = await ask(
      "You are a Finance Copilot specialised in KSA VAT (15%). Explain the VAT validation result: which rule failed, what the expected values are, and what the accountant should verify. Reference ZATCA where relevant.",
      JSON.stringify(evidence),
      lang,
    );
    await record(context, { orgId: data.orgId, intakeId: data.intakeId, kind: "vat_validation", answer, language: lang, evidence });
    return { answer, evidence };
  });

// 4) Suggest GL account / cost center / project / department
export const suggestPosting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { intakeId: string; orgId: string; language?: Lang })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const intake = await loadIntake(context.supabase, data.intakeId);
    if (!intake) throw new Error("intake not found");
    const [coa, ccs, history] = await Promise.all([
      loadCoa(context.supabase, data.orgId),
      loadCostCenters(context.supabase, data.orgId),
      loadSupplierHistory(context.supabase, data.orgId, intake.matched_party_id),
    ]);

    // pull previous account choices for this supplier
    let historyPostings: any[] = [];
    if (intake.matched_party_id && history.length) {
      const ids = history.map((h: any) => h.id);
      const { data: lines } = await context.supabase
        .from("document_lines")
        .select("document_id, account_code, cost_center_code, description")
        .in("document_id", ids).limit(60);
      historyPostings = lines ?? [];
    }

    const ex = intake.extraction || {};
    const evidence = {
      supplier: ex.supplierName,
      lines: (ex.lines || []).slice(0, 20),
      history_postings: historyPostings.slice(0, 30),
      coa_sample: coa.slice(0, 120),
      cost_centers: ccs,
    };

    const parsed = await askJSON<{
      lines: Array<{
        description: string;
        account_code: string; account_name: string;
        cost_center_code?: string | null;
        project?: string | null; department?: string | null;
        reasoning: string; confidence: number;
      }>;
      overall: string;
    }>(
      "You are a Finance Copilot. For each invoice line, pick the best GL account from the provided chart of accounts (return existing code, do NOT invent). Also suggest cost_center_code (if applicable), project and department. Consider the supplier's historical postings if provided. Return JSON: { lines: [{description, account_code, account_name, cost_center_code, project, department, reasoning, confidence(0-100)}], overall: string }",
      JSON.stringify(evidence),
      lang,
    );

    const overall = parsed?.overall || "";
    const answer = overall + (parsed?.lines?.length
      ? "\n\n" + parsed.lines.map((l: any, i: number) =>
          `${i + 1}. ${l.description || ""} → ${l.account_code} ${l.account_name || ""}` +
          (l.cost_center_code ? ` [CC ${l.cost_center_code}]` : "") +
          (l.project ? ` [Project ${l.project}]` : "") +
          (l.department ? ` [Dept ${l.department}]` : "") +
          `\n   ${l.reasoning || ""} — ${l.confidence ?? 0}%`
        ).join("\n")
      : "");

    await record(context, {
      orgId: data.orgId, intakeId: data.intakeId, kind: "suggest_posting",
      answer, language: lang, evidence: { lines: parsed?.lines ?? [] },
      confidence: parsed?.lines?.length
        ? Math.round(parsed.lines.reduce((s, l) => s + (l.confidence || 0), 0) / parsed.lines.length)
        : null,
    });
    return { answer, suggestions: parsed?.lines ?? [] };
  });

// 5) Explain confidence scores
export const explainConfidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { intakeId: string; orgId: string; language?: Lang })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const intake = await loadIntake(context.supabase, data.intakeId);
    if (!intake) throw new Error("intake not found");
    const ex = intake.extraction || {};
    const evidence = {
      overall: intake.confidence, match: intake.match_confidence,
      per_field: ex.confidence || {},
      supplier_layout: (intake as any).supplier_layout_used ?? null,
    };
    const answer = await ask(
      "You are a Finance Copilot. Explain each confidence score: overall extraction, supplier match, and per-field. Point out the weakest fields and why they matter. Suggest what the reviewer should double-check.",
      JSON.stringify(evidence),
      lang,
    );
    await record(context, { orgId: data.orgId, intakeId: data.intakeId, kind: "confidence", answer, language: lang, evidence });
    return { answer, evidence };
  });

// 6) Natural-language invoice summary
export const summarizeInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { intakeId: string; orgId: string; language?: Lang })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const intake = await loadIntake(context.supabase, data.intakeId);
    if (!intake) throw new Error("intake not found");
    const ex = intake.extraction || {};
    const answer = await ask(
      "You are a Finance Copilot. Write a 3-4 sentence natural summary of this invoice: supplier, purpose (from line descriptions), total, VAT, due date, and any notable point. Do not fabricate values.",
      JSON.stringify(ex),
      lang,
    );
    await record(context, { orgId: data.orgId, intakeId: data.intakeId, kind: "summary", answer, language: lang, evidence: ex });
    return { answer };
  });

// 7) Anomaly detection vs supplier history
export const detectAnomalies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { intakeId: string; orgId: string; language?: Lang })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const intake = await loadIntake(context.supabase, data.intakeId);
    if (!intake) throw new Error("intake not found");
    const history = await loadSupplierHistory(context.supabase, data.orgId, intake.matched_party_id, 30);

    const ex = intake.extraction || {};
    // simple stats to help the model
    const totals = history.map((h: any) => Number(h.grand_total) || 0).filter((n: number) => n > 0);
    const avg = totals.length ? totals.reduce((a: number, b: number) => a + b, 0) / totals.length : 0;
    const max = totals.length ? Math.max(...totals) : 0;
    const min = totals.length ? Math.min(...totals) : 0;
    const dupLineDescs = (ex.lines || []).map((l: any) => (l.description || "").toString().trim().toLowerCase());
    const dupCounts: Record<string, number> = {};
    dupLineDescs.forEach((d: string) => { if (d) dupCounts[d] = (dupCounts[d] || 0) + 1; });

    const evidence = {
      current: {
        total: ex.grandTotal, vat: ex.vat, currency: ex.currency ?? "SAR",
        due_date: ex.dueDate, payment_terms: ex.paymentTerms, lines: ex.lines,
      },
      history_stats: { count: history.length, avg, min, max },
      history_sample: history.slice(0, 10),
      duplicate_line_descriptions: Object.entries(dupCounts).filter(([, c]) => c > 1),
    };

    const parsed = await askJSON<{
      anomalies: Array<{ type: string; severity: "low" | "medium" | "high"; message: string; evidence?: any }>;
      overall_risk: "low" | "medium" | "high";
      summary: string;
    }>(
      "You are a Finance Copilot. Detect anomalies vs supplier history. Look for: unusual total vs average, abnormal price increases per line, unusual currency, unusual payment terms/due date, duplicate line items, unusual quantities. Return JSON: { anomalies:[{type,severity,message,evidence}], overall_risk, summary }.",
      JSON.stringify(evidence),
      lang,
    );
    const answer = (parsed?.summary || "") + "\n\n" +
      (parsed?.anomalies || []).map((a: any) => `• [${a.severity}] ${a.type}: ${a.message}`).join("\n");

    await record(context, {
      orgId: data.orgId, intakeId: data.intakeId, kind: "anomalies",
      answer, language: lang, evidence: { anomalies: parsed?.anomalies ?? [] },
      recommendation: parsed?.overall_risk ?? null,
    });
    return { answer, anomalies: parsed?.anomalies ?? [], overall_risk: parsed?.overall_risk ?? "low" };
  });

// 8) Approval recommendation with audit explanation
export const recommendApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { intakeId: string; orgId: string; language?: Lang })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    const intake = await loadIntake(context.supabase, data.intakeId);
    if (!intake) throw new Error("intake not found");
    const ex = intake.extraction || {};

    const [history, appr] = await Promise.all([
      loadSupplierHistory(context.supabase, data.orgId, intake.matched_party_id, 20),
      context.supabase.from("ap_intake_approvals").select("*").eq("intake_id", data.intakeId),
    ]);
    const validation = (intake as any).validation || {};

    const evidence = {
      status: intake.status,
      confidence: intake.confidence,
      match_confidence: intake.match_confidence,
      matched_party_id: intake.matched_party_id,
      matched_bill_id: intake.matched_bill_id,
      extraction: {
        supplier: ex.supplierName, invoice_number: ex.invoiceNumber, date: ex.invoiceDate,
        total: ex.grandTotal, vat: ex.vat, currency: ex.currency,
      },
      validation_issues: validation.issues ?? [],
      supplier_history_count: history.length,
      existing_approvals: appr.data ?? [],
    };

    const parsed = await askJSON<{
      recommendation: "approve" | "review" | "reject";
      confidence: number;
      reasons: string[];
      risks: string[];
      audit_explanation: string;
    }>(
      "You are a Finance Copilot acting as an internal auditor. Recommend approve / review / reject for this AP invoice. Base your decision on: extraction confidence, supplier match strength, duplicate signals, VAT/total validation, supplier history depth, and existing approval trail. Return JSON: { recommendation, confidence(0-100), reasons[], risks[], audit_explanation }.",
      JSON.stringify(evidence),
      lang,
    );

    const answer =
      `**${parsed?.recommendation?.toUpperCase() ?? "?"}** (${parsed?.confidence ?? 0}%)\n\n` +
      (parsed?.audit_explanation || "") +
      (parsed?.reasons?.length ? "\n\n" + (lang === "ar" ? "الأسباب:" : "Reasons:") + "\n" + parsed.reasons.map((r) => `• ${r}`).join("\n") : "") +
      (parsed?.risks?.length ? "\n\n" + (lang === "ar" ? "المخاطر:" : "Risks:") + "\n" + parsed.risks.map((r) => `• ${r}`).join("\n") : "");

    await record(context, {
      orgId: data.orgId, intakeId: data.intakeId, kind: "recommend_approval",
      answer, language: lang, evidence,
      confidence: parsed?.confidence ?? null,
      recommendation: parsed?.recommendation ?? null,
    });
    return {
      answer,
      recommendation: parsed?.recommendation ?? "review",
      confidence: parsed?.confidence ?? 0,
      reasons: parsed?.reasons ?? [], risks: parsed?.risks ?? [],
    };
  });

// 9) Free-form chat with intake context
export const copilotChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as {
    orgId: string; intakeId?: string | null; language?: Lang;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  })
  .handler(async ({ data, context }) => {
    const lang = data.language ?? "ar";
    let intakeCtx: any = null;
    if (data.intakeId) {
      const i = await loadIntake(context.supabase, data.intakeId);
      if (i) {
        intakeCtx = {
          status: i.status, confidence: i.confidence, match_confidence: i.match_confidence,
          matched_party_id: i.matched_party_id, extraction: i.extraction,
          validation: (i as any).validation,
        };
      }
    }
    const sys =
      "You are the Finance Copilot for a KSA (ZATCA) accounting system. Help the accountant understand AP invoices, VAT (15%), postings, and approvals. Reference the invoice context if provided. Never fabricate figures.";
    const messages: GatewayMessage[] = [
      { role: "system", content: `${sys}\n\n${langInstruction(lang)}${intakeCtx ? `\n\nCurrent invoice context:\n${JSON.stringify(intakeCtx)}` : ""}` },
      ...data.messages.map((m) => ({ role: m.role, content: m.content } as GatewayMessage)),
    ];
    const answer = await callLovableAI({ model: MODEL, messages, temperature: 0.3 });
    const question = data.messages.filter((m) => m.role === "user").slice(-1)[0]?.content ?? "";
    await record(context, {
      orgId: data.orgId, intakeId: data.intakeId ?? null, kind: "chat",
      question, answer, language: lang,
    });
    return { answer };
  });

// 10) History
export const listCopilotDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; intakeId?: string | null; limit?: number })
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("ai_copilot_decisions").select("*")
      .eq("org_id", data.orgId).order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 100, 500));
    if (data.intakeId) q = q.eq("intake_id", data.intakeId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

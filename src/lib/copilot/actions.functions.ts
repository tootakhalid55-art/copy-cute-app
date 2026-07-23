// Phase C1.3 — Finance Copilot Actions
// Proposes actions the assistant can execute after explicit user confirmation.
// Every proposal + execution is logged to financial_audit_log for full traceability.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Lang = "ar" | "en";

// ─────────────── audit helper ───────────────
async function audit(ctx: any, opts: {
  orgId: string;
  event: string;
  proposal?: any;
  amount?: number | null;
  currency?: string | null;
  partyId?: string | null;
  documentId?: string | null;
  reason?: string | null;
  after?: any;
}) {
  try {
    await ctx.supabase.from("financial_audit_log").insert({
      org_id: opts.orgId,
      event_kind: "copilot_action" as any,
      party_id: opts.partyId ?? null,
      source_document_id: opts.documentId ?? null,
      amount: opts.amount ?? null,
      currency: opts.currency ?? null,
      reason: `${opts.event}: ${opts.reason ?? ""}`.slice(0, 500),
      actor_id: ctx.userId ?? null,
      after_state: opts.after ?? { proposal_id: opts.proposal?.id, kind: opts.proposal?.action_kind },
    } as any);
  } catch (e) {
    // Audit table may reject unknown event_kind enum values; fall back to notifications
    console.warn("[copilot-action-audit]", e);
  }
}

// ─────────────── list / read ───────────────
export const listProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { orgId: string; status?: string; conversationId?: string; limit?: number })
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("copilot_action_proposals")
      .select("*")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 100, 500));
    if (data.status) q = q.eq("status", data.status);
    if (data.conversationId) q = q.eq("conversation_id", data.conversationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ─────────────── generic propose ───────────────
async function insertProposal(ctx: any, p: {
  orgId: string; conversationId?: string | null; actionKind: string; module: string;
  title: string; summary?: string; payload: any; preview?: any;
  riskLevel?: "low" | "medium" | "high"; language: Lang;
}) {
  const { data: row, error } = await ctx.supabase
    .from("copilot_action_proposals")
    .insert({
      org_id: p.orgId,
      conversation_id: p.conversationId ?? null,
      proposed_by: ctx.userId ?? null,
      action_kind: p.actionKind,
      module: p.module,
      language: p.language,
      title: p.title,
      summary: p.summary ?? null,
      payload: p.payload,
      preview: p.preview ?? {},
      risk_level: p.riskLevel ?? "low",
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  await audit(ctx, { orgId: p.orgId, event: "proposed", proposal: row });
  return row;
}

// ─────────────── specific proposal builders ───────────────

export const proposeDraftJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as {
    orgId: string; conversationId?: string; language?: Lang;
    entry_date: string; memo: string;
    lines: Array<{ account_code: string; debit?: number; credit?: number; description?: string; party_id?: string }>;
  })
  .handler(async ({ data, context }) => {
    const totalDebit = data.lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
    const totalCredit = data.lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) throw new Error("journal_unbalanced");
    return insertProposal(context, {
      orgId: data.orgId, conversationId: data.conversationId, language: data.language ?? "ar",
      actionKind: "draft_journal", module: "GL",
      title: (data.language === "en" ? "Draft journal: " : "مسودة قيد يومية: ") + (data.memo || ""),
      summary: `${data.lines.length} lines · debit=${totalDebit.toFixed(2)} · credit=${totalCredit.toFixed(2)}`,
      payload: { entry_date: data.entry_date, memo: data.memo, lines: data.lines },
      preview: { total_debit: totalDebit, total_credit: totalCredit, lines: data.lines },
      riskLevel: totalDebit > 100000 ? "high" : totalDebit > 10000 ? "medium" : "low",
    });
  });

export const proposeCollectionReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as {
    orgId: string; conversationId?: string; language?: Lang;
    partyId: string; documentIds: string[]; totalOpen: number; currency?: string;
    channel?: "email" | "whatsapp" | "sms" | "call"; message: string; dueDate?: string;
  })
  .handler(async ({ data, context }) => {
    const { data: party } = await context.supabase
      .from("parties").select("id, name, email, phone").eq("id", data.partyId).maybeSingle();
    return insertProposal(context, {
      orgId: data.orgId, conversationId: data.conversationId, language: data.language ?? "ar",
      actionKind: "collection_reminder", module: "AR",
      title: (data.language === "en" ? "Collection reminder: " : "مطالبة تحصيل: ") + ((party as any)?.name ?? ""),
      summary: `${data.documentIds.length} invoices · open=${data.totalOpen.toFixed(2)} ${data.currency ?? "SAR"}`,
      payload: { ...data, party },
      preview: { party, count: data.documentIds.length, total: data.totalOpen, channel: data.channel ?? "email" },
      riskLevel: "low",
    });
  });

export const proposeSupplierPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as {
    orgId: string; conversationId?: string; language?: Lang;
    partyId: string; cashBankAccountId: string; amount: number; currency?: string;
    date?: string; reference?: string; memo?: string;
    allocations?: Array<{ target_kind: string; target_document_id: string; amount: number }>;
    autoFifo?: boolean;
  })
  .handler(async ({ data, context }) => {
    const { data: party } = await context.supabase
      .from("parties").select("id, name, credit_hold").eq("id", data.partyId).maybeSingle();
    const risk = data.amount > 100000 ? "high" : data.amount > 25000 ? "medium" : "low";
    return insertProposal(context, {
      orgId: data.orgId, conversationId: data.conversationId, language: data.language ?? "ar",
      actionKind: "supplier_payment", module: "AP",
      title: (data.language === "en" ? "Supplier payment: " : "دفعة مورد: ") + ((party as any)?.name ?? ""),
      summary: `${data.amount.toFixed(2)} ${data.currency ?? "SAR"}`,
      payload: data,
      preview: { party, amount: data.amount, currency: data.currency ?? "SAR",
        allocations: data.allocations ?? [], auto_fifo: data.autoFifo ?? false },
      riskLevel: risk,
    });
  });

export const proposeFollowUpTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as {
    orgId: string; conversationId?: string; language?: Lang;
    title: string; description?: string; dueDate?: string; priority?: string;
    assignee?: string; relatedKind?: string; relatedId?: string;
  })
  .handler(async ({ data, context }) =>
    insertProposal(context, {
      orgId: data.orgId, conversationId: data.conversationId, language: data.language ?? "ar",
      actionKind: "followup_task", module: "TASKS",
      title: (data.language === "en" ? "Follow-up: " : "مهمة متابعة: ") + data.title,
      summary: data.description ?? undefined,
      payload: data, preview: data, riskLevel: "low",
    })
  );

export const proposeBulkSupplierPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as {
    orgId: string; conversationId?: string; language?: Lang;
    cashBankAccountId: string; dueBefore: string; currency?: string;
  })
  .handler(async ({ data, context }) => {
    const { data: openBills } = await context.supabase
      .from("document_open_balances")
      .select("document_id, party_id, kind, doc_number, issue_date, open_as_target")
      .eq("org_id", data.orgId)
      .in("kind", ["bill"])
      .gt("open_as_target", 0)
      .lte("issue_date", data.dueBefore)
      .limit(500);

    const rows = (openBills ?? []) as any[];
    // group by party
    const byParty = new Map<string, { partyId: string; total: number; docs: any[] }>();
    for (const r of rows) {
      const g = byParty.get(r.party_id) ?? { partyId: r.party_id, total: 0, docs: [] };
      g.total += Number(r.open_as_target);
      g.docs.push(r);
      byParty.set(r.party_id, g);
    }
    const groups = Array.from(byParty.values());
    const grandTotal = groups.reduce((s, g) => s + g.total, 0);

    return insertProposal(context, {
      orgId: data.orgId, conversationId: data.conversationId, language: data.language ?? "ar",
      actionKind: "bulk_payments", module: "AP",
      title: data.language === "en"
        ? `Bulk payments (${groups.length} suppliers)`
        : `دفعات جماعية (${groups.length} مورد)`,
      summary: `${grandTotal.toFixed(2)} ${data.currency ?? "SAR"} · dueBefore=${data.dueBefore}`,
      payload: { ...data, groups },
      preview: { groups, grand_total: grandTotal, currency: data.currency ?? "SAR" },
      riskLevel: grandTotal > 100000 ? "high" : "medium",
    });
  });

export const proposeCollectionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as {
    orgId: string; conversationId?: string; language?: Lang;
    daysOverdue: number;
  })
  .handler(async ({ data, context }) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - data.daysOverdue);
    const iso = cutoff.toISOString().slice(0, 10);

    const { data: openInv } = await context.supabase
      .from("document_open_balances")
      .select("document_id, party_id, kind, doc_number, issue_date, open_as_target")
      .eq("org_id", data.orgId)
      .in("kind", ["invoice", "debit_note"])
      .gt("open_as_target", 0)
      .lte("issue_date", iso)
      .limit(1000);

    const rows = (openInv ?? []) as any[];
    const byParty = new Map<string, { partyId: string; total: number; oldest: string; docs: any[] }>();
    for (const r of rows) {
      const g = byParty.get(r.party_id) ?? { partyId: r.party_id, total: 0, oldest: r.issue_date, docs: [] };
      g.total += Number(r.open_as_target);
      if (r.issue_date < g.oldest) g.oldest = r.issue_date;
      g.docs.push(r);
      byParty.set(r.party_id, g);
    }
    const parties = Array.from(byParty.values()).sort((a, b) => b.total - a.total);

    return insertProposal(context, {
      orgId: data.orgId, conversationId: data.conversationId, language: data.language ?? "ar",
      actionKind: "collection_plan", module: "AR",
      title: data.language === "en"
        ? `Collection plan (>${data.daysOverdue}d, ${parties.length} customers)`
        : `خطة تحصيل (متأخر >${data.daysOverdue} يوم، ${parties.length} عميل)`,
      summary: `total_overdue=${parties.reduce((s, p) => s + p.total, 0).toFixed(2)}`,
      payload: { ...data, parties },
      preview: { parties: parties.slice(0, 50), count: parties.length },
      riskLevel: "low",
    });
  });

// ─────────────── confirmation & execution ───────────────

async function loadProposal(ctx: any, id: string) {
  const { data, error } = await ctx.supabase
    .from("copilot_action_proposals").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("proposal_not_found");
  return data;
}

async function markStatus(ctx: any, id: string, patch: any) {
  const { error } = await ctx.supabase
    .from("copilot_action_proposals").update(patch).eq("id", id);
  if (error) throw error;
}

async function executeProposal(ctx: any, p: any): Promise<{ entityType?: string; entityId?: string }> {
  const orgId = p.org_id;
  switch (p.action_kind) {
    case "draft_journal": {
      // Create a manual journal_entry in DRAFT status (not posted).
      const { data: fy } = await ctx.supabase
        .from("fiscal_years").select("id")
        .eq("org_id", orgId)
        .lte("start_date", p.payload.entry_date)
        .gte("end_date", p.payload.entry_date)
        .maybeSingle();
      const { data: per } = await ctx.supabase
        .from("accounting_periods").select("id")
        .eq("org_id", orgId)
        .lte("start_date", p.payload.entry_date)
        .gte("end_date", p.payload.entry_date)
        .maybeSingle();
      const totalDebit = p.payload.lines.reduce((s: number, l: any) => s + Number(l.debit ?? 0), 0);
      const totalCredit = p.payload.lines.reduce((s: number, l: any) => s + Number(l.credit ?? 0), 0);
      const entryNumber = "JE-DRAFT-" + Math.random().toString(36).slice(2, 10).toUpperCase();
      const { data: entry, error } = await ctx.supabase
        .from("journal_entries")
        .insert({
          org_id: orgId,
          fiscal_year_id: (fy as any)?.id ?? null,
          period_id: (per as any)?.id ?? null,
          entry_number: entryNumber,
          entry_date: p.payload.entry_date,
          memo: p.payload.memo,
          status: "draft",
          currency: "SAR",
          exchange_rate: 1,
          total_debit: totalDebit,
          total_credit: totalCredit,
          created_by: ctx.userId,
          meta: { copilot_proposal_id: p.id },
        }).select().single();
      if (error) throw error;
      let lineNo = 0;
      for (const l of p.payload.lines) {
        lineNo++;
        const { data: acc } = await ctx.supabase
          .from("chart_of_accounts").select("id").eq("org_id", orgId).eq("code", l.account_code).maybeSingle();
        if (!acc) throw new Error(`account_not_found: ${l.account_code}`);
        await ctx.supabase.from("journal_lines").insert({
          entry_id: (entry as any).id, org_id: orgId, line_no: lineNo,
          account_id: (acc as any).id,
          description: l.description ?? null,
          currency: "SAR", exchange_rate: 1,
          debit_fc: Number(l.debit ?? 0), credit_fc: Number(l.credit ?? 0),
          debit: Number(l.debit ?? 0), credit: Number(l.credit ?? 0),
          party_id: l.party_id ?? null,
        });
      }
      return { entityType: "journal_entries", entityId: (entry as any).id };
    }

    case "followup_task": {
      const { data: row, error } = await ctx.supabase
        .from("copilot_followup_tasks")
        .insert({
          org_id: orgId,
          created_by: ctx.userId,
          proposal_id: p.id,
          assignee: p.payload.assignee ?? ctx.userId,
          title: p.payload.title,
          description: p.payload.description ?? null,
          due_date: p.payload.dueDate ?? null,
          priority: p.payload.priority ?? "normal",
          related_kind: p.payload.relatedKind ?? null,
          related_id: p.payload.relatedId ?? null,
          status: "open",
        }).select().single();
      if (error) throw error;
      return { entityType: "copilot_followup_tasks", entityId: (row as any).id };
    }

    case "collection_reminder": {
      // Log as notification + follow-up task so the sales rep can act.
      const p2 = p.payload;
      const { data: task } = await ctx.supabase
        .from("copilot_followup_tasks")
        .insert({
          org_id: orgId, created_by: ctx.userId, proposal_id: p.id,
          title: `مطالبة تحصيل — ${p2.party?.name ?? p2.partyId}`,
          description: p2.message,
          related_kind: "parties", related_id: p2.partyId,
          priority: "high", status: "open",
          due_date: p2.dueDate ?? null,
        }).select().single();
      // best-effort notification
      try {
        await ctx.supabase.from("notifications").insert({
          org_id: orgId, user_id: ctx.userId,
          title: p.title, body: p2.message,
          kind: "collection_reminder", severity: "info",
          related_kind: "parties", related_id: p2.partyId,
        });
      } catch {}
      return { entityType: "copilot_followup_tasks", entityId: (task as any)?.id };
    }

    case "supplier_payment": {
      const { data: docId, error } = await ctx.supabase.rpc("create_payment", {
        _org: orgId,
        _payload: {
          party_id: p.payload.partyId,
          cash_bank_account_id: p.payload.cashBankAccountId,
          amount: p.payload.amount,
          currency: p.payload.currency ?? "SAR",
          date: p.payload.date ?? new Date().toISOString().slice(0, 10),
          memo: p.payload.memo ?? p.title,
          reference: p.payload.reference,
          allocations: p.payload.allocations ?? [],
          auto_fifo: p.payload.autoFifo ?? false,
        },
      });
      if (error) throw error;
      return { entityType: "documents", entityId: docId as any };
    }

    case "bulk_payments": {
      const results: any[] = [];
      for (const g of p.payload.groups as any[]) {
        const total = g.docs.reduce((s: number, d: any) => s + Number(d.open_as_target), 0);
        const { data: docId, error } = await ctx.supabase.rpc("create_payment", {
          _org: orgId,
          _payload: {
            party_id: g.partyId,
            cash_bank_account_id: p.payload.cashBankAccountId,
            amount: total,
            currency: p.payload.currency ?? "SAR",
            date: new Date().toISOString().slice(0, 10),
            memo: `Bulk payment (copilot ${p.id.slice(0, 8)})`,
            auto_fifo: true,
          },
        });
        results.push({ partyId: g.partyId, total, docId, error: error?.message ?? null });
      }
      return { entityType: "bulk_payments", entityId: undefined };
    }

    case "collection_plan": {
      const parties = p.payload.parties as any[];
      for (const grp of parties) {
        await ctx.supabase.from("copilot_followup_tasks").insert({
          org_id: orgId, created_by: ctx.userId, proposal_id: p.id,
          title: `تحصيل — ${grp.partyId}`,
          description: `${grp.docs.length} فاتورة متأخرة · إجمالي ${grp.total.toFixed(2)} · أقدم ${grp.oldest}`,
          related_kind: "parties", related_id: grp.partyId,
          priority: "high", status: "open",
        });
      }
      return { entityType: "copilot_followup_tasks", entityId: undefined };
    }

    default:
      throw new Error(`unsupported_action_kind: ${p.action_kind}`);
  }
}

export const confirmProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { proposalId: string; note?: string })
  .handler(async ({ data, context }) => {
    const p = await loadProposal(context, data.proposalId);
    if (p.status !== "pending") throw new Error(`invalid_status: ${p.status}`);
    await markStatus(context, p.id, {
      status: "confirmed",
      confirmed_by: context.userId,
      user_note: data.note ?? null,
    });
    try {
      const res = await executeProposal(context, p);
      await markStatus(context, p.id, {
        status: "executed",
        executed_at: new Date().toISOString(),
        result_entity_type: res.entityType ?? null,
        result_entity_id: res.entityId ?? null,
      });
      await audit(context, {
        orgId: p.org_id, event: "executed", proposal: p,
        after: { entity_type: res.entityType, entity_id: res.entityId },
      });
      return { ok: true, ...res };
    } catch (e: any) {
      const msg = e?.message || String(e);
      await markStatus(context, p.id, { status: "failed", error: msg });
      await audit(context, { orgId: p.org_id, event: "failed", proposal: p, reason: msg });
      throw e;
    }
  });

export const rejectProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { proposalId: string; note?: string })
  .handler(async ({ data, context }) => {
    const p = await loadProposal(context, data.proposalId);
    if (p.status !== "pending") throw new Error(`invalid_status: ${p.status}`);
    await markStatus(context, p.id, {
      status: "rejected", confirmed_by: context.userId, user_note: data.note ?? null,
    });
    await audit(context, { orgId: p.org_id, event: "rejected", proposal: p, reason: data.note ?? null });
    return { ok: true };
  });

export const cancelProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d as { proposalId: string })
  .handler(async ({ data, context }) => {
    const p = await loadProposal(context, data.proposalId);
    if (!["pending", "confirmed"].includes(p.status)) throw new Error(`invalid_status: ${p.status}`);
    await markStatus(context, p.id, { status: "cancelled" });
    await audit(context, { orgId: p.org_id, event: "cancelled", proposal: p });
    return { ok: true };
  });

// Centralized Posting Engine (Batch 2C.0)
// Business modules MUST call postEvent() with an event + payload.
// The engine loads posting rules for the org+event, evaluates expressions,
// and calls the `post_journal` RPC to atomically create a balanced journal entry.

import { supabase } from "@/integrations/supabase/client";
import type { JournalLineInput, PostJournalInput, PostingEventType, RuleConfig } from "./types";
import { evalExpr } from "./expr";

export type PostEventInput = {
  orgId: string;
  eventType: PostingEventType;
  eventId: string; // idempotency key — required
  payload: Record<string, number | string | null | undefined>;
  entryDate?: string;
  memo?: string;
  branchId?: string | null;
  sourceModule?: string;
  sourceDocumentType?: string;
  sourceDocumentId?: string | null;
  currency?: string;
  exchangeRate?: number;
};

export type PostResult =
  | { ok: true; journalEntryId: string; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

const ROUND = (n: number) => Math.round(n * 100) / 100;

export function buildLinesFromRule(config: RuleConfig, payload: Record<string, unknown>): JournalLineInput[] {
  const scope: Record<string, number> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "number" && Number.isFinite(v)) scope[k] = v;
    else if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) scope[k] = Number(v);
  }
  const lines: JournalLineInput[] = [];
  for (const leg of config.legs || []) {
    const amt = ROUND(evalExpr(leg.amount_expr, scope));
    if (!Number.isFinite(amt) || amt === 0) continue;
    if (!leg.account_code) {
      throw new Error(
        `posting_rule_missing_account_code${leg.account_key ? `:unresolved_key=${leg.account_key}` : ""}`,
      );
    }
    lines.push({
      account_code: leg.account_code,
      debit: leg.side === "debit" ? amt : 0,
      credit: leg.side === "credit" ? amt : 0,
      description: leg.description,
      cost_center_code: leg.cost_center_code,
    });
  }
  return lines;
}

async function loadRule(orgId: string, eventType: PostingEventType) {
  const { data, error } = await supabase
    .from("posting_rules")
    .select("id,config,is_active,priority")
    .eq("org_id", orgId)
    .eq("event_type", eventType)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function postEvent(input: PostEventInput): Promise<PostResult> {
  try {
    if (!input.orgId) return { ok: false, error: "missing_org" };
    if (!input.eventId) return { ok: false, error: "missing_event_id" };

    // Idempotency: log the event first (best-effort)
    await supabase.from("posting_events").upsert(
      {
        org_id: input.orgId,
        event_type: input.eventType,
        event_key: input.eventId,
        payload: input.payload as never,
        source_module: input.sourceModule ?? null,
        source_document_id: input.sourceDocumentId ?? null,
        status: "pending",
      },
      { onConflict: "org_id,event_key" }
    );

    const rule = await loadRule(input.orgId, input.eventType);
    if (!rule) {
      await supabase
        .from("posting_events")
        .update({ status: "failed", error: "no_posting_rule" })
        .eq("org_id", input.orgId)
        .eq("event_key", input.eventId);
      return { ok: false, error: "no_posting_rule_for_event:" + input.eventType };
    }

    const config = (rule.config as unknown as RuleConfig) || { legs: [] };
    const lines = buildLinesFromRule(config, input.payload);
    if (lines.length < 2) {
      await supabase
        .from("posting_events")
        .update({ status: "failed", error: "rule_produced_less_than_2_lines" })
        .eq("org_id", input.orgId)
        .eq("event_key", input.eventId);
      return { ok: false, error: "rule_produced_less_than_2_lines" };
    }

    const payload: PostJournalInput = {
      entry_date: input.entryDate,
      memo: input.memo,
      currency: input.currency ?? "SAR",
      exchange_rate: input.exchangeRate ?? 1,
      branch_id: input.branchId ?? null,
      source_module: input.sourceModule,
      source_document_type: input.sourceDocumentType,
      source_document_id: input.sourceDocumentId ?? null,
      event_type: input.eventType,
      event_id: input.eventId,
      lines,
    };

    const { data, error } = await supabase.rpc("post_journal", {
      _org: input.orgId,
      _payload: payload as never,
    });
    if (error) {
      await supabase
        .from("posting_events")
        .update({ status: "failed", error: error.message })
        .eq("org_id", input.orgId)
        .eq("event_key", input.eventId);
      return { ok: false, error: error.message };
    }
    const jeId = data as unknown as string;
    await supabase
      .from("posting_events")
      .update({ status: "processed", journal_entry_id: jeId, processed_at: new Date().toISOString() })
      .eq("org_id", input.orgId)
      .eq("event_key", input.eventId);
    return { ok: true, journalEntryId: jeId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function reverseJournal(orgId: string, entryId: string, memo?: string, date?: string) {
  const args: { _org: string; _entry_id: string; _memo?: string; _date?: string } = {
    _org: orgId,
    _entry_id: entryId,
  };
  if (memo) args._memo = memo;
  if (date) args._date = date;
  const { data, error } = await supabase.rpc("reverse_journal", args);
  if (error) throw error;
  return data as unknown as string;
}

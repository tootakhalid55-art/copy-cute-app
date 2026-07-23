// Finance Health Check client — reads run_finance_health_check RPC and latest-snapshot view.
import { supabase } from "@/integrations/supabase/client";

export type Severity = "ok" | "warn" | "error";

export type HealthCheck = {
  check_name: string;
  severity: Severity;
  issue_count: number;
  details: { rows: unknown[] };
  ran_at?: string;
};

export const CHECK_LABELS: Record<string, string> = {
  unbalanced_journals: "قيود غير متوازنة",
  orphan_allocations: "تخصيصات يتيمة",
  duplicate_allocations: "تخصيصات مكررة",
  negative_open_balances: "أرصدة مفتوحة سالبة",
  duplicate_journal_refs: "مراجع قيود مكررة",
  invalid_posting_sequences: "تسلسلات ترحيل غير صحيحة",
  failed_posting_events: "أحداث ترحيل فشلت",
  settlement_mismatch: "عدم تطابق التسويات مع الأرصدة",
};

export async function runHealthCheck(orgId: string): Promise<HealthCheck[]> {
  const { data, error } = await supabase.rpc("run_finance_health_check", { _org: orgId });
  if (error) throw error;
  return (data ?? []) as HealthCheck[];
}

export async function loadLatestHealth(orgId: string): Promise<HealthCheck[]> {
  const { data, error } = await supabase
    .from("finance_health_latest")
    .select("check_name,severity,issue_count,details,ran_at")
    .eq("org_id", orgId);
  if (error) throw error;
  return (data ?? []) as HealthCheck[];
}

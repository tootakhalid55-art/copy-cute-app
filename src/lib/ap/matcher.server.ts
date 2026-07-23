// Server-only supplier matching helper.
// Do not import from client code.
import type { SupabaseClient } from "@supabase/supabase-js";

export type MatchCandidate = {
  party_id: string;
  score: number;      // 0..1
  reason: string;     // vat, iban, email, phone, alias, name
};

const norm = (v: string | null | undefined) =>
  (v || "").toString().trim().toLowerCase().replace(/\s+/g, " ");

const digits = (v: string | null | undefined) =>
  (v || "").toString().replace(/\D+/g, "");

// Simple Dice coefficient for fuzzy name compare (bigrams).
function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  const t = s.replace(/[^\p{L}\p{N}]+/gu, "");
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
function nameSim(a: string, b: string): number {
  const A = bigrams(norm(a));
  const B = bigrams(norm(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export type MatcherInput = {
  supplierName?: string;
  vat?: string;
  iban?: string;
  email?: string;
  phone?: string;
};

export async function matchSupplier(
  supabase: SupabaseClient,
  orgId: string,
  input: MatcherInput,
): Promise<{ best: MatchCandidate | null; all: MatchCandidate[] }> {
  const candidates = new Map<string, MatchCandidate>();
  const push = (id: string, score: number, reason: string) => {
    const prev = candidates.get(id);
    if (!prev || score > prev.score) candidates.set(id, { party_id: id, score, reason });
  };

  // 1) Deterministic keys via supplier_aliases
  const aliasChecks: Array<{ type: string; value: string; conf: number; reason: string }> = [];
  if (input.vat && digits(input.vat).length >= 10)
    aliasChecks.push({ type: "vat", value: digits(input.vat), conf: 0.99, reason: "vat" });
  if (input.iban)
    aliasChecks.push({ type: "iban", value: norm(input.iban).replace(/\s+/g, ""), conf: 0.99, reason: "iban" });
  if (input.email)
    aliasChecks.push({ type: "email", value: norm(input.email), conf: 0.95, reason: "email" });
  if (input.phone && digits(input.phone).length >= 8)
    aliasChecks.push({ type: "phone", value: digits(input.phone), conf: 0.9, reason: "phone" });
  if (input.supplierName)
    aliasChecks.push({ type: "name", value: norm(input.supplierName), conf: 0.92, reason: "alias" });

  if (aliasChecks.length) {
    const { data: aliases } = await supabase
      .from("supplier_aliases")
      .select("party_id, alias_type, normalized")
      .eq("org_id", orgId)
      .in("alias_type", aliasChecks.map((a) => a.type))
      .in("normalized", aliasChecks.map((a) => a.value));
    for (const row of aliases || []) {
      const rule = aliasChecks.find((a) => a.type === row.alias_type && a.value === row.normalized);
      if (rule) push(row.party_id, rule.conf, rule.reason);
    }
  }

  // 2) Direct fields on parties (vat/iban/email/phone/name fuzzy)
  const { data: parties } = await supabase
    .from("parties")
    .select("id, name, name_ar, vat_number, iban, email, phone, party_type")
    .eq("org_id", orgId)
    .in("party_type", ["supplier", "both"])
    .limit(500);

  const vatDigits = digits(input.vat);
  const ibanN = norm(input.iban).replace(/\s+/g, "");
  const emailN = norm(input.email);
  const phoneD = digits(input.phone);

  for (const p of parties || []) {
    if (vatDigits && digits((p as any).vat_number) === vatDigits) push(p.id, 0.99, "vat");
    if (ibanN && norm((p as any).iban).replace(/\s+/g, "") === ibanN) push(p.id, 0.99, "iban");
    if (emailN && norm((p as any).email) === emailN) push(p.id, 0.95, "email");
    if (phoneD && digits((p as any).phone) === phoneD) push(p.id, 0.9, "phone");
    if (input.supplierName) {
      const sim = Math.max(
        nameSim(input.supplierName, (p as any).name || ""),
        nameSim(input.supplierName, (p as any).name_ar || ""),
      );
      if (sim >= 0.6) push(p.id, sim, "name");
    }
  }

  const all = Array.from(candidates.values()).sort((a, b) => b.score - a.score);
  return { best: all[0] || null, all: all.slice(0, 5) };
}

export async function findDuplicateIntake(
  supabase: SupabaseClient,
  orgId: string,
  partyId: string | null,
  invoiceNumber: string,
  total: number,
): Promise<string | null> {
  if (!invoiceNumber && !total) return null;
  // Check existing bills first
  const q = supabase
    .from("documents")
    .select("id, ref, total, party_id")
    .eq("org_id", orgId)
    .eq("kind", "bill")
    .limit(20);
  const { data: bills } = await q;
  for (const b of bills || []) {
    const sameRef = invoiceNumber && (b as any).ref === invoiceNumber;
    const sameTotal = Math.abs(Number((b as any).total || 0) - total) < 0.5;
    const sameParty = partyId && (b as any).party_id === partyId;
    if (sameRef && sameTotal && (sameParty || !partyId)) return (b as any).id;
  }
  return null;
}

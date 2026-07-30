// Supabase-backed replacement for `useCollection`, keyed by legacy storage keys.
// Public API matches useCollection: { items, add, update, remove } for keys we've migrated.
// Currently migrated: "customers", "suppliers", "items".
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./org";

export const CLOUD_KEYS = new Set(["customers", "suppliers", "items"]);

type Rec = { id: string; [k: string]: any };

function isBrowser() {
  return typeof window !== "undefined";
}

// ---- mappers ------------------------------------------------------------

function mapPartyRow(r: any) {
  const meta = r.meta ?? {};
  return {
    id: r.id,
    name: r.name,
    code: r.code ?? undefined,
    type: meta.subtype ?? (r.type === "supplier" ? "شركة" : "شركة"),
    taxNumber: r.vat_number ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    address: typeof r.address === "string" ? r.address : r.address?.text ?? "",
    openingBalance: Number(r.opening_balance ?? 0),
    currency: r.currency ?? "SAR",
    cr_number: r.cr_number ?? "",
    payment_terms_days: r.payment_terms_days ?? 0,
    notes: r.notes ?? "",
    createdAt: r.created_at,
    ...meta,
  };
}

function toPartyInsert(input: any, orgId: string, partyType: "customer" | "supplier") {
  const {
    id: _id,
    createdAt: _c,
    name,
    code,
    taxNumber,
    phone,
    email,
    address,
    openingBalance,
    currency,
    cr_number,
    payment_terms_days,
    notes,
    ...rest
  } = input ?? {};
  return {
    org_id: orgId,
    type: partyType,
    name: String(name ?? "").trim(),
    code: code ?? null,
    vat_number: taxNumber ?? null,
    cr_number: cr_number ?? null,
    phone: phone ?? null,
    email: email ?? null,
    address: address ? { text: String(address) } : null,
    opening_balance: Number(openingBalance ?? 0) || 0,
    currency: currency ?? "SAR",
    payment_terms_days: Number(payment_terms_days ?? 0) || 0,
    notes: notes ?? null,
    meta: rest ?? {},
  };
}

function mapItemRow(r: any) {
  const meta = r.meta ?? {};
  return {
    id: r.id,
    name: r.name,
    sku: r.sku ?? "",
    type: r.kind === "service" ? "خدمة" : "منتج",
    unit: r.unit ?? "",
    price: Number(r.price ?? 0),
    cost: Number(r.cost ?? 0),
    stock: Number(r.stock ?? 0),
    taxRate: Number(r.tax_rate ?? 15),
    createdAt: r.created_at,
    ...meta,
  };
}

function toItemInsert(input: any, orgId: string) {
  const { id: _id, createdAt: _c, name, sku, type, unit, price, cost, stock, taxRate, ...rest } = input ?? {};
  const kind = type === "خدمة" || type === "service" ? "service" : "product";
  return {
    org_id: orgId,
    name: String(name ?? "").trim(),
    sku: sku ?? null,
    kind,
    unit: unit ?? null,
    price: Number(price ?? 0) || 0,
    cost: Number(cost ?? 0) || 0,
    stock: Number(stock ?? 0) || 0,
    tax_rate: Number(taxRate ?? 15) || 0,
    meta: rest ?? {},
  };
}

// ---- fetch/mutate primitives -------------------------------------------

async function fetchAll(key: string, orgId: string): Promise<Rec[]> {
  if (key === "customers" || key === "suppliers") {
    const partyType = key === "customers" ? "customer" : "supplier";
    const { data, error } = await supabase
      .from("parties")
      .select("*")
      .eq("org_id", orgId)
      .in("type", [partyType, "both"])
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapPartyRow);
  }
  if (key === "items") {
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapItemRow);
  }
  return [];
}

async function insertOne(key: string, orgId: string, input: any) {
  if (key === "customers" || key === "suppliers") {
    const payload = toPartyInsert(input, orgId, key === "customers" ? "customer" : "supplier");
    const { data, error } = await (supabase.from("parties") as any).insert(payload).select("*").single();
    if (error) throw error;
    return mapPartyRow(data);
  }
  if (key === "items") {
    const { data, error } = await (supabase.from("items") as any).insert(toItemInsert(input, orgId)).select("*").single();
    if (error) throw error;
    return mapItemRow(data);
  }
  throw new Error(`unknown key ${key}`);
}

async function updateOne(key: string, orgId: string, id: string, patch: any) {
  if (key === "customers" || key === "suppliers") {
    const payload = toPartyInsert(patch, orgId, key === "customers" ? "customer" : "supplier");
    // Only send fields present in patch to avoid overwriting with defaults.
    const filtered: Record<string, any> = {};
    for (const k of Object.keys(payload)) {
      if (k === "org_id" || k === "type") continue;
      const v = (payload as any)[k];
      if (v !== undefined) filtered[k] = v;
    }
    const { error } = await (supabase.from("parties") as any).update(filtered).eq("id", id).eq("org_id", orgId);
    if (error) throw error;
    return;
  }
  if (key === "items") {
    const payload = toItemInsert(patch, orgId);
    const filtered: Record<string, any> = {};
    for (const k of Object.keys(payload)) {
      if (k === "org_id") continue;
      const v = (payload as any)[k];
      if (v !== undefined) filtered[k] = v;
    }
    const { error } = await (supabase.from("items") as any).update(filtered).eq("id", id).eq("org_id", orgId);
    if (error) throw error;
    return;
  }
}

async function deleteOne(key: string, orgId: string, id: string) {
  const table = key === "items" ? "items" : "parties";
  const { error } = await supabase.from(table).delete().eq("id", id).eq("org_id", orgId);
  if (error) throw error;
}

// ---- hook --------------------------------------------------------------

export function useCloudCollection<T extends Rec = Rec>(key: string) {
  const { currentOrgId, ready } = useOrg();
  const qc = useQueryClient();
  const enabled = ready && !!currentOrgId && CLOUD_KEYS.has(key);
  const queryKey = ["coll", key, currentOrgId] as const;

  const q = useQuery({
    queryKey,
    queryFn: () => fetchAll(key, currentOrgId!),
    enabled,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isBrowser() || !enabled) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (!detail?.key || detail.key === key) {
        void qc.invalidateQueries({ queryKey });
      }
    };
    window.addEventListener("haseem:collection-changed", handler as EventListener);
    return () => window.removeEventListener("haseem:collection-changed", handler as EventListener);
  }, [enabled, key, qc, queryKey]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["coll", key, currentOrgId] });

  const addM = useMutation({
    mutationFn: (input: Omit<T, "id">) => insertOne(key, currentOrgId!, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Rec[]>(queryKey) ?? [];
      const optimistic = { ...(input as any), id: `tmp_${Date.now()}`, createdAt: new Date().toISOString() };
      qc.setQueryData<Rec[]>(queryKey, [optimistic, ...prev]);
      return { prev };
    },
    onSuccess: (data) => {
      qc.setQueryData<Rec[]>(queryKey, (prev = []) => {
        const filtered = prev.filter((row) => !String(row.id).startsWith("tmp_"));
        return [data as Rec, ...filtered];
      });
      if (isBrowser()) window.dispatchEvent(new CustomEvent("haseem:collection-changed", { detail: { key } }));
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: invalidate,
  });

  const updateM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<T> }) => updateOne(key, currentOrgId!, id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Rec[]>(queryKey) ?? [];
      qc.setQueryData<Rec[]>(queryKey, prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(queryKey, ctx.prev),
    onSettled: invalidate,
  });

  const removeM = useMutation({
    mutationFn: (id: string) => deleteOne(key, currentOrgId!, id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Rec[]>(queryKey) ?? [];
      qc.setQueryData<Rec[]>(queryKey, prev.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(queryKey, ctx.prev),
    onSettled: invalidate,
  });

  const items = (q.data ?? []) as T[];

  const add = useCallback(
    (input: Omit<T, "id">) => {
      const optimistic = { ...(input as any), id: `tmp_${Date.now()}` } as T;
      addM.mutate(input);
      return optimistic;
    },
    [addM],
  );
  const update = useCallback((id: string, patch: Partial<T>) => updateM.mutate({ id, patch }), [updateM]);
  const remove = useCallback((id: string) => removeM.mutate(id), [removeM]);

  return { items, add, update, remove, loading: q.isLoading, error: q.error, enabled };
}

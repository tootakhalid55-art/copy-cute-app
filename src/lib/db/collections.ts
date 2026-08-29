// Supabase-backed replacement for `useCollection`, keyed by legacy storage keys.
// Public API matches useCollection: { items, add, update, remove } for keys we've migrated.
// Migrated: parties/items, all document collections (documents table),
// "accounts" (chart_of_accounts) and "journal-entries" (journal_entries).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./org";

// Legacy storage key -> documents.kind
export const DOC_KEYS: Record<string, string> = {
  invoices: "sales_invoice",
  bills: "purchase_invoice",
  quotations: "sales_quotation",
  "credit-notes": "credit_note",
  "debit-notes": "debit_note",
  "purchase-orders": "purchase_order",
  receipts: "receipt_voucher",
  payments: "payment_voucher",
  expenses: "expense_voucher",
};

export const CLOUD_KEYS = new Set([
  "customers",
  "suppliers",
  "items",
  "accounts",
  "journal-entries",
  ...Object.keys(DOC_KEYS),
]);

// UI (Arabic) <-> DB status labels for documents
const DOC_STATUS_TO_UI: Record<string, string> = {
  draft: "مسودة",
  pending_approval: "قيد الانتظار",
  approved: "معتمد",
  issued: "مؤكد",
  posted: "مرحل",
  paid: "مدفوع",
  partially_paid: "مدفوع جزئياً",
  cancelled: "ملغي",
  archived: "مؤرشف",
};

/** Post a document's journal atomically on the server (documents only). */
export async function postCloudDocument(orgId: string, docId: string) {
  const { data, error } = await supabase.rpc("post_document", {
    _org: orgId,
    _doc_id: docId,
  } as never);
  if (error) throw error;
  return data as unknown as { document_id: string; journal_id?: string };
}

/** Cancel a document; reverses its journal server-side when posted. */
export async function cancelCloudDocument(orgId: string, docId: string, reason?: string) {
  const { data, error } = await supabase.rpc("cancel_document", {
    _org: orgId,
    _doc_id: docId,
    _reason: reason ?? null,
  } as never);
  if (error) throw error;
  return data as unknown as { document_id: string; reversal_journal_id?: string };
}

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
    address: { text: String(address ?? "").trim() || "غير محدد" },
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

function mapDocLine(l: any) {
  return {
    description: l.description ?? "",
    qty: Number(l.qty ?? 1),
    price: Number(l.price ?? 0),
    tax: Number(l.tax_rate ?? 15),
    discount: Number(l.discount ?? 0),
  };
}

function mapDocRow(r: any) {
  const meta = r.meta ?? {};
  const lines = Array.isArray(r.document_lines)
    ? [...r.document_lines].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(mapDocLine)
    : [];
  return {
    id: r.id,
    dbId: r.id,
    ref: r.doc_number,
    date: r.issue_date,
    dueDate: r.due_date ?? undefined,
    partyId: r.party_id ?? undefined,
    partyName: r.party_snapshot?.name ?? meta.partyName ?? "",
    customer: r.party_snapshot?.name ?? meta.partyName ?? "",
    supplier: r.party_snapshot?.name ?? meta.supplier ?? "",
    notes: r.notes ?? "",
    subtotal: Number(r.subtotal ?? 0),
    tax: Number(r.vat_total ?? 0),
    total: Number(r.grand_total ?? 0),
    amount: Number(r.grand_total ?? 0),
    status: DOC_STATUS_TO_UI[r.status] ?? r.status,
    dbStatus: r.status,
    currency: r.currency ?? "SAR",
    lines,
    createdAt: r.created_at,
    ...meta,
  };
}

function toDocPayload(key: string, input: any, orgId: string) {
  const {
    id: _id, dbId: _db, createdAt: _c, dbStatus: _ds,
    ref, date, dueDate, partyId, partyName, notes, subtotal, tax, total, amount,
    lines, status: _status, currency, customer, supplier, description, category,
    ...rest
  } = input ?? {};
  const amt = Number(total ?? amount ?? 0);
  const linesPayload = Array.isArray(lines)
    ? lines.map((l: any, i: number) => {
        const qty = Number(l.qty || 0);
        const price = Number(l.price || 0);
        const taxRate = Number(l.tax ?? l.tax_rate ?? 0);
        const discount = Number(l.discount || 0);
        const net = qty * price - discount;
        return {
          position: i + 1,
          description: l.description || "",
          qty,
          price,
          discount,
          tax_rate: taxRate,
          line_total: Math.round((net * (1 + taxRate / 100) + Number.EPSILON) * 100) / 100,
        };
      })
    : undefined;
  return {
    org_id: orgId,
    kind: DOC_KEYS[key],
    doc_number: String(ref ?? "").trim() || `${DOC_KEYS[key].slice(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    issue_date: date ?? new Date().toISOString().slice(0, 10),
    due_date: dueDate || null,
    party_id: partyId || null,
    party_snapshot: partyName || customer || supplier ? { name: partyName ?? customer ?? supplier } : {},
    notes: [description, notes].filter(Boolean).join("\n") || null,
    currency: currency ?? "SAR",
    subtotal: Number(subtotal ?? amt ?? 0),
    vat_total: Number(tax ?? 0),
    grand_total: amt,
    meta: { ...rest, ...(category ? { category } : {}), ...(supplier ? { supplier } : {}), ...(partyName ? { partyName } : {}) },
    lines: linesPayload,
  };
}

const UI_ACCOUNT_TYPE: Record<string, string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق الملكية",
  revenue: "إيرادات",
  cost_of_sales: "تكلفة المبيعات",
  expense: "مصروفات",
  other_income: "إيرادات أخرى",
  other_expense: "مصروفات أخرى",
};

function toDbAccountType(t: string | undefined): string {
  const s = String(t ?? "").trim();
  for (const [db, ar] of Object.entries(UI_ACCOUNT_TYPE)) {
    if (s === db || s === ar) return db;
  }
  if (/إيراد|revenue|income/i.test(s)) return "revenue";
  if (/تكلفة|cogs|cost/i.test(s)) return "cost_of_sales";
  if (/مصروف|expense/i.test(s)) return "expense";
  if (/خصوم|التزام|liabilit/i.test(s)) return "liability";
  if (/ملكية|equity/i.test(s)) return "equity";
  return "asset";
}

function mapAccountRow(r: any) {
  const meta = r.meta ?? {};
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: UI_ACCOUNT_TYPE[r.type] ?? r.type,
    dbType: r.type,
    openingBalance: Number(r.opening_balance ?? 0),
    isHeader: !!r.is_header,
    isActive: r.is_active !== false,
    createdAt: r.created_at,
    ...meta,
  };
}

function mapJournalRow(r: any) {
  const lines = Array.isArray(r.journal_lines)
    ? [...r.journal_lines]
        .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
        .map((l: any) => ({
          accountCode: l.chart_of_accounts?.code ?? l.account_code ?? "",
          description: l.description ?? "",
          debit: Number(l.debit ?? 0),
          credit: Number(l.credit ?? 0),
        }))
    : [];
  return {
    id: r.id,
    ref: r.entry_number,
    date: r.entry_date,
    memo: r.memo ?? "",
    status: r.status,
    totalDebit: Number(r.total_debit ?? 0),
    totalCredit: Number(r.total_credit ?? 0),
    lines,
    createdAt: r.created_at,
  };
}

// ---- fetch/mutate primitives -------------------------------------------

async function fetchAll(key: string, orgId: string): Promise<Rec[]> {
  if (DOC_KEYS[key]) {
    const { data, error } = await supabase
      .from("documents")
      .select("*, document_lines(*)")
      .eq("org_id", orgId)
      .eq("kind", DOC_KEYS[key] as never)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []).map(mapDocRow);
  }
  if (key === "accounts") {
    const { data, error } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("org_id", orgId)
      .order("code", { ascending: true })
      .limit(2000);
    if (error) throw error;
    return (data ?? []).map(mapAccountRow);
  }
  if (key === "journal-entries") {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, entry_number, entry_date, memo, status, total_debit, total_credit, created_at, journal_lines(line_no, description, debit, credit, chart_of_accounts(code))")
      .eq("org_id", orgId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return (data ?? []).map(mapJournalRow);
  }
  return fetchAllLegacy(key, orgId);
}

async function fetchAllLegacy(key: string, orgId: string): Promise<Rec[]> {
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

async function fetchDocRow(orgId: string, id: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("*, document_lines(*)")
    .eq("org_id", orgId)
    .eq("id", id)
    .single();
  if (error) throw error;
  return mapDocRow(data);
}

async function insertOne(key: string, orgId: string, input: any) {
  if (DOC_KEYS[key]) {
    const { createDocument } = await import("./documents");
    const { org_id: _o, ...payload } = toDocPayload(key, input, orgId);
    const doc = await createDocument({ orgId, ...payload } as any);
    if (input?.status === "مؤكد" || input?.status === "مرحل") {
      await postCloudDocument(orgId, doc.id);
    }
    return fetchDocRow(orgId, doc.id);
  }
  if (key === "accounts") {
    const { id: _id, createdAt: _c, code, name, type, openingBalance, isHeader, isActive, dbType: _t, ...rest } = input ?? {};
    const { data, error } = await (supabase.from("chart_of_accounts") as any)
      .insert({
        org_id: orgId,
        code: String(code ?? "").trim(),
        name: String(name ?? "").trim(),
        type: toDbAccountType(type),
        opening_balance: Number(openingBalance ?? 0) || 0,
        is_header: !!isHeader,
        is_active: isActive !== false,
        meta: rest ?? {},
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapAccountRow(data);
  }
  if (key === "journal-entries") {
    const lines = (input?.lines ?? [])
      .filter((l: any) => l.accountCode && (Number(l.debit) || Number(l.credit)))
      .map((l: any) => ({
        account_code: String(l.accountCode).trim(),
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        description: l.description ?? "",
      }));
    const eventId = `manual:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
    const { data, error } = await supabase.rpc("post_journal", {
      _org: orgId,
      _payload: {
        entry_date: input?.date ?? new Date().toISOString().slice(0, 10),
        memo: input?.memo ?? input?.ref ?? "",
        source_module: "manual",
        event_type: "manual_journal",
        event_id: eventId,
        lines,
      },
    } as never);
    if (error) throw error;
    const { data: row, error: fetchErr } = await supabase
      .from("journal_entries")
      .select("id, entry_number, entry_date, memo, status, total_debit, total_credit, created_at, journal_lines(line_no, description, debit, credit, chart_of_accounts(code))")
      .eq("id", data as string)
      .single();
    if (fetchErr) throw fetchErr;
    return mapJournalRow(row);
  }
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
  if (DOC_KEYS[key]) {
    const { updateDocument } = await import("./documents");
    const { org_id: _o, kind: _k, lines, ...payload } = toDocPayload(key, patch, orgId);
    // Never regenerate identifiers on partial patches.
    if (!patch?.ref) delete (payload as any).doc_number;
    if (!patch?.date) delete (payload as any).issue_date;
    await updateDocument(id, orgId, { ...payload, ...(lines ? { lines } : {}) } as any);
    if (patch?.status === "مؤكد" || patch?.status === "مرحل") {
      await postCloudDocument(orgId, id);
    }
    return;
  }
  if (key === "accounts") {
    const { id: _id, createdAt: _c, code, name, type, openingBalance, isHeader, isActive, dbType: _t, ...rest } = patch ?? {};
    const upd: Record<string, any> = { meta: rest ?? {} };
    if (code !== undefined) upd.code = String(code).trim();
    if (name !== undefined) upd.name = String(name).trim();
    if (type !== undefined) upd.type = toDbAccountType(type);
    if (openingBalance !== undefined) upd.opening_balance = Number(openingBalance) || 0;
    if (isHeader !== undefined) upd.is_header = !!isHeader;
    if (isActive !== undefined) upd.is_active = isActive !== false;
    const { error } = await (supabase.from("chart_of_accounts") as any)
      .update(upd)
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) throw error;
    return;
  }
  if (key === "journal-entries") {
    throw new Error("القيود المرحلة لا تُعدّل — أنشئ قيد عكس بدلاً من ذلك");
  }
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
  const table = DOC_KEYS[key]
    ? "documents"
    : key === "accounts"
      ? "chart_of_accounts"
      : key === "journal-entries"
        ? "journal_entries"
        : key === "items"
          ? "items"
          : "parties";
  const { error } = await supabase.from(table as never).delete().eq("id", id).eq("org_id", orgId);
  if (error) throw error;
}

// ---- hook --------------------------------------------------------------

const ERROR_AR: Array<[RegExp, string]> = [
  [/posted_document_is_immutable/i, "المستند مرحّل ولا يمكن تعديل بياناته المالية"],
  [/cannot_delete_posted_document/i, "لا يمكن حذف مستند مرحّل — استخدم الإلغاء"],
  [/cannot_delete_posted_or_reversed_journal/i, "لا يمكن حذف قيد مرحّل — أنشئ قيد عكس"],
  [/journal_unbalanced/i, "القيد غير متوازن (المدين ≠ الدائن)"],
  [/no_period_for_date|period_closed_or_locked/i, "لا توجد فترة محاسبية مفتوحة لهذا التاريخ"],
  [/no_posting_rule_for_event/i, "لا توجد قاعدة ترحيل لهذا النوع — فعّل الأساس المحاسبي من الإعدادات"],
  [/missing_account_determination/i, "حساب افتراضي مفقود — أكمل ربط الحسابات من الإعدادات"],
  [/document_has_allocations/i, "المستند مرتبط بتسويات — اعكسها أولاً"],
  [/duplicate key.*doc_number|documents_org_id_kind_doc_number/i, "رقم المستند مستخدم من قبل"],
  [/forbidden|not_authorized/i, "لا تملك صلاحية لهذه العملية"],
];

function surfaceError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const hit = ERROR_AR.find(([re]) => re.test(msg));
  toast.error(hit ? hit[1] : `تعذر تنفيذ العملية: ${msg.slice(0, 140)}`);
}

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
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      surfaceError(err);
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
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      surfaceError(err);
    },
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
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      surfaceError(err);
    },
    onSettled: invalidate,
  });

  const items = (q.data ?? []) as T[];

  const addAsync = useCallback(
    async (input: Omit<T, "id">) => {
      const rec = (await addM.mutateAsync(input)) as T;
      // Make sure every consumer (dropdowns, search, other tabs) sees the row now.
      await qc.invalidateQueries({ queryKey: ["coll", key, currentOrgId] });
      return rec;
    },
    [addM, qc, key, currentOrgId],
  );

  const add = useCallback(
    (input: Omit<T, "id">) => {
      const optimistic = { ...(input as any), id: `tmp_${Date.now()}` } as T;
      void addAsync(input).catch(() => undefined);
      return optimistic;
    },
    [addAsync],
  );
  const update = useCallback((id: string, patch: Partial<T>) => updateM.mutate({ id, patch }), [updateM]);
  const remove = useCallback((id: string) => removeM.mutate(id), [removeM]);

  return { items, add, addAsync, update, remove, loading: q.isLoading, error: q.error, enabled };
}


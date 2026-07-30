import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !PUB_KEY) {
  console.error("missing env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("apikey", SERVICE_KEY);
      return fetch(input, { ...init, headers });
    },
  },
});

const anon = createClient(SUPABASE_URL, PUB_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeJournalLines(entry) {
  const raw = Array.isArray(entry.lines) && entry.lines.length > 0 ? entry.lines : entry.journal_lines ?? [];
  return raw
    .map((line) => ({
      accountCode: String(line.accountCode ?? line.account_code ?? line.account ?? line.gl_account_code ?? "").trim(),
      debit: Number(line.debit ?? line.debit_amount ?? 0) || 0,
      credit: Number(line.credit ?? line.credit_amount ?? 0) || 0,
    }))
    .filter((line) => !!line.accountCode);
}

test("posted invoice and bill flow into balanced journal-ledger data", async () => {
  const email = "info@canarmodern.com";
  const password = "hisho@HASEEM@41991";
  const login = await anon.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;

  const tag = `LEDGER-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const user = (await svc.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === email);
  assert.ok(user, "expected seeded user");

  const orgRes = await svc.from("organizations").insert({ name: `Ledger ${tag}`, created_by: user.id, currency: "SAR" }).select().single();
  if (orgRes.error) throw orgRes.error;
  const orgId = orgRes.data.id;

  try {
    await svc.from("org_members").upsert({ org_id: orgId, user_id: user.id, role: "owner" });
    const year = new Date().getFullYear();
    const fyRes = await svc.from("fiscal_years").insert({
      org_id: orgId,
      name: String(year),
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      is_current: true,
    }).select().single();
    if (fyRes.error) throw fyRes.error;

    const coaRows = [
      { org_id: orgId, code: "1201", name: "Accounts Receivable", type: "أصول", subtype: "أصول متداولة", is_active: true, currency: "SAR" },
      { org_id: orgId, code: "2101", name: "Accounts Payable", type: "التزامات", subtype: "التزامات متداولة", is_active: true, currency: "SAR" },
      { org_id: orgId, code: "4101", name: "Sales Revenue", type: "إيرادات", subtype: "إيرادات تشغيلية", is_active: true, currency: "SAR" },
      { org_id: orgId, code: "5101", name: "Cost of Sales", type: "مصروفات", subtype: "تكلفة المبيعات", is_active: true, currency: "SAR" },
    ];
    const coaRes = await svc.from("chart_of_accounts").insert(coaRows).select();
    if (coaRes.error) throw coaRes.error;

    const customer = await svc.from("parties").insert({ org_id: orgId, name: `Cust ${tag}`, type: "customer" }).select().single();
    if (customer.error) throw customer.error;
    const supplier = await svc.from("parties").insert({ org_id: orgId, name: `Sup ${tag}`, type: "supplier" }).select().single();
    if (supplier.error) throw supplier.error;

    const invoiceDoc = await svc.from("documents").insert({
      org_id: orgId,
      kind: "sales_invoice",
      doc_number: `INV-${tag}`,
      party_id: customer.data.id,
      issue_date: `${year}-07-01`,
      currency: "SAR",
      exchange_rate: 1,
      subtotal: 1000,
      grand_total: 1150,
      status: "posted",
      created_by: user.id,
    }).select().single();
    if (invoiceDoc.error) throw invoiceDoc.error;

    const billDoc = await svc.from("documents").insert({
      org_id: orgId,
      kind: "purchase_invoice",
      doc_number: `BILL-${tag}`,
      party_id: supplier.data.id,
      issue_date: `${year}-07-02`,
      currency: "SAR",
      exchange_rate: 1,
      subtotal: 500,
      grand_total: 575,
      status: "posted",
      created_by: user.id,
    }).select().single();
    if (billDoc.error) throw billDoc.error;

    const post = async (payload) => {
      const r = await anon.rpc("post_journal", { _org: orgId, _payload: payload });
      if (r.error) throw new Error(r.error.message);
      return r.data;
    };

    const invJe = await post({
      entry_date: `${year}-07-01`,
      memo: `Sales invoice ${invoiceDoc.data.doc_number}`,
      source_module: "sales",
      source_document_type: "sales_invoice",
      source_document_id: invoiceDoc.data.id,
      event_type: "invoice_posted",
      event_id: `test:${tag}:invoice`,
      lines: [
        { account_code: "1201", debit: 1150, credit: 0 },
        { account_code: "4101", debit: 0, credit: 1000 },
        { account_code: "2101", debit: 0, credit: 150 },
      ],
    });

    const billJe = await post({
      entry_date: `${year}-07-02`,
      memo: `Purchase invoice ${billDoc.data.doc_number}`,
      source_module: "purchases",
      source_document_type: "purchase_invoice",
      source_document_id: billDoc.data.id,
      event_type: "bill_posted",
      event_id: `test:${tag}:bill`,
      lines: [
        { account_code: "5101", debit: 500, credit: 0 },
        { account_code: "2101", debit: 0, credit: 500 },
      ],
    });

    const entries = await svc.from("journal_entries").select("id,date,ref,memo,total_debit,total_credit,source_document_type,source_document_id").eq("org_id", orgId).order("date");
    if (entries.error) throw entries.error;
    assert.equal(entries.data.length, 2);
    assert.deepEqual(entries.data.map((e) => [Number(e.total_debit), Number(e.total_credit)]), [[1150, 1150], [500, 500]]);

    const lines = await svc.from("journal_entries").select("date,lines,journal_lines").eq("org_id", orgId).order("date");
    if (lines.error) throw lines.error;
    const allLines = lines.data.flatMap(normalizeJournalLines);
    const revenue = allLines.filter((l) => l.accountCode === "4101").reduce((s, l) => s + (l.credit - l.debit), 0);
    const cogs = allLines.filter((l) => l.accountCode === "5101").reduce((s, l) => s + (l.debit - l.credit), 0);
    assert.equal(revenue, 1000);
    assert.equal(cogs, 500);
    assert.equal(invJe, entries.data[0].id);
    assert.equal(billJe, entries.data[1].id);
  } finally {
    await svc.from("organizations").delete().eq("id", orgId);
  }
});


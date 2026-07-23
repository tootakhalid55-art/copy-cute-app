// Phase B2 — Full integration test suite.
// Covers: FIFO ordering, writeoffs, refunds, credit hold, over-allocation, advances,
// partial settlements, reversal, journal balance invariants.
//
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY.
// Runs with:  node tests/accounting/phase-b2.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUB_KEY      = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !PUB_KEY) {
  console.error("missing env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY"); process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => {
    const h = new Headers(init?.headers); h.set('apikey', SERVICE_KEY);
    if (h.get('Authorization') === `Bearer ${SERVICE_KEY}` && SERVICE_KEY.startsWith('sb_')) h.delete('Authorization');
    return fetch(input, { ...init, headers: h });
  }},
});

const results = [];
const log = (n, ok, d='') => { results.push({n,ok,d}); console.log(`${ok?'✅':'❌'} ${n}${d?' — '+d:''}`); };
const near = (a, b, tol=0.01) => Math.abs(Number(a)-Number(b)) <= tol;

async function must(name, fn) { try { await fn(); log(name,true); } catch(e){ log(name,false,String(e?.message||e).slice(0,180)); } }
async function shouldThrow(name, fn, expect) {
  try { await fn(); log(name,false,`expected: ${expect}`); }
  catch(e){ const m=String(e?.message||e); log(name, expect ? m.includes(expect):true, m.slice(0,140)); }
}

const TAG = 'B2-' + Math.random().toString(36).slice(2,7).toUpperCase();
console.log("Tag:", TAG);

// user + org
const email = 'info@canarmodern.com';
const password = 'hisho@HASEEM@41991';
const ul = await sb.auth.admin.listUsers({ perPage: 200 });
const user = ul.data.users.find(u => u.email === email);
if (!user) { console.error('missing test user'); process.exit(1); }

const orgIns = await sb.from('organizations').insert({ name:`Phase-B2 ${TAG}`, created_by: user.id, currency:'SAR' }).select().single();
if (orgIns.error) throw orgIns.error;
const orgId = orgIns.data.id;
await sb.from('org_members').upsert({ org_id: orgId, user_id: user.id, role: 'owner' });

const year = new Date().getFullYear();
await sb.from('fiscal_years').insert({ org_id:orgId, name:String(year), start_date:`${year}-01-01`, end_date:`${year}-12-31`, is_current:true });

// seed CoA
const coa = [
  ['1102','asset','Bank'],['1201','asset','AR'],['2101','liability','AP'],
  ['2201','liability','VAT Payable'],['4101','revenue','Sales'],['5101','expense','COGS'],
  ['6401','expense','General'],['6902','expense','Bad Debt'],
];
await sb.from('chart_of_accounts').insert(coa.map(([code,type,name])=>({
  org_id:orgId, code, name, type, is_active:true, currency:'SAR'
})));

// determinations
await sb.from('account_determinations').insert([
  { org_id:orgId, key:'accounts_receivable', account_code:'1201', is_active:true },
  { org_id:orgId, key:'accounts_payable',    account_code:'2101', is_active:true },
  { org_id:orgId, key:'bad_debt_expense',    account_code:'6902', is_active:true },
]);

// cash/bank account
const bank = await sb.from('cash_bank_accounts').insert({
  org_id:orgId, name:'Main Bank', kind:'bank', currency:'SAR', gl_account_code:'1102', is_active:true
}).select().single();
if (bank.error) throw bank.error;
const bankId = bank.data.id;

// customer
const cust = await sb.from('parties').insert({ org_id:orgId, name:`Cust ${TAG}`, type:'customer' }).select().single();
if (cust.error) throw cust.error;
const custId = cust.data.id;

// supplier
const sup = await sb.from('parties').insert({ org_id:orgId, name:`Sup ${TAG}`, type:'supplier' }).select().single();
if (sup.error) throw sup.error;
const supId = sup.data.id;

// signed-in client for RPCs
const anon = createClient(SUPABASE_URL, PUB_KEY, { auth: { persistSession:false, autoRefreshToken:false }});
const s = await anon.auth.signInWithPassword({ email, password });
if (s.error) throw s.error;

const rpc = async (fn, params) => { const r = await anon.rpc(fn, params); if (r.error) throw new Error(r.error.message); return r.data; };

// helper to create posted invoice (bypasses UI, direct insert + journal for AR)
async function makeInvoice({ party, kind, date, amount, docNumber }) {
  const doc = await sb.from('documents').insert({
    org_id:orgId, kind, doc_number:docNumber, party_id:party, issue_date:date,
    currency:'SAR', exchange_rate:1, subtotal:amount, grand_total:amount, status:'posted',
    created_by:user.id
  }).select().single();
  if (doc.error) throw doc.error;
  const isSale = kind === 'sales_invoice' || kind === 'debit_note';
  const je = await rpc('post_journal', { _org: orgId, _payload: {
    entry_date:date, memo:`${kind} ${docNumber}`,
    source_module: isSale?'AR':'AP', source_document_type: kind, source_document_id: doc.data.id,
    event_type: kind==='sales_invoice'?'invoice_posted':(kind==='purchase_invoice'?'bill_posted':'debit_note_posted'),
    event_id: `${kind}:${doc.data.id}`,
    lines: isSale ? [
      { account_code:'1201', debit:amount, party_id: party },
      { account_code:'4101', credit:amount, party_id: party },
    ] : [
      { account_code:'5101', debit:amount, party_id: party },
      { account_code:'2101', credit:amount, party_id: party },
    ]
  }});
  return { id: doc.data.id, je };
}

// ---------------- 1. FIFO ordering by (issue_date, doc_number) ----------------
console.log("\n== 1. FIFO ordering ==");
// Two invoices same date, different doc_numbers → FIFO by doc_number
const invA = await makeInvoice({ party:custId, kind:'sales_invoice', date:`${year}-03-10`, amount:100, docNumber:'INV-0002' });
const invB = await makeInvoice({ party:custId, kind:'sales_invoice', date:`${year}-03-10`, amount:100, docNumber:'INV-0001' });
const invC = await makeInvoice({ party:custId, kind:'sales_invoice', date:`${year}-03-11`, amount:100, docNumber:'INV-0003' });

const recId = await rpc('create_receipt', { _org: orgId, _payload: {
  party_id: custId, cash_bank_account_id: bankId, amount: 150, date: `${year}-03-15`,
  currency:'SAR', exchange_rate:1, auto_fifo: true,
}});

const allocs = await sb.from('payment_allocations').select('target_document_id,amount')
  .eq('source_document_id', recId).order('amount', { ascending: false });
const allocMap = new Map(allocs.data.map(a => [a.target_document_id, Number(a.amount)]));
log('fifo_first_targets_lowest_doc_number', allocMap.get(invB.id) === 100, `INV-0001 got ${allocMap.get(invB.id)}`);
log('fifo_second_targets_next_doc_number',  allocMap.get(invA.id) === 50,  `INV-0002 got ${allocMap.get(invA.id)}`);
log('fifo_skips_later_date',                !allocMap.has(invC.id) || allocMap.get(invC.id) === 0);

// ---------------- 2. Partial settlement / over-allocation guard ----------------
console.log("\n== 2. Partial + over-allocation ==");
const invD = await makeInvoice({ party:custId, kind:'sales_invoice', date:`${year}-04-01`, amount:200, docNumber:'INV-D' });
// partial
const rec2 = await rpc('create_receipt', { _org: orgId, _payload: {
  party_id: custId, cash_bank_account_id: bankId, amount: 80, date: `${year}-04-02`,
  allocations: [{ target_kind:'invoice', target_document_id: invD.id, amount: 80 }]
}});
const st1 = await sb.from('document_open_balances').select('open_as_target').eq('document_id', invD.id).single();
log('partial_leaves_open_balance', near(st1.data.open_as_target, 120), `open=${st1.data.open_as_target}`);
// over-allocation
await shouldThrow('over_allocation_rejected', () => rpc('create_receipt', { _org: orgId, _payload: {
  party_id: custId, cash_bank_account_id: bankId, amount: 200, date: `${year}-04-03`,
  allocations: [{ target_kind:'invoice', target_document_id: invD.id, amount: 200 }]
}}), 'over_allocation');

// ---------------- 3. Advances / unapplied source ----------------
console.log("\n== 3. Advances ==");
const invE = await makeInvoice({ party:custId, kind:'sales_invoice', date:`${year}-04-10`, amount:50, docNumber:'INV-E' });
const rec3 = await rpc('create_receipt', { _org: orgId, _payload: {
  party_id: custId, cash_bank_account_id: bankId, amount: 200, date: `${year}-04-11`,
  allocations: [{ target_kind:'invoice', target_document_id: invE.id, amount: 50 }]
}});
const src = await sb.from('document_open_balances').select('unapplied_as_source').eq('document_id', rec3).single();
log('advance_recorded_as_unapplied_source', near(src.data.unapplied_as_source, 150), `unapplied=${src.data.unapplied_as_source}`);
const audit = await sb.from('financial_audit_log').select('event_kind').eq('source_document_id', rec3).eq('event_kind','advance_created').maybeSingle();
log('advance_audit_row_present', !!audit.data);

// ---------------- 4. Write-off ----------------
console.log("\n== 4. Write-off ==");
const invF = await makeInvoice({ party:custId, kind:'sales_invoice', date:`${year}-05-01`, amount:300, docNumber:'INV-F' });
await rpc('create_writeoff', { _org: orgId, _payload: {
  target_document_id: invF.id, amount: 300, reason:'bad debt', date: `${year}-05-05`
}});
const wf = await sb.from('documents').select('financial_state').eq('id', invF.id).single();
log('writeoff_sets_state_written_off', wf.data.financial_state === 'written_off');
const wfOpen = await sb.from('document_open_balances').select('open_as_target').eq('document_id', invF.id).single();
log('writeoff_zeroes_open_balance', near(wfOpen.data.open_as_target, 0));
// verify JE balanced
const wfJe = await sb.from('journal_entries').select('total_debit,total_credit').eq('source_document_id', invF.id).eq('event_type','writeoff_created').single();
log('writeoff_journal_balanced', near(wfJe.data.total_debit, wfJe.data.total_credit) && near(wfJe.data.total_debit, 300));

// ---------------- 5. Refund ----------------
console.log("\n== 5. Refund ==");
// Create receipt with advance, refund it
const rec4 = await rpc('create_receipt', { _org: orgId, _payload: {
  party_id: custId, cash_bank_account_id: bankId, amount: 100, date: `${year}-05-10`,
}});
await rpc('create_refund', { _org: orgId, _payload: {
  source_document_id: rec4, cash_bank_account_id: bankId, amount: 100, reason:'client request', date:`${year}-05-11`
}});
const rf = await sb.from('documents').select('financial_state').eq('id', rec4).single();
log('refund_sets_state_refunded', rf.data.financial_state === 'refunded');
const rfJe = await sb.from('journal_entries').select('total_debit,total_credit').eq('source_document_id', rec4).eq('event_type','refund_created').single();
log('refund_journal_balanced', near(rfJe.data.total_debit, rfJe.data.total_credit) && near(rfJe.data.total_debit, 100));

// ---------------- 6. Credit hold + credit limit ----------------
console.log("\n== 6. Credit hold ==");
await sb.from('parties').update({ credit_limit: 500, credit_policy: 'block' }).eq('id', custId);
const ck1 = await rpc('check_credit', { _org: orgId, _party: custId, _new_amount: 100000 });
log('credit_check_reports_not_ok_when_over_limit', ck1.ok === false, `remaining=${ck1.remaining}`);
await sb.from('parties').update({ credit_hold: true }).eq('id', custId);
const ck2 = await rpc('check_credit', { _org: orgId, _party: custId, _new_amount: 1 });
log('credit_hold_blocks_regardless_of_amount', ck2.ok === false && ck2.credit_hold === true);
await sb.from('parties').update({ credit_hold: false, credit_limit: 0, credit_policy: 'warn_only' }).eq('id', custId);

// ---------------- 7. Payment allocation against bills ----------------
console.log("\n== 7. AP payment FIFO ==");
const bill1 = await makeInvoice({ party:supId, kind:'purchase_invoice', date:`${year}-06-01`, amount:400, docNumber:'BILL-01' });
const bill2 = await makeInvoice({ party:supId, kind:'purchase_invoice', date:`${year}-06-02`, amount:400, docNumber:'BILL-02' });
const pay = await rpc('create_payment', { _org: orgId, _payload: {
  party_id: supId, cash_bank_account_id: bankId, amount: 500, date: `${year}-06-05`, auto_fifo: true
}});
const b1 = await sb.from('document_open_balances').select('open_as_target').eq('document_id', bill1.id).single();
const b2 = await sb.from('document_open_balances').select('open_as_target').eq('document_id', bill2.id).single();
log('ap_fifo_settles_oldest_first', near(b1.data.open_as_target, 0) && near(b2.data.open_as_target, 300));

// ---------------- 8. Balance invariants ----------------
console.log("\n== 8. Journal balance invariant ==");
const unbal = await sb.from('journal_entries').select('id,total_debit,total_credit')
  .eq('org_id', orgId).neq('status','draft');
const bad = (unbal.data||[]).filter(r => !near(Number(r.total_debit), Number(r.total_credit), 0.01));
log('all_journals_balanced', bad.length === 0, bad.length ? `${bad.length} unbalanced` : '');

// ---------------- 9. Reverse allocation ----------------
console.log("\n== 9. Reverse allocation ==");
const invG = await makeInvoice({ party:custId, kind:'sales_invoice', date:`${year}-07-01`, amount:100, docNumber:'INV-G' });
const rec5 = await rpc('create_receipt', { _org: orgId, _payload: {
  party_id: custId, cash_bank_account_id: bankId, amount: 100, date:`${year}-07-02`,
  allocations: [{ target_kind:'invoice', target_document_id: invG.id, amount: 100 }]
}});
const al = await sb.from('payment_allocations').select('id').eq('source_document_id', rec5).single();
await rpc('reverse_allocation', { _org: orgId, _alloc: al.data.id, _reason: 'test' });
const invGopen = await sb.from('document_open_balances').select('open_as_target').eq('document_id', invG.id).single();
log('reverse_allocation_reopens_target', near(invGopen.data.open_as_target, 100));

// ---------------- Cleanup ----------------
await sb.from('organizations').delete().eq('id', orgId);

const passed = results.filter(r=>r.ok).length;
const failed = results.filter(r=>!r.ok).length;
console.log(`\n===== Phase B2: ${passed}/${results.length} passed, ${failed} failed =====`);
if (failed) { results.filter(r=>!r.ok).forEach(r => console.log(' -', r.n, r.d)); process.exit(1); }

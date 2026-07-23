// Phase B2 — Performance harness.
// Bulk-loads 100,000 invoices + 50,000 receipts with allocations across a single org,
// then benchmarks the FIFO settlement / open-balance / party-balance queries.
//
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Run:   node tests/accounting/phase-b2-perf.mjs
//
// Timings are only meaningful with warm cache — the script runs each benchmark twice.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("missing env"); process.exit(1); }

const N_INVOICES = Number(process.env.PERF_INVOICES ?? 100000);
const N_PAYMENTS = Number(process.env.PERF_PAYMENTS ?? 50000);
const N_CUSTOMERS = Number(process.env.PERF_CUSTOMERS ?? 500);
const CHUNK = 2000;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth:{persistSession:false, autoRefreshToken:false},
  global:{ fetch:(i,init)=>{ const h=new Headers(init?.headers); h.set('apikey',SERVICE_KEY);
    if (h.get('Authorization')===`Bearer ${SERVICE_KEY}` && SERVICE_KEY.startsWith('sb_')) h.delete('Authorization');
    return fetch(i,{...init,headers:h}); }}
});

const ul = await sb.auth.admin.listUsers({perPage:200});
const user = ul.data.users.find(u=>u.email==='info@canarmodern.com');
if (!user) { console.error('need info@canarmodern.com user'); process.exit(1); }

const TAG = 'PERF-' + Math.random().toString(36).slice(2,6).toUpperCase();
console.log("Tag:", TAG, "target:", { N_INVOICES, N_PAYMENTS, N_CUSTOMERS });

const org = await sb.from('organizations').insert({ name:`Perf ${TAG}`, created_by:user.id, currency:'SAR' }).select().single();
if (org.error) throw org.error;
const orgId = org.data.id;
await sb.from('org_members').upsert({ org_id:orgId, user_id:user.id, role:'owner' });

const year = new Date().getFullYear();
await sb.from('fiscal_years').insert({ org_id:orgId, name:String(year), start_date:`${year}-01-01`, end_date:`${year}-12-31`, is_current:true });

// customers
console.log(`seeding ${N_CUSTOMERS} customers…`);
const custIds = [];
for (let i=0; i<N_CUSTOMERS; i+=CHUNK) {
  const rows = [];
  for (let j=i; j<Math.min(i+CHUNK, N_CUSTOMERS); j++) rows.push({ org_id:orgId, name:`Cust-${TAG}-${j}`, type:'customer' });
  const r = await sb.from('parties').insert(rows).select('id');
  if (r.error) throw r.error;
  custIds.push(...r.data.map(x=>x.id));
}

// invoices — direct posted docs, no journals (bench focuses on settlement math)
console.log(`seeding ${N_INVOICES} invoices…`);
const t0 = Date.now();
const invIds = [];
for (let i=0; i<N_INVOICES; i+=CHUNK) {
  const rows = [];
  const size = Math.min(CHUNK, N_INVOICES - i);
  for (let k=0; k<size; k++) {
    const idx = i+k;
    const cust = custIds[idx % custIds.length];
    const day  = 1 + (idx % 365);
    const d = new Date(year,0,day).toISOString().slice(0,10);
    rows.push({
      org_id:orgId, kind:'sales_invoice',
      doc_number: `INV-${String(idx).padStart(7,'0')}`,
      party_id: cust, issue_date: d, due_date: d,
      currency:'SAR', exchange_rate:1,
      subtotal: 100 + (idx % 900), grand_total: 100 + (idx % 900),
      status:'posted', created_by: user.id
    });
  }
  const r = await sb.from('documents').insert(rows).select('id');
  if (r.error) throw r.error;
  invIds.push(...r.data.map(x=>x.id));
  if (i % 10000 === 0) console.log(`  ${i}/${N_INVOICES}`);
}
console.log(`invoices seeded in ${((Date.now()-t0)/1000).toFixed(1)}s`);

// receipts (as documents) + allocations — bulk insert allocations
console.log(`seeding ${N_PAYMENTS} receipts + allocations…`);
const t1 = Date.now();
const recIds = [];
for (let i=0; i<N_PAYMENTS; i+=CHUNK) {
  const rows = [];
  const size = Math.min(CHUNK, N_PAYMENTS - i);
  for (let k=0; k<size; k++) {
    const idx = i+k;
    const cust = custIds[idx % custIds.length];
    const inv = invIds[idx % invIds.length];
    rows.push({
      org_id:orgId, kind:'receipt_voucher',
      doc_number: `REC-${String(idx).padStart(7,'0')}`,
      party_id: cust, issue_date: `${year}-06-01`,
      currency:'SAR', exchange_rate:1,
      subtotal: 50, grand_total: 50, status:'posted', created_by: user.id
    });
  }
  const r = await sb.from('documents').insert(rows).select('id');
  if (r.error) throw r.error;
  recIds.push(...r.data.map(x=>x.id));

  // Allocations: each receipt of 50 → allocates 50 to a random invoice
  const allocs = r.data.map((rec, k) => ({
    org_id: orgId,
    party_id: custIds[(i+k) % custIds.length],
    source_kind: 'receipt', source_document_id: rec.id,
    target_kind: 'invoice', target_document_id: invIds[(i+k) % invIds.length],
    amount: 50, currency:'SAR', exchange_rate:1, allocation_date:`${year}-06-01`, created_by: user.id
  }));
  const a = await sb.from('payment_allocations').insert(allocs);
  if (a.error) throw a.error;
}
console.log(`receipts+allocs seeded in ${((Date.now()-t1)/1000).toFixed(1)}s`);

// ------------------ Benchmarks ------------------
async function bench(name, fn, runs=2) {
  const times=[];
  for (let i=0;i<runs;i++) { const s=Date.now(); const r=await fn(); const ms=Date.now()-s; times.push(ms); }
  console.log(`⏱  ${name}: ${times.map(t=>t+'ms').join(' / ')} (warm=${times[times.length-1]}ms)`);
  return times;
}

console.log("\n== Benchmarks ==");
const sampleParty = custIds[0];

await bench('list_open_docs_single_party', () =>
  sb.from('document_open_balances').select('document_id,open_as_target,issue_date,doc_number')
    .eq('org_id', orgId).eq('party_id', sampleParty).gt('open_as_target', 0)
    .order('issue_date').order('doc_number').limit(200)
);

await bench('party_balance_single', () => sb.rpc('get_party_balance', { _org: orgId, _party: sampleParty }));

await bench('doc_open_balance_single', () => sb.rpc('get_document_open_balance', { _org: orgId, _doc: invIds[0] }));

await bench('aging_all_customers', () => sb.rpc('get_aging_buckets', { _org: orgId, _party_type: 'customer', _asof: `${year}-12-31` }));

await bench('statement_party_full_year', () => sb.rpc('get_statement', {
  _org: orgId, _account_kind: 'customer', _account_id: sampleParty, _from: `${year}-01-01`, _to: `${year}-12-31`
}));

// Cleanup
console.log("\ncleaning up…");
await sb.from('organizations').delete().eq('id', orgId);
console.log("done.");

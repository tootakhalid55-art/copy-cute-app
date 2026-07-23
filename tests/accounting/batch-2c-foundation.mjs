// Batch 2C.0 automated test suite (uses service_role directly for setup + assertions).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("missing env"); process.exit(1); }

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => {
    const h = new Headers(init?.headers); h.set('apikey', SERVICE_KEY);
    if (h.get('Authorization') === `Bearer ${SERVICE_KEY}` && SERVICE_KEY.startsWith('sb_')) h.delete('Authorization');
    return fetch(input, { ...init, headers: h });
  }},
});

const results = [];
function log(name, ok, detail='') {
  results.push({ name, ok, detail });
  console.log(`${ok?'✅':'❌'} ${name}${detail?' — '+detail:''}`);
}
async function assertThrows(name, fn, expectSubstr) {
  try { await fn(); log(name, false, `expected throw with "${expectSubstr}"`); }
  catch (e) {
    const m = String(e?.message || e);
    log(name, m.includes(expectSubstr), expectSubstr ? `matched: ${m.slice(0,140)}` : m.slice(0,140));
  }
}

// --- Setup: find or create a test user and org ---
const TAG = 'BATCH2C-' + Math.random().toString(36).slice(2,7).toUpperCase();
console.log("Tag:", TAG);

// use existing org from previous tests if available, else create fresh
let userRes = await sb.auth.admin.listUsers({ perPage: 200 });
let user = userRes.data.users.find(u => u.email === 'info@canarmodern.com');
if (!user) {
  const c = await sb.auth.admin.createUser({ email: `test-${TAG.toLowerCase()}@example.com`, password: 'Test-'+TAG+'!', email_confirm: true });
  if (c.error) throw c.error;
  user = c.data.user;
}
console.log("user:", user.email, user.id);

// Create fresh org for isolated tests
const orgIns = await sb.from('organizations').insert({ name: `Test ${TAG}`, created_by: user.id, currency: 'SAR' }).select().single();
if (orgIns.error) throw orgIns.error;
const orgId = orgIns.data.id;
await sb.from('org_members').upsert({ org_id: orgId, user_id: user.id, role: 'owner' });
console.log("org:", orgId);

// --- Test 1: fiscal year auto-creates 12 periods ---
const year = new Date().getFullYear();
const fyIns = await sb.from('fiscal_years').insert({
  org_id: orgId, name: String(year), start_date: `${year}-01-01`, end_date: `${year}-12-31`, is_current: true
}).select().single();
if (fyIns.error) throw fyIns.error;
const fyId = fyIns.data.id;
const periods = await sb.from('accounting_periods').select('*').eq('fiscal_year_id', fyId).order('period_number');
log('fiscal_year_creates_12_periods', periods.data?.length === 12, `got ${periods.data?.length}`);
log('periods_default_open', (periods.data||[]).every(p => p.status === 'open'));

// --- Test 2: seed Chart of Accounts ---
const coaRows = [
  ['1201','asset','Accounts Receivable'],
  ['1102','asset','Bank'],
  ['1401','asset','VAT Recoverable'],
  ['2101','liability','Accounts Payable'],
  ['2201','liability','VAT Payable'],
  ['4101','revenue','Sales Revenue'],
  ['6401','expense','General Expenses'],
  ['9999','asset','Header Only'],
];
const coaIns = await sb.from('chart_of_accounts').insert(coaRows.map(([code,type,name],i) => ({
  org_id: orgId, code, name, type, is_header: code === '9999', is_active: true, currency: 'SAR',
}))).select();
if (coaIns.error) throw coaIns.error;
log('coa_seeded', coaIns.data.length === coaRows.length);

// --- Test 3: post_journal — balanced sales invoice ---
async function callPostJournal(payload) {
  // impersonate user by creating a scoped client with a session? Service role bypasses RLS
  // but post_journal reads auth.uid(). Use RPC with the service client + a magic X-User header? Not available.
  // Workaround: call the RPC using a signed-in client for that user. Generate a magic link.
  const link = await sb.auth.admin.generateLink({ type: 'magiclink', email: user.email });
  const at = link.data?.properties?.access_token || link.data?.properties?.action_link;
  // Simpler: create a session directly
  const sess = await sb.auth.admin.createSession ? null : null;
  throw new Error('need_session');
}
// Simpler approach: sign in via anon-key client with password? We have publishable key.
const anon = createClient(SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// try to sign in — if user is our shared 'info@canarmodern.com' we know password from earlier
if (user.email === 'info@canarmodern.com') {
  const s = await anon.auth.signInWithPassword({ email: user.email, password: 'hisho@HASEEM@41991' });
  if (s.error) throw s.error;
} else {
  const s = await anon.auth.signInWithPassword({ email: user.email, password: 'Test-'+TAG+'!' });
  if (s.error) throw s.error;
}
console.log("signed in as", user.email);

const rpc = async (name, params) => {
  const r = await anon.rpc(name, params);
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

// Balanced entry — sales invoice 1000 subtotal + 150 VAT = 1150 total
const balancedPayload = {
  entry_date: `${year}-06-15`,
  memo: 'Test sales invoice',
  currency: 'SAR', exchange_rate: 1,
  source_module: 'sales', source_document_type: 'invoice',
  event_type: 'invoice_posted', event_id: `test:${TAG}:inv1`,
  lines: [
    { account_code: '1201', debit: 1150, credit: 0, description: 'AR' },
    { account_code: '4101', debit: 0, credit: 1000, description: 'Sales' },
    { account_code: '2201', debit: 0, credit: 150,  description: 'VAT' },
  ],
};
const je1 = await rpc('post_journal', { _org: orgId, _payload: balancedPayload });
log('post_balanced_journal', typeof je1 === 'string' && je1.length > 10);

// Idempotency
const je1b = await rpc('post_journal', { _org: orgId, _payload: balancedPayload });
log('idempotent_replay_returns_same_id', je1 === je1b);

// --- Test 4: unbalanced entry rejected ---
await assertThrows('unbalanced_rejected', () => rpc('post_journal', { _org: orgId, _payload: {
  entry_date: `${year}-06-15`, memo: 'bad',
  lines: [
    { account_code: '1201', debit: 100 },
    { account_code: '4101', credit: 90 },
  ],
}}), 'journal_unbalanced');

// --- Test 5: header account rejected ---
await assertThrows('header_account_rejected', () => rpc('post_journal', { _org: orgId, _payload: {
  entry_date: `${year}-06-15`, memo: 'bad',
  lines: [
    { account_code: '9999', debit: 100 },
    { account_code: '4101', credit: 100 },
  ],
}}), 'cannot_post_to_header_account');

// --- Test 6: missing account rejected ---
await assertThrows('missing_account_rejected', () => rpc('post_journal', { _org: orgId, _payload: {
  entry_date: `${year}-06-15`, memo: 'bad',
  lines: [ { account_code: 'ZZZ', debit: 100 }, { account_code: '4101', credit: 100 } ],
}}), 'account_not_found');

// --- Test 7: single-line rejected ---
await assertThrows('single_line_rejected', () => rpc('post_journal', { _org: orgId, _payload: {
  entry_date: `${year}-06-15`, memo: 'bad',
  lines: [ { account_code: '1201', debit: 100 } ],
}}), 'journal_needs_at_least_two_lines');

// --- Test 8: audit trail populated ---
const je1Row = await sb.from('journal_entries').select('*').eq('id', je1).single();
log('audit_created_by', je1Row.data.created_by === user.id);
log('audit_posted_by', je1Row.data.posted_by === user.id);
log('audit_posted_at_set', !!je1Row.data.posted_at);
log('audit_event_id_stored', je1Row.data.event_id === `test:${TAG}:inv1`);
log('audit_source_document_type', je1Row.data.source_document_type === 'invoice');
log('audit_period_and_fy_set', !!je1Row.data.period_id && !!je1Row.data.fiscal_year_id);

// --- Test 9: cannot edit posted entry (via RLS/trigger) ---
const ed = await anon.from('journal_entries').update({ memo: 'hacked' }).eq('id', je1);
log('cannot_edit_posted_journal', !!ed.error, ed.error?.message?.slice(0,80) || 'expected error missing');

// --- Test 10: cannot delete posted entry ---
const del = await anon.from('journal_entries').delete().eq('id', je1);
log('cannot_delete_posted_journal', !!del.error, del.error?.message?.slice(0,80) || 'expected error missing');

// --- Test 11: cannot mutate lines of posted journal ---
const linesRes = await anon.from('journal_lines').select('id').eq('entry_id', je1).limit(1);
const lineId = linesRes.data?.[0]?.id;
if (lineId) {
  const lm = await anon.from('journal_lines').update({ debit: 999 }).eq('id', lineId);
  log('cannot_edit_lines_of_posted', !!lm.error);
}

// --- Test 12: reverse_journal creates balanced counter-entry ---
const revId = await rpc('reverse_journal', { _org: orgId, _entry_id: je1, _memo: null, _date: null });
log('reverse_created_new_entry', typeof revId === 'string' && revId !== je1);
const revRow = await sb.from('journal_entries').select('*').eq('id', revId).single();
log('reverse_marks_original_reversed', (await sb.from('journal_entries').select('status,reversed_by_entry_id,reversed_by').eq('id', je1).single()).data.status === 'reversed');
log('reverse_balanced', Number(revRow.data.total_debit) === Number(revRow.data.total_credit));
log('reverse_totals_match_original', Number(revRow.data.total_debit) === 1150);

// --- Test 13: cannot reverse twice ---
try { await rpc('reverse_journal', { _org: orgId, _entry_id: je1, _memo:null, _date:null }); log('cannot_reverse_twice', false, 'expected throw'); } catch(e) { const m=String(e.message||e); log('cannot_reverse_twice', m.includes('entry_already_reversed') || m.includes('only_posted_entries_can_be_reversed'), m.slice(0,140)); }

// --- Test 14: closed period rejects posting ---
const junePeriod = periods.data.find(p => p.period_number === 6);
await sb.from('accounting_periods').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', junePeriod.id);
await assertThrows('closed_period_rejects_post', () => rpc('post_journal', { _org: orgId, _payload: {
  entry_date: `${year}-06-20`, memo: 'x',
  event_id: `test:${TAG}:closed`,
  lines: [{account_code:'1201',debit:10},{account_code:'4101',credit:10}],
}}), 'period_closed');
await sb.from('accounting_periods').update({ status: 'open' }).eq('id', junePeriod.id);

// --- Test 15: locked fiscal year rejects ---
await sb.from('fiscal_years').update({ is_locked: true }).eq('id', fyId);
await assertThrows('locked_fy_rejects_post', () => rpc('post_journal', { _org: orgId, _payload: {
  entry_date: `${year}-07-05`, memo: 'x',
  event_id: `test:${TAG}:fylock`,
  lines: [{account_code:'1201',debit:10},{account_code:'4101',credit:10}],
}}), 'fiscal_year_locked');
await sb.from('fiscal_years').update({ is_locked: false }).eq('id', fyId);

// --- Test 16: multi-currency conversion ---
const fcPayload = {
  entry_date: `${year}-08-01`, memo: 'USD invoice',
  currency: 'USD', exchange_rate: 3.75,
  event_id: `test:${TAG}:fx1`,
  lines: [
    { account_code: '1201', debit: 100, credit: 0, currency: 'USD', exchange_rate: 3.75 },
    { account_code: '4101', debit: 0, credit: 100, currency: 'USD', exchange_rate: 3.75 },
  ],
};
const fcId = await rpc('post_journal', { _org: orgId, _payload: fcPayload });
const fcRow = await sb.from('journal_entries').select('total_debit,total_credit,currency,exchange_rate').eq('id', fcId).single();
log('multicurrency_base_totals', Number(fcRow.data.total_debit) === 375 && Number(fcRow.data.total_credit) === 375);
const fcLines = await sb.from('journal_lines').select('debit,credit,debit_fc,credit_fc,currency').eq('entry_id', fcId).order('line_no');
log('multicurrency_fc_stored', Number(fcLines.data[0].debit_fc) === 100 && Number(fcLines.data[0].debit) === 375);

// --- Cleanup ---
await sb.from('organizations').delete().eq('id', orgId);

const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
console.log(`\n===== ${passed}/${results.length} passed, ${failed} failed =====`);
if (failed) { console.log('\nFailures:'); results.filter(r=>!r.ok).forEach(r => console.log(' -', r.name, r.detail)); process.exit(1); }

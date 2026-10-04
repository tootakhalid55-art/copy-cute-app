import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/routes/purchases.scan.tsx', import.meta.url), 'utf8');
const start = source.indexOf('          onSave={(payload) => {') + '          onSave={'.length;
const end = source.indexOf('\n          }}', start) + '\n          }'.length;
const code = ts.transpileModule(`const submit = ${source.slice(start, end)}; globalThis.submit = submit;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let finish;
let calls = 0;
let closed = false;
let job = {};
const locks = new Set();
const events = new Set();
const context = vm.createContext({
  scope: 'user:org', reviewJob: { id: 'job' }, activeSaves: locks,
  warnPendingSave() {},
  window: { addEventListener: (name) => events.add(name), removeEventListener: (name) => events.delete(name) },
  updateJob: (_, patch) => Object.assign(job, patch),
  setReviewId: () => { closed = true; },
  toast: { info() {}, error() {}, success() {} }, navigate() {},
  saveScannedInvoice: () => { calls++; return new Promise((resolve) => { finish = resolve; }); },
});
vm.runInContext(code, context);
const payload = { supplierName: 'Corrected supplier', supplierVatNumber: '123', selectedSupplierId: 'supplier' };
assert.equal(context.submit(payload), undefined);
assert.equal(closed, true);
assert.equal(job.status, 'saving');
assert.equal(job.reviewPayload, payload);
assert.equal(events.has('beforeunload'), true);
context.submit(payload);
assert.equal(calls, 1, 'double submission must not create a second bill');
finish({ ok: false, reason: 'error' });
await new Promise(setImmediate);
assert.equal(job.status, 'save-error');
assert.equal(job.reviewPayload, payload, 'corrections survive failure');
assert.equal(locks.size, 0);
assert.equal(events.size, 0);
context.submit(payload);
assert.equal(calls, 2, 'retry allowed after failure');
finish({ ok: true, billId: 'saved-bill' });
await new Promise(setImmediate);
assert.equal(locks.size, 0);
console.log('Background save: immediate close, duplicate lock, retained corrections, retry and unload guard passed');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
const records = new Map(), legacy = new Map();
let abortWrite = false, localWrites = 0;
const db = {
  close() {},
  transaction() {
    const tx = { objectStore: () => ({
      get(key) { const req = {}; queueMicrotask(() => { req.result = records.get(key); tx.oncomplete(); }); return req; },
      put(value, key) { const req = {}; queueMicrotask(() => {
        if (abortWrite) { tx.error = new Error('quota'); tx.onabort(); }
        else { records.set(key, structuredClone(value)); tx.oncomplete(); }
      }); return req; },
    }) };
    return tx;
  },
};
const source = await readFile(new URL('../../src/lib/haseem/branding-storage.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export /g, '');
const ctx = vm.createContext({ indexedDB: { open() { const req = {}; queueMicrotask(() => { req.result = db; req.onsuccess(); }); return req; } }, localStorage: { getItem: key => legacy.get(key) ?? null, setItem() { localWrites++; throw new Error('full'); } } });
vm.runInContext(js + '\nglobalThis.api = {readBranding, writeBranding};', ctx);
const {readBranding, writeBranding} = ctx.api;
const a = 'haseem:scoped:user1:org1:kv:branding', b = 'haseem:scoped:user2:org1:kv:branding', c = 'haseem:scoped:user1:org2:kv:branding';
const empty = {logo: '', stamp: ''};
legacy.set(a, JSON.stringify({logo: 'old', stamp: 'old-stamp'}));
assert.equal((await readBranding(a, empty)).logo, 'old');
await Promise.all([writeBranding(a, empty, old => ({...old, logo: 'new'})), writeBranding(a, empty, old => ({...old, stamp: 'new-stamp'}))]);
assert.deepEqual(await readBranding(a, empty), {logo: 'new', stamp: 'new-stamp'});
assert.deepEqual(await readBranding(b, empty), empty);
assert.deepEqual(await readBranding(c, empty), empty);
assert.equal(localWrites, 0);
assert.equal(JSON.parse(legacy.get(a)).logo, 'old');
abortWrite = true;
await assert.rejects(writeBranding(a, empty, {logo: 'lost', stamp: ''}));
assert.equal((await readBranding(a, empty)).logo, 'new');
abortWrite = false;
await writeBranding(a, empty, old => ({...old, logo: ''}));
assert.equal((await readBranding(a, empty)).logo, '');
console.log('Branding quota independence, scoped legacy reads, user/org isolation, concurrent updates, commit failure and retry passed');

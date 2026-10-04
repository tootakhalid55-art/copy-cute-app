import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const source=await readFile(new URL('../../src/lib/haseem/scanned-original.ts',import.meta.url),'utf8');
const {selectScannedOriginals}=await import('data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64'));
test('chooses explicit originals; supports manual reattachment and old invoices',()=>{
 const old={id:'old',filename:'original.pdf'},other={id:'other',filename:'contract.pdf'},original={id:'qr',filename:'scan.png',meta:{purpose:'scanned-original'}};
 assert.deepEqual(selectScannedOriginals([other,original,old],'original.pdf'),[original]);
 assert.deepEqual(selectScannedOriginals([other,old],'original.pdf'),[old]);
 assert.deepEqual(selectScannedOriginals([other],'original.pdf'),[]);
 assert.deepEqual(selectScannedOriginals([old]),[old]);
});
test('failed original upload retries only the existing bill attachment and releases lock',async()=>{
 const route=await readFile(new URL('../../src/routes/purchases.scan.tsx',import.meta.url),'utf8');
 const code=compile(route.slice(route.indexOf('  const saveOriginal ='),route.indexOf('  // Shared save routine'))+'\nglobalThis.saveOriginal=saveOriginal;globalThis.retryOriginal=retryOriginal;');
 const job={id:'job',file:{name:'scan.pdf'},billId:'saved-bill'};const calls=[];let succeeds=false;const locks=new Set();
 const context=vm.createContext({currentOrgId:'org',scope:'user:org',activeSaves:locks,warnPendingSave(){},window:{addEventListener(){},removeEventListener(){}},toast:{success(){},error(){}},updateJob:(_,patch)=>Object.assign(job,patch),uploadAttachmentAndWait:async(file,opts)=>{calls.push({file,opts});return {status:succeeds?'done':'failed'};}});
 vm.runInContext(code,context);
 assert.equal(await context.saveOriginal(job,'saved-bill'),false);assert.equal(job.status,'attachment-error');assert.equal(job.billId,'saved-bill');
 succeeds=true;await context.retryOriginal(job);assert.equal(job.status,'saved');assert.equal(calls.length,2);assert.equal(calls[1].opts.entityId,'saved-bill');assert.equal(calls[1].opts.orgId,'org');assert.equal(calls[1].opts.purpose,'scanned-original');assert.equal(locks.size,0);
});
test('original PDF print failures are surfaced instead of silently printing without them',async()=>{
 const source=await readFile(new URL('../../src/lib/haseem/printDoc.ts',import.meta.url),'utf8');
 const start=source.indexOf('async function buildAttachmentPagesHtml');const end=source.indexOf('export async function printDoc',start);
 const code=compile(source.slice(start,end)+'\nglobalThis.render=buildAttachmentPagesHtml;').replace('await import("pdfjs-dist")','await Promise.reject(new Error("offline"))');
 const context=vm.createContext({esc:s=>s,console:{error(){}},Image:class {async decode(){throw new Error('offline');}}});
 vm.runInContext(code,context);
 await assert.rejects(context.render('https://example.test/file.pdf','application/pdf'),/تعذر تحميل صفحات/);
 await assert.rejects(context.render('https://example.test/file.png','image/png'),/تعذر تحميل صورة/);
});

test('renders every PDF page and includes multiple originals in print order',async()=>{
 const source=await readFile(new URL('../../src/lib/haseem/printDoc.ts',import.meta.url),'utf8');
 const start=source.indexOf('async function buildAttachmentPagesHtml'),end=source.indexOf('export async function printDoc',start);
 let destroyed=false;
 const pdf={numPages:2,getPage:async()=>({getViewport:()=>({width:300,height:400}),render:()=>({promise:Promise.resolve()})}),destroy:async()=>{destroyed=true;}};
 const code=compile(source.slice(start,end)+'\nglobalThis.render=buildAttachmentPagesHtml;').replace('await import("pdfjs-dist")','await Promise.resolve(globalThis.pdfjs)').replace('await import("pdfjs-dist/build/pdf.worker.min.mjs?url")','await Promise.resolve({default:"worker"})');
 const context=vm.createContext({esc:s=>s,pdfjs:{GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve(pdf)})},document:{createElement:()=>({getContext:()=>({}),toDataURL:()=> 'data:image/png;base64,test'})},console});
 vm.runInContext(code,context);
 const html=await context.render('https://example.test/original.pdf','application/pdf');
 assert.equal((html.match(/<img /g)||[]).length,2);assert.equal(destroyed,true);
 const snippet=source.slice(source.indexOf('  let attachmentHtml = "";'),source.indexOf('  const scanned =',source.indexOf('  let attachmentHtml = "";')));
 const merge=compile(`async function merge(d){${snippet};return attachmentHtml;} globalThis.merge=merge;`);
 const prints=vm.createContext({buildAttachmentPagesHtml:async url=>`[${url}]`});vm.runInContext(merge,prints);
 assert.equal(await prints.merge({attachments:[{url:'first.pdf'},{url:'second.png'}]}),'[first.pdf][second.png]');
});


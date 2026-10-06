import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const root=new URL('../../src/lib/haseem/',import.meta.url);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
async function moduleUrl(name){let js=compile(await readFile(new URL(name+'.ts',root),'utf8'));for(const m of [...js.matchAll(/from "\.\/([^"]+)"/g)])js=js.replace(m[0],`from "${await moduleUrl(m[1])}"`);return 'data:text/javascript;base64,'+Buffer.from(js).toString('base64');}
const {buildDocHtml,makeZatcaQrPayload}=await import(await moduleUrl('printDoc'));
const {unifiedInvoiceAppearance}=await import(await moduleUrl('invoice-appearance'));
const {parseZatcaQr}=await import(await moduleUrl('zatca-qr'));
const base={title:'فاتورة',ref:'1664531',date:'2026-10-02',org:{name:'Buyer',taxNumber:'300000000000003'},party:{name:'Supplier',taxNumber:'310713456300003'},currency:'SAR',partyLabel:'المورد',lines:[{description:'Item',qty:1,price:100,tax:15}],lineCalcs:[],subtotal:100,tax:15,total:115,tpl:{name:'OLD',accent:'#ff0000',onAccent:'#000000',soft:'#ffff00',scannedLayout:{version:1}},structure:'thermal',layoutVariant:'contracting'};
test('one invoice policy overrides historical custom and scanned appearances without mutating data',()=>{
 for(const kind of ['invoice','bill']){const doc={...base,kind};const normalized=unifiedInvoiceAppearance(doc);assert.equal(normalized.tpl.id,'canar-unified-invoice');assert.equal(normalized.structure,'boxed');assert.equal(normalized.tpl.scannedLayout,undefined);assert.equal(doc.tpl.name,'OLD');const html=buildDocHtml(doc);assert.match(html,/1664531/);assert.doesNotMatch(html,/scanned-document/);assert.doesNotMatch(html,/#ff0000/);}
 const quote={...base,kind:'quotation'};assert.equal(unifiedInvoiceAppearance(quote),quote);
});
test('generated supplier QR contains invoice values and prints its explicit origin label',()=>{
 const raw=makeZatcaQrPayload({sellerName:base.party.name,vatNumber:base.party.taxNumber,issuedAtIso:'2026-10-02T00:00:00Z',totalWithVat:115,vatAmount:15});
 const qr=parseZatcaQr(raw);assert.equal(qr.vatNumber,base.party.taxNumber);assert.equal(qr.total,115);
 const html=buildDocHtml({...base,kind:'bill',qrDataUrl:'data:image/png;base64,AA==',qrLabel:'QR مولّد داخل النظام — ليس الرمز الأصلي للمورد'});assert.match(html,/مولّد داخل النظام/);assert.match(html,/ليس الرمز الأصلي للمورد/);assert.match(html,/data:image\/png;base64,AA==/);
});
test('scan requests only data, with reduced output budget and no template extraction',async()=>{
 const source=await readFile(new URL('scan.functions.ts',root),'utf8');const code=compile(source.slice(source.indexOf('const SYSTEM ='),source.indexOf('export const scanInvoice'))+'\nglobalThis.extract=extract;');let request;
 const context=vm.createContext({callAnthropicAI:async opts=>{request=opts;return JSON.stringify({supplierName:'Supplier',supplierVatNumber:base.party.taxNumber,invoiceNumber:'INV',grandTotal:115,vat:15,lines:[{description:'Item',qty:1,price:100,tax:15}],visualLayout:{bad:'ignored'},language:'en'});}});vm.runInContext(code,context);
 const result=await context.extract('data:application/pdf;base64,AAA','invoice.pdf');assert.equal(request.maxTokens,8000);assert.doesNotMatch(request.messages[0].content,/logoCrop|headerHeight|visualLayout/);assert.equal(result.visualLayout,undefined);assert.equal(result.layoutWarning,undefined);assert.equal(result.lines.length,1);assert.equal(result.grandTotal,115);
});

test('a response cut off by the token ceiling never becomes a partial invoice',async()=>{
 const source=await readFile(new URL('../../src/lib/ai-gateway.server.ts',import.meta.url),'utf8');
 const code=compile(source).replace(/export /g,'')+'\nglobalThis.callAnthropicAI=callAnthropicAI;';
 const context=vm.createContext({process:{env:{ANTHROPIC_API_KEY:'test-only',CLAUDE_API_KEY:'test-only'}},fetch:async()=>({ok:true,json:async()=>({stop_reason:'max_tokens',content:[{type:'text',text:'{"lines":[]}' }]})})});
 vm.runInContext(code,context);
 await assert.rejects(context.callAnthropicAI({model:'test',maxTokens:8000,messages:[{role:'user',content:'test'}]}),/AI_RESPONSE_TOO_LONG/);
});

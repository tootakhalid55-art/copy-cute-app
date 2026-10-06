import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import ts from 'typescript';
const root=new URL('../../src/lib/haseem/',import.meta.url);
async function moduleUrl(name){let js=ts.transpileModule(await readFile(new URL(name+'.ts',root),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;for(const m of [...js.matchAll(/from "\.\/([^"]+)"/g)])js=js.replace(m[0],`from "${await moduleUrl(m[1])}"`);return 'data:text/javascript;base64,'+Buffer.from(js).toString('base64');}
const {buildDocHtml}=await import(await moduleUrl('printDoc'));
const {SALES_REFERENCE_TEMPLATES}=await import(await moduleUrl('sales-reference-templates'));
const {unifiedInvoiceAppearance}=await import(await moduleUrl('invoice-appearance'));
const base={kind:'invoice',title:'فاتورة ضريبية',ref:'TEST-100',date:'2026-10-06',org:{name:'كنار الحديثة',taxNumber:'300000000000003',address:'جدة'},party:{name:'عميل تجريبي',taxNumber:'310000000000003'},currency:'SAR',lines:[{description:'مواد توريد',qty:2,price:100,tax:15}],lineCalcs:[],subtotal:200,tax:30,total:230,qrDataUrl:'data:image/png;base64,TEST'};
for(const tpl of SALES_REFERENCE_TEMPLATES){
 test(tpl.id+' uses current sales data and cannot override purchases',()=>{
  assert.deepEqual(tpl.kinds,['invoice']);
  assert.equal(unifiedInvoiceAppearance({...base,tpl}).tpl.id,tpl.id);
  assert.equal(unifiedInvoiceAppearance({...base,tpl,kind:'bill'}).tpl.id,'canar-unified-invoice');
  const html=buildDocHtml({...base,tpl});
  for(const value of ['TEST-100','كنار الحديثة','310000000000003','230.00',base.qrDataUrl])assert.ok(html.includes(value));
  assert.ok(html.includes('data-template="'+tpl.id+'"'));
  const changed=buildDocHtml({...base,tpl,ref:'NEW-200',party:{name:'<script>alert(1)</script>'}});
  assert.ok(changed.includes('NEW-200'));assert.ok(!changed.includes('TEST-100'));assert.ok(!changed.includes('<script>'));assert.ok(changed.includes('&lt;script&gt;'));
  const long=buildDocHtml({...base,tpl,lines:Array.from({length:60},(_,i)=>({...base.lines[0],description:'ROW-'+i}))});
  assert.ok(long.includes('ROW-59'));assert.ok(long.includes('table-header-group'));
 });
}
if(process.env.RENDER_REFERENCE_PREVIEWS){
 const QRCode=(await import('qrcode')).default; const {makeZatcaQrPayload}=await import(await moduleUrl('printDoc'));
 const qr=await QRCode.toDataURL(makeZatcaQrPayload({sellerName:base.org.name,vatNumber:base.org.taxNumber,issuedAtIso:'2026-10-06T12:00:00Z',totalWithVat:230,vatAmount:30}),{margin:4});
 await mkdir('tmp/template-previews',{recursive:true});
 for(const tpl of SALES_REFERENCE_TEMPLATES)await writeFile('tmp/template-previews/'+tpl.id+'.html','<!doctype html><meta charset="utf-8"><body style="margin:25px">'+buildDocHtml({...base,tpl,qrDataUrl:qr})+'</body>');
}

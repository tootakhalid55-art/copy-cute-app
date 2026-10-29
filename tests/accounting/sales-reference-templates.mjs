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
  const html=buildDocHtml({...base,tpl,issuedAtIso:'2026-10-06T12:34:56Z'});
  assert.ok(!html.includes('12:34:56'));if(tpl.id!=="sales-reference-330") assert.ok(html.includes(base.date));
  for(const value of ['TEST-100','كنار الحديثة','310000000000003','230.00',base.qrDataUrl])assert.ok(html.includes(value));
  const multiline=buildDocHtml({...base,tpl,lines:[{...base.lines[0],description:'First line\nSecond line'}]});
  assert.ok(multiline.includes('First line\nSecond line'));assert.ok(multiline.includes('white-space:pre-wrap'));
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
test('all sales templates include complete issuer address independently of customer address', () => {
 for (const tpl of [...SALES_REFERENCE_TEMPLATES, {id:'canar-unified-invoice',accent:'#123456',soft:'#ffffff'}]) {
  const html=buildDocHtml({...base,tpl,variant:'simplified',org:{...base.org,address:'Issuer <HQ>\nStreet 12',city:'IssuerCity',district:'IssuerDistrict',buildingNo:'8945',postalCode:'76543'},party:{name:'Customer'}});
  for(const part of ['Issuer &lt;HQ&gt;','Street 12','IssuerCity','IssuerDistrict','8945','76543']) assert.ok(html.includes(part),tpl.id+': '+part);
  assert.ok(!html.includes('Issuer <HQ>'));
 }
});

test('every sales template renders the issuer registration stored as cr', () => {
 for (const tpl of [...SALES_REFERENCE_TEMPLATES, {id:'canar-unified-invoice',accent:'#123456',soft:'#ffffff'}]) {
  for (const variant of ['standard','simplified']) {
   const html=buildDocHtml({...base,tpl,variant,org:{...base.org,cr:'7043264105'},party:{name:'Customer'}});
   assert.ok(html.includes('7043264105'),tpl.id+' '+variant);
  }
 }
});

test('seller-table templates omit duplicate header address but preserve seller address', () => {
 for (const tpl of SALES_REFERENCE_TEMPLATES.filter(t=>t.id!=='sales-reference-simple-tax' && t.id!=='sales-reference-330')) {
  const html=buildDocHtml({...base,tpl,org:{...base.org,address:'UNIQUE_SELLER_ADDRESS'}});
  const sellerStart=html.indexOf('البائع · Seller');
  assert.ok(sellerStart>0);
  assert.ok(!html.slice(0,sellerStart).includes('UNIQUE_SELLER_ADDRESS'));
  assert.ok(html.slice(sellerStart).includes('UNIQUE_SELLER_ADDRESS'));
 }
});
test('supply date template renders an independent saved date and leaves other templates unchanged', () => {
 const tpl=SALES_REFERENCE_TEMPLATES.find(t=>t.id==='sales-reference-supply-date');
 const html=buildDocHtml({...base,tpl,supplyDate:'2026-10-25',dueDate:'2026-11-15'});
 for(const value of ['Supply Date','2026-10-25','2026-11-15',base.date]) assert.ok(html.includes(value));
 const empty=buildDocHtml({...base,tpl});assert.ok(empty.includes('Supply Date'));assert.ok(!empty.includes('undefined'));
 const old=buildDocHtml({...base,tpl:SALES_REFERENCE_TEMPLATES.find(t=>t.id==='sales-reference-detailed'),supplyDate:'2026-10-25'});
 assert.ok(!old.includes('Supply Date'));
});
test('supply metadata is four columns and two rows',()=>{
 const tpl=SALES_REFERENCE_TEMPLATES.find(t=>t.id==='sales-reference-supply-date');
 const html=buildDocHtml({...base,tpl});
 const table=html.match(/<table data-supply-metadata[\s\S]*?<\/table>/)[0];
 assert.equal((table.match(/<tr>/g)||[]).length,2);
 assert.equal((table.match(/<th style/g)||[]).length,4);
 assert.equal((table.match(/<td style/g)||[]).length,4);
});
test('custom color renders in every sales template and unified purchase invoice',()=>{
 for(const tpl of [...SALES_REFERENCE_TEMPLATES,{id:'canar-unified-invoice'}]) {
  const html=buildDocHtml({...base,tpl,invoiceColor:'#b51b84'});
  assert.ok(html.includes('#b51b84'),tpl.id);
  const normalized=unifiedInvoiceAppearance({...base,tpl,invoiceColor:'#ffffff'});
  assert.equal(normalized.tpl.onAccent,'#0f2a1d');
  assert.equal(unifiedInvoiceAppearance({...base,tpl,invoiceColor:'red;display:none'}).tpl.accent,unifiedInvoiceAppearance({...base,tpl}).tpl.accent);
 }
 assert.ok(buildDocHtml({...base,kind:'bill',tpl:{id:'canar-unified-invoice'},invoiceColor:'#b51b84'}).includes('#b51b84'));
});

test('reference 330 uses current parties, QR and actual payment data',()=>{
 const tpl=SALES_REFERENCE_TEMPLATES.find(t=>t.id==='sales-reference-330');
 const html=buildDocHtml({...base,tpl,paidAmount:100,paymentMethod:'Bank',bankAccounts:[{bankName:'Current Bank',iban:'CURRENT-IBAN'}]});
 for(const text of ['Current Bank','CURRENT-IBAN','100.00','130.00','Payment method','Bill to',base.qrDataUrl])assert.ok(html.includes(text));
 assert.ok(!html.includes('301115392600003'));assert.ok(!html.includes('MADA'));assert.ok(!html.includes('aronium'));
});

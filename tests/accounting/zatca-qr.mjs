import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
async function load(path){const source=await readFile(new URL(path,import.meta.url),'utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));}
const {parseZatcaQr,selectZatcaQr,applyQrIdentity}=await load('../../src/lib/haseem/zatca-qr.ts');
const {applyRegisteredSupplier}=await load('../../src/lib/haseem/scan-supplier.ts');
const name='شركة اختبار المورد';
const fields=[name,'300000000000003','2026-10-04T12:00:00Z','230.00','30.00'];
function encode(values=fields){return Buffer.concat(values.map((v,i)=>{const b=Buffer.from(v);return Buffer.concat([Buffer.from([i+1,b.length]),b]);})).toString('base64');}
const raw=encode();
test('decodes actual QR pixels and Arabic UTF8 TLV identity',()=>{
 const qr=QRCode.create(raw,{errorCorrectionLevel:'M'});const scale=6,margin=4,size=(qr.modules.size+margin*2)*scale;
 const pixels=new Uint8ClampedArray(size*size*4).fill(255);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const mx=Math.floor(x/scale)-margin,my=Math.floor(y/scale)-margin;const black=mx>=0&&my>=0&&mx<qr.modules.size&&my<qr.modules.size&&qr.modules.get(my,mx);if(black){const i=(y*size+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}}
 const decoded=jsQR(pixels,size,size);assert.equal(decoded.data,raw);const result=parseZatcaQr(decoded.data);assert.equal(result.sellerName,name);assert.equal(result.vatNumber,fields[1]);assert.equal(result.total,230);
});
test('rejects unrelated, truncated, invalid UTF8, duplicate and missing fields',()=>{
 for(const v of ['https://example.test','garbage',Buffer.from([1,200,65]).toString('base64'),encode(['name','bad',...fields.slice(2)]),encode(fields.slice(0,2)),Buffer.concat([Buffer.from(raw,'base64'),Buffer.from([1,1,65])]).toString('base64'),Buffer.from([1,1,255,2,1,65]).toString('base64')]) assert.equal(parseZatcaQr(v),undefined);
});
test('binary phase 2 signature tags do not need UTF8 decoding',()=>{
 const bytes=Buffer.concat([Buffer.from(raw,'base64'),Buffer.from([6,3,255,0,128])]);assert.equal(parseZatcaQr(bytes.toString('base64')).sellerName,name);
});
test('ignores unrelated QR, deduplicates repeated pages and refuses multiple invoices',()=>{
 assert.equal(selectZatcaQr(['https://example.test',raw,raw]).status,'decoded');
 assert.equal(selectZatcaQr([raw,encode([name,fields[1],fields[2],'345','45'])]).status,'ambiguous');
 assert.equal(selectZatcaQr([]).status,'unreadable');
});
test('QR identity overrides OCR and registered name without modifying amounts; keeps evidence',()=>{
 const source={supplierName:'wrong',supplierVatNumber:'wrong',grandTotal:240,vat:30,lines:[{qty:2}]};
 const next=applyQrIdentity(source,selectZatcaQr([raw]));assert.equal(next.supplierName,name);assert.equal(next.supplierVatNumber,fields[1]);assert.equal(next.grandTotal,240);assert.equal(next.lines,source.lines);assert.equal(next.zatcaQr.originalName,'wrong');assert.deepEqual(next.zatcaQr.differences,['اسم المورد','الرقم الضريبي','إجمالي الفاتورة']);
 const selected=applyRegisteredSupplier(next,{id:'supplier',name:'stored alias',taxNumber:fields[1],address:'Riyadh'});assert.equal(selected.supplierName,name);assert.equal(selected.supplierVatNumber,fields[1]);assert.equal(selected.supplierAddress,'Riyadh');
 assert.equal(applyQrIdentity(source,{status:'unreadable'}).supplierName,'wrong');
});

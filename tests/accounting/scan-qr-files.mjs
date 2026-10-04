import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import QRCode from 'qrcode';
import {createCanvas,Image,DOMMatrix,Path2D,ImageData} from '@napi-rs/canvas';
import {deflateSync} from 'node:zlib';
Object.assign(globalThis,{DOMMatrix,Path2D,ImageData});
globalThis.document={createElement:()=>createCanvas(1,1)};
globalThis.Image=class extends Image {constructor(){super();this.ready=new Promise((resolve,reject)=>{this.onload=resolve;this.onerror=reject;});}decode(){return this.ready;}};
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const parser=url(compile(await readFile(new URL('../../src/lib/haseem/zatca-qr.ts',import.meta.url),'utf8')));
let source=compile(await readFile(new URL('../../src/lib/haseem/scan-qr.ts',import.meta.url),'utf8'));
source=source.replace('"jsqr"',JSON.stringify(import.meta.resolve('jsqr'))).replace('"./zatca-qr"',JSON.stringify(parser)).replace('import("pdfjs-dist")',`import(${JSON.stringify(import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs'))})`).replace('(await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default',JSON.stringify(import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')));
const {readInvoiceQr}=await import(url(source));
const raw=Buffer.concat(['شركة اختبار','300000000000003','2026-10-04T12:00:00Z','230','30'].map((v,i)=>{const b=Buffer.from(v);return Buffer.concat([Buffer.from([i+1,b.length]),b]);})).toString('base64');
const image=await QRCode.toDataURL(raw,{width:500,margin:4});
assert.equal((await readInvoiceQr(image)).data.vatNumber,'300000000000003');
// Build a two-page synthetic PDF; its QR is only on page two.
const modules=QRCode.create(raw).modules, size=modules.size+8;
const gray=Buffer.alloc(size*size,255);
for(let y=0;y<modules.size;y++)for(let x=0;x<modules.size;x++)gray[(y+4)*size+x+4]=modules.get(y,x)?0:255;
const compressed=deflateSync(gray);
const draw='q 240 0 0 240 30 30 cm /Qr Do Q';
const objects=[
 '<< /Type /Catalog /Pages 2 0 R >>',
 '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << >> >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /XObject << /Qr 5 0 R >> >> /Contents 6 0 R >>',
 Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${size} /Height ${size} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`),compressed,Buffer.from('\nendstream')]),
 `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`
];
let parts=[Buffer.from('%PDF-1.4\n')],offsets=[0],length=parts[0].length;
objects.forEach((body,i)=>{offsets.push(length);const chunk=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),Buffer.isBuffer(body)?body:Buffer.from(body),Buffer.from('\nendobj\n')]);parts.push(chunk);length+=chunk.length;});
parts.push(Buffer.from(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));
const result=await readInvoiceQr('data:application/pdf;base64,'+Buffer.concat(parts).toString('base64'));
assert.equal(result.status,'decoded',JSON.stringify(result));assert.equal(result.data.vatNumber,'300000000000003');
console.log('Actual image and two-page PDF QR decoding passed');

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../../src/lib/haseem/scan-supplier.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {applyRegisteredSupplier,resolveScanSupplier}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('selection replaces all supplier fields without changing invoice amounts or items',()=>{
 const invoice={supplierName:'OCR error',supplierVatNumber:'bad',supplierCrNumber:'old',supplierAddress:'old',supplierPhone:'old',supplierEmail:'old',invoiceNumber:'INV-1',currency:'USD',grandTotal:230,lines:[{qty:2}]};
 const supplier={id:'b',name:'Registered',taxNumber:'300000000000003',cr_number:'CR1',address:'Riyadh',phone:'123',email:'test@example.test'};
 const next=applyRegisteredSupplier(invoice,supplier);
 assert.equal(next.supplierName,supplier.name);assert.equal(next.supplierVatNumber,supplier.taxNumber);assert.equal(next.supplierCrNumber,'CR1');assert.equal(next.supplierAddress,'Riyadh');assert.equal(next.supplierPhone,'123');assert.equal(next.supplierEmail,supplier.email);
 assert.equal(next.grandTotal,230);assert.equal(next.currency,'USD');assert.equal(next.lines,invoice.lines);assert.equal(invoice.supplierName,'OCR error');
 const empty=applyRegisteredSupplier(next,{id:'c',name:'No details',street:'Street',city:'City'});
 assert.equal(empty.supplierVatNumber,'');assert.equal(empty.supplierPhone,'');assert.equal(empty.supplierEmail,'');assert.equal(empty.supplierCrNumber,'');assert.equal(empty.supplierAddress,'Street، City');
});
test('explicit ID wins with duplicate names and a removed selection never falls back or creates a supplier',()=>{
 const suppliers=[{id:'a',name:'Same',taxNumber:'A'},{id:'b',name:'Same',taxNumber:'B'}];
 assert.equal(resolveScanSupplier(suppliers,'b','Wrong OCR').taxNumber,'B');
 assert.throws(()=>resolveScanSupplier(suppliers,'removed','Same'));
 assert.throws(()=>resolveScanSupplier(suppliers,undefined,'Same'));
 assert.equal(resolveScanSupplier(suppliers,undefined,'New supplier'),undefined);
});

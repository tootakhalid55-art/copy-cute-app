import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../../src/lib/haseem/scan-recovery.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {scanWithGatewayRecovery,scanFailureMessage}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('recovers from a restart without losing result',async()=>{
 let calls=0; const waits=[]; const retries=[];
 const result=await scanWithGatewayRecovery(async()=>{if(++calls<3)throw new Error('<html>502 Bad Gateway</html>');return {invoiceNumber:'INV1'};},n=>retries.push(n),async ms=>{waits.push(ms);});
 assert.equal(result.invoiceNumber,'INV1');assert.equal(calls,3);assert.deepEqual(waits,[15000,30000]);assert.deepEqual(retries,[1,2]);
});
test('caps attempts and hides raw gateway HTML',async()=>{
 let calls=0;const failure=new Error('<html><body>502 Bad Gateway</body></html>');
 await assert.rejects(scanWithGatewayRecovery(async()=>{calls++;throw failure;},()=>{},async()=>{}));
 assert.equal(calls,3);assert.ok(!scanFailureMessage(failure).includes('<html>'));assert.ok(scanFailureMessage(failure).includes('إعادة'));
});
test('does not retry billing/auth/extraction failures',async()=>{
 for(const message of ['Insufficient credits','Unauthorized','Invalid invoice JSON']){
  let calls=0;await assert.rejects(scanWithGatewayRecovery(async()=>{calls++;throw new Error(message);},()=>assert.fail('unexpected retry'),async()=>{}));assert.equal(calls,1);assert.equal(scanFailureMessage(new Error(message)),message);
 }
});

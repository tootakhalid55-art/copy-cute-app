import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../../src/lib/haseem/full-address.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {fullAddress}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const address=fullAddress({address:'شارع طويل محفوظ',street:'الملك فهد',district:'المشرفة',city:'جدة',region:'مكة',country:'السعودية',buildingNo:'1234',postalCode:'23336',additionalNo:'5678'});
for(const part of ['شارع طويل محفوظ','الملك فهد','المشرفة','جدة','مكة','السعودية','1234','23336','5678'])assert.ok(address.includes(part));
assert.equal(fullAddress({address:'عنوان نصي فقط'}),'عنوان نصي فقط');
assert.equal(fullAddress({address:'غير محدد',city:'جدة'}),'جدة');
assert.equal(fullAddress(null),'');
console.log('Complete and legacy addresses passed');


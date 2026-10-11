import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../../src/lib/haseem/store.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/export /g,'');
let user={id:'A'},org={ready:true,currentOrgId:'O1',currentOrg:{name:'Org A',vat_number:'VAT-A'}},cursor=0,slots=[],effects=[];
const storage=new Map([['haseem:customers','[{"id":"OLD","name":"Private legacy"}]'],['haseem:kv:org','{"name":"Private legacy"}']]);
const ctx=vm.createContext({window:{},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},useAuth:()=>({user}),useOrg:()=>org,CLOUD_KEYS:new Set(['customers']),useCloudCollection:()=>({enabled:false,items:[{id:'STALE'}]}),useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],n=>slots[i]=typeof n==='function'?n(slots[i]):n]},useRef:v=>{const i=cursor++;return slots[i]??(slots[i]={current:v})},useMemo:f=>f(),useCallback:f=>f,useEffect:f=>effects.push(f)});
vm.runInContext(js+'\nglobalThis.api={useKV,useCollection};',ctx);
const render=(f)=>{cursor=0;effects=[];return f()};const settle=f=>{let result=render(f);const pending=effects;for(const e of pending)e();return render(f)};
let data=settle(()=>ctx.api.useKV('org',{name:'WRONG DEFAULT'}));assert.equal(data[0].name,'Org A');data[1]({name:'A private setting'});
user={id:'B'};org={...org,currentOrgId:'O2',currentOrg:{name:'Org B'}};
data=render(()=>ctx.api.useKV('org',{name:'WRONG DEFAULT'}));assert.equal(data[0].name,'Org B');data=settle(()=>ctx.api.useKV('org',{}));assert.equal(data[0].name,'Org B');data[1]({name:'B private setting'});
user={id:'A'};org={...org,currentOrgId:'O1',currentOrg:{name:'Org A'}};data=settle(()=>ctx.api.useKV('org',{}));assert.equal(data[0].name,'A private setting');
slots=[];const customers=settle(()=>ctx.api.useCollection('customers'));assert.equal(customers.items.length,0,'disabled cloud never falls back to legacy customer data');
slots=[];const local=settle(()=>ctx.api.useCollection('drafts'));local.add({name:'A private draft'});
user={id:'B'};org={...org,currentOrgId:'O2'};const other=render(()=>ctx.api.useCollection('drafts'));assert.equal(other.items.length,0,'old local state hidden immediately on identity change');
org={...org,ready:false,currentOrgId:null};const disabled=settle(()=>ctx.api.useCollection('drafts'));assert.throws(()=>disabled.add({name:'blocked'}));assert.throws(()=>disabled.remove('x'));
assert.ok(storage.has('haseem:customers'),'unowned legacy records preserved, not deleted');
console.log('Scoped settings, scope switches, safe cloud loading, local drafts and disabled writes passed');


slots=[];org={...org,ready:true,currentOrgId:'O2'};
let saved=settle(()=>ctx.api.useKV('branding',{logo:'previous'}));
const originalSet=ctx.localStorage.setItem;ctx.localStorage.setItem=()=>{throw new Error('quota')};
assert.throws(()=>saved[1]({logo:'replacement'}));
saved=render(()=>ctx.api.useKV('branding',{logo:'previous'}));assert.equal(saved[0].logo,'previous');
ctx.localStorage.setItem=originalSet;

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import crypto from 'node:crypto';
function fixture(initial = { has_state: true }) {
 let clock = Date.parse('2026-11-17T04:00:00Z'), meta = initial, metadataCalls = 0, fullCalls = 0, gate = null;
 class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
 const c = createContext({Date:Clock, crypto, Buffer, process:{env:{}}, console:{error(){},warn(){}},
  fetchAppStateMeta: async args => { metadataCalls++; assert.equal(args.userId,null); assert.equal(args.deviceId,null); if(gate) await gate; if(meta instanceof Error) throw meta; return meta; },
  fetchAppState: async () => { fullCalls++; return {state:{websiteCms:{title:'fake CMS only'}}}; },
  saveAppState: () => { throw Error('A health probe must never write'); }, captureServerException: async()=>{},
  sendJson:(res,status,body)=>{res.status=status;res.body=body;},
 });
 for (const name of ['_health-readiness.js','health.js']) {
  const src=readFileSync(new URL('../api/'+name,import.meta.url),'utf8').replace(/^import\s[\s\S]*?;\s*$/gm,'').replace(/export default /g,'').replace(/\bexport\s+(?=(?:async\s+)?function|const|let)/g,'');
  runInContext(src,c,{filename:name});
 }
 return {
  async get(query={}) { const res={headers:{},setHeader(k,v){this.headers[k]=v;return this;}};await c.handler({method:'GET',query,headers:{}},res);return res; },
  advance(ms){clock+=ms;}, setMeta(value){meta=value;}, setGate(value){gate=value;},
  get calls(){return metadataCalls;},get fullCalls(){return fullCalls;},
 };
}
test('ordinary health uses metadata only and never fetches the financial state',async()=>{
 const f=fixture();const r=await f.get();assert.equal(r.status,200);assert.equal(f.calls,1);assert.equal(f.fullCalls,0);assert.equal(r.body.probe,'metadata');assert.equal(r.body.probeCached,false);
});
test('50 simultaneous health requests share one database probe',async()=>{
 const f=fixture();let release;f.setGate(new Promise(r=>{release=r;}));const pending=Array.from({length:50},()=>f.get());await new Promise(r=>setImmediate(r));assert.equal(f.calls,1);release();const responses=await Promise.all(pending);assert.ok(responses.every(r=>r.status===200));assert.equal(f.fullCalls,0);
});
test('successful probe is reused for 60 seconds and exposes its original age',async()=>{
 const f=fixture();const first=await f.get();f.advance(59999);const cached=await f.get();assert.equal(f.calls,1);assert.equal(cached.body.probeAgeMs,59999);assert.equal(cached.body.probeCheckedAt,first.body.probeCheckedAt);assert.equal(cached.body.probeCached,true);f.advance(1);const fresh=await f.get();assert.equal(f.calls,2);assert.equal(fresh.body.probeCached,false);assert.equal(fresh.body.probeAgeMs,0);
});
test('outage is reported after the observed probe expires; cached data retains its age',async()=>{
 const f=fixture();await f.get();f.setMeta({isOfflineSnapshot:true,has_state:true});f.advance(30000);const before=await f.get();assert.equal(before.body.probeAgeMs,30000);assert.equal(before.body.probeCached,true);f.advance(30000);const after=await f.get();assert.equal(after.status,503);assert.equal(after.body.source,'offline_snapshot');assert.equal(after.body.readOnly,true);assert.equal(after.body.hasState,null);assert.equal(after.headers['Retry-After'],'60');
});
test('100 requests during an outage reuse one failed probe and remain degraded',async()=>{
 const f=fixture({has_state:true,isOfflineSnapshot:true});for(let i=0;i<100;i++){const r=await f.get();assert.equal(r.status,503);assert.equal(r.body.ok,false);}assert.equal(f.calls,1);assert.equal(f.fullCalls,0);
});
test('unexpected probe failure is cached without exposing the exception',async()=>{
 const f=fixture(Error('PRIVATE_CREDENTIAL_OR_CUSTOMER_DATA'));for(let i=0;i<5;i++){const r=await f.get();assert.equal(r.status,503);assert.equal(r.body.reason,'probe_failed');assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE_/);}assert.equal(f.calls,1);
});
test('reachable but uninitialized financial state is not healthy',async()=>{
 const f=fixture({has_state:false});const r=await f.get();assert.equal(r.status,503);assert.equal(r.body.database,'reachable');assert.equal(r.body.reason,'state_missing');
});
test('invalid metadata does not fall back to a full state download',async()=>{
 const f=fixture({});const r=await f.get();assert.equal(r.status,503);assert.equal(r.body.reason,'invalid_metadata');assert.equal(f.fullCalls,0);
});
test('CMS reads retain their explicit state retrieval behavior',async()=>{
 const f=fixture();const r=await f.get({scope:'website-cms'});assert.equal(r.status,200);assert.equal(r.body.data.title,'fake CMS only');assert.equal(f.fullCalls,1);assert.equal(f.calls,0);
});
test('metadata fields cannot leak through the public health result',async()=>{
 const f=fixture({has_state:true,updated_by:'PRIVATE_ACCOUNT',state:{secret:'PRIVATE_STATE'}});const r=await f.get();assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE_/);
});

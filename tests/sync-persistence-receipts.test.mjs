import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import crypto from 'node:crypto';
function load(name,{db=false,drive=false,driveFail=false,offline=false}={}) {
 const c=createContext({Buffer,crypto,console:{warn(){},error(){}},process:{env:{SYSTEM_STATUS_REPORT_TOKEN:'fake-test-token'}},
  getSupabase:()=>({rpc:async()=>db?{data:{success:true,id:'receipt'},error:null}:{data:null,error:Error('test offline')}}),
  getClientIp:()=> 'test',createBoundedRateLimiter:()=>({check:()=>false}),isGoogleDriveBackupConfigured:()=>drive,
  uploadPrivateFileToGoogleDrive:async()=>{if(driveFail) throw Error('test offline');return{id:'fake-drive-receipt'};},
  getDatabaseReadiness:async()=>({reachable:!offline,ready:!offline,hasState:!offline,source:offline?'offline_snapshot':'database',reason:offline?'database_unavailable':null,checkedAtEpoch:Date.now(),ageMs:0,cached:false}),
  sendJson:(r,status,body)=>{r.status=status;r.body=body;},fetchAppState:async()=>({state:{},isOfflineSnapshot:offline}),captureServerException:async()=>{},
 });
 const code=readFileSync(new URL('../api/'+name,import.meta.url),'utf8').replace(/^import\s[\s\S]*?;\s*$/gm,'').replace(/export default /g,'').replace(/\bexport\s+(?=(?:async\s+)?function|const|let)/g,'');
 runInContext(code,c);return c;
}
for(const [name,source] of [['sync-finance.js','shenglong'],['sync-cylinder-history.js','shenglong_cylinder']]) {
 for(const scenario of [{db:false,drive:false},{db:false,drive:true,driveFail:true},{db:false,drive:true},{db:true,drive:false}]) {
  test(name+' persistence receipt '+JSON.stringify(scenario),async()=>{
   const c=load(name,scenario);const response={headers:{},setHeader(k,v){this.headers[k]=v;}};
   await c.handler({method:'POST',headers:{'x-status-token':'fake-test-token'},body:{source,recentMovements:[{id:'fake-only'}]}},response);
   const archived=scenario.drive&&!scenario.driveFail;
   assert.equal(response.status,scenario.db?200:503);
   assert.equal(response.body.success,scenario.db);assert.equal(response.body.applied,scenario.db);
   assert.equal(response.body.persisted,Boolean(scenario.db||archived));
   assert.equal(response.body.archived,Boolean(archived));
   if(!scenario.db) assert.equal(response.headers['Retry-After'],'60');
   assert.equal(response.body.data.success,response.body.success);
  });
 }
}
test('finance health labels offline snapshot degraded without blocking read fallback',async()=>{
 const c=load('health.js',{offline:true}),r={setHeader(){}};
 await c.handler({method:'GET',headers:{}},r);
 assert.equal(r.status,503);assert.equal(r.body.database,'unreachable');assert.equal(r.body.readOnly,true);assert.equal(r.body.source,'offline_snapshot');
});
test('finance health confirms live primary',async()=>{
 const c=load('health.js'),r={setHeader(){}};await c.handler({method:'GET',headers:{}},r);assert.equal(r.status,200);assert.equal(r.body.ok,true);
});

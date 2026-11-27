import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {makeDriveRead} from '../api/_sl-drive-read.js';
import {makeSLLiveHandler} from '../api/_sl-live-handler.js';
const code=(await readFile(new URL('../api/_google-drive.js',import.meta.url),'utf8')).replace("import { fetchWithTimeout } from './_fetch.js';","const fetchWithTimeout=(...args)=>globalThis.__SL_TOKEN_FETCH(...args);");
const module=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const saved=process.env.SL_DRIVE_SERVICE_ACCOUNT_JSON;
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const account={type:'service_account',client_email:'sl-reader@synthetic-project.iam.gserviceaccount.com',private_key:pair.privateKey.export({type:'pkcs8',format:'pem'})};
test('dedicated account signs a read-only JWT and takes priority over legacy OAuth',async()=>{
 process.env.SL_DRIVE_SERVICE_ACCOUNT_JSON=JSON.stringify(account);
 globalThis.__SL_TOKEN_FETCH=async(url,options)=>{
  assert.equal(url,'https://oauth2.googleapis.com/token');
  assert.equal(options.body.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const parts=options.body.get('assertion').split('.'),claim=JSON.parse(Buffer.from(parts[1],'base64url'));
  assert.equal(claim.iss,account.client_email);assert.equal(claim.scope,'https://www.googleapis.com/auth/drive.readonly');
  assert.equal(claim.aud,url);assert.ok(claim.exp> Date.now()/1000);assert.ok(claim.exp-claim.iat<=3600);
  assert.ok(crypto.verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),pair.publicKey,Buffer.from(parts[2],'base64url')));
  return Response.json({access_token:'synthetic-only'});
 };
 assert.equal(module.getSLDriveReadAuthMode(),'service-account');assert.equal(await module.getGoogleDriveReadAccessToken(),'synthetic-only');
});
test('malformed config fails closed without provider or key details',async()=>{
 for(const value of ['{bad',JSON.stringify({...account,type:'other'}),JSON.stringify({...account,private_key:'SYNTHETIC-PRIVATE-DETAIL'})]){
  process.env.SL_DRIVE_SERVICE_ACCOUNT_JSON=value;
  await assert.rejects(module.getGoogleDriveReadAccessToken(),{message:'SL_DRIVE_SERVICE_ACCOUNT_INVALID'});
 }
 process.env.SL_DRIVE_SERVICE_ACCOUNT_JSON=JSON.stringify(account);
 globalThis.__SL_TOKEN_FETCH=async()=>Response.json({error:'invalid_grant',error_description:'PRIVATE-DETAIL'},{status:400});
 await assert.rejects(module.getGoogleDriveReadAccessToken(),{message:'SL_DRIVE_SERVICE_ACCOUNT_INVALID'});
});
test('disabled Drive API is distinct from missing file permission',async()=>{
 const source=makeDriveRead(async()=>'fixture',async()=>Response.json({error:{details:[{reason:'SERVICE_DISABLED'}]}},{status:403}));
 await assert.rejects(source.metadata(),{message:'SL_DRIVE_API_NOT_ENABLED'});
});
test('authenticated errors return auth mode but do not return provider detail',async()=>{
 const token='synthetic-bridge-1234567890123456789012345';
 const h=makeSLLiveHandler({authMode:()=> 'service-account',metadata:async()=>{throw Error('SL_DRIVE_SERVICE_ACCOUNT_INVALID');}},{AI_ROTATOR_BRIDGE_TOKEN:token});
 const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await h({method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:{op:'probe'}},res);
 assert.equal(res.code,503);assert.deepEqual(res.body,{code:'SL_DRIVE_SERVICE_ACCOUNT_INVALID',authMode:'service-account'});
});
test.after(()=>{if(saved===undefined)delete process.env.SL_DRIVE_SERVICE_ACCOUNT_JSON;else process.env.SL_DRIVE_SERVICE_ACCOUNT_JSON=saved;delete globalThis.__SL_TOKEN_FETCH;});

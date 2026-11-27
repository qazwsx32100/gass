import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {querySLSnapshot} from './_sl-read-query.js';
const sha=data=>createHash('sha256').update(data).digest('hex');
const MIN_ROWS={customers:3000,orders:200000,money:8000};
export function parseSLCSV(buffer,columns,idColumn){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer).replace(/^\uFEFF/,'');const records=[];let row=[],field='',quoted=false,afterQuote=false;
 const endField=()=>{row.push(field);field='';afterQuote=false;};const endRow=()=>{endField();if(!(row.length===1&&row[0]===''))records.push(row);row=[];};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}else field+=c;continue;}if(c==='"'){if(field||afterQuote)throw Error('SL_CSV_INVALID');quoted=true;}else if(c===',')endField();else if(c==='\n')endRow();else if(c==='\r'){if(text[i+1]==='\n')i++;endRow();}else{if(afterQuote)throw Error('SL_CSV_INVALID');field+=c;}}
 if(quoted)throw Error('SL_CSV_INVALID');if(field||row.length||afterQuote)endRow();const header=records.shift();if(JSON.stringify(header)!==JSON.stringify(columns))throw Error('SL_CSV_SCHEMA_CHANGED');const seen=new Set();const index=columns.indexOf(idColumn);
 for(const r of records){if(r.length!==columns.length||!r[index]||seen.has(r[index]))throw Error('SL_CSV_INVALID');seen.add(r[index]);}return records;
}
export function makeLiveSL({drive,cache,secret,columns,clock=Date.now,minRows=MIN_ROWS,authVersion='legacy-oauth'}){
 const prefix='shenglong-sl-auto-v1:prj_rtZqXzAPAOf7jFXR2SR1soqhBRK1:',memory=new Map();let pending=null;const retryKey='retry:'+authVersion;
 const key=createHash('sha256').update('SL-PRIVATE-RUNTIME-CACHE-v1\0').update(secret||'').digest();
 const seal=value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(value)),{level:3})),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');};
 const open=value=>{if(typeof value!=='string')throw Error('SL_CACHE_INVALID');const b=Buffer.from(value,'base64');const d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(gunzipSync(Buffer.concat([d.update(b.subarray(28)),d.final()]),{maxOutputLength:64*1024*1024}).toString('utf8'));};
 async function get(name){const local=memory.get(name);if(local&&local.expires>clock())return local.value;try{const raw=await cache.get(prefix+name);if(!raw)return null;const value=open(raw);memory.set(name,{value,expires:clock()+3600_000});return value;}catch{return null;}}
 async function put(name,value){const encrypted=seal(value);if(Buffer.byteLength(encrypted)>1_900_000)throw Error('SL_CACHE_ITEM_TOO_LARGE');memory.set(name,{value,expires:clock()+3600_000});for(const [k,v] of memory)if(v.expires<=clock())memory.delete(k);try{await cache.set(prefix+name,encrypted,{ttl:604800,name:'sl-private-readonly'});}catch{}return encrypted.length;}
 const fingerprint=meta=>sha(JSON.stringify(meta.map(m=>[m.dataset,m.id,m.md5Checksum,m.size]).sort((a,b)=>a[0].localeCompare(b[0]))));
 const isoDate=s=>{const m=s.match(/^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);if(!m)return null;const d=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');return Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d?d:null;};
 async function refresh(force=false){const previous=await get('active');const now=clock();if(!force&&previous&&now-Date.parse(previous.sync.checkedAt)<3600_000)return previous;const retry=await get(retryKey);if(!force&&retry&&retry.after>now){if(previous)return {...previous,sync:{...previous.sync,state:'stale',error:retry.code}};throw Error(retry.code);}
 try{
  const meta=await drive.metadata(),id=fingerprint(meta),sourceAsOf=new Date(Math.max(...meta.map(m=>Date.parse(m.modifiedTime)))).toISOString();
  if(clock()-Date.parse(sourceAsOf)<120_000)throw Error('SL_FILES_STILL_UPLOADING');
  if(previous&&previous.snapshotId===id&&!force){const m={...previous,sourceAsOf,sync:{automatic:true,checkedAt:new Date(now).toISOString(),state:'fresh',intervalSeconds:3600}};await put('active',m);return m;}
  const all={},datasets={},files=[];let through='';
  for(const m of meta){const dataset=m.dataset,c=columns[dataset];if(!c)throw Error('SL_CSV_SCHEMA_CHANGED');let records=null;
   if(previous?.datasets[dataset]?.sourceMd5===m.md5Checksum){try{records=await readRows(previous,dataset);}catch{records=null;}}
   if(records===null){const buffer=await drive.download(dataset,m);if(createHash('md5').update(buffer).digest('hex')!==m.md5Checksum)throw Error('SL_DRIVE_CHANGED_DURING_READ');records=parseSLCSV(buffer,c,dataset==='orders'?'訂單編號':dataset==='money'?'流水號':'客戶編號');datasets[dataset]={name:m.name,rows:records.length,columns:c,sourceSha256:sha(buffer),sourceMd5:m.md5Checksum};}
   else datasets[dataset]={...previous.datasets[dataset]};
   if(records.length<(minRows[dataset]||1))throw Error('SL_SOURCE_INCOMPLETE');all[dataset]=records;
  }
  if(fingerprint(await drive.metadata())!==id)throw Error('SL_DRIVE_CHANGED_DURING_READ');
  for(const [dataset,rows] of Object.entries(all)){const c=columns[dataset],dateIndex=c.indexOf(dataset==='orders'?'出貨日期':dataset==='money'?'入帳日期':'交易起始日'),groups=new Map();
   for(const r of rows){const d=isoDate(r[dateIndex]);if(r[dateIndex].trim()&&!d)throw Error('SL_CSV_DATE_INVALID');if(d&&d>through)through=d;const year=dataset==='customers'?'all':d?.slice(0,4)||'unknown';const g=groups.get(year)||[];g.push(r);groups.set(year,g);}
   for(const [year,items] of groups){for(let offset=0;offset<items.length;offset+=5000){const slice=items.slice(offset,offset+5000),name=`${dataset}-${year}-${offset/5000}`,cacheKey=datasets[dataset].sourceMd5+':'+name;const existing=await get(cacheKey);if(!Array.isArray(existing)||existing.length!==slice.length)await put(cacheKey,slice);files.push({dataset,year,name,cacheKey,rows:slice.length});}}
  }
  const manifest={version:1,snapshotId:id,sourceAsOf,dataThrough:through,datasets,files,sync:{automatic:true,checkedAt:new Date(now).toISOString(),state:'fresh',intervalSeconds:3600}};
  const older=await get('previous');if(previous&&previous.snapshotId!==manifest.snapshotId)await put('previous',previous);await put('active',manifest);if(older&&older.snapshotId!==manifest.snapshotId&&older.snapshotId!==previous?.snapshotId){const retained=new Set([...manifest.files,...(previous?.files||[])].map(f=>f.cacheKey));for(const file of older.files){if(retained.has(file.cacheKey))continue;memory.delete(file.cacheKey);try{await cache.delete?.(prefix+file.cacheKey);}catch{}}}await put(retryKey,{after:0,code:null});return manifest;
 }catch(e){const code=/^SL_[A-Z_]+$/.test(e?.message||'')?e.message:'SL_DRIVE_UNAVAILABLE';await put(retryKey,{after:clock()+300_000,code});if(previous)return {...previous,sync:{...previous.sync,state:'stale',error:code}};throw Error(code);}
 }
 async function ensure(force=false){if(!pending){pending=refresh(force).finally(()=>{pending=null;});}return pending;}
 async function readRows(m,dataset,period){const out=[];for(const f of m.files.filter(f=>f.dataset===dataset&&(!period||f.year===period.slice(0,4)||f.year==='unknown'))){const records=await get(f.cacheKey);if(!Array.isArray(records)||records.length!==f.rows)throw Error('SL_CACHE_MISS');for(const row of records)out.push(row);}return out;}
 return {async status(){return ensure();},async query(input){let m=await ensure();try{return await querySLSnapshot(m,(dataset,period)=>readRows(m,dataset,period),input);}catch(e){if(e?.message!=='SL_CACHE_MISS')throw e;m=await ensure(true);return querySLSnapshot(m,(dataset,period)=>readRows(m,dataset,period),input);}}};
}

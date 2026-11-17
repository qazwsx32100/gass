import {createHash,timingSafeEqual} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest();
export function makeSLLiveHandler(source,env=process.env){return async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({code:'METHOD_NOT_ALLOWED'});}
 const key=env.AI_ROTATOR_BRIDGE_TOKEN,auth=req.headers?.authorization;if(!key||key.length<32)return res.status(503).json({code:'SL_NOT_CONFIGURED'});if(typeof auth!=='string'||!timingSafeEqual(hash(auth),hash('Bearer '+key)))return res.status(401).json({code:'SL_AUTH_REQUIRED'});
 if(!req.headers?.['content-type']?.startsWith('application/json'))return res.status(415).json({code:'SL_QUERY_INVALID'});
 let body;try{const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw)>2500)throw Error();body=JSON.parse(raw);if(!body||Array.isArray(body)||Object.keys(body).length!==1||body.op!=='probe')throw Error();}catch{return res.status(400).json({code:'SL_QUERY_INVALID'});}
 try{return res.status(200).json({mode:'sl-drive-read-probe',files:await source.metadata(),checkedAt:new Date().toISOString(),productionModified:false});}catch(e){const code=['SL_DRIVE_AUTH_UNAVAILABLE','SL_DRIVE_PERMISSION_REQUIRED','SL_DRIVE_METADATA_INVALID'].includes(e?.message)?e.message:'SL_DRIVE_UNAVAILABLE';return res.status(503).json({code});}
 };}

import {validateMonth,taipeiMonth,resolveMonthlyIntent} from './_ai-monthly-finance.js';
import {createHash,timingSafeEqual} from 'node:crypto';
import {parseCommand,parsePlan,PLAN_TOOL,PLANNER_SYSTEM} from './_command-plan.js';
const digest=value=>createHash('sha256').update(value).digest();
export function validateCompletion(data){
 if(!Array.isArray(data?.choices)||data.choices.length!==1||data.choices[0].finish_reason!=='tool_calls')throw Error('MODEL_INVALID');
 const calls=data.choices[0].message?.tool_calls;
 if(!Array.isArray(calls)||calls.length!==1||calls[0].type!=='function'||calls[0].function?.name!=='submit_readonly_plan'||typeof calls[0].function.arguments!=='string')throw Error('MODEL_INVALID');
 parsePlan(JSON.parse(calls[0].function.arguments));
}
/** Authenticated read-only plans and monthly aggregates. No dispatch, messages or ERP writes. */
export function makeCommandHandler(callAi,env=process.env,readFinance=null,clock=()=>new Date()){return async function(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({code:'METHOD_NOT_ALLOWED'});}
 const token=env.AI_ROTATOR_BRIDGE_TOKEN;
 if(!token||token.length<32)return res.status(503).json({code:'MODEL_NOT_CONFIGURED'});
 const auth=req.headers?.authorization;
 if(typeof auth!=='string'||!timingSafeEqual(digest(auth),digest(`Bearer ${token}`)))return res.status(401).json({code:'MODEL_AUTH_REQUIRED'});
 if(!req.headers?.['content-type']?.startsWith('application/json'))return res.status(415).json({code:'INVALID_COMMAND'});
 let command,body;
 try{const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw)>5000)throw Error();body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(body&&Object.keys(body).length===1&&Object.hasOwn(body,'financeReport')){if(typeof body.financeReport!=='string')throw Error();validateMonth(body.financeReport,clock());}else command=parseCommand(body);}catch{return res.status(400).json({code:'INVALID_COMMAND'});}
 if(command===undefined){
  if(!readFinance)return res.status(503).json({code:'FINANCE_NOT_CONFIGURED'});
  try{return res.status(200).json(await readFinance(body.financeReport,clock()));}catch(error){const code=['FINANCE_NO_DATA','FINANCE_COMPANY_REQUIRED','FINANCE_AMOUNT_INVALID','FINANCE_DATE_INVALID','FINANCE_DUPLICATE_OR_MISSING_ID','FINANCE_ACCOUNT_INVALID'].includes(error?.message)?error.message:'FINANCE_SOURCE_UNAVAILABLE';return res.status(503).json({code});}
 }
 try{
  const result=await callAi({prompt:command,systemInstruction:PLANNER_SYSTEM+`\n本次台北日期 ${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(clock())}，本月 ${taipeiMonth(clock())}。以此解讀未註明年份的月份；禁止未來月份月報。`,temperature:0,preferredModel:env.AI_ROTATOR_COMMAND_MODEL,strategy:'round-robin',mode:'readonly-command',toolRequest:{tools:[PLAN_TOOL],tool_choice:{type:'function',function:{name:'submit_readonly_plan'}},validate:validateCompletion}});
  validateCompletion(result.completion);
  const intent=resolveMonthlyIntent(command,clock());
  if(intent){const calls=result.completion.choices[0].message.tool_calls;const plan=parsePlan(JSON.parse(calls[0].function.arguments));if(plan.status==='ready'&&(intent.period>taipeiMonth(clock())||plan.tasks.length!==1||plan.tasks[0].tool!=='finance.monthly-report'||plan.tasks[0].query!==intent.period))throw Error('MODEL_INVALID');}

  // Return a minimal compatible envelope; never return account names, keys, provider errors or raw usage.
  return res.status(200).json({choices:[{finish_reason:'tool_calls',message:{tool_calls:result.completion.choices[0].message.tool_calls.map(call=>({type:'function',function:{name:'submit_readonly_plan',arguments:call.function.arguments}}))}}]});
 }catch{return res.status(503).json({code:'MODEL_UNAVAILABLE'});}
};}

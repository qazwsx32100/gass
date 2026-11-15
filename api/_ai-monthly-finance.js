/** Read-only projection of the ERP income statement. Never returns ledger rows. */
const effective = r => (r.status || 'approved') === 'approved' && !['corrected','superseded'].includes(String(r.correctionStatus || '').toLowerCase()) && !['reversal','void'].includes(String(r.correctionType || '').toLowerCase()) && (r.effectiveForReport === undefined || r.effectiveForReport === true);
const estimates = new Set(['estimate','estimated','system_estimate','system_estimated','gas_cost_estimate','inventory_cost_estimate']);
const estimated = r => r.isEstimated === true || r.systemEstimated === true || [r.sourceType,r.syncType,r.entryType].some(x=>estimates.has(String(x||'').trim().toLowerCase()));
const distribution = r => String(r.accountCode||'').startsWith('6110') || String(r.entryNature||'').trim().toLowerCase()==='equity_distribution';
export function taipeiMonth(now = new Date()) {
 const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).formatToParts(now);
 return `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}`;
}
export function validateMonth(period,now=new Date()) {
 if(typeof period!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)||period>taipeiMonth(now)) throw Error('FINANCE_PERIOD_INVALID');
 return period;
}
function cents(value) {
 if(!['number','string'].includes(typeof value)||!/^\d+(?:\.\d{1,2})?$/.test(String(value)))throw Error('FINANCE_AMOUNT_INVALID');
 const n=Number(value)*100, rounded=Math.round(n);
 if(!Number.isSafeInteger(rounded)||Math.abs(n-rounded)>0.001)throw Error('FINANCE_AMOUNT_INVALID');
 return rounded;
}
function add(a,b){const n=a+b;if(!Number.isSafeInteger(n))throw Error('FINANCE_AMOUNT_INVALID');return n;}
function validDate(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const d=new Date(`${date}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date;}
export function buildMonthlyFinance(row,period,now=new Date()) {
 validateMonth(period,now);
 const state=row?.state;
 if(!state||!['incomes','expenses','companies','chartOfAccounts','periodLocks'].every(k=>Array.isArray(state[k])))throw Error('FINANCE_SOURCE_INVALID');
 // A multi-company ledger requires explicit company selection; never silently combine companies.
 if(state.companies.length!==1||state.companies[0]?.id===undefined)throw Error('FINANCE_COMPANY_REQUIRED');
 const company=state.companies[0], scoped=r=>r&&r.companyId===company.id;
 const limitations=['採 ERP 損益表口徑；不是現金流量表、應收對帳或會計查核結論。'];
 const accounts=new Map(state.chartOfAccounts.map(a=>[String(a.code),a]));
 const groups={revenue:new Map(),cost:new Map(),expense:new Map()};
 let selected=0,excluded=0,gasRevenue=false,manualCost=0,unknownAccount=false;
 function group(kind,code,value,label){const main=code.slice(0,4),account=accounts.get(main)||accounts.get(code);if(!account&&!label)unknownAccount=true;const key=label?'MANUAL_GAS_COGS':main;const existing=groups[kind].get(key);groups[kind].set(key,{code:main,name:label||String(account?.name||'未分類科目').slice(0,80),cents:add(existing?.cents||0,value)});}
 for(const [kind,records] of [['revenue',state.incomes],['expense',state.expenses]]){
  const seen=new Set();
  for(const r of records){
   if(!scoped(r))continue;
   if(!validDate(r.date))throw Error('FINANCE_DATE_INVALID');
   if(!r.date.startsWith(period+'-'))continue;
   const id=String(r.id??'');if(!id||seen.has(id))throw Error('FINANCE_DUPLICATE_OR_MISSING_ID');seen.add(id);
   if(!effective(r)||(kind==='revenue'&&(r.syncType==='receivable_opening'||/尚未核銷|欠款餘額/.test(String(r.remarks||''))))||(kind==='expense'&&distribution(r))){excluded++;continue;}
   const amount=cents(r.amount),code=String(r.accountCode||'');if(!/^\d{4,}$/.test(code))throw Error('FINANCE_ACCOUNT_INVALID');
   selected++;
   if(kind==='revenue'){
    if(Number(r.gasKg)>0||(r.summaryOnly===true&&['daily_summary_monthly','daily_summary_monthly_correction','daily_summary_debt'].includes(r.syncType)))gasRevenue=true;
    group('revenue',code,amount);
   }else if(code.startsWith('5101')){
    if(!estimated(r))manualCost=add(manualCost,amount);else excluded++;
   }else{const a=accounts.get(code.slice(0,4))||accounts.get(code);group(a?.type==='cogs'?'cost':'expense',code,amount);}
  }
 }
 if(manualCost>0)group('cost','5101',manualCost,'手動進氣成本（正式結算）');
 if(!selected)throw Error('FINANCE_NO_DATA');
 const sum=map=>[...map.values()].reduce((a,x)=>add(a,x.cents),0);
 const revenue=sum(groups.revenue),cost=sum(groups.cost),expense=sum(groups.expense),gross=add(revenue,-cost),net=add(gross,-expense);
 const locked=state.periodLocks.some(x=>x.companyId===company.id&&x.yearMonth===period&&x.locked===true);
 if(!locked)limitations.push('本月尚未鎖帳，後續補登或更正會改變金額。');
 const sourceAsOf=typeof row.updated_at==='string'&&Number.isFinite(Date.parse(row.updated_at))?new Date(row.updated_at).toISOString():null;
 const age=sourceAsOf?now.getTime()-Date.parse(sourceAsOf):null;
 const freshness=age===null||age<0?'unknown':age>24*3600_000?'stale':'fresh';
 const offline=row.isOfflineSnapshot===true;
 if(offline)limitations.push('ERP 回傳離線備援快照，未確認雲端帳本最新狀態。');
 if(freshness!=='fresh')limitations.push('來源時間不明、異常或超過 24 小時，請先確認同步。');
 if(unknownAccount)limitations.push('有未分類科目，科目歸屬仍待會計確認。');
 const missingGasCost=gasRevenue&&manualCost===0;
 if(missingGasCost)limitations.push('有瓦斯營收但沒有手動進氣成本；毛利及淨利暫不提供，避免高估。');
 return {mode:'erp-monthly-finance-readonly',period,companyName:String(company.name||'未命名公司').slice(0,80),status:offline||freshness!=='fresh'||!locked||unknownAccount||missingGasCost?'PARTIAL':'VERIFIED_READONLY',sourceAsOf,fetchedAt:now.toISOString(),offline,freshness,locked,selected,excluded,totals:{revenue:revenue/100,cost:cost/100,expense:expense/100,grossProfit:missingGasCost?null:gross/100,netProfit:missingGasCost?null:net/100},categories:Object.fromEntries(Object.entries(groups).map(([key,map])=>[key,[...map.values()].sort((a,b)=>a.code.localeCompare(b.code)).map(({code,name,cents})=>({code,name,amount:cents/100}))])),limitations,productionModified:false};
}
/** Guard only unambiguous short requests. Model still produces the plan. */
export function resolveMonthlyIntent(command,now=new Date()){
 const text=command.normalize('NFKC').replace(/\s+/g,'');
 const match=text.match(/^(?:請)?(?:幫我)?(?:查詢|查|給我|整理)?(?:(20\d{2}|民國\d{2,3})年)?(1[0-2]|[1-9])月(?:報表|月報|損益表)[。!！]?$/);
 if(!match)return null;
 const year=match[1]?(match[1].startsWith('民國')?Number(match[1].slice(2))+1911:Number(match[1])):Number(taipeiMonth(now).slice(0,4));
 return {period:`${year}-${match[2].padStart(2,'0')}`,assumedYear:!match[1]};
}

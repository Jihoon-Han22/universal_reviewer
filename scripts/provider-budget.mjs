// User-authorized spend control. This ledger contains no prompts, documents or keys.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const BUDGET_POLICY=Object.freeze({model:'gemini-3.5-flash-lite',inputUsdPerMillion:0.30,outputUsdPerMillion:2.50,inputTokenMaximum:1048576,outputTokenMaximum:65536,conservativeKrwPerUsd:3000,operatingLimitKrw:40000,exclusiveUserLimitKrw:50000,pricingVerifiedAt:'2026-09-21',pricingSource:'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite',modelSource:'https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite'});
const fail=(code,message)=>Object.assign(new Error(message),{code});
const money=(input,output)=>Math.ceil((input*BUDGET_POLICY.inputUsdPerMillion+output*BUDGET_POLICY.outputUsdPerMillion)*BUDGET_POLICY.conservativeKrwPerUsd/1000000*100)/100;
const reservationKrw=money(BUDGET_POLICY.inputTokenMaximum,BUDGET_POLICY.outputTokenMaximum);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const nonnegative=x=>Number.isFinite(x)&&x>=0;
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
function validLedger(ledger){
 if(!ledger||ledger.schemaVersion!==1||!nonnegative(ledger.openingSpendKrw)||!nonnegative(ledger.settledKrw)||!ledger.reservations||Array.isArray(ledger.reservations)||typeof ledger.reservations!=='object'||!Array.isArray(ledger.calls)||JSON.stringify(ledger.policy)!==JSON.stringify(BUDGET_POLICY))return false;
 const ids=new Set();
 for(const [id,r] of Object.entries(ledger.reservations)){
  if(!uuid(id)||!r||r.id!==id||r.model!==BUDGET_POLICY.model||r.reservedKrw!==reservationKrw||!Number.isFinite(Date.parse(r.reservedAt)))return false;ids.add(id);
 }
 let total=ledger.openingSpendKrw;
 for(const c of ledger.calls){if(!c||!uuid(c.id)||ids.has(c.id)||c.model!==BUDGET_POLICY.model||!nonnegative(c.chargedUpperEstimateKrw)||c.chargedUpperEstimateKrw>reservationKrw||!['usage-upper-estimate','full-reservation-uncertain'].includes(c.accounting))return false;ids.add(c.id);total+=c.chargedUpperEstimateKrw;}
 return Math.round(total*100)===Math.round(ledger.settledKrw*100);
}
export function createProviderBudget({directory=path.join(projectRoot,'.cache/rebuild/provider-budget'),enabled=false,openingSpendKrw=0,allowInitialize=false}={}){
 if(!Number.isFinite(openingSpendKrw)||openingSpendKrw<0)throw fail('BUDGET_INVALID','Invalid opening spend.');
 const ledgerPath=path.join(directory,'ledger.json'),lockPath=path.join(directory,'ledger.lock');
 async function transact(work){
  await fs.mkdir(directory,{recursive:true});let lock;
  for(let attempt=0;attempt<100;attempt++){
   try{lock=await fs.open(lockPath,'wx');break;}catch(e){
    // Windows can report a sharing violation while another process owns wx.
    const existingWindowsLock=e.code==='EPERM'&&await fs.stat(lockPath).then(s=>s.isFile(),()=>false);
    if(e.code!=='EEXIST'&&!existingWindowsLock)throw e;
    if(attempt===99)throw fail('BUDGET_LOCKED','Cost ledger is busy or a prior process stopped. Review the lock before enabling calls.');await sleep(30);
   }
  }
  try{
   let ledger;try{ledger=JSON.parse(await fs.readFile(ledgerPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;if(!allowInitialize)throw fail('BUDGET_LEDGER_MISSING','Cost ledger is missing. Confirm prior project spend before explicitly initializing it.');ledger={schemaVersion:1,policy:BUDGET_POLICY,openingSpendKrw,settledKrw:openingSpendKrw,reservations:{},calls:[]};}
   if(!validLedger(ledger))throw fail('BUDGET_INVALID','Cost ledger or pricing policy must be reviewed.');
   const result=await work(ledger);
   const temporary=ledgerPath+'.'+randomUUID()+'.tmp';
   const file=await fs.open(temporary,'wx');
   try{await file.writeFile(JSON.stringify({...ledger,updatedAt:new Date().toISOString()},null,2)+'\n');await file.sync();}finally{await file.close();}
   await fs.rename(temporary,ledgerPath);return result;
  }finally{await lock?.close();await fs.unlink(lockPath);}
 }
 function reserved(ledger){return Object.values(ledger.reservations).reduce((sum,r)=>sum+r.reservedKrw,0);}
 async function finish(token,usage){
  return transact(ledger=>{
   const id=typeof token==='string'?token:token?.id;
   if(!uuid(id))throw fail('BUDGET_RESERVATION_MISSING','Missing cost reservation.');
   const entry=Object.hasOwn(ledger.reservations,id)?ledger.reservations[id]:undefined;
   if(!entry){if(ledger.calls.some(call=>call.id===id))return;throw fail('BUDGET_RESERVATION_MISSING','Missing cost reservation.');}
   const input=usage?.promptTokenCount, candidates=usage?.candidatesTokenCount,thoughts=usage?.thoughtsTokenCount??0;
   const valid=[input,candidates,thoughts].every(x=>Number.isSafeInteger(x)&&x>=0)&&input<=BUDGET_POLICY.inputTokenMaximum&&candidates+thoughts<=BUDGET_POLICY.outputTokenMaximum;
   const cost=valid?money(input,candidates+thoughts):entry.reservedKrw;
   ledger.settledKrw=Math.round((ledger.settledKrw+cost)*100)/100;
   ledger.calls.push({id,model:entry.model,reservedAt:entry.reservedAt,settledAt:new Date().toISOString(),accounting:valid?'usage-upper-estimate':'full-reservation-uncertain',chargedUpperEstimateKrw:cost,...(valid?{inputTokens:input,outputTokens:candidates+thoughts}:{})});delete ledger.reservations[id];
   return {chargedUpperEstimateKrw:cost,cumulativeUpperEstimateKrw:ledger.settledKrw};
  });
 }
 return {
  async reserve(request={}){
   if(!enabled)throw fail('LIVE_CALLS_DISABLED','Live provider calls have not been enabled for this run.');
   const model=String(request.model??BUDGET_POLICY.model).replace(/^models\//,'');
   if(model!==BUDGET_POLICY.model)throw fail('BUDGET_MODEL_UNPRICED','The requested model does not have an approved price policy.');
   const tiers=[request.config?.serviceTier,request.serviceTier,request.config?.service_tier,request.service_tier];
   if(tiers.some(tier=>tier!==undefined&&tier!=='standard'))throw fail('BUDGET_TIER_UNPRICED','Only standard provider pricing is authorized.');
   if(request.config?.tools?.length||request.tools?.length)throw fail('BUDGET_TOOLS_UNPRICED','Priced external tools are not enabled.');
   return transact(ledger=>{
    if(ledger.settledKrw+reserved(ledger)+reservationKrw>=BUDGET_POLICY.operatingLimitKrw)throw fail('BUDGET_LIMIT','The next call could exceed the conservative project cost limit.');
    const id=randomUUID();ledger.reservations[id]={id,model,reservedKrw:reservationKrw,reservedAt:new Date().toISOString()};return {...ledger.reservations[id]};
   });
  },
  settle:finish,
  // An SDK rejection/abort can still have been billed. Keep the entire maximum.
  release:token=>finish(token,undefined),
  snapshot:()=>transact(ledger=>({policy:ledger.policy,settledUpperEstimateKrw:ledger.settledKrw,reservedKrw:reserved(ledger),calls:ledger.calls.length,pending:Object.keys(ledger.reservations).length,remainingOperationalKrw:Math.max(0,BUDGET_POLICY.operatingLimitKrw-ledger.settledKrw-reserved(ledger))})),
 };
}

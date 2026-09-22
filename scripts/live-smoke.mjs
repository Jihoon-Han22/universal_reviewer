import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServiceRuntime} from './provider-runtime.mjs';
import {publicConfig,errorSummary,runSandboxCommand} from '../integrations/src/index.mjs';
const directory=path.resolve('.cache/rebuild/live/loop-002');
await fs.mkdir(directory,{recursive:true});
const reportPath=path.join(directory,'service-smoke.json');
const runtime=createServiceRuntime({live:true});
const report={schemaVersion:1,acceptanceProfile:'CURRENT_REPRODUCTION',origin:'live-provider',scope:'connection smoke only; not G03/G09 completion',startedAt:new Date().toISOString(),command:['node','scripts/live-smoke.mjs'],config:publicConfig(runtime.config),template:runtime.config.e2bTemplate,sourceHashes:{},checks:[]};
for(const file of ['scripts/live-smoke.mjs','scripts/provider-runtime.mjs','scripts/provider-budget.mjs','integrations/src/gemini.mjs','integrations/src/sandbox.mjs'])report.sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
const persist=()=>fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
report.budgetBefore=await runtime.budgetGuard.snapshot();
await persist();
for(const [service,work] of [
 ['gemini',async()=>{const result=await runtime.gemini.generateText({prompt:'Reply with OK only.',maxOutputTokens:32});if(!result.text?.trim())throw new Error('Empty response');return {model:result.model,usage:result.usage,nonempty:true,okReply:/\bOK\b/i.test(result.text)};}],
 ['e2b',async()=>runtime.withSandbox(async handle=>{const result=await runSandboxCommand(handle,"python -c \"import sys; print('sandbox-ready'); print(sys.version.split()[0])\"");if(result.exitCode!==0||!result.stdout.includes('sandbox-ready'))throw Object.assign(new Error('Invalid sandbox result'),{service:'e2b'});return {completed:true,exitCode:result.exitCode,pythonVersion:result.stdout.trim().split(/\r?\n/).at(-1)};},{activity:{kind:'sandbox',title:'서비스 연결 확인'}})],
]){
 const check={service,startedAt:new Date().toISOString(),status:'running'};report.checks.push(check);await persist();
 try{check.actual=await work();check.status='pass';}catch(error){check.status='fail';check.error=errorSummary(error,service);}
 check.endedAt=new Date().toISOString();report.budgetAfter=await runtime.budgetGuard.snapshot();await persist();console.log(JSON.stringify(check));
}
report.activity=runtime.activityStore.snapshot();report.endedAt=new Date().toISOString();report.status=report.checks.every(c=>c.status==='pass')?'pass':'fail';await persist();console.log(JSON.stringify({status:report.status,budget:report.budgetAfter,artifact:reportPath}));if(report.status!=='pass')process.exitCode=1;

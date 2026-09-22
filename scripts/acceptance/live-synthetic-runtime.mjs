// Promoted for offline preparation under LOOP005; live execution still requires
// a final frozen manifest, independent review, and an explicit root invocation.
// Default invocation cannot load credentials or contact a provider.
import {readFile,writeFile,mkdir,readdir,realpath,lstat,open} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const FORMAT='synthetic-live-ordinary-v1';
const ENTRY='scripts/acceptance/live-synthetic-runtime.mjs';
const FIXTURES='scripts/acceptance/live-synthetic-fixtures.mjs';
const REGISTRY='scripts/acceptance/case-registry.json';
const REGISTRY_SHA='7a7160fc0564c4df73fd4842781267f2e184304ebdc087935c0696fe498ac5b7';
const LEDGER='.cache/rebuild/provider-budget/ledger.json';
const PERMISSION='.cache/rebuild/live/document-permission.json';
const BASE='.cache/rebuild/live-synthetic';
const PINNED_NODE='.cache/runtime/node-v24.13.1-win-x64/node.exe';
const MAX_CALLS=30,MAX_SESSIONS=7,DEADLINE_MS=45*60*1000;
const MAX_INPUT_TOKENS=1048576,MAX_OUTPUT_TOKENS=65536;
const RESERVATION_KRW=Math.ceil((MAX_INPUT_TOKENS*0.30+MAX_OUTPUT_TOKENS*2.50)*3000/1e6*100)/100;
const USER_ACTIONS=Object.freeze({
  revisionFeedback:'Keep all criteria, source evidence, threshold, unit, applicability, and classification unchanged. Set the display label of the compressive strength criterion to "Compressive strength (reviewed)".',
  directEditLabel:'Compressive strength (approved)',
  dashboardInstruction:'Use a clear summary with the supplied result table and counts. Preserve all source labels, values, units, verdicts, and evidence. Use an accessible light theme.',
});
const LIMITATIONS=Object.freeze([
  'Ordinary authored inputs only; no full G03/G09 or case PASS assertion is made by this runtime.',
  'No private P01/C05 input access or provider transmission; original-document call allowance is unchanged.',
  'No malformed/unsupported/boundary/large-source/visual-limit/cancellation/retry-injection batch.',
  'No stream or explicit concurrency/backlog measurement, browser interaction, HTTP transport, SSE reconnection, or visual screenshot validation.',
  'The dashboard uses its real POST admission handler and real E2B jsdom validator, without starting an HTTP server.',
  'Only CSV receives semantic target review; DOCX/PDF/PNG receive complete ordinary analysis attempts.',
  'The persistent Gemini ledger does not price E2B sessions; session counts, lifetimes, and cleanup are recorded separately.',
  'Unknown usage retains full reservation; the 30-call cap is not a promise that the cost guard will admit 30 requests.',
]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const now=()=>new Date().toISOString();
const failure=code=>Object.assign(new Error(code),{code});
const insist=(condition,code)=>{if(!condition)throw failure(code);};
const errorCode=error=>typeof error?.code==='string'&&/^[A-Z0-9_]{1,100}$/.test(error.code)?error.code:'UNCLASSIFIED_FAILURE';
const normalized=p=>path.resolve(p).replaceAll('\\','/').toLowerCase();
const relative=(root,p)=>path.relative(root,p).replaceAll('\\','/');
const moduleAt=(root,p)=>import(pathToFileURL(path.join(root,p)).href);

// Resolve only declared, ordinary local files. Never scan .env, golden, answers,
// evaluator outputs, unrelated caches, or the private document directories.
async function safeFile(root,rel) {
  insist(typeof rel==='string'&&!path.isAbsolute(rel)&&!rel.includes('\\')&&!rel.split('/').some(v=>!v||v==='.'||v==='..'),'UNSAFE_RELATIVE_PATH');
  const full=path.join(root,rel),resolved=await realpath(full);
  insist(relative(root,resolved)===rel,'SYMLINK_OR_ALIAS_FORBIDDEN');
  let cursor=root;
  for(const segment of rel.split('/')){cursor=path.join(cursor,segment);insist(!(await lstat(cursor)).isSymbolicLink(),'SYMLINK_FORBIDDEN');}
  insist((await lstat(full)).isFile(),'REGULAR_FILE_REQUIRED');
  return full;
}
async function digestFile(root,rel) {const bytes=await readFile(await safeFile(root,rel));return {path:rel,bytes:bytes.length,sha256:sha(bytes)};}
async function mkdirWithin(root,rel) {
  insist(!path.isAbsolute(rel)&&!rel.includes('\\')&&!rel.split('/').some(v=>!v||v==='.'||v==='..'),'UNSAFE_DIRECTORY_PATH');
  let current=root;
  for(const segment of rel.split('/')){
    current=path.join(current,segment);
    try{await mkdir(current);}catch(error){if(error.code!=='EEXIST')throw error;}
    const info=await lstat(current);insist(info.isDirectory()&&!info.isSymbolicLink()&&normalized(await realpath(current))===normalized(current),'UNSAFE_DIRECTORY');
  }
}
async function inventoryCode(root) {
  const files=new Set([ENTRY,FIXTURES,'scripts/provider-runtime.mjs','scripts/provider-budget.mjs','package.json','package-lock.json','integrations/package.json','integrations/package-lock.json',REGISTRY]);
  async function walk(rel) {
    for(const entry of await readdir(path.join(root,rel),{withFileTypes:true})) {
      insist(!entry.isSymbolicLink(),'CODE_SYMLINK_FORBIDDEN');
      const child=rel+'/'+entry.name;
      if(entry.isDirectory())await walk(child);
      else if(entry.isFile()&&/\.(mjs|cjs|js|py|ts|json|txt|html|css)$/.test(entry.name))files.add(child);
    }
  }
  for(const dir of ['server','integrations/src','architecture/contracts'])await walk(dir);
  const values=[];for(const rel of [...files].sort())values.push(await digestFile(root,rel));return values;
}
async function checkCode(root,expected) {insist(sha(jsonBytes(await inventoryCode(root)))===sha(jsonBytes(expected)),'CODE_HASH_CHANGED');}
function validateLedger(ledger) {
  insist(ledger?.schemaVersion===1&&Array.isArray(ledger.calls)&&ledger.reservations&&typeof ledger.reservations==='object'&&!Array.isArray(ledger.reservations)&&Number.isFinite(ledger.settledKrw)&&ledger.settledKrw>=0&&Number.isFinite(ledger.openingSpendKrw)&&ledger.openingSpendKrw>=0,'INVALID_EXISTING_LEDGER');
  const policy=ledger.policy;
  insist(policy?.model==='gemini-3.5-flash-lite'&&policy.inputUsdPerMillion===0.30&&policy.outputUsdPerMillion===2.50&&policy.inputTokenMaximum===MAX_INPUT_TOKENS&&policy.outputTokenMaximum===MAX_OUTPUT_TOKENS&&policy.conservativeKrwPerUsd===3000&&policy.operatingLimitKrw===40000&&policy.exclusiveUserLimitKrw===50000,'LEDGER_POLICY_CHANGED');
  insist(Object.keys(ledger.reservations).length===0,'EXISTING_RESERVATION_PENDING');
  insist(ledger.settledKrw+RESERVATION_KRW*2<40000,'INSUFFICIENT_UPPER_RESERVATION_HEADROOM');
  insist(new Set(ledger.calls.map(c=>c.id)).size===ledger.calls.length,'DUPLICATE_LEDGER_CALL');
  insist(ledger.calls.every(call=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(call.id)&&call.model===policy.model&&Number.isFinite(call.chargedUpperEstimateKrw)&&call.chargedUpperEstimateKrw>=0&&call.chargedUpperEstimateKrw<=RESERVATION_KRW&&['usage-upper-estimate','full-reservation-uncertain'].includes(call.accounting)),'INVALID_LEDGER_CALL');
  insist(Math.round((ledger.openingSpendKrw+ledger.calls.reduce((sum,call)=>sum+call.chargedUpperEstimateKrw,0))*100)===Math.round(ledger.settledKrw*100),'LEDGER_TOTAL_INCONSISTENT');
  return ledger;
}
function ledgerProjection(ledger) {return {schemaVersion:ledger.schemaVersion,policy:ledger.policy,openingSpendKrw:ledger.openingSpendKrw,settledKrw:ledger.settledKrw,calls:ledger.calls,reservations:ledger.reservations};}
async function ledgerFile(root) {const bytes=await readFile(await safeFile(root,LEDGER));return {bytes,value:JSON.parse(bytes)};}
async function prepare(root,batch) {
  insist(/^[A-Za-z0-9][A-Za-z0-9_-]{0,60}$/.test(batch),'BATCH_ID_REQUIRED');
  const dir=BASE+'/ordinary-'+batch;
  // A prepared directory is immutable and cannot be reused or overwritten.
  await mkdirWithin(root,BASE);await mkdir(path.join(root,dir));
  await mkdir(path.join(root,dir,'inputs'));
  const ledger=await ledgerFile(root);validateLedger(ledger.value);
  const permission=await digestFile(root,PERMISSION),registry=await digestFile(root,REGISTRY);
  insist(registry.sha256===REGISTRY_SHA,'REGISTRY_CHANGED');
  const {generateSyntheticInputs}=await moduleAt(root,FIXTURES);
  const inputs=[];
  for(const {bytes,...input} of await generateSyntheticInputs(root)){
    const rel=dir+'/inputs/'+input.name;await writeFile(path.join(root,rel),bytes,{flag:'wx'});
    inputs.push({...input,classification:'authored-nonprivate-provider-input',...await digestFile(root,rel)});
  }
  const manifest={format:FORMAT,preparedAt:now(),batch,artifactDirectory:dir,prepared:true,node:{version:process.versions.node,...await digestFile(root,PINNED_NODE)},
    scope:'first-ordinary-synthetic-only',inputs,codeHashes:await inventoryCode(root),registry,
    originalDocumentPermission:permission,
    ledgerContinuity:{path:LEDGER,sha256:sha(ledger.bytes),stateSha256:sha(jsonBytes(ledgerProjection(ledger.value))),calls:ledger.value.calls.length,settledUpperEstimateKrw:ledger.value.settledKrw,existingCallIds:ledger.value.calls.map(c=>c.id)},
    providerPolicy:{model:'gemini-3.5-flash-lite',maximumGeminiCalls:MAX_CALLS,maximumSandboxSessions:MAX_SESSIONS,maximumConcurrentGeminiCalls:2,maximumConcurrentSandboxSessions:2,operatingLimitKrw:40000,userExclusiveLimitKrw:50000,perRequestUpperReservationKrw:RESERVATION_KRW,maximumSimultaneousReservationKrw:RESERVATION_KRW*2,worstCaseThirtyReservationsKrw:Math.round(RESERVATION_KRW*MAX_CALLS*100)/100,headroomAtPreparationKrw:40000-ledger.value.settledKrw,admission:'unchanged-persistent-guard-before-every-SDK-request; stop before request 31; no allowance reset',e2bCostIncludedInGeminiLedger:false},
    stagePlan:['ingest','criteria.prepare','criteria.revise','criteria.confirm','target.review','exports','dashboard','analysis.docx','analysis.pdf','analysis.png'],
    userActions:USER_ACTIONS,deadlineMs:DEADLINE_MS,limitations:LIMITATIONS,
    evaluator:{runtimeReadsExpectedAnswers:false,caseVerdictsProducedByRuntime:false,independentPreexecutionBaselineRequired:true},
  };
  const file=dir+'/manifest.json';await writeFile(path.join(root,file),jsonBytes(manifest),{flag:'wx'});
  return {mode:'prepared-offline-only',manifest:file,manifestSha256:sha(jsonBytes(manifest)),inputs:inputs.map(({id,path,sha256,bytes})=>({id,path,sha256,bytes})),noLiveExecution:true};
}

function byteValue(value) {
  if(typeof value==='string')return Buffer.from(value);
  if(value instanceof ArrayBuffer)return Buffer.from(value);
  if(ArrayBuffer.isView(value))return Buffer.from(value.buffer,value.byteOffset,value.byteLength);
  throw failure('UNSUPPORTED_SANDBOX_BYTES');
}
const FIXED_COMMANDS=new Set([
  'python -m pip install --disable-pip-version-check --no-input openpyxl==3.1.5 python-docx==1.1.2 PyMuPDF==1.26.4 Pillow==11.3.0',
  'mkdir -p /home/user/trace-criteria',
  'python -m pip install --disable-pip-version-check --no-input openpyxl==3.1.5',
  'python /home/user/trace-criteria/profile.py /home/user/trace-criteria/workbook.xlsx inventory /home/user/trace-criteria/inventory.json',
  'python /home/user/trace-criteria/profile.py /home/user/trace-criteria/workbook.xlsx read /home/user/trace-criteria/details.json /home/user/trace-criteria/request.json',
  'mkdir -p /home/user/review-dashboard',
  'cd /home/user/review-dashboard && npm install --no-audit --no-fund --ignore-scripts',
  'cd /home/user/review-dashboard && node validate.cjs',
]);
for(const kind of ['xlsx','csv','docx','pdf','png']){
  FIXED_COMMANDS.add(`python /home/user/document-reader.py /home/user/document-input.bin ${kind} /home/user/document-profile.json`);
  FIXED_COMMANDS.add(`python /home/user/document-requery.py /home/user/document-input.bin ${kind} /home/user/document-requests.json /home/user/document-requery.json`);
}
const WRITE_PATHS=new Set(['/home/user/document-input.bin','/home/user/document-reader.py','/home/user/document-requery.py','/home/user/document-requests.json','/home/user/trace-criteria/profile.py','/home/user/trace-criteria/workbook.xlsx','/home/user/trace-criteria/request.json','/home/user/review-dashboard/package.json','/home/user/review-dashboard/validate.cjs','/home/user/review-dashboard/data.json','/home/user/review-dashboard/dashboard.html','/home/user/review-dashboard/plan.json']);
const READ_PATHS=new Set(['/home/user/document-profile.json','/home/user/document-requery.json','/home/user/trace-criteria/inventory.json','/home/user/trace-criteria/details.json','/home/user/review-dashboard/validation.json','/home/user/review-dashboard/dashboard.html']);

async function execute(root,manifestPath,expectedHash) {
  insist(/^[a-f0-9]{64}$/.test(expectedHash??''),'MANIFEST_HASH_REQUIRED');
  insist(manifestPath.startsWith(BASE+'/ordinary-')&&manifestPath.endsWith('/manifest.json'),'MANIFEST_LOCATION_INVALID');
  const manifestBytes=await readFile(await safeFile(root,manifestPath));insist(sha(manifestBytes)===expectedHash,'MANIFEST_HASH_MISMATCH');
  const manifest=JSON.parse(manifestBytes);
  insist(manifest.format===FORMAT&&manifest.prepared===true,'UNPREPARED_MANIFEST');
  insist(manifest.node?.version==='24.13.1'&&manifest.node.path===PINNED_NODE&&(await digestFile(root,PINNED_NODE)).sha256===manifest.node.sha256,'PINNED_NODE_CHANGED');
  insist(manifest.artifactDirectory===path.posix.dirname(manifestPath),'MANIFEST_DIRECTORY_MISMATCH');
  insist(sha(jsonBytes(manifest.userActions))===sha(jsonBytes(USER_ACTIONS))&&manifest.deadlineMs===DEADLINE_MS,'ACTION_PLAN_CHANGED');
  insist(manifest.providerPolicy.maximumGeminiCalls===MAX_CALLS&&manifest.providerPolicy.maximumSandboxSessions===MAX_SESSIONS&&manifest.providerPolicy.operatingLimitKrw===40000&&manifest.providerPolicy.perRequestUpperReservationKrw===RESERVATION_KRW,'BUDGET_PLAN_CHANGED');
  insist((await digestFile(root,REGISTRY)).sha256===REGISTRY_SHA&&manifest.registry.sha256===REGISTRY_SHA,'REGISTRY_CHANGED');
  await checkCode(root,manifest.codeHashes);
  insist((await digestFile(root,PERMISSION)).sha256===manifest.originalDocumentPermission.sha256,'ORIGINAL_PERMISSION_CHANGED');
  const before=await ledgerFile(root);validateLedger(before.value);
  insist(sha(before.bytes)===manifest.ledgerContinuity.sha256&&sha(jsonBytes(ledgerProjection(before.value)))===manifest.ledgerContinuity.stateSha256,'STALE_LEDGER_PREPARATION');
  const {INPUT_DEFINITIONS,generateSyntheticInputs}=await moduleAt(root,FIXTURES);
  const regenerated=new Map((await generateSyntheticInputs(root)).map(input=>[input.id,sha(input.bytes)]));
  insist(Array.isArray(manifest.inputs)&&manifest.inputs.length===INPUT_DEFINITIONS.length,'INPUT_SET_CHANGED');
  const inputBytes=new Map(),binaryHashes=new Map();
  for(const definition of INPUT_DEFINITIONS){
    const input=manifest.inputs.find(v=>v.id===definition.id);
    insist(input&&input.path===manifest.artifactDirectory+'/inputs/'+definition.name&&input.name===definition.name&&input.kind===definition.kind&&input.role===definition.role&&input.classification==='authored-nonprivate-provider-input','INPUT_IDENTITY_CHANGED');
    const bytes=await readFile(await safeFile(root,input.path));insist(sha(bytes)===input.sha256&&input.sha256===regenerated.get(input.id)&&bytes.length===input.bytes&&bytes.length>0&&bytes.length<=20*1024*1024,'INPUT_HASH_CHANGED');
    inputBytes.set(input.id,bytes);binaryHashes.set(input.sha256,{inputId:input.id,origin:'manifest-original'});
  }
  // Irreversible admission marker: one prepared manifest gets one live attempt.
  // Repeated attempts require a newly prepared manifest and current ledger hash.
  const lock=await open(path.join(root,manifest.artifactDirectory,'execution.lock'),'wx');await lock.writeFile(jsonBytes({manifestSha256:expectedHash,startedAt:now(),pid:process.pid}));await lock.close();
  const output=manifest.artifactDirectory+'/execution-'+randomUUID();await mkdir(path.join(root,output));
  const tracePath=path.join(root,output,'trace.ndjson'),context=new AsyncLocalStorage();
  const result={format:FORMAT,manifest:{path:manifestPath,sha256:expectedHash},startedAt:now(),executionStatus:'running',providerMode:'real',caseVerdicts:[],fullGateCasesPassed:0,limitations:LIMITATIONS,stages:[],inputs:manifest.inputs,documents:{},models:[],sdkAdmissions:[],sessions:[],snapshots:{},exports:{},dashboard:null,ledger:{before:ledgerProjection(before.value)},continuity:{},artifacts:[]};
  let sequence=0,admitted=0,admissionClaims=0,attemptedSessions=0,activeModels=0,maxActiveModels=0,activeSessions=0,maxActiveSessions=0,artifactNumber=0;
  const controller=new AbortController(),activeWork=new Set(),tokenRecords=new Map();
  const record=(type,data={})=>{const event={sequence:++sequence,timestamp:now(),phase:context.getStore()?.phase??'lifecycle',type,...data};try{appendFileSync(tracePath,JSON.stringify(event)+'\n');}catch(error){result.traceWriteFailed=true;controller.abort(failure('TRACE_WRITE_FAILED'));throw error;}return event;};
  const artifact=async(label,data)=>{const bytes=Buffer.isBuffer(data)?data:typeof data==='string'?Buffer.from(data):jsonBytes(data),name=String(++artifactNumber).padStart(4,'0')+'-'+label.replace(/[^A-Za-z0-9_.-]/g,'_'),rel=output+'/'+name;await writeFile(path.join(root,rel),bytes,{flag:'wx'});const reference={path:rel,sha256:sha(bytes),bytes:bytes.length};result.artifacts.push(reference);return reference;};
  const tracked=work=>{const promise=Promise.resolve().then(work);activeWork.add(promise);promise.then(()=>activeWork.delete(promise),()=>activeWork.delete(promise));return promise;};
  const combined=signal=>signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const fatal=code=>{const error=failure(code);record('batch.admission_blocked',{code});controller.abort(error);throw error;};
  const timer=setTimeout(()=>{record('batch.deadline',{deadlineMs:DEADLINE_MS});controller.abort(failure('BATCH_DEADLINE'));},DEADLINE_MS);
  const interrupt=()=>{record('batch.interrupted');controller.abort(failure('BATCH_INTERRUPTED'));};
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  let runtime,engine,documents,unsubscribeActivity,run,unsubscribeRun;
  async function stage(name,work,{depends=true}={}){
    if(!depends||controller.signal.aborted){result.stages.push({name,status:'NOT_RUN',reason:controller.signal.aborted?'batch_stopped':'prerequisite_not_satisfied'});return undefined;}
    return context.run({phase:name},async()=>{
      const row={name,status:'running',startedAt:now(),firstTrace:sequence+1};result.stages.push(row);record('stage.started');
      try{const value=await work();row.status='observed';return value;}
      catch(error){row.status='error';row.errorCode=errorCode(error);record('stage.error',{errorCode:row.errorCode});return undefined;}
      finally{row.completedAt=now();row.lastTrace=sequence;record('stage.ended',{status:row.status});}
    });
  }
  const snapshot=async(name)=>{const value=engine.snapshot(run);result.snapshots[name]=await artifact(name+'.json',value);return value;};
  try{
    record('batch.started',{manifestSha256:expectedHash,maximumGeminiCalls:MAX_CALLS,maximumSandboxSessions:MAX_SESSIONS});
    // Only this explicit execute branch imports production configuration or keys.
    const [{createServiceRuntime},{createApp},{createExportService},{schemas,criteriaSchemas}]=await Promise.all([moduleAt(root,'scripts/provider-runtime.mjs'),moduleAt(root,'server/app.mjs'),moduleAt(root,'server/exports.mjs'),moduleAt(root,'server/pipeline-prompts.mjs')]);
    runtime=createServiceRuntime({live:true});
    insist([runtime.config.modelExtract,runtime.config.modelExplore].every(model=>String(model).replace(/^models\//,'')==='gemini-3.5-flash-lite'),'CONFIGURED_MODEL_UNPRICED');
    insist(typeof runtime.config.e2bApiKey==='string'&&runtime.config.e2bApiKey.length>0,'E2B_KEY_NOT_CONFIGURED');
    record('budget.production_guard_validated',{snapshot:await runtime.budgetGuard.snapshot()});
    const guard=runtime.budgetGuard,reserve=guard.reserve.bind(guard),settle=guard.settle.bind(guard),release=guard.release.bind(guard);
    function requestBinaries(value,list=[]){if(!value||typeof value!=='object')return list;if(value.fileData)fatal('EXTERNAL_MODEL_FILE_FORBIDDEN');if(value.inlineData){const digest=sha(Buffer.from(value.inlineData.data,'base64'));if(!binaryHashes.has(digest))fatal('UNMANIFESTED_MODEL_BINARY');list.push({sha256:digest,mimeType:value.inlineData.mimeType,...binaryHashes.get(digest)});}for(const [key,child]of Object.entries(value))if(key!=='inlineData')requestBinaries(child,list);return list;}
    guard.reserve=async request=>{
      controller.signal.throwIfAborted();if(admissionClaims>=MAX_CALLS)fatal('BATCH_CALL_LIMIT');admissionClaims++;await checkCode(root,manifest.codeHashes);
      const binaries=requestBinaries(request),call=context.getStore()?.modelCall;insist(call,'UNATTRIBUTED_SDK_REQUEST');
      const budget=await guard.snapshot();if(budget.pending>2||budget.settledUpperEstimateKrw+budget.reservedKrw+RESERVATION_KRW>=40000)fatal('BATCH_UPPER_RESERVATION_LIMIT');
      // requestFor contains model/content/config, never the client API key.
      // Only the nonserializable AbortSignal is omitted from request evidence.
      const {abortSignal,...requestConfig}=request.config??{};
      const requestEvidence={...request,config:requestConfig},requestArtifact=await artifact('request-'+call.id+'.json',requestEvidence),requestSha256=sha(jsonBytes(requestEvidence));
      record('gemini.reservation_requested',{callId:call.id,stage:call.stage,requestSha256,request:requestArtifact,requestHashScope:'model-contents-config-excluding-abortSignal',binaries,upperReservationKrw:RESERVATION_KRW,priorBudget:budget});
      let token;try{token=await reserve(request);}catch(error){record('gemini.reservation_denied',{callId:call.id,errorCode:errorCode(error)});controller.abort(error);throw error;}
      const admission={id:token.id,callId:call.id,ordinal:++admitted,phase:call.phase,stage:call.stage,reservation:{...token},request:requestArtifact,requestSha256,requestHashScope:'model-contents-config-excluding-abortSignal',binaries};
      call.admissionIds.push(token.id);result.sdkAdmissions.push(admission);tokenRecords.set(token.id,admission);
      record('gemini.admitted',{callId:call.id,sdkAdmission:admitted,reservation:{...token},request:requestArtifact});return token;
    };
    guard.settle=async(token,usage)=>{const accounting=await settle(token,usage),admission=tokenRecords.get(token.id);const actualUsage=Object.fromEntries(['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount','cachedContentTokenCount'].filter(k=>Number.isFinite(usage?.[k])).map(k=>[k,usage[k]]));if(admission)Object.assign(admission,{usage:actualUsage,accounting});record('gemini.settled',{callId:admission?.callId,reservationId:token.id,usage:actualUsage,accounting});return accounting;};
    guard.release=async token=>{const accounting=await release(token),admission=tokenRecords.get(token.id);if(admission)Object.assign(admission,{usageUnavailable:true,accounting});record('gemini.released_at_full_reservation',{callId:admission?.callId,reservationId:token.id,accounting});return accounting;};
    const schemaNames=new Map([...Object.entries(schemas),...Object.entries(criteriaSchemas)].map(([name,schema])=>[sha(jsonBytes(schema)),name]));
    const observedGemini=Object.fromEntries(['generateText','generateJson'].map(method=>[method,request=>tracked(async()=>{
      controller.signal.throwIfAborted();const prior=context.getStore()??{},schemaName=request.schema?schemaNames.get(sha(jsonBytes(request.schema))):undefined;
      const call={id:randomUUID(),phase:prior.phase,method,stage:schemaName??(method==='generateText'?'dashboard.design':'unknown-schema'),schemaSha256:request.schema?sha(jsonBytes(request.schema)):null,maxOutputTokens:request.maxOutputTokens,role:request.role,startedAt:now(),status:'running',admissionIds:[]};result.models.push(call);
      return context.run({...prior,modelCall:call},async()=>{
        activeModels++;maxActiveModels=Math.max(maxActiveModels,activeModels);record('gemini.started',{callId:call.id,stage:call.stage,activeModels});
        try{const response=await runtime.gemini[method]({...request,signal:combined(request.signal)});call.status='returned';call.response=await artifact('model-'+call.id+'.json',response);return response;}
        catch(error){call.status='error';call.errorCode=errorCode(error);record('gemini.error',{callId:call.id,errorCode:call.errorCode});throw error;}
        finally{call.completedAt=now();activeModels--;record('gemini.ended',{callId:call.id,status:call.status});}
      });
    })]));
    const observedSandbox=(work,options={})=>tracked(async()=>{
      controller.signal.throwIfAborted();if(attemptedSessions>=MAX_SESSIONS)fatal('BATCH_SANDBOX_LIMIT');const attempt=++attemptedSessions;await checkCode(root,manifest.codeHashes);
      const session={id:randomUUID(),phase:context.getStore()?.phase,attempt,requestedLifetimeMs:options.timeoutMs??60000,startedAt:now(),status:'provisioning',cleanup:{attempts:0,status:'not-observed'},writes:[],reads:[],commands:[]};result.sessions.push(session);
      insist(session.requestedLifetimeMs>=10000&&session.requestedLifetimeMs<=300000,'UNBOUNDED_SANDBOX_LIFETIME');
      record('e2b.requested',{sessionId:session.id,lifetimeMs:session.requestedLifetimeMs});let handle,priorKill;
      try{return await runtime.withSandbox(async(sandbox,report)=>{
        handle=sandbox;priorKill=sandbox.kill;session.providerSandboxId=sandbox.sandboxId??sandbox.id??null;session.taskId=report.taskId;session.status='running';session.provisionedAt=now();activeSessions++;maxActiveSessions=Math.max(maxActiveSessions,activeSessions);
        // Observe the actual kill invoked by the production adapter; delegate its
        // arguments/result/rejection unchanged and restore after adapter finally.
        sandbox.kill=async(...args)=>{session.cleanup.attempts++;session.cleanup.startedAt=now();session.cleanup.status='running';record('e2b.cleanup_started',{sessionId:session.id});try{const value=await priorKill.apply(sandbox,args);session.cleanup.status='resolved';session.cleanup.result=value===true?true:value===false?false:null;return value;}catch(error){session.cleanup.status='rejected';session.cleanup.errorCode=errorCode(error);throw error;}finally{session.cleanup.completedAt=now();record('e2b.cleanup_ended',{sessionId:session.id,cleanup:session.cleanup});}};
        const proxy={commands:{run:async(command,settings)=>{
          insist(FIXED_COMMANDS.has(command),'UNREVIEWED_SANDBOX_COMMAND');const entry={command,commandSha256:sha(command),timeoutMs:settings?.timeoutMs,requestTimeoutMs:settings?.requestTimeoutMs,startedAt:now()};session.commands.push(entry);record('e2b.command_started',{sessionId:session.id,...entry});
          try{const response=await sandbox.commands.run(command,settings);Object.assign(entry,{exitCode:response.exitCode,stdoutSha256:sha(String(response.stdout??'')),stderrSha256:sha(String(response.stderr??''))});return response;}
          catch(error){entry.errorCode=errorCode(error);throw error;}finally{entry.completedAt=now();record('e2b.command_ended',{sessionId:session.id,...entry});}
        }},files:{write:async(...args)=>{
          const entries=Array.isArray(args[0])?args[0]:[{path:args[0],data:args[1]}];
          for(const entry of entries){insist(WRITE_PATHS.has(entry.path),'UNREVIEWED_SANDBOX_WRITE');const bytes=byteValue(entry.data),digest=sha(bytes);if(['/home/user/document-input.bin','/home/user/trace-criteria/workbook.xlsx'].includes(entry.path))insist(manifest.inputs.some(input=>input.sha256===digest),'UNMANIFESTED_SANDBOX_ORIGINAL');session.writes.push({path:entry.path,sha256:digest,bytes:bytes.length});record('e2b.file_write',{sessionId:session.id,path:entry.path,sha256:digest,bytes:bytes.length});}
          return sandbox.files.write(...args);
        },read:async(remotePath,...args)=>{
          insist(READ_PATHS.has(remotePath)||/^\/home\/user\/document-image-\d+\.png$/.test(remotePath),'UNREVIEWED_SANDBOX_READ');const value=await sandbox.files.read(remotePath,...args),bytes=byteValue(value);insist(bytes.length<=32*1024*1024,'SANDBOX_ARTIFACT_TOO_LARGE');const reference=await artifact('e2b-'+session.id+'-'+path.posix.basename(remotePath),bytes);session.reads.push({path:remotePath,...reference});
          if(/^\/home\/user\/document-image-\d+\.png$/.test(remotePath)){const original=session.writes.find(write=>write.path==='/home/user/document-input.bin');insist(original,'DERIVED_IMAGE_WITHOUT_AUTHORED_SOURCE');binaryHashes.set(sha(bytes),{origin:'real-e2b-derived-image',sessionId:session.id,originalSha256:original.sha256,artifact:reference});}
          record('e2b.file_read',{sessionId:session.id,remotePath,...reference});return value;
        }}};
        record('e2b.provisioned',{sessionId:session.id,providerSandboxId:session.providerSandboxId,taskId:report.taskId});return work(proxy,report);
      },{...options,signal:combined(options.signal)});}
      catch(error){session.errorCode=errorCode(error);throw error;}
      finally{if(handle){handle.kill=priorKill;activeSessions--;}session.completedAt=now();session.status=session.errorCode?'error':'returned';record('e2b.ended',{sessionId:session.id,status:session.status,cleanup:session.cleanup});}
    });
    const app=createApp({config:runtime.config,gemini:observedGemini,withSandbox:observedSandbox,activityStore:runtime.activityStore,live:true,registerExports:false});
    engine=app.locals.engine;documents=app.locals.documents;
    unsubscribeActivity=runtime.activityStore.subscribe(value=>record('activity.snapshot',{value}));
    const ids={};
    const captureAnalysis=async id=>{
      const document=documents.get(ids[id]),analyzed=document.sandboxAnalysisResult;
      if(!analyzed)return;
      result.documents[id].analysis=await artifact('analysis-'+id+'.json',analyzed.analysis);
      result.documents[id].trusted=await artifact('trusted-'+id+'.json',Object.fromEntries(['id','name','kind','mime','source','sourceRows','sourceSheets','verificationPages','sandboxProfile','transcription','activityContext'].filter(key=>analyzed[key]!==undefined).map(key=>[key,analyzed[key]])));
    };
    await stage('ingest',async()=>{for(const input of manifest.inputs){const document=await documents.add({name:input.name,buffer:inputBytes.get(input.id),role:input.role});ids[input.id]=document.id;result.documents[input.id]={documentId:document.id,inputSha256:input.sha256,public:documents.public(document)};}insist(Object.keys(ids).length===5,'INGEST_INCOMPLETE');});
    await stage('criteria.prepare',async()=>{run=engine.start({mode:'criteria_first',criteriaDocumentIds:[ids.criteria]});unsubscribeRun=engine.subscribe(run,event=>record('run.event',{event}));await run.job;await snapshot('criteria-proposed');await captureAnalysis('criteria');insist(run.status==='awaiting_confirmation'&&run.criteria.length>0,'CRITERIA_PREREQUISITE_FAILED');},{depends:!!ids.criteria});
    await stage('criteria.revise',async()=>{result.revisionAction={feedback:USER_ACTIONS.revisionFeedback,expectedCriterionVersion:run.criterionVersion};engine.revise(run,result.revisionAction);await run.job;await snapshot('criteria-revised');insist(run.status==='awaiting_confirmation'&&!run.revisionError&&run.criteriaFeedback.at(-1)?.status==='completed','REVISION_PREREQUISITE_FAILED');},{depends:run?.status==='awaiting_confirmation'&&run.criteria.length>0});
    await stage('criteria.confirm',async()=>{
      // Direct edit derives from the real proposed criteria, never fabricated model output.
      insist(run.criteria.length===1,'ORDINARY_CRITERION_COUNT_UNEXPECTED');const edited=structuredClone(run.criteria);edited[0].label=USER_ACTIONS.directEditLabel;
      result.confirmAction={expectedCriterionVersion:run.criterionVersion,criteria:edited};engine.confirm(run,result.confirmAction);await snapshot('criteria-approved');result.approvedCriteriaSha256=sha(jsonBytes(run.approvedCriteria));insist(run.status==='awaiting_documents','APPROVAL_PREREQUISITE_FAILED');
    },{depends:run?.status==='awaiting_confirmation'&&!run?.revisionError&&run?.criteriaFeedback?.at(-1)?.status==='completed'});
    await stage('target.review',async()=>{engine.attachDocuments(run,{expectedCriterionVersion:run.criterionVersion,documentIds:[ids.target]});await run.job;await snapshot('target-reviewed');await captureAnalysis('target');insist(['completed','partial'].includes(run.status)&&run.items.length>0,'TARGET_PREREQUISITE_FAILED');},{depends:run?.status==='awaiting_documents'&&!!ids.target});
    const queuedGemini=Object.fromEntries(['generateText','generateJson'].map(method=>[method,request=>engine.queueModel(()=>observedGemini[method](request),request.signal)]));
    const exports=createExportService({documents,engine,gemini:queuedGemini,withSandbox:observedSandbox,activityStore:runtime.activityStore,config:runtime.config});
    await stage('exports',async()=>{for(const format of ['json','csv','xlsx'])result.exports[format]=await artifact('review.'+format,await exports[format](run));result.exports.sourceSnapshotSha256=sha(jsonBytes(engine.snapshot(run)));},{depends:['completed','partial'].includes(run?.status)&&!!run?.items?.length});
    await stage('dashboard',async()=>{
      const routes=new Map();exports.dashboard.registerRoutes({post:(url,handler)=>routes.set('POST '+url,handler),get:()=>{},delete:()=>{}});const handler=routes.get('POST /api/dashboards');insist(typeof handler==='function','DASHBOARD_ROUTE_MISSING');
      let status=200,body;const response={status(value){status=value;return this;},json(value){body=value;return this;}};
      const immutableBefore=sha(jsonBytes({approvedCriteria:run.approvedCriteria,items:run.items}));
      await handler({body:{runId:run.id,instruction:USER_ACTIONS.dashboardInstruction}},response);insist(status===202&&body?.id,'DASHBOARD_ADMISSION_FAILED');
      const job=exports.dashboard.jobs.get(body.id);insist(job?.work,'DASHBOARD_JOB_MISSING');await job.work;
      result.dashboard={admissionStatus:status,public:exports.dashboard.publicJob(job),sourceSnapshot:await artifact('dashboard-source-snapshot.json',job.snapshot),validation:job.validation??null,design:job.design??null,sourceImmutableBefore:immutableBefore,sourceImmutableAfter:sha(jsonBytes({approvedCriteria:run.approvedCriteria,items:run.items})),html:typeof job.html==='string'?await artifact('dashboard.html',job.html):null};
      // A standard fallback remains an observed fallback, never generated success.
      if(job.status!=='ready'||job.presentation!=='generated'||!job.validation)throw failure('GENERATED_DASHBOARD_NOT_OBSERVED');
    },{depends:['completed','partial'].includes(run?.status)&&!!run?.items?.length});
    for(const id of ['docx','pdf','png'])await stage('analysis.'+id,async()=>{
      await engine.ensureAnalyzed(documents.get(ids[id]),{signal:controller.signal,contextId:'synthetic-'+manifest.batch+'-'+id});await captureAnalysis(id);
    },{depends:!!ids[id]});
    if(run){await snapshot('final-run');result.approvedCriteriaFinalSha256=run.approvedCriteria?sha(jsonBytes(run.approvedCriteria)):null;}
  }catch(error){result.fatalErrorCode=errorCode(error);record('batch.error',{errorCode:result.fatalErrorCode});controller.abort(error);}
  finally{
    clearTimeout(timer);process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);
    // Await production promises, including finally/kill, before sealing evidence.
    if(controller.signal.aborted&&run)engine?.cancel(run);
    while(activeWork.size)await Promise.allSettled([...activeWork]);
    if(run?.job)await Promise.allSettled([run.job]);unsubscribeRun?.();unsubscribeActivity?.();
    try{
      result.activity=runtime?await artifact('activity-final.json',runtime.activityStore.snapshot()):null;
      const after=await ledgerFile(root);result.ledger.after=ledgerProjection(after.value);
      const previous=before.value.calls,newCalls=after.value.calls.slice(previous.length);
      result.continuity={originalPermissionUnchanged:(await digestFile(root,PERMISSION)).sha256===manifest.originalDocumentPermission.sha256,ledgerPrefixUnchanged:sha(jsonBytes(after.value.calls.slice(0,previous.length)))===sha(jsonBytes(previous)),newLedgerCallsMatchAdmissions:newCalls.length===admitted&&newCalls.every(call=>tokenRecords.has(call.id)),noPendingReservations:Object.keys(after.value.reservations).length===0,strictBudgetUnderLimit:after.value.settledKrw<40000,codeHashesUnchanged:false,inputHashesUnchanged:true};
      await checkCode(root,manifest.codeHashes);result.continuity.codeHashesUnchanged=true;
      for(const input of manifest.inputs)if((await digestFile(root,input.path)).sha256!==input.sha256)result.continuity.inputHashesUnchanged=false;
      result.providerTotals={geminiAdmissions:admitted,sandboxAttempts:attemptedSessions,maxActiveModels,maxActiveSessions,newSettledUpperEstimateKrw:Math.round((after.value.settledKrw-before.value.settledKrw)*100)/100,cumulativeGeminiUpperEstimateKrw:after.value.settledKrw,e2bPricingIncluded:false};
      insist(Object.values(result.continuity).every(value=>value===true),'EVIDENCE_CONTINUITY_FAILED');
    }catch(error){result.sealingErrorCode=errorCode(error);}
    const cleanupComplete=result.sessions.every(session=>session.providerSandboxId&&session.cleanup.attempts===1&&session.cleanup.status==='resolved');
    result.executionStatus=!result.fatalErrorCode&&!result.sealingErrorCode&&!result.traceWriteFailed&&!controller.signal.aborted&&cleanupComplete&&result.stages.length===10&&result.stages.every(s=>s.status==='observed')?'observations-complete':'incomplete';
    result.cleanupAllObserved=cleanupComplete;result.completedAt=now();record('batch.ended',{executionStatus:result.executionStatus,admitted,attemptedSessions});
    result.trace=await digestFile(root,relative(root,tracePath));await writeFile(path.join(root,output,'result.json'),jsonBytes(result),{flag:'wx'});
  }
  return {executionStatus:result.executionStatus,result:output+'/result.json',trace:output+'/trace.ndjson',geminiAdmissions:admitted,fullGateCasesPassed:0};
}

async function main() {
  const args=process.argv.slice(2),root=await realpath(process.cwd());
  insist(normalized(fileURLToPath(import.meta.url))===normalized(path.join(root,ENTRY)),'DRAFT_NOT_EXECUTABLE_PROMOTION_REQUIRED');
  insist(process.versions.node==='24.13.1'&&normalized(process.execPath)===normalized(path.join(root,PINNED_NODE)),'PINNED_NODE_REQUIRED');
  const nodeDirectory=path.dirname(process.execPath);
  process.env.PATH=[nodeDirectory,...String(process.env.PATH??'').split(path.delimiter).filter(value=>normalized(value)!==normalized(nodeDirectory))].join(path.delimiter);
  if(args[0]==='--prepare'&&args.length===3&&args[1]==='--batch')return prepare(root,args[2]);
  if(args[0]==='--execute'&&args.length===6&&args[1]==='--manifest'&&args[3]==='--manifest-sha256'&&args[5]==='--acknowledge-live-synthetic')return execute(root,args[2],args[4]);
  throw failure('EXPLICIT_PREPARE_OR_AUTHORIZED_EXECUTE_REQUIRED');
}
if(process.argv[1]&&normalized(process.argv[1])===normalized(fileURLToPath(import.meta.url))) {
  main().then(value=>{process.stdout.write(JSON.stringify(value)+'\n');if(value.executionStatus==='incomplete')process.exitCode=1;}).catch(error=>{process.stderr.write(JSON.stringify({errorCode:errorCode(error),liveExecutionNotAutomaticallyRetried:true})+'\n');process.exitCode=1;});
}

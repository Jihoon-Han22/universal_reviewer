// Opt-in live evidence runner. The parent agent must inspect and execute this file.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const planRelative='.cache/rebuild/live/loop-003/document-plan-xlsx-01.json';
const reportRoot='.cache/rebuild/live/loop-003/document-attempts';
const permissionRelative='.cache/rebuild/live/document-permission.json';
const leaseRelative='.cache/rebuild/live/document-run.lock';
let schemas,diagnostics;
const approvedInputs=['golden/certs/P01.pdf','golden/criteria/C05.xlsx'];
const selectedInputs=['golden/criteria/C05.xlsx'];
const codePaths=[
  'scripts/live-document-check.mjs','scripts/provider-runtime.mjs','scripts/provider-budget.mjs',
  'server/documents.mjs','server/document-analyzer.mjs','server/sandbox-documents.mjs',
  'server/sandbox-document-reader.py','server/document-sandbox-resources.mjs',
  'server/document-source.mjs','server/document-quality.mjs','server/document-requery.mjs',
  'server/document-diagnostics.mjs',
  'server/document-requery.py','server/visual-transcription.mjs','server/visual-quality-judge.mjs',
  'server/criteria-sandbox.mjs','server/criteria-workbook-validation.mjs','server/criteria-workbook-profile.py',
  'server/pipeline-prompts.mjs','server/algorithms.mjs','server/criteria-normalization.mjs',
  'server/table-records.mjs','server/field-extraction.mjs','server/criterion-applicability.mjs',
  'server/conditions.mjs','server/missing-result.mjs',
  'integrations/src/index.mjs','integrations/src/gemini.mjs','integrations/src/sandbox.mjs',
  'integrations/src/task-pool.mjs','integrations/src/activity.mjs','integrations/src/config.mjs',
  'integrations/src/command-progress.mjs','integrations/src/errors.mjs',
  'package.json','package-lock.json','integrations/package.json','integrations/package-lock.json',
];
const versionCommand="python -c \"import sys,json,importlib.metadata as m; print(json.dumps({'python':sys.version.split()[0],'openpyxl':m.version('openpyxl'),'python-docx':m.version('python-docx'),'PyMuPDF':m.version('PyMuPDF'),'Pillow':m.version('Pillow')}))\"";
const expectedVersions={openpyxl:'3.1.5','python-docx':'1.1.2',PyMuPDF:'1.26.4',Pillow:'11.3.0'};
const now=()=>new Date().toISOString();
const digest=value=>createHash('sha256').update(value).digest('hex');
const plainCode=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(value)?value:undefined;
function requireEvidence(id,condition){if(!condition)throw Object.assign(new Error(id),{name:'EvidenceAssertionError',evidenceCheck:id});}
function safeFailure(error){return {name:plainCode(error?.name)||'Error',...(plainCode(error?.code)?{code:error.code}:{}),...(plainCode(error?.evidenceCheck)?{check:error.evidenceCheck}:{}),...(['gemini','e2b','config'].includes(error?.service)?{service:error.service}:{}),...(Number.isInteger(error?.status)?{status:error.status}:{}),...(diagnostics?{frames:diagnostics.safeInternalFrames(error,root,codePaths)}:{})};}
function numericUsage(usage){const result={};for(const key of ['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','cachedContentTokenCount','totalTokenCount','toolUsePromptTokenCount'])if(Number.isSafeInteger(usage?.[key])&&usage[key]>=0)result[key]=usage[key];return result;}
function coverageSummary(coverage={}){const result={};for(const key of ['complete','readerComplete','contextComplete','truncated','sourceTruncated','visualAnalysisPending'])if(typeof coverage[key]==='boolean')result[key]=coverage[key];for(const key of ['unitsTotal','unitsRead','cellsTotal','cellsRead','textChars','rowsRead','missingFormulaCaches','contextSegmentsTotal','contextSegmentsRead','initialContextSegmentsRead','sourceChars','contextChars'])if(coverage[key]===null||Number.isFinite(coverage[key]))result[key]=coverage[key];result.truncatedReasonCount=coverage.truncatedReasons?.length||0;result.truncatedReasonCodes=[...new Set((coverage.truncatedReasons||[]).map(value=>diagnostics?.readerReasonCode(value)||'UNCLASSIFIED_READER_WARNING'))];result.missingContextSheetCount=coverage.missingContextSheets?.length||0;return result;}
function qualitySummary(quality){if(!quality)return null;return {status:quality.status,attempts:quality.attempts,maxAttempts:quality.maxAttempts,...(plainCode(quality.stopReason)?{stopReason:quality.stopReason}:{}),issueCount:quality.issues?.length||0,rounds:(quality.rounds||[]).map(round=>({attempt:round.attempt,status:round.status,issueCount:round.issueCount,rereadRangeCount:round.rereadRanges?.length||0}))};}
function classifyModel(request){
  if(request.schema===schemas.documentContextSchema&&request.maxOutputTokens===9000)return 'context_initial';
  if(request.schema===schemas.documentContextReviewSchema&&request.maxOutputTokens===6000)return 'context_verifier';
  if(request.schema===schemas.documentContextSchema&&request.maxOutputTokens===12000)return 'context_replacement';
  if(request.schema===schemas.visualTranscriptionSchema&&request.maxOutputTokens===16384)return 'visual_transcription';
  if(request.schema===schemas.visualQualityJudgeSchema&&request.maxOutputTokens===4000)return 'visual_judge';
  throw Object.assign(new Error('UNPLANNED_MODEL_PHASE'),{evidenceCheck:'UNPLANNED_MODEL_PHASE'});
}
function classifyCommand(command){if(command===versionCommand)return 'runtime_versions';if(command.startsWith('python -m pip install --disable-pip-version-check --no-input '))return 'parser_install';if(/^python \/home\/user\/document-reader\.py \/home\/user\/document-input\.bin (pdf|xlsx) \/home\/user\/document-profile\.json$/.test(command))return 'trusted_reader';if(/^python \/home\/user\/document-requery\.py \/home\/user\/document-input\.bin (pdf|xlsx) \/home\/user\/document-requests\.json \/home\/user\/document-requery\.json$/.test(command))return 'trusted_reread';throw Object.assign(new Error('UNPLANNED_SANDBOX_COMMAND'),{evidenceCheck:'UNPLANNED_SANDBOX_COMMAND'});}
function fileKind(file){if(file==='/home/user/document-input.bin')return 'original';if(file==='/home/user/document-profile.json')return 'profile';if(file==='/home/user/document-reader.py')return 'trusted_reader_program';if(file==='/home/user/document-requery.py')return 'trusted_reread_program';if(file==='/home/user/document-requests.json')return 'selectors';if(file==='/home/user/document-requery.json')return 'reread';if(/^\/home\/user\/document-image-\d+\.png$/.test(file))return 'page_or_embedded_image';return 'unplanned';}
function activitySummary(snapshot){return {revision:snapshot.revision,tasks:(snapshot.tasks||[]).map(task=>({id:task.id,runtime:task.runtime,kind:task.kind,status:task.status,phase:task.phase,startedAt:task.startedAt,updatedAt:task.updatedAt,...(task.parentTaskId?{parentTaskId:task.parentTaskId}:{}),eventCount:task.events?.length||0,history:task.history,events:(task.events||[]).map(event=>({time:event.time,step:event.step,status:event.status}))}))};}

export function validateRunAuthorization(plan,permission,{priorRequests,priorPaths,foundPaths}){
  requireEvidence('PERMISSION_GRANTED',permission.granted===true&&JSON.stringify(permission.inputs)===JSON.stringify(approvedInputs));
  requireEvidence('PLAN_APPROVED_SELECTION',JSON.stringify(plan.inputs.map(value=>value.path))===JSON.stringify(selectedInputs));
  requireEvidence('PERMISSION_DESTINATIONS',JSON.stringify(permission.destinations)===JSON.stringify(['Gemini API','E2B sandbox']));
  requireEvidence('PERMISSION_REMAINING_CAP',permission.maximumGeminiDocumentRequests===12&&permission.usedGeminiDocumentRequests===2&&permission.remainingGeminiDocumentRequests===10&&plan.limits.totalModelRequests===6&&plan.limits.totalModelRequests<=permission.remainingGeminiDocumentRequests);
  requireEvidence('PERMISSION_PRIOR_SET',JSON.stringify(permission.attempts.map(value=>value.path))===JSON.stringify(priorPaths));
  requireEvidence('NO_UNACCOUNTED_ATTEMPTS',JSON.stringify([...foundPaths].sort())===JSON.stringify([...priorPaths].sort()));
  requireEvidence('PRIOR_REQUEST_TOTAL',priorRequests===permission.usedGeminiDocumentRequests);
}

async function main(expectedPlanHash){
  const planBytes=await fs.readFile(path.join(root,planRelative));
  requireEvidence('REVIEWED_PLAN_HASH',digest(planBytes)===expectedPlanHash);
  const plan=JSON.parse(planBytes);
  requireEvidence('PLAN_PROFILE',plan.acceptanceProfile==='CURRENT_REPRODUCTION'&&plan.executionStatus==='NOT_RUN');
  requireEvidence('PLAN_EXACT_INPUTS',JSON.stringify(plan.inputs.map(value=>value.path))===JSON.stringify(selectedInputs));
  requireEvidence('PLAN_REQUEST_CAP',plan.limits.totalModelRequests===6&&plan.limits.modelRequestsPerDocument===6&&plan.limits.physicalSessions===1&&plan.limits.sequentialDocuments===1);
  requireEvidence('PLAN_OUTPUT_ROOT',plan.resultRoot===reportRoot);
  requireEvidence('PLAN_EXACT_CODE_SET',JSON.stringify(Object.keys(plan.codeHashes||{}).sort())===JSON.stringify([...codePaths].sort()));
  const attemptId=now().replace(/[:.]/g,'-')+'-'+randomUUID();
  const attemptRelative=reportRoot+'/'+attemptId,reportRelative=attemptRelative+'/document-check.json',reportPath=path.join(root,reportRelative);
  await fs.mkdir(path.join(root,reportRoot),{recursive:true});
  // An exclusive unique directory prevents one attempt from overwriting another.
  await fs.mkdir(path.join(root,attemptRelative));
  const reservation=await fs.open(reportPath,'wx');await reservation.close();
  const report={schemaVersion:1,attemptId,acceptanceProfile:'CURRENT_REPRODUCTION',origin:'live-provider',scope:'Actual DocumentStore -> createDocumentAnalyzer.analyze for the approved C05 multi-sheet XLSX only. No PDF retry, criteria discovery, eligibility, fields, review, approval, or oracle comparison.',unverified:['PDF-P01 analysis success'],status:'running',startedAt:now(),command:[process.execPath,...process.argv.slice(1)],planHash:digest(planBytes),codeHashes:{},inputs:[],cases:[],modelRequests:[],sessions:[],limits:plan.limits};
  const persist=()=>fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  let runtime,unsubscribe,activeCase,lease,activeOperations=0,maximumActiveOperations=0;
  const eventCounters={snapshots:0,byRuntime:{},byStatus:{},uniqueTasks:0};
  const seenTasks=new Map();
  const enter=()=>{activeOperations++;maximumActiveOperations=Math.max(maximumActiveOperations,activeOperations);requireEvidence('NO_CONCURRENT_PROVIDER_OPERATIONS',activeOperations===1);};
  const leave=()=>{activeOperations--;};
  try{
    lease=await fs.open(path.join(root,leaseRelative),'wx');
    for(const file of codePaths){report.codeHashes[file]=digest(await fs.readFile(path.join(root,file)));requireEvidence('PREEXECUTION_CODE_HASH',report.codeHashes[file]===plan.codeHashes[file]);}
    const originals=[];
    for(const input of plan.inputs){const buffer=await fs.readFile(path.join(root,input.path));requireEvidence('INPUT_HASH_'+input.id,digest(buffer)===input.sha256);requireEvidence('INPUT_SIZE_'+input.id,buffer.length===input.bytes);originals.push(buffer);report.inputs.push({id:input.id,path:input.path,kind:input.kind,bytes:buffer.length,sha256:digest(buffer)});}
    const permissionBytes=await fs.readFile(path.join(root,permissionRelative));
    requireEvidence('PERMISSION_HASH',digest(permissionBytes)===plan.permission.sha256);
    const permission=JSON.parse(permissionBytes);
    const priorPaths=plan.permission.priorAttempts.map(value=>value.path),foundPaths=[];
    let priorRequests=0;
    for(const prior of plan.permission.priorAttempts){requireEvidence('PRIOR_ATTEMPT_PATH',/^\.cache\/rebuild\/live\/loop-\d{3}\/document-attempts\/[A-Za-z0-9-]+\/document-check\.json$/.test(prior.path));const bytes=await fs.readFile(path.join(root,prior.path));requireEvidence('PRIOR_ATTEMPT_HASH',digest(bytes)===prior.sha256);const data=JSON.parse(bytes);requireEvidence('PRIOR_ATTEMPT_REQUESTS',data.modelRequests.length===prior.requests);priorRequests+=data.modelRequests.length;}
    for(const loop of await fs.readdir(path.join(root,'.cache/rebuild/live'),{withFileTypes:true})){if(!loop.isDirectory()||!/^loop-\d{3}$/.test(loop.name))continue;const relative='.cache/rebuild/live/'+loop.name+'/document-attempts';let attempts;try{attempts=await fs.readdir(path.join(root,relative),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}for(const attempt of attempts){if(!attempt.isDirectory())continue;const candidate=relative+'/'+attempt.name+'/document-check.json';if(candidate!==reportRelative)foundPaths.push(candidate);}}
    validateRunAuthorization(plan,permission,{priorRequests,priorPaths,foundPaths});
    report.authorization={permissionSha256:digest(permissionBytes),priorAttempts:plan.permission.priorAttempts,priorRequests,maximumDocumentRequests:12,remainingBefore:10,thisAttemptMaximum:6};
    const [{createServiceRuntime},{DocumentStore},{createDocumentAnalyzer},promptModule,{publicConfig},diagnosticModule]=await Promise.all([import('./provider-runtime.mjs'),import('../server/documents.mjs'),import('../server/document-analyzer.mjs'),import('../server/pipeline-prompts.mjs'),import('../integrations/src/index.mjs'),import('../server/document-diagnostics.mjs')]);
    diagnostics=diagnosticModule;
    schemas=promptModule.schemas;
    runtime=createServiceRuntime({live:true});
    report.config=publicConfig(runtime.config);report.template=runtime.config.e2bTemplate;report.nodeVersion=process.version;
    report.budgetBefore=await runtime.budgetGuard.snapshot();
    requireEvidence('NO_PENDING_BUDGET',report.budgetBefore.pending===0);
    requireEvidence('EXCLUSIVE_USER_BUDGET',report.budgetBefore.settledUpperEstimateKrw+report.budgetBefore.reservedKrw<50000);
    requireEvidence('NO_PREEXISTING_ACTIVE_TASKS',!(runtime.activityStore.snapshot().tasks||[]).some(task=>['queued','running'].includes(task.status)));
    unsubscribe=runtime.activityStore.subscribe(()=>{eventCounters.snapshots++;for(const task of runtime.activityStore.snapshot().tasks||[])seenTasks.set(task.id,{runtime:task.runtime,status:task.status});});
    await persist();
    const observedGemini={generateJson:async request=>{
      const phase=classifyModel(request),limits={context_initial:1,context_verifier:3,context_replacement:2,visual_transcription:3,visual_judge:3};
      requireEvidence('MODEL_TOTAL_CAP',report.modelRequests.length<plan.limits.totalModelRequests);
      requireEvidence('MODEL_DOCUMENT_CAP',activeCase.modelRequestCount<plan.limits.modelRequestsPerDocument);
      requireEvidence('MODEL_PHASE_CAP',(activeCase.phaseCounts[phase]||0)<limits[phase]);
      requireEvidence('MODEL_DOCUMENT_PHASE',activeCase.kind==='pdf'?phase.startsWith('visual_'):phase.startsWith('context_'));
      const entry={index:report.modelRequests.length+1,caseId:activeCase.id,phase,role:request.role,maxOutputTokens:request.maxOutputTokens,requestedAt:now(),status:'running'};
      report.modelRequests.push(entry);activeCase.modelRequestCount++;activeCase.phaseCounts[phase]=(activeCase.phaseCounts[phase]||0)+1;
      enter();
      try{const response=await runtime.gemini.generateJson(request);entry.status='completed';entry.model=plainCode(response.model);entry.usage=numericUsage(response.usage);if(phase==='visual_transcription')entry.responseShape=diagnostics.visualTranscriptionShape(response.data);else if(phase.startsWith('context_'))entry.responseShape=diagnostics.contextResponseShape(response.data,{review:phase==='context_verifier'});return response;}
      catch(error){entry.status='failed';entry.error=safeFailure(error);throw error;}
      finally{entry.endedAt=now();leave();}
    }};
    const observedSandbox=async(work,options={})=>{
      requireEvidence('SANDBOX_SESSION_CAP',report.sessions.length<plan.limits.physicalSessions);
      const entry={index:report.sessions.length+1,caseId:activeCase.id,requestedAt:now(),status:'requested',commands:[],fileOperations:[],originalUploads:0};report.sessions.push(entry);
      try{const result=await runtime.withSandbox(async(handle,reportActivity)=>{
        entry.enteredAt=now();entry.status='running';
        const proxy={commands:{run:async(command,commandOptions)=>{
          const kind=classifyCommand(command),operation={kind,commandSha256:digest(command),requestedAt:now(),timeoutMs:commandOptions?.timeoutMs,status:'running'};entry.commands.push(operation);
          requireEvidence('COMMAND_COUNT_CAP',entry.commands.length<=5);enter();
          try{const result=await handle.commands.run(command,commandOptions);operation.exitCode=result.exitCode;operation.status=result.exitCode===0?'completed':'failed';operation.stdoutBytes=Buffer.byteLength(result.stdout||'');operation.stderrBytes=Buffer.byteLength(result.stderr||'');return result;}
          catch(error){operation.status='failed';operation.error=safeFailure(error);throw error;}
          finally{operation.endedAt=now();leave();}
        }},files:{write:async(file,data)=>{
          const writes=Array.isArray(file)?file:[{path:file,data}];
          for(const write of writes){const kind=fileKind(write.path);requireEvidence('WRITE_PATH_ALLOWLIST',kind!=='unplanned');entry.fileOperations.push({operation:'write',kind,requestedAt:now()});if(kind==='original'){entry.originalUploads++;requireEvidence('ORIGINAL_SINGLE_UPLOAD',entry.originalUploads===1);const bytes=Buffer.from(write.data);requireEvidence('UPLOADED_ORIGINAL_HASH',digest(bytes)===activeCase.inputSha256);entry.uploadedOriginalSha256=digest(bytes);}}
          return Array.isArray(file)?handle.files.write(file):handle.files.write(file,data);
        },read:async(file,readOptions)=>{const kind=fileKind(file);requireEvidence('READ_PATH_ALLOWLIST',kind!=='unplanned');entry.fileOperations.push({operation:'read',kind,requestedAt:now()});const result=await(readOptions?handle.files.read(file,readOptions):handle.files.read(file));if(kind==='profile'){const profile=JSON.parse(result);entry.physicalRead={status:profile.status,coverage:coverageSummary(profile.coverage),warningCodes:[...new Set((profile.warnings||[]).map(diagnostics.readerReasonCode))],warningCount:profile.warnings?.length||0};requireEvidence('COMPLETE_READER_BEFORE_MODEL',profile.coverage?.complete===true&&profile.coverage?.truncated!==true);}return result;}}};
        const result=await work(proxy,reportActivity);
        entry.readerStage={kind:result.profile?.kind,sha256:result.profile?.sha256,status:result.profile?.status,coverage:coverageSummary(result.profile?.coverage),analysisCoverage:coverageSummary(result.analysis?.coverage),sheetCount:result.profile?.sheets?.length||0,pageCount:result.profile?.inventory?.pageCount||0,warningCount:result.profile?.warnings?.length||0,warningCodes:[...new Set((result.profile?.warnings||[]).map(diagnostics.readerReasonCode))]};
        requireEvidence('READER_ORIGINAL_IDENTITY',result.profile?.sha256===activeCase.inputSha256&&result.profile?.kind===activeCase.kind);
        if(activeCase.kind==='pdf'){requireEvidence('PDF_PHYSICAL_PAGE_COUNT',result.profile?.inventory?.pageCount===1);requireEvidence('PDF_CONTEXT_PENDING_BEFORE_VLM',result.analysis?.coverage?.visualAnalysisPending===true&&result.analysis?.coverage?.contextComplete===false);requireEvidence('NO_VLM_BEFORE_SANDBOX_CLEANUP',activeCase.modelRequestCount===0);}
        else{requireEvidence('XLSX_PHYSICAL_SHEET_COUNT',result.profile?.inventory?.sheetCount===3&&result.profile?.sheets?.length===3);requireEvidence('XLSX_SOURCE_SEGMENT_BOUND',result.analysis?.coverage?.contextSegmentsTotal===1);}
        const versions=await proxy.commands.run(versionCommand,{timeoutMs:15000,requestTimeoutMs:20000});
        requireEvidence('REMOTE_VERSION_COMMAND',versions.exitCode===0);
        const parsed=JSON.parse(versions.stdout.trim());entry.versions={};
        for(const key of ['python',...Object.keys(expectedVersions)]){requireEvidence('REMOTE_VERSION_SHAPE',typeof parsed[key]==='string'&&/^\d+\.\d+\.\d+(?:[a-z0-9.+-]*)?$/.test(parsed[key]));entry.versions[key]=parsed[key];}
        for(const [key,value] of Object.entries(expectedVersions))requireEvidence('PINNED_REMOTE_'+key,parsed[key]===value);
        entry.workEndedAt=now();return result;
      },options);
        entry.status='completed';entry.cleanupConfirmed=true;return result;
      }catch(error){entry.status='failed';entry.error=safeFailure(error);entry.cleanupConfirmed=false;throw error;}
      finally{entry.endedAt=now();}
    };
    const analyzer=createDocumentAnalyzer({gemini:observedGemini,withSandbox:observedSandbox,activityStore:runtime.activityStore}),documents=new DocumentStore();
    for(let index=0;index<plan.inputs.length;index++){
      const input=plan.inputs[index];activeCase={id:input.id,kind:input.kind,inputSha256:input.sha256,startedAt:now(),status:'running',modelRequestCount:0,phaseCounts:{},reportedEvents:0};report.cases.push(activeCase);await persist();
      try{
        const document=await documents.add({name:path.basename(input.path),buffer:originals[index],role:input.role});
        requireEvidence('DOCUMENT_STORE_BYTES',digest(document.buffer)===input.sha256);
        const analyzed=await analyzer.analyze(document,{runId:randomUUID(),contextId:document.id,report:()=>{activeCase.reportedEvents++;}});
        const coverage=analyzed.analysis?.coverage;
        activeCase.actual={readerStatus:analyzed.sandboxProfile?.status,analysisStatus:analyzed.analysis?.status,coverage:coverageSummary(coverage),quality:qualitySummary(analyzed.analysis?.quality),structureCount:analyzed.analysis?.structure?.length||0,warningCount:analyzed.analysis?.warnings?.length||0,questionCount:analyzed.analysis?.questions?.length||0,needsConfirmation:analyzed.analysis?.needsConfirmation,retainedSourceSheetCount:analyzed.sourceSheets?.length||0,retainedVerificationPageCount:analyzed.verificationPages?.length||0};
        if(analyzed.transcription){activeCase.actual.transcription={coverage:analyzed.transcription.coverage,requiresConfirmation:analyzed.transcription.requiresConfirmation,pageCount:analyzed.transcription.pages.length,blockCount:analyzed.transcription.pages.reduce((n,p)=>n+p.blocks.length,0),tableCount:analyzed.transcription.pages.reduce((n,p)=>n+p.tables.length,0),issueCount:analyzed.transcription.issueDetails?.length||0,quality:qualitySummary(analyzed.transcription.quality)};}
        requireEvidence('ORIGINAL_BYTES_RETAINED',digest(analyzed.buffer)===input.sha256);
        requireEvidence('PHYSICAL_READER_COMPLETE',analyzed.sandboxProfile?.coverage?.complete===true&&coverage?.readerComplete===true);
        requireEvidence('CONTEXT_COMPLETE_DISTINCT_FROM_READ',coverage?.contextComplete===true&&coverage?.complete===true&&analyzed.analysis?.status==='complete');
        requireEvidence('NO_UNRESOLVED_ANALYSIS',analyzed.analysis?.needsConfirmation===false&&analyzed.analysis?.quality?.status==='verified');
        requireEvidence('NO_SOURCE_TRUNCATION',coverage?.sourceTruncated!==true&&coverage?.truncated!==true&&!(coverage?.missingContextSheets?.length));
        const session=report.sessions.find(value=>value.caseId===input.id);
        requireEvidence('ONE_CLEANED_PHYSICAL_SESSION',report.sessions.filter(value=>value.caseId===input.id).length===1&&session?.cleanupConfirmed===true&&session.originalUploads===1);
        requireEvidence('ONE_TRUSTED_READ_AND_INSTALL',session.commands.filter(value=>value.kind==='trusted_reader').length===1&&session.commands.filter(value=>value.kind==='parser_install').length===1);
        if(input.kind==='pdf'){
          requireEvidence('PDF_COMPLETE_VISUAL_COVERAGE',analyzed.transcription?.coverage?.complete===true&&analyzed.transcription.coverage.expectedPages===1&&analyzed.transcription.coverage.missingPages.length===0&&coverage.visualAnalysisPending===false);
          requireEvidence('PDF_ORIGINAL_MODEL_PART',analyzed.modelParts.some(part=>part.inlineData?.mimeType==='application/pdf'&&digest(Buffer.from(part.inlineData.data,'base64'))===input.sha256));
          requireEvidence('INDEPENDENT_VISUAL_JUDGE',activeCase.phaseCounts.visual_transcription>=1&&activeCase.phaseCounts.visual_judge>=1);
          requireEvidence('VLM_AFTER_PHYSICAL_CLEANUP',report.modelRequests.filter(value=>value.caseId===input.id).every(value=>Date.parse(value.requestedAt)>=Date.parse(session.endedAt)));
        }else{
          requireEvidence('ALL_XLSX_SHEETS_RETAINED',analyzed.sourceSheets?.length===3);
          requireEvidence('INITIAL_AND_INDEPENDENT_CONTEXT_CALLS',activeCase.phaseCounts.context_initial===1&&activeCase.phaseCounts.context_verifier>=1);
          requireEvidence('CONTEXT_WITHIN_SAME_PHYSICAL_SESSION',report.modelRequests.filter(value=>value.caseId===input.id).every(value=>Date.parse(value.requestedAt)>=Date.parse(session.enteredAt)&&Date.parse(value.endedAt)<=Date.parse(session.workEndedAt)));
        }
        activeCase.status='pass';
      }catch(error){activeCase.status='fail';activeCase.error=safeFailure(error);}
      activeCase.endedAt=now();activeCase.budgetAfter=await runtime.budgetGuard.snapshot();await persist();
      if(activeCase.status!=='pass')break;
    }
    for(const input of plan.inputs)if(!report.cases.some(value=>value.id===input.id))report.cases.push({id:input.id,kind:input.kind,status:'not_run',reason:'prior_case_failed'});
    report.maximumActiveCommandOrModelOperations=maximumActiveOperations;
    requireEvidence('ALL_CASES_COMPLETE',report.cases.length===1&&report.cases.every(value=>value.status==='pass'));
    requireEvidence('PROVIDER_SERIALIZATION',maximumActiveOperations===1&&activeOperations===0);
    report.status='pass';
  }catch(error){report.status='fail';report.error=safeFailure(error);}
  finally{
    unsubscribe?.();
    if(runtime){try{report.budgetAfter=await runtime.budgetGuard.snapshot();if(report.budgetAfter.pending!==0||report.budgetAfter.settledUpperEstimateKrw+report.budgetAfter.reservedKrw>=50000){report.status='fail';report.budgetInvariantFailed=true;}}catch(error){report.status='fail';report.budgetError=safeFailure(error);}report.activity=activitySummary(runtime.activityStore.snapshot());}
    for(const task of seenTasks.values()){eventCounters.byRuntime[task.runtime]=(eventCounters.byRuntime[task.runtime]||0)+1;eventCounters.byStatus[task.status]=(eventCounters.byStatus[task.status]||0)+1;}eventCounters.uniqueTasks=seenTasks.size;report.activityCounts=eventCounters;
    report.maximumActiveCommandOrModelOperations=maximumActiveOperations;report.endedAt=now();
    if(report.authorization){report.authorization.requestsThisAttempt=report.modelRequests.length;report.authorization.remainingAfter=12-report.authorization.priorRequests-report.modelRequests.length;}
    report.notRun=['PDF retry; PDF analysis success remains unverified','criteria eligibility','workbook criterion discovery','criterion revision/approval','target fact extraction','verdict proposal/normalization','oracle comparison'];
    if(lease){try{await lease.close();await fs.unlink(path.join(root,leaseRelative));}catch(error){report.status='fail';report.leaseError=safeFailure(error);}}
    await persist();
    console.log(JSON.stringify({status:report.status,cases:report.cases.map(value=>({id:value.id,status:value.status})),modelRequests:report.modelRequests.length,sessions:report.sessions.length,budget:report.budgetAfter,artifact:reportRelative}));
    if(report.status!=='pass')process.exitCode=1;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length===5&&process.argv[2]==='--execute'&&process.argv[3]==='--plan-sha256'&&/^[a-f0-9]{64}$/.test(process.argv[4]))await main(process.argv[4]).catch(error=>{console.error(JSON.stringify({status:'fail',error:safeFailure(error)}));process.exitCode=1;});
  else{console.log(JSON.stringify({status:'not_run',plan:planRelative,command:['node','scripts/live-document-check.mjs','--execute','--plan-sha256','<reviewed-plan-sha256>'],reason:'Explicit execution flag and reviewed plan SHA256 required. This invocation made no provider requests.'}));if(process.argv.length>2)process.exitCode=1;}
}

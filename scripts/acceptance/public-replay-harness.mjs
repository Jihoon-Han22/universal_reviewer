// Test-only transport replay around the actual document analyzer and engine.
// Default mode is preparation checking. Product imports happen only after every
// case has physical artifacts, reviewed response fixtures, and frozen assertions.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {snapshotImplementation} from '../../architecture/validation/acceptance.mjs';
import {HASH,ref,readRef,writeJson,sha256,jsonPointer,compare} from './shared.mjs';
import {observeSamples} from './sample-observer.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const IDS=['baseline','shift','columns','transpose','blocks-hidden','renamed','scaled-both','changed-values','incompatible-unit','missing-required','unreadable','condition-mismatch','csv'].map(value=>`G08:${value}`);
const denyEvaluator=name=>{if(typeof name!=='string'||/(^|[\\/])evaluator([\\/]|$)|(^|[\\/])oracle\.json$/i.test(name))throw new Error('REPLAY_EVALUATOR_ACCESS_FORBIDDEN');};
async function artifact(root,reference){denyEvaluator(reference?.path);return readRef(root,reference);}
const bytes=value=>Buffer.isBuffer(value)?value:value instanceof ArrayBuffer?Buffer.from(value):ArrayBuffer.isView(value)?Buffer.from(value.buffer,value.byteOffset,value.byteLength):Buffer.from(String(value));

export async function checkReplayPreparation(plan,{root=ROOT}={}){
  const issues=[];
  let original;
  try{original=JSON.parse(await artifact(root,plan.inputManifestRef));await artifact(root,plan.authoredManifestRef);}catch(error){issues.push(error.message);}
  if(plan.schemaVersion!=='1.0'||plan.acceptanceProfile!=='CURRENT_REPRODUCTION')issues.push('PLAN_PROFILE_INVALID');
  if(!Array.isArray(plan.cases)||plan.cases.length!==13||new Set(plan.cases.map(c=>c.caseId)).size!==13||IDS.some(id=>!plan.cases.some(c=>c.caseId===id)))issues.push('ALL_THIRTEEN_CASES_REQUIRED');
  if(!HASH.test(plan.codeDigest??''))issues.push('IMPLEMENTATION_NOT_FROZEN');
  if(!plan.preparedAt||!Number.isFinite(Date.parse(plan.preparedAt)))issues.push('PLAN_TIME_MISSING');
  if(!Array.isArray(plan.physicalProgramReferences)||!plan.physicalProgramReferences.length)issues.push('PHYSICAL_PROGRAM_IDENTITY_MISSING');
  else for(const reference of plan.physicalProgramReferences)try{await artifact(root,reference);}catch(error){issues.push(`PHYSICAL_PROGRAM_NOT_REUSABLE:${reference.path}:${error.message}`);}
  for(const definition of plan.cases??[]){
    const pending=[];
    const source=original?.cases?.find(c=>c.caseId===definition.caseId);
    if(!source||!isDeepStrictEqual(source.inputs,definition.inputs)||!isDeepStrictEqual(source.request,definition.request)||source.inputDirectory!==definition.inputDirectory)pending.push('ORIGINAL_INPUT_SCOPE_MISMATCH');
    try{await artifact(root,definition.authoredDraftRef);for(const input of definition.inputs??[])await artifact(root,input.input);}catch(error){pending.push(error.message);}
    if(definition.state!=='prepared'||definition.semanticReview?.reviewed!==true||!definition.semanticReview?.reviewerId)pending.push('SEMANTIC_BASELINE_REVIEW_UNRESOLVED');
    else try{await artifact(root,definition.semanticReview.reviewTraceRef);if(!definition.semanticReview.baselineReferences?.length)throw new Error('CURRENT_BASELINE_REFERENCES_MISSING');for(const reference of definition.semanticReview.baselineReferences)await artifact(root,reference);}catch(error){pending.push(error.message);}
    if(!Array.isArray(definition.assertions)||!definition.assertions.length)pending.push('FROZEN_ASSERTIONS_MISSING');
    if(definition.pendingPhysical===true)pending.push('EXACT_PHYSICAL_REQUEST_UNRESOLVED');
    if(!Array.isArray(definition.physicalEvidenceRefs)||!definition.physicalEvidenceRefs.length)pending.push('ACTUAL_READER_HELPER_EVIDENCE_MISSING');
    else for(const reference of definition.physicalEvidenceRefs)try{await artifact(root,reference);}catch(error){pending.push(error.message);}
    if(!Array.isArray(definition.responses)||!definition.responses.length)pending.push('SOURCE_REVIEWED_RESPONSE_SEQUENCE_MISSING');
    else for(const response of definition.responses){
      if(!['schemas','criteriaSchemas'].includes(response.schemaGroup)||!response.schemaKey||!Array.isArray(response.sourceAssertions)||!response.sourceAssertions.length||response.sourceAssertions.some(s=>typeof s!=='string'||!s))pending.push('RESPONSE_SOURCE_OR_SCHEMA_BINDING_MISSING');
      try{await artifact(root,response.responseRef);}catch(error){pending.push(error.message);}
    }
    if(!Array.isArray(definition.sandboxSessions)||!definition.sandboxSessions.length)pending.push('PHYSICAL_TRANSPORT_REPLAY_MISSING');
    else for(const session of definition.sandboxSessions){
      if(!Array.isArray(session.commands)||!Array.isArray(session.writes)||!Array.isArray(session.reads))pending.push('INCOMPLETE_PHYSICAL_TRANSPORT_REPLAY');
      for(const io of [...(session.writes??[]),...(session.reads??[])])try{await artifact(root,io.artifactRef);}catch(error){pending.push(error.message);}
      for(const command of session.commands??[])try{
        if(command.setupOnly===true){if(!/^(mkdir -p \/home\/user\/trace-criteria|python -m pip install --disable-pip-version-check --no-input )/.test(command.command))throw new Error('INVALID_SETUP_ACKNOWLEDGMENT');continue;}
        const execution=JSON.parse(await artifact(root,command.actualExecutionRef)),record=execution.records?.[command.actualRecordIndex];
        if(!execution.complete||!record||record.caseId!==definition.caseId||record.exitCode!==0||record.assertions?.some(a=>a.passed!==true)||!isDeepStrictEqual(command.result,{exitCode:record.exitCode,stdout:record.stdout,stderr:record.stderr}))throw new Error('UNVERIFIED_PHYSICAL_COMMAND_RESULT');
        await artifact(root,record.input);await artifact(root,record.outputRef);
        if(!definition.inputs.some(input=>isDeepStrictEqual(input.input,record.input))||!session.reads.some(read=>isDeepStrictEqual(read.artifactRef,record.outputRef)))throw new Error('PHYSICAL_RECORD_INPUT_OUTPUT_MISMATCH');
      }catch(error){pending.push(error.message);}
    }
    if(pending.length)issues.push({caseId:definition.caseId,pending:[...new Set(pending)]});
  }
  return {selectedCases:13,preparedCases:(plan.cases??[]).filter(c=>!issues.some(issue=>issue?.caseId===c.caseId)).length,issues,ready:issues.length===0,productExecuted:false,fullGateCasesPassed:0};
}

function identityBind(value,state){
  if(Array.isArray(value))return value.map(item=>identityBind(item,state));
  if(!value||typeof value!=='object')return value;
  if(value.$identity==='document'){
    const id=state.documentIds.get(value.role);if(!id)throw new Error('REPLAY_DOCUMENT_IDENTITY_UNAVAILABLE');return id;
  }
  if(value.$identity==='criterion'){
    const matches=state.criteria.filter(c=>c.label===value.label);if(matches.length!==1)throw new Error('REPLAY_CRITERION_IDENTITY_AMBIGUOUS');return matches[0].id;
  }
  if(Object.hasOwn(value,'identityBinding')||Object.hasOwn(value,'authoringEvidence'))throw new Error('REPLAY_DRAFT_NOT_COMPILED_OR_REVIEWED');
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,identityBind(item,state)]));
}

async function createReplayRuntime(definition,root){
  const [{createDocumentAnalyzer},{schemas,criteriaSchemas}]=await Promise.all([import('../../server/document-analyzer.mjs'),import('../../server/pipeline-prompts.mjs')]);
  const responses=[...definition.responses],sessions=[...definition.sandboxSessions],trace=[];
  const state={documentIds:new Map(),criteria:[]};
  const gemini={async generateJson(request){
    request.signal?.throwIfAborted();
    const fixture=responses.shift();if(!fixture)throw new Error('REPLAY_UNPLANNED_MODEL_REQUEST');
    const schema=(fixture.schemaGroup==='schemas'?schemas:criteriaSchemas)[fixture.schemaKey];
    if(!schema||!isDeepStrictEqual(schema,request.schema)||fixture.role!==request.role||fixture.maxOutputTokens!==request.maxOutputTokens)throw new Error('REPLAY_SCHEMA_SEQUENCE_MISMATCH');
    const content=(request.contents??[]).flatMap(part=>typeof part==='string'?[part]:part?.text?[part.text]:[]).join('\n');
    if(fixture.sourceAssertions.some(source=>!content.includes(source)))throw new Error('REPLAY_OBSERVED_SOURCE_CONTENT_MISMATCH');
    const template=JSON.parse(await artifact(root,fixture.responseRef)),data=identityBind(template,state);
    trace.push({kind:'authored-model-response-replay',at:new Date().toISOString(),schemaGroup:fixture.schemaGroup,schemaKey:fixture.schemaKey,role:request.role,maxOutputTokens:request.maxOutputTokens,sourceAssertions:fixture.sourceAssertions,observedContent:content,responseRef:fixture.responseRef,boundResponse:data,providerExecuted:false});
    return {data,model:'independently-authored-offline-response-fixture',usage:null};
  }};
  const withSandbox=async(work)=>{
    const fixture=sessions.shift();if(!fixture)throw new Error('REPLAY_UNPLANNED_SANDBOX_SESSION');
    const commands=[...fixture.commands],writes=[...fixture.writes],reads=[...fixture.reads];
    const execute=async command=>{const expected=commands.shift();if(!expected||command!==expected.command)throw new Error('REPLAY_UNPLANNED_SANDBOX_COMMAND');trace.push({kind:'command-transport-replay',at:new Date().toISOString(),command,actualExecutionRef:expected.actualExecutionRef??null,setupOnly:expected.setupOnly===true,providerExecuted:false});return structuredClone(expected.result);};
    const sandbox={commands:{run:execute},command:{run:execute},files:{
      async write(first,second){for(const write of Array.isArray(first)?first:[{path:first,data:second}]){const expected=writes.shift();if(!expected||write.path!==expected.path||!bytes(write.data).equals(await artifact(root,expected.artifactRef)))throw new Error('REPLAY_SANDBOX_WRITE_IDENTITY_MISMATCH');trace.push({kind:'verified-test-transport-write',path:write.path,sha256:sha256(bytes(write.data))});}},
      async read(name,options){const expected=reads.shift();if(!expected||name!==expected.path)throw new Error('REPLAY_UNPLANNED_SANDBOX_READ');const raw=await artifact(root,expected.artifactRef);trace.push({kind:'actual-physical-artifact-replay',path:name,artifactRef:expected.artifactRef});return options?.format==='bytes'?raw:raw.toString('utf8');},
    }};
    const report=()=>{};report.taskId='offline-transport-fixture';
    try{const output=await work(sandbox,report);if(commands.length||writes.length||reads.length)throw new Error('REPLAY_UNUSED_SANDBOX_OPERATIONS');return output;}
    finally{trace.push({kind:'test-transport-session-closed',at:new Date().toISOString(),providerExecuted:false});}
  };
  const actual=createDocumentAnalyzer({gemini,withSandbox});
  const analyzer={...actual,
    async analyze(document,options){state.documentIds.set(document.role,document.id);const result=await actual.analyze(document,options);trace.push({kind:'actual-document-analyzer-output',documentId:document.id,analysis:result.analysis,profile:result.sandboxProfile});return result;},
    async discoverCriteria(documents,text,options){const result=await actual.discoverCriteria(documents,text,options);state.criteria=result.criteria;trace.push({kind:'actual-criteria-discovery-output',result});return result;},
  };
  return {analyzer,gemini,geminiConfigured:true,trace,close:async()=>{if(responses.length||sessions.length)throw new Error('REPLAY_UNUSED_MODEL_OR_PHYSICAL_FIXTURES');}};
}

export async function executePreparedReplay(plan,{root=ROOT,signal}={}){
  const preparation=await checkReplayPreparation(plan,{root});if(!preparation.ready)return {...preparation,state:'not_run'};
  const before=await snapshotImplementation(root);if(before.digest!==plan.codeDigest)throw new Error('REPLAY_STALE_IMPLEMENTATION_PLAN');
  const {runContract}=await import('./contract.mjs');const cases=[],startedAt=new Date().toISOString();
  for(const definition of plan.cases){
    let runtime,result,error;const start=new Date().toISOString();
    try{runtime=await createReplayRuntime(definition,root);result=await runContract(definition.request,{inputDirectory:path.join(root,definition.inputDirectory),runId:randomUUID(),implementationRoot:root,runtime,signal,observeSamples:observation=>observeSamples(observation,definition.sampleObservationBindings)});}
    catch(cause){error={name:cause.name,message:cause.message};}
    const assertions=definition.assertions.map(assertion=>{try{const actual=jsonPointer(result,assertion.pointer);return {...assertion,actual,passed:compare(actual,assertion.expected,assertion.operator)};}catch(cause){return {...assertion,passed:false,error:cause.message};}});
    cases.push({caseId:definition.caseId,startedAt:start,endedAt:new Date().toISOString(),state:error||assertions.some(a=>!a.passed)?'failed':'passed',result,error,assertions,trace:runtime?.trace??[]});
  }
  const after=await snapshotImplementation(root);return {schemaVersion:'1.0',acceptanceProfile:'CURRENT_REPRODUCTION',startedAt,endedAt:new Date().toISOString(),origin:'actual-implementation-with-source-authored-model-and-physical-artifact-test-transports',providerCalls:{gemini:0,e2b:0},oracleRead:false,implementationStable:before.digest===after.digest,codeDigestBefore:before.digest,codeDigestAfter:after.digest,cases,selectedCases:13,fullGateCasesPassed:0,completeProductAcceptance:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const file=process.argv[2],mode=process.argv[3]??'--check';denyEvaluator(file);
  if(!file||!['--check','--execute'].includes(mode))throw new Error('Usage: public-replay-harness.mjs PROJECT_RELATIVE_PLAN [--check|--execute]');
  const planRef=await ref(ROOT,file),plan=JSON.parse(await artifact(ROOT,planRef));
  const output=mode==='--execute'?await executePreparedReplay(plan):await checkReplayPreparation(plan);
  let reportRef;
  if(mode==='--execute'&&output.cases)reportRef=await writeJson(ROOT,`${plan.outputDirectory}/execution-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,{...output,planRef,command:[process.execPath,...process.argv.slice(1)]});
  console.log(JSON.stringify(reportRef?{reportRef,selectedCases:13,cases:output.cases.map(c=>({caseId:c.caseId,state:c.state})),implementationStable:output.implementationStable,fullGateCasesPassed:0,completeProductAcceptance:false}:output));process.exitCode=mode==='--check'?output.ready?0:2:output.state==='not_run'||!output.implementationStable||output.cases?.some(c=>c.state!=='passed')?1:0;
}

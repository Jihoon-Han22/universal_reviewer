// Validator positive/negative controls only; these are never product gate results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, compare, jsonPointer, safeFile, ref, writeJson } from './shared.mjs';
import { evaluateRecordedCase, loadExecutionEvidence, validateGateOrigin } from './evidence.mjs';
import { projectContractResult, runContract } from './contract.mjs';
import { partialMatch } from './builtins.mjs';
import { runGate } from '../acceptance-adapter.mjs';
import { observeSamples } from './sample-observer.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
async function fixture(t) {
  const base=path.join(root,'.cache/rebuild/adapter-selftests');await mkdir(base,{recursive:true});
  const temporary=await mkdtemp(path.join(base,'case-'));
  t.after(async()=>{assert.ok(temporary.startsWith(base+path.sep));await rm(temporary,{recursive:true,force:true});});
  return temporary;
}
test('validator rejects coercion, missing JSON pointers, duplicate sets and unsupported operators',()=>{
  assert.equal(compare('1',1),false);assert.equal(compare(NaN,[0,1],'finiteWithin'),false);
  assert.equal(compare([1,1],[1],'setEqual'),false);assert.equal(compare(3,[2,4],'finiteWithin'),true);
  assert.throws(()=>compare(1,1,'trustCaller'));
  assert.throws(()=>jsonPointer({},'/missing'));assert.equal(jsonPointer({'a/b':{'~x':2}},'/a~1b/~0x'),2);
  assert.equal(partialMatch([{a:1,extra:true}],[{a:1}]),true);assert.equal(partialMatch([{a:1},{a:2}],[{a:1}]),false);
});
test('evidence paths reject traversal, absolute paths, secret files and stale hashes',async t=>{
  const temporary=await fixture(t);await writeFile(path.join(temporary,'actual.json'),'{}');
  for(const name of ['../actual.json',path.join(temporary,'actual.json'),'.env','.env.local'])await assert.rejects(safeFile(temporary,name));
  const actualRef=await ref(temporary,'actual.json'),baseline=await writeJson(temporary,'baseline.json',{contract:'test-only'});
  const definition={id:'G02:test-only',inputs:[],baselineReferences:[baseline]};
  const plan={assertions:[{name:'strict value',pointer:'/value',expected:1}],inputs:[],baselineReferences:[baseline],initialState:{},actions:['test-only']};
  const evidence={startedAt:'2026-01-01T00:00:00.000Z',endedAt:'2026-01-01T00:00:02.000Z'};
  const record={caseId:definition.id,state:'passed',actualRef,startedAt:evidence.startedAt,endedAt:evidence.endedAt};
  assert.equal((await evaluateRecordedCase(temporary,definition,{record,plan},evidence)).state,'failed');
  await writeFile(path.join(temporary,'actual.json'),' {"value":1}');
  assert.equal((await evaluateRecordedCase(temporary,definition,{record,plan},evidence)).errors[0],'STALE_EVIDENCE_HASH');
  record.actualRef=await ref(temporary,'actual.json');
  assert.equal((await evaluateRecordedCase(temporary,definition,{record,plan},evidence)).state,'passed');
  plan.assertions[0].expected=2;
  assert.equal((await evaluateRecordedCase(temporary,definition,{record,plan},evidence)).state,'failed');
  assert.equal((await evaluateRecordedCase(temporary,definition,undefined,evidence)).state,'not_run');
});
test('missing live, browser and independent observations cannot pass',()=>{
  for(const [gate,kind]of[['G03','live_implementation'],['G09','live_implementation'],['G10','browser_implementation'],['G11','browser_implementation'],['G13','browser_implementation'],['G14','independent_review']])assert.ok(validateGateOrigin(gate,kind,{}).length);
  assert.ok(validateGateOrigin('G03','live_implementation',{evidence:{providerCalls:{gemini:'1',e2b:1}}}).length);
});
test('execution records reject stale code and expectations prepared after the run began',async t=>{
  const temporary=await fixture(t),codeDigest='a'.repeat(64),registrySha256='b'.repeat(64),freeze={loop:'LOOP-001',codeDigest,frozenAt:'2026-01-01T00:00:00.000Z'};
  const plan={schemaVersion:'1.0',acceptanceProfile:'CURRENT_REPRODUCTION',gateId:'G02',codeDigest,registrySha256,preparedAt:'2026-01-01T00:00:01.000Z',cases:[]};
  let planRef=await writeJson(temporary,'plan.json',plan);
  const observation={schemaVersion:'1.0',acceptanceProfile:'CURRENT_REPRODUCTION',gateId:'G02',codeDigest,registrySha256,startedAt:'2026-01-01T00:00:02.000Z',endedAt:'2026-01-01T00:00:03.000Z',exitCode:0,command:['test-only'],origin:'validator-selftest',oracleAccess:false,planRef,cases:[]};
  const name='.cache/rebuild/evidence/LOOP-001/G02-observations.json';await writeJson(temporary,name,observation);
  assert.deepEqual((await loadExecutionEvidence(temporary,'G02',freeze,registrySha256)).errors,[]);
  observation.codeDigest='c'.repeat(64);await writeJson(temporary,name,observation);
  assert.deepEqual((await loadExecutionEvidence(temporary,'G02',freeze,registrySha256)).errors,['STALE_EXECUTION_SCOPE']);
  observation.codeDigest=codeDigest;plan.preparedAt='2026-01-01T00:00:03.000Z';observation.planRef=await writeJson(temporary,'plan.json',plan);await writeJson(temporary,name,observation);
  assert.deepEqual((await loadExecutionEvidence(temporary,'G02',freeze,registrySha256)).errors,['PLAN_NOT_FROZEN_BEFORE_EXECUTION']);
});
test('unfrozen negative-control workspace cannot execute even a selected command',async t=>{
  const temporary=await fixture(t);
  const definition={id:'G02:never-run',gateId:'G02',driver:'command',command:['nonexistent-never-executed-command'],inputs:[],baselineReferences:[]};
  await writeJson(temporary,'scripts/acceptance/case-registry.json',{gates:{G02:{executionKind:'offline_implementation',caseIds:[definition.id]}},cases:[definition],sourceReferences:[]});
  const result=await runGate('G02',{projectRoot:temporary,runId:'negative-control',acceptanceProfile:'CURRENT_REPRODUCTION'});
  assert.equal(result.state,'not_run');assert.deepEqual(result.observations.tests,{selected:1,passed:0,failed:0,skipped:1});
  assert.ok(result.observations.errors.includes('IMPLEMENTATION_NOT_FROZEN'));assert.equal(result.observations.implementationExecutionVerified,false);
});
test('contract projection never fabricates reader coverage, cells, absent highlights or criteria completion',()=>{
  const request={documents:[{file:'input.csv',role:'target',sha256:'a'.repeat(64)}]};
  const projected=projectContractResult({request,runId:'test',documents:[{id:'d'}],inputNames:['input.csv'],snapshot:{status:'completed',criteria:[],items:[{id:'i',label:'x',status:'review',presence:'missing',evidence:[{documentId:'d',sheet:'',cell:'A1',quote:'header'}]}]},run:{analyzedDocuments:new Map([['d',{preview:{ready:true},analysis:{status:'complete'}}]])}});
  assert.equal(projected.coverage[0].readerComplete,false);assert.equal(projected.coverage[0].contextComplete,false);
  assert.equal(projected.coverage[0].criteriaComplete,false);assert.deepEqual(projected.coverage[0].coveredCells,[]);assert.deepEqual(projected.items[0].highlightEvidence,[]);
});
test('criteria completion observes only the matching real workbook discovery report',()=>{
  const request={documents:[{file:'criteria.xlsx',role:'criteria',sha256:'a'.repeat(64)},{file:'target.xlsx',role:'target',sha256:'b'.repeat(64)}]},documents=[{id:'criteria-id'},{id:'target-id'}];
  const project=criteriaDiscovery=>projectContractResult({request,documents,inputNames:['criteria.xlsx','target.xlsx'],runId:'observer-control',snapshot:{status:'completed',criteria:[],items:[]},run:{criteriaDiscovery,analyzedDocuments:new Map([['criteria-id',{analysis:{criteriaComplete:true}}]])}}).coverage.map(c=>c.criteriaComplete);
  assert.deepEqual(project([{documentId:'unrelated-id',coverage:{extractedCriteriaComplete:true}}]),[false,false]);
  assert.deepEqual(project([{documentId:'criteria-id',coverage:{extractedCriteriaComplete:true}},{documentId:'target-id',coverage:{extractedCriteriaComplete:true}}]),[true,false]);
  assert.deepEqual(project([{documentId:'criteria-id',coverage:{extractedCriteriaComplete:false}}]),[false,false]);
});
test('covered cells are exact physically returned records without range expansion and require source identity',()=>{
  const input={file:'criteria.xlsx',role:'criteria',sha256:'a'.repeat(64)},profile={sha256:input.sha256,sheets:[{name:'Hidden',rows:[{row:400,cells:[{cell:'AH400',value:'x'},{cell:'AH400',value:'x'},{cell:'AK400',value:''}]}]}]};
  const project=value=>projectContractResult({request:{documents:[input]},runId:'physical-observer-control',documents:[{id:'d'}],inputNames:[input.file],snapshot:{status:'completed',items:[],criteria:[]},run:{analyzedDocuments:new Map([['d',{sandboxProfile:value}]])}}).coverage[0].coveredCells;
  assert.deepEqual(project(profile),[{sheet:'Hidden',cell:'AH400'},{sheet:'Hidden',cell:'AK400'}]);
  assert.deepEqual(project({...profile,sha256:'b'.repeat(64)}),[]);
  assert.deepEqual(project({sha256:input.sha256,coverage:{cellsRead:20}}),[]);
});
test('sample observer requires actual normalized label, source header association and retained evidence',()=>{
  const binding={role:'target',criterionLabel:'Pressure',sampleName:'Sample A',sheet:'Observed',cell:'AA7',headerCell:'Z7',orientation:'vertical'};
  const document={id:'d',role:'target',kind:'xlsx',sourceSheets:[{name:'Observed',rows:[{row:7,cells:[{address:'Z7',text:'시료명'},{address:'AA7',text:'Sample A'}]}]}]};
  const item={id:'i',criterionId:'c',label:'Sample A · Pressure',evidence:[{documentId:'d',sheet:'Observed',cell:'AA7',quote:'Sample A'}]};
  const base={snapshot:{criteria:[{id:'c',label:'Pressure'}],items:[item]},run:{analyzedDocuments:new Map([['d',document]])},documents:[document]};
  assert.equal(observeSamples(base,[binding]).byItemId.get('i'),'Sample A');
  for(const change of [{label:'Pressure'},{evidence:[{...item.evidence[0],documentId:'other'}]},{evidence:[{...item.evidence[0],cell:'AB7'}]}]){
    const output=observeSamples({...base,snapshot:{...base.snapshot,items:[{...item,...change}]}},[binding]);assert.equal(output.byItemId.size,0);assert.equal(output.observations[0].state,'unobserved');
  }
  assert.equal(observeSamples(base,[{...binding,headerCell:'Z8'}]).byItemId.size,0);
  assert.equal(observeSamples(base,[binding,binding]).byItemId.size,0);
});
test('contract rejects changed input bytes before runtime or provider construction',async t=>{
  const temporary=await fixture(t);await writeFile(path.join(temporary,'input.csv'),'a,b\n1,2');let called=false;
  const result=await runContract({schemaVersion:'1.0',criteriaText:'test',documents:[{file:'input.csv',role:'criteria',sha256:'0'.repeat(64)}]},{inputDirectory:temporary,runId:'selftest',createRuntime(){called=true;throw new Error('must not run');}});
  assert.equal(called,false);assert.equal(result.completion,'failed');assert.equal(result.error.code,'CONTRACT_INPUT_DIGEST');
});
test('runContract drives real store, approval audit, target attachment and deterministic finding normalization with explicit DI',async t=>{
  const temporary=await fixture(t),input={criteria:'Strength,30 MPa 이상\n',target:'Strength,31,MPa\n'},documents=[];
  for(const [role,text]of Object.entries(input)){const file=`${role}.csv`;await writeFile(path.join(temporary,file),text);documents.push({file,role,sha256:sha256(text)});}
  const calls=[];
  const analyzer={
    analyze:async doc=>{calls.push(`analyze:${doc.role}`);return{...doc,analysis:{status:'complete',summary:'Explicit test response',warnings:[],needsConfirmation:false,coverage:{complete:true,readerComplete:true,contextComplete:true}}};},
    discoverCriteria:async docs=>{calls.push('discover');return{criteria:[{id:'strength',label:'Strength',rule:'30 MPa 이상',comparison:{operator:'gte',value:30,unit:'MPa'},sourceDocumentId:docs[0].id,needsConfirmation:false,conditions:[],categoryPath:[]}]};},
    extractTarget:async doc=>{calls.push('extract');return{data:{items:[{criterionId:'strength',label:'Strength',value:'31',unit:'MPa',status:'review',uncertain:false,presence:'present',explanation:'Explicit injected model candidate for the engine boundary test.',evidence:[{documentId:doc.id,quote:'Strength,31,MPa'}]}]}};},
  };
  const result=await runContract({schemaVersion:'1.0',criteriaText:'Use supplied criteria',documents},{inputDirectory:temporary,runId:'engine-selftest',analyzer});
  assert.equal(result.completion,'completed',JSON.stringify(result.error));assert.equal(result.items.length,1);
  assert.equal(result.items[0].status,'pass');assert.equal(result.items[0].sourceValue,'31');
  assert.equal(result.observations.approvalAudit.length,1);assert.deepEqual(calls,['analyze:criteria','discover','analyze:target','extract']);
  assert.ok(result.coverage.every(c=>c.readerComplete&&c.contextComplete));
  assert.ok(result.coverage.every(c=>c.coveredCells.length===0&&!c.criteriaComplete));
});

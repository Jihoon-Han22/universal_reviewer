import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStore } from './documents.mjs';
import { ReviewEngine } from './review.mjs';
import { serializeRun, hydrateRun, restoreRunOriginals, externalizeOriginals, restoreOriginals, encodeState, decodeState } from './sites/engine-state.mjs';

const criterion = {id:'limit',label:'Strength',rule:'30 MPa 이상',comparison:{operator:'gte',value:30,unit:'MPa'},needsConfirmation:false,conditions:[],categoryPath:[],sourceDocumentId:'natural-language'};
const analysis = {status:'complete',summary:'read',warnings:[],coverage:{complete:true,readerComplete:true,contextComplete:true}};

async function harness() {
  const calls = {analyze:0,discover:0,revise:0,extract:0};
  const documents = new DocumentStore();
  const analyzer = {
    analyze:async document => { calls.analyze++; return {...document,analysis}; },
    discoverCriteria:async () => { calls.discover++; return {criteria:[structuredClone(criterion)]}; },
    reviseCriteria:async (criteria,feedback,options) => { calls.revise++; calls.revisionInput={criteria,feedback,scope:options.scope,documentId:options.documentId}; return {criteria:criteria.map(c=>({...c,label:'Revised Strength'}))}; },
    extractTarget:async document => { calls.extract++; return {data:{items:[{id:'strength',label:'Strength',value:'31',unit:'MPa',criterionId:'limit',status:'pass',uncertain:false,explanation:'측정값 비교',evidence:[{documentId:document.id,quote:'Strength 31 MPa'}]}]}}; },
  };
  const engine = new ReviewEngine({documents,analyzer,geminiConfigured:true,deferJobs:true});
  const target = await documents.add({name:'target.txt',buffer:Buffer.from('Strength 31 MPa'),role:'target'});
  return {engine,documents,analyzer,calls,target};
}

function restore(h,run) {
  const engine = new ReviewEngine({documents:h.documents,analyzer:h.analyzer,geminiConfigured:true,deferJobs:true});
  const restored = hydrateRun(JSON.stringify(serializeRun(run)));
  engine.runs.set(restored.id,restored);
  return {engine,run:restored};
}

test('deferred jobs survive JSON storage and await durable execution acknowledgement before providers',async()=>{
  const h=await harness(),run=h.engine.start({mode:'criteria_first',criteriaText:'Strength 30 MPa 이상'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.discover,0);assert.equal(run.pendingJob.state,'queued');assert.equal(run.job,undefined);
  const restored=restore(h,run);let release;const persisted=new Promise(resolve=>{release=resolve;});
  const job=restored.engine.executePendingJob(restored.run,{beforeExecute:async value=>{assert.equal(value.pendingJob.state,'executing');await persisted;}});
  assert.equal(restored.engine.executePendingJob(restored.run),job);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(h.calls.discover,0);
  release();await job;
  assert.equal(h.calls.discover,1);assert.equal(restored.run.status,'awaiting_confirmation');assert.equal(restored.run.pendingJob,undefined);
});

test('hydrated confirmation, attachment and review preserve source bytes and frozen approval',async()=>{
  const h=await harness(),run=h.engine.start({mode:'criteria_first',criteriaText:'Strength 30 MPa 이상'});
  await h.engine.executePendingJob(run);
  const a=restore(h,run);a.engine.confirm(a.run,{expectedCriterionVersion:1});
  const b=restore(h,a.run);assert.ok(Object.isFrozen(b.run.approvedCriteria.criteria[0]));
  b.engine.attachDocuments(b.run,{expectedCriterionVersion:1,documentIds:[h.target.id]});assert.equal(h.calls.analyze,0);
  const c=restore(h,b.run);await c.engine.executePendingJob(c.run);
  assert.equal(c.run.status,'completed');assert.equal(c.run.items[0].status,'pass');assert.equal(h.calls.extract,1);
  const d=restore(h,c.run),document=d.run.analyzedDocuments.get(h.target.id);
  assert.ok(Buffer.isBuffer(document.buffer));assert.equal(document.buffer.toString(),'Strength 31 MPa');
  assert.deepEqual(d.run.documentIds,[h.target.id]);assert.equal(d.run.criteriaText,'Strength 30 MPa 이상');
  assert.equal(d.run.listeners.size,0);assert.equal(d.run.controller.signal.aborted,false);
  d.engine.resolve(d.run,d.run.items[0].id,{status:'review',note:'원문 재확인'});
  assert.equal(d.run.items[0].reviewedByHuman,true);
});

test('queued criteria revision retains captured local draft and scope across requests',async()=>{
  const h=await harness(),run=h.engine.start({mode:'criteria_first',criteriaText:'Strength 30 MPa 이상'});
  await h.engine.executePendingJob(run);
  h.engine.revise(run,{expectedCriterionVersion:1,feedback:'다시 정리',scope:'selected group',documentId:'natural-language',criteria:[{...run.criteria[0],label:'Local draft'}]});
  assert.equal(h.calls.revise,0);
  const expectedDraft=structuredClone(run.pendingJob.draft);
  const restored=restore(h,run);await restored.engine.executePendingJob(restored.run);
  assert.deepEqual(h.calls.revisionInput,{criteria:expectedDraft,feedback:'다시 정리',scope:'selected group',documentId:'natural-language'});
  assert.equal(restored.run.status,'awaiting_confirmation');assert.equal(restored.run.criterionVersion,2);
  assert.equal(restored.run.criteriaFeedback[0].status,'completed');assert.equal(restored.run.audit[0].priorDraft[0].label,'Local draft');
});

test('interrupted executing checkpoint fails explicitly without replaying provider work',async()=>{
  const h=await harness(),run=h.engine.start({mode:'criteria_first',criteriaText:'Strength 30 MPa 이상'});
  run.pendingJob.state='executing';const restored=restore(h,run);
  await restored.engine.executePendingJob(restored.run);
  assert.equal(h.calls.discover,0);assert.equal(restored.run.status,'failed');assert.match(restored.run.error,/연결이 중단/);assert.equal(restored.run.pendingJob,undefined);
});

test('queued legacy confirmation resumes review and cancellation never executes deferred work',async()=>{
  const h=await harness(),run=h.engine.start({documentIds:[h.target.id],criteriaText:'Strength 30 MPa 이상'});
  await h.engine.executePendingJob(run);const restored=restore(h,run);
  restored.engine.confirm(restored.run);assert.equal(restored.run.pendingJob.kind,'review');assert.equal(h.calls.extract,0);
  await restored.engine.executePendingJob(restored.run);assert.equal(restored.run.status,'completed');assert.equal(h.calls.extract,1);
  const cancelled=h.engine.start({mode:'criteria_first',criteriaText:'Strength 30 MPa 이상'});h.engine.cancel(cancelled);
  const cancelledRestored=restore(h,cancelled);assert.equal(cancelledRestored.run.controller.signal.aborted,true);
  await cancelledRestored.engine.executePendingJob(cancelledRestored.run);assert.equal(h.calls.discover,1);
});

test('completed analysis cache is reused and pending analysis promises are never persisted',async()=>{
  const h=await harness();await h.engine.ensureAnalyzed(h.target);h.target.analysisPromise=Promise.resolve();
  const run=h.engine.start({documentIds:[h.target.id],criteriaText:'Strength 30 MPa 이상'});await h.engine.executePendingJob(run);
  assert.equal(h.calls.analyze,1);
  const restored=restore(h,run);assert.equal(restored.run.analyzedDocuments.get(h.target.id).analysisPromise,undefined);
});

test('20 MB originals are referenced once without losing bytes, model parts or generated images',async()=>{
  const h=await harness(),run=h.engine.start({mode:'criteria_first',criteriaText:'Strength 30 MPa 이상'});
  const buffer=Buffer.alloc(20*1024*1024,0x61),data=buffer.toString('base64'),page=Buffer.from('generated page').toString('base64');
  const document={id:'large-pdf',buffer,modelParts:[{inlineData:{mimeType:'application/pdf',data}},{inlineData:{mimeType:'image/png',data:page}}],nested:{buffer:new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength),modelParts:[{inlineData:{mimeType:'application/pdf',data}}]},analysis:{...analysis}};
  run.analyzedDocuments.set(document.id,document);
  const serialized=JSON.stringify(serializeRun(run,{externalizeOriginals:true}));
  assert.ok(serialized.length<10_000,`snapshot expanded to ${serialized.length} bytes`);
  assert.equal(document.buffer,buffer);assert.equal(document.modelParts[0].inlineData.data,data);
  const hydrated=hydrateRun(serialized),documents=new Map([[document.id,{id:document.id,buffer,modelParts:document.modelParts}]]);
  // Inspection-only requests may save again before loading original content.
  const inspected=hydrateRun(JSON.stringify(serializeRun(hydrated,{externalizeOriginals:true})));
  restoreRunOriginals(inspected,documents);
  const result=inspected.analyzedDocuments.get(document.id);
  assert.equal(result.buffer,buffer);assert.equal(result.nested.buffer,buffer);
  assert.equal(result.modelParts[0].inlineData.data,data);assert.equal(result.nested.modelParts[0].inlineData.data,data);
  assert.equal(result.modelParts[1].inlineData.data,page);assert.deepEqual(result.analysis,analysis);
  assert.equal(inspected.externalizedOriginalDocuments.size,0);
  restoreRunOriginals(inspected,documents);assert.equal(inspected.analyzedDocuments.get(document.id),result);
});

test('original reference codec escapes user literals and rejects mismatched document references',()=>{
  const buffer=Buffer.from('original bytes'),literal={__reviewOriginal:1,documentId:'different',representation:'bytes'};
  const value={buffer,modelParts:[{inlineData:{data:buffer.toString('base64')}}],literal,escaped:{__reviewOriginal:0,value:literal},malformed:{__reviewOriginal:'text',detail:'preserve'}};
  const encoded=externalizeOriginals(value,{documentId:'source',buffer});
  const decoded=restoreOriginals(encoded,{documentId:'source',buffer});
  assert.deepEqual(decoded,value);
  assert.throws(()=>restoreOriginals(encoded,{documentId:'other',buffer}),/Invalid original document reference/);
  assert.throws(()=>restoreOriginals(encoded,{documentId:'source',buffer,base64:'wrong'}),/does not match/);
  const ordinary={inlineData:{data:Buffer.from('different').toString('base64')},otherData:buffer.toString('base64'),image:Buffer.from('other image')};
  assert.deepEqual(externalizeOriginals(ordinary,{documentId:'source',buffer}),ordinary);
});

test('default snapshots preserve all originals without requiring a document store',async()=>{
  const h=await harness(),run=h.engine.start({documentIds:[h.target.id],criteriaText:'Strength 30 MPa 이상'});
  await h.engine.executePendingJob(run);
  const original=run.analyzedDocuments.get(h.target.id);
  original.literal={__reviewOriginal:1,documentId:h.target.id,representation:'bytes'};
  const restored=hydrateRun(JSON.stringify(serializeRun(run)));
  assert.deepEqual(restored.analyzedDocuments.get(h.target.id),original);
  restoreRunOriginals(restored,new Map());
  assert.deepEqual(restored.analyzedDocuments.get(h.target.id).literal,original.literal);
});

test('generic state codec preserves literal marker objects while retaining binary metadata',()=>{
  const value={literal:{__reviewStoredType:'bytes',value:'literal text'},nested:{__reviewStoredType:'object',value:{__reviewStoredType:'date',value:'literal date'}},buffer:Buffer.from('actual bytes'),map:new Map([['source',{__reviewStoredType:'map',value:[]}]]),date:new Date('2026-09-22T00:00:00Z')};
  assert.deepEqual(decodeState(JSON.parse(JSON.stringify(encodeState(value)))),value);
});

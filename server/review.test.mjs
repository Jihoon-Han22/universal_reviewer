import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStore } from './documents.mjs';
import { ReviewEngine, ReviewError, summaryOf } from './review.mjs';

const criterion = {id:'limit',label:'Strength',rule:'30 MPa 이상',comparison:{operator:'gte',value:30,unit:'MPa'},needsConfirmation:false,conditions:[],categoryPath:[],sourceDocumentId:'natural-language'};
const analysis = {status:'complete',summary:'read',warnings:[],needsConfirmation:false,coverage:{complete:true,readerComplete:true,contextComplete:true}};
const rawItem = (doc,value='31') => ({label:'Strength',value,unit:'MPa',criterionId:'limit',status:'pass',uncertain:false,explanation:'측정값 비교',evidence:[{documentId:doc.id,quote:`Strength ${value} MPa`}]});
async function harness(overrides={}) {
  const documents=new DocumentStore();
  const analyzer={analyze:async doc=>({...doc,analysis:structuredClone(analysis)}),discoverCriteria:async()=>({criteria:[structuredClone(criterion)]}),reviseCriteria:async criteria=>({criteria,summary:'수정 완료'}),extractTarget:async doc=>({data:{items:[rawItem(doc)]}}),...overrides};
  const engine=new ReviewEngine({documents,analyzer,geminiConfigured:true});
  const target=await documents.add({name:'target.txt',buffer:Buffer.from('Strength 31 MPa'),role:'target'});
  return {engine,documents,target,analyzer};
}
async function ready(h) { const r=h.engine.start({mode:'criteria_first',criteriaText:'Strength 30 MPa 이상'});await r.job;return r; }
async function completed(h) { const r=await ready(h);h.engine.confirm(r,{expectedCriterionVersion:1});h.engine.attachDocuments(r,{expectedCriterionVersion:1,documentIds:[h.target.id]});await r.job;return r; }

test('criteria-first waits for explicit frozen approval before targets; stale/missing versions rejected',async()=>{
  const h=await harness(),r=await ready(h);
  assert.equal(r.status,'awaiting_confirmation');assert.equal(r.criterionVersion,1);
  assert.throws(()=>h.engine.attachDocuments(r,{documentIds:[h.target.id],expectedCriterionVersion:1}),{status:409});
  assert.throws(()=>h.engine.confirm(r,{}),{status:400});assert.throws(()=>h.engine.confirm(r,{expectedCriterionVersion:0}),{status:409});
  h.engine.confirm(r,{expectedCriterionVersion:1,criteria:structuredClone(r.criteria)});
  assert.equal(r.criterionVersion,2);assert.equal(r.status,'awaiting_documents');assert.ok(Object.isFrozen(r.approvedCriteria.criteria[0].comparison));
  assert.throws(()=>{r.approvedCriteria.criteria[0].rule='changed';},TypeError);
  r.criteria[0].rule='mutable draft';h.engine.attachDocuments(r,{documentIds:[h.target.id],expectedCriterionVersion:2});await r.job;
  assert.equal(r.criteria[0].rule,'30 MPa 이상');assert.equal(r.status,'completed');assert.equal(r.items[0].status,'pass');assert.equal(r.audit[0].action,'criteria.confirmed');
});
test('zero criteria is a confirmation checkpoint with exclusion reasons, never approved',async()=>{
  const h=await harness({discoverCriteria:async docs=>({criteria:[],criteriaAssessments:docs.map(d=>({documentId:d.id,name:d.name,status:'not_criteria',reason:'측정 보고서',evidence:[]}))})});
  const d=await h.documents.add({name:'source.txt',buffer:Buffer.from('측정 결과'),role:'criteria'});
  const r=h.engine.start({mode:'criteria_first',criteriaDocumentIds:[d.id]});await r.job;
  assert.equal(r.status,'awaiting_confirmation');assert.equal(r.excludedCriteriaDocuments[0].documentId,d.id);assert.throws(()=>h.engine.confirm(r,{expectedCriterionVersion:1}));
  assert.throws(()=>h.engine.revise(r,{expectedCriterionVersion:1,feedback:'수정',documentId:d.id}),{status:400});
});
test('revise consumes local incomplete draft; failures retain server criteria and version',async()=>{
  let captured;const h=await harness({reviseCriteria:async criteria=>{captured=criteria;throw new ReviewError('수정 실패');}}),r=await ready(h);
  const draft=[{...r.criteria[0],label:'',rule:'',comparison:undefined,draftState:{mode:'numeric',operator:'gte',value:'',upper:'',unit:'MPa',issues:['값 입력']}}];
  const initial=h.engine.revise(r,{expectedCriterionVersion:1,feedback:'현재 초안 수정',criteria:draft});assert.equal(initial.stage,'criteria_revising');await r.job;
  assert.equal(captured[0].rule,'');assert.equal(captured[0].draftState.value,'');assert.equal(r.criteria[0].rule,'30 MPa 이상');assert.equal(r.criterionVersion,1);assert.equal(r.criteriaFeedback[0].status,'failed');assert.equal(r.revisionError,'수정 실패');
});
test('successful revision advances version and audit, then waits for renewed approval',async()=>{
  const h=await harness({reviseCriteria:async criteria=>({criteria:criteria.map(c=>({...c,rule:'35 MPa 이상',comparison:{...c.comparison,value:35}})),summary:'변경'})}),r=await ready(h);
  h.engine.revise(r,{expectedCriterionVersion:1,feedback:'35로 바꿔 줘'});await r.job;
  assert.equal(r.status,'awaiting_confirmation');assert.equal(r.criterionVersion,2);assert.equal(r.criteriaRevision,1);assert.equal(r.audit[0].priorDraft[0].rule,'30 MPa 이상');assert.equal(r.criteriaFeedback[0].toVersion,2);
});
test('20 accepted failed feedback attempts count; semantic rejection does not',async()=>{
  const h=await harness({reviseCriteria:async()=>{throw new ReviewError('재시도 필요');}}),r=await ready(h);
  assert.throws(()=>h.engine.revise(r,{expectedCriterionVersion:1,feedback:' '}));assert.equal(r.criteriaFeedback.length,0);
  for(let i=0;i<20;i++){h.engine.revise(r,{expectedCriterionVersion:1,feedback:'수정'});await r.job;}
  assert.equal(r.criteriaFeedback.length,20);assert.throws(()=>h.engine.revise(r,{expectedCriterionVersion:1,feedback:'수정'}));
});
test('cancel suppresses late results/events and marks feedback cancelled; terminal cancel no-op',async()=>{
  let release;const h=await harness({reviseCriteria:criteria=>new Promise(resolve=>{release=()=>resolve({criteria});})}),r=await ready(h);
  h.engine.revise(r,{expectedCriterionVersion:1,feedback:'수정'});await Promise.resolve();h.engine.cancel(r);release();await r.job;
  assert.equal(r.status,'cancelled');assert.equal(r.criteriaFeedback[0].status,'cancelled');assert.equal(r.events.at(-1).type,'run.cancelled');assert.equal(r.criterionVersion,1);
  const count=r.events.length;h.engine.cancel(r);assert.equal(r.events.length,count);
});
test('human corrections preserve first machine verdict and all audit history including same-status confirmation',async()=>{
  const h=await harness(),r=await completed(h),id=r.items[0].id;
  assert.throws(()=>h.engine.resolve(r,id,{status:'fail',note:' '}),{status:400});
  h.engine.resolve(r,id,{status:'fail',note:'원문 재확인'});h.engine.resolve(r,id,{status:'fail',note:'유지 확인'});const out=h.engine.resolve(r,id,{status:'review',note:'추가 확인'});
  assert.equal(out.item.machineStatus,'pass');assert.equal(out.summary.review,1);assert.equal(out.summary.humanReviewed,1);assert.equal(r.audit.filter(a=>a.action==='item.resolved').length,3);assert.equal(r.audit.at(-1).before,'fail');
  const snap=h.engine.snapshot(r);snap.items[0].status='pass';assert.equal(r.items[0].status,'review');
});
test('target read failure is isolated, criteria read failure fails preparation',async()=>{
  const h=await harness({analyze:async d=>{if(d.name==='bad.txt')throw new ReviewError('read failed');return {...d,analysis};}}),bad=await h.documents.add({name:'bad.txt',buffer:Buffer.from('x'),role:'target'}),r=await ready(h);
  h.engine.confirm(r,{expectedCriterionVersion:1});h.engine.attachDocuments(r,{expectedCriterionVersion:1,documentIds:[bad.id,h.target.id]});await r.job;
  assert.equal(r.status,'partial');assert.equal(r.documents[0].status,'failed');assert.equal(r.documents[1].status,'completed');assert.equal(r.items.length,1);
  const source=await h.documents.add({name:'bad.txt',buffer:Buffer.from('x'),role:'criteria'});const broken=h.engine.start({mode:'criteria_first',criteriaDocumentIds:[source.id]});await broken.job;assert.equal(broken.status,'failed');assert.equal(broken.stage,'failed');
});
test('all target failures aggregate failed/complete; upper-level failure uses failed/failed',async()=>{
  const h=await harness({extractTarget:async()=>{throw new Error('private failure');}}),r=await completed(h);
  assert.equal(r.status,'failed');assert.equal(r.stage,'complete');assert.doesNotMatch(r.documents[0].error,/private/);
});
test('run aggregation preserves baseline predicate and document payload status is not runStatus',async()=>{
  const h=await harness({discoverCriteria:async()=>({criteria:[criterion],criteriaDiscovery:[{coverage:{extractedCriteriaComplete:false,allRegionsExamined:false,contextComplete:false}}]})}),r=await completed(h);
  assert.equal(r.status,'completed');const event=r.events.find(e=>e.type==='document.completed');assert.equal(event.status,'completed');assert.equal(event.runStatus,'running');assert.equal(event.stage,'reviewing');
  assert.ok(r.events.every((e,i)=>e.sequence===i+1&&e.runId===r.id));
});
test('coverage false causes partial; null/missing does not and item review can be complete',async()=>{
  const h=await harness({extractTarget:async doc=>({data:{items:[{...rawItem(doc),uncertain:true}],reviewCoverage:{complete:null}}})}),r=await completed(h);assert.equal(r.items[0].status,'review');assert.equal(r.status,'completed');
  const h2=await harness({extractTarget:async doc=>({data:{items:[rawItem(doc)],reviewCoverage:{complete:false,remainingWork:['tail']}}})}),r2=await completed(h2);assert.equal(r2.status,'partial');assert.equal(r2.documents[0].reviewCoverage.itemLimit,250);
});
test('250 normalized items marks partial',async()=>{
  const h=await harness({extractTarget:async doc=>({data:{items:Array.from({length:250},()=>rawItem(doc))}})}),r=await completed(h);assert.equal(r.status,'partial');assert.equal(r.documents[0].status,'partial');assert.equal(r.items.length,250);
});
test('summary counts final statuses and partial documents only, pending remains separate',()=>{
  const summary=summaryOf({items:[{status:'pending'},{status:'fail',reviewedByHuman:true}],documents:[{status:'completed'},{status:'partial',missingRows:[1,2]},{status:'failed'},{status:'cancelled'}]});
  assert.deepEqual(summary,{total:2,pass:0,fail:1,review:0,documents:4,completedDocuments:1,failedDocuments:1,incompleteDocuments:1,unreviewedRows:2,humanReviewed:1});
});
test('open admission is three; run pruning occurs after insert and preserves open runs',async()=>{
  const h=await harness();const runs=[await ready(h),await ready(h),await ready(h)];assert.throws(()=>h.engine.start({mode:'criteria_first',criteriaText:'x'}),{status:429});runs.forEach(r=>h.engine.cancel(r));
  const first=runs[0].id;
  for(let i=0;i<37;i++){const r=await ready(h);h.engine.cancel(r);}assert.equal(h.engine.runs.size,40);const newest=await ready(h);assert.equal(h.engine.runs.size,40);assert.equal(h.engine.runs.has(first),false);assert.ok(h.engine.runs.has(newest.id));
});
test('late analysis waiter cancellation ends only its own wait and preserves owner/cache',async()=>{
  let active=0,max=0,release;const gate=new Promise(resolve=>{release=resolve;});
  const h=await harness({analyze:async d=>{active++;max=Math.max(max,active);await gate;active--;return {...d,analysis};}});
  const owner=new AbortController(),waiter=new AbortController();const a=h.engine.ensureAnalyzed(h.target,{signal:owner.signal});const b=h.engine.ensureAnalyzed(h.target,{signal:waiter.signal});
  const rejected=assert.rejects(b,{name:'AbortError'});waiter.abort();await rejected;
  assert.equal(active,1);assert.equal(max,1);assert.equal(owner.signal.aborted,false);assert.ok(h.target.analysisPromise);assert.equal(h.target.sandboxAnalysisResult,undefined);
  release();const result=await a;assert.equal(active,0);assert.equal(h.target.analysisPromise,undefined);assert.equal(h.target.sandboxAnalysisResult.analysis,result);assert.equal(await h.engine.ensureAnalyzed(h.target),result);
});
test('ensureAnalyzed shares and caches PublicAnalysis while retaining the private analyzed document separately',async()=>{
  let release,calls=0;const gate=new Promise(resolve=>{release=resolve;});
  const publicAnalysis={...structuredClone(analysis),structure:[{name:'실제 표',kind:'table',sheet:'검사',range:'A1:B2',headers:['항목','결과'],description:'원문 표',orientation:'horizontal',uncertain:false}]};
  const sourceSheets=[{name:'검사',rows:[{row:2,cells:[{address:'A2',text:'private source'}]}]}];
  const h=await harness({analyze:async d=>{calls++;await gate;return {...d,analysis:publicAnalysis,sourceSheets,sandboxProfile:{kind:'txt',status:'ready'},activityContext:{contextId:'private-context'}};}});
  const owner=h.engine.ensureAnalyzed(h.target),shared=h.target.analysisPromise,waiter=h.engine.ensureAnalyzed(h.target);
  assert.ok(shared instanceof Promise);assert.equal(calls,1);release();
  const [first,inFlight,second]=await Promise.all([owner,shared,waiter]);
  assert.equal(first,publicAnalysis);assert.equal(inFlight,publicAnalysis);assert.equal(second,publicAnalysis);assert.deepEqual(first,publicAnalysis);
  for(const key of ['buffer','modelParts','sourceSheets','sandboxProfile','activityContext','sandboxAnalysisResult','analysisPromise'])assert.equal(Object.hasOwn(first,key),false);
  assert.equal(first.structure[0].sheet,'검사');assert.equal(first.structure[0].range,'A1:B2');
  assert.equal(h.target.sandboxAnalysisResult.analysis,publicAnalysis);assert.deepEqual(h.target.sandboxAnalysisResult.buffer,h.target.buffer);assert.equal(h.target.sandboxAnalysisResult.sourceSheets,sourceSheets);assert.ok(h.target.sandboxAnalysisResult.modelParts);
  assert.equal(await h.engine.ensureAnalyzed(h.target),publicAnalysis);assert.equal(calls,1);assert.equal(h.target.analysisPromise,undefined);
});
test('run document analysis uses two workers and cancellation prevents starting queued work',async()=>{
  const gates=[],started=[];let active=0,max=0;
  const h=await harness({analyze:d=>new Promise(resolve=>{started.push(d.id);active++;max=Math.max(max,active);gates.push(()=>{active--;resolve({...d,analysis});});})});
  const docs=await Promise.all(Array.from({length:4},(_,i)=>h.documents.add({name:`source${i}.txt`,buffer:Buffer.from('x'),role:'criteria'})));
  const r=h.engine.start({mode:'criteria_first',criteriaDocumentIds:docs.map(d=>d.id)});await Promise.resolve();await Promise.resolve();assert.equal(started.length,2);assert.equal(max,2);
  h.engine.cancel(r);for(const finish of gates)finish();await r.job;assert.equal(started.length,2);assert.equal(r.events.at(-1).type,'run.cancelled');assert.equal(active,0);
});
test('model queue cancels waiting work without freeing an active slot early',async()=>{
  const h=await harness();let release1,release2,calls=0;const a=h.engine.queueModel(()=>new Promise(resolve=>{release1=resolve;}));const b=h.engine.queueModel(()=>new Promise(resolve=>{release2=resolve;}));await Promise.resolve();
  const controller=new AbortController(),queued=h.engine.queueModel(()=>{calls++;},controller.signal);controller.abort();await assert.rejects(queued);assert.equal(h.engine.modelActive,2);assert.equal(calls,0);release1();release2();await Promise.all([a,b]);await Promise.resolve();assert.equal(h.engine.modelActive,0);
});
test('document activity publishes bounded redacted allowlisted fields',async()=>{
  const h=await harness(),r=await ready(h);h.engine.config={geminiApiKey:'synthetic-private-key'};
  h.engine.options(r,h.target).report({step:'read',title:'read',status:'running',detail:'synthetic-private-key https://private.invalid/path',command:'private command',arbitrarySecret:'secret',output:'token=private-value'});
  const record=r.analysisActivity.at(-1);assert.equal(record.command,undefined);assert.equal(record.arbitrarySecret,undefined);assert.doesNotMatch(JSON.stringify(record),/synthetic-private-key|private\.invalid|private-value/);assert.equal(record.documentId,h.target.id);
});
test('legacy path freezes criteria then reviews original targets',async()=>{
  const h=await harness(),r=h.engine.start({documentIds:[h.target.id],criteriaText:'Strength 30 MPa 이상'});await r.job;assert.equal(r.status,'awaiting_confirmation');h.engine.confirm(r,{});await r.job;assert.equal(r.status,'completed');assert.equal(r.approvedCriteria.criterionVersion,1);
});

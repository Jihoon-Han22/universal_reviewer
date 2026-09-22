import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentStore} from './documents.mjs';
import {ReviewEngine} from './review.mjs';

async function fixture(discovery){
  const documents=new DocumentStore();
  const eligible=await documents.add({name:'rule.txt',role:'criteria',buffer:Buffer.from('Strength 30 MPa minimum')}),excluded=await documents.add({name:'record.txt',role:'criteria',buffer:Buffer.from('Recorded measurement only')});
  const valid={id:'c',label:'Strength',rule:'30 MPa 이상',comparison:{operator:'gte',value:30,unit:'MPa'},needsConfirmation:false,sourceDocumentId:eligible.id,sourceEvidence:[{documentId:eligible.id,quote:'30 MPa minimum'}]};
  let modelCalls=0;
  const engine=new ReviewEngine({documents,geminiConfigured:true,analyzer:{analyze:async document=>({...document,analysis:{status:'complete',coverage:{complete:true,readerComplete:true,contextComplete:true}}}),discoverCriteria:async()=>({criteria:discovery?.({valid,eligible,excluded})??[valid],criteriaAssessments:[{documentId:eligible.id,status:'criteria',reason:'rule'},{documentId:excluded.id,status:'not_criteria',reason:'record only'}]}),reviseCriteria:async criteria=>{modelCalls++;return {criteria};}}});
  const run=engine.start({mode:'criteria_first',criteriaDocumentIds:[eligible.id,excluded.id]});await run.job;
  return {engine,run,eligible,excluded,valid,get modelCalls(){return modelCalls;}};
}
for(const field of ['sourceEvidence','evidenceCells','hierarchyEvidence'])for(const array of [true,false]){
  test(`excluded ${field} ${array?'array':'object'} candidate is omitted before trust`,async()=>{
    const h=await fixture(({valid,excluded})=>{const evidence={documentId:excluded.id,quote:'record only'},candidate={...valid,[field]:array?[evidence]:evidence};if(field==='evidenceCells')delete candidate.sourceEvidence;return [candidate];});
    assert.equal(h.run.status,'awaiting_confirmation');assert.equal(h.run.criteria.length,0);assert.throws(()=>h.engine.confirm(h.run,{expectedCriterionVersion:1}));assert.equal(h.run.approvedCriteria,null);
  });
  for(const boundary of ['confirm','revise'])test(`${boundary} rejects surviving excluded ${field} ${array?'array':'object'} server provenance`,async()=>{
    const h=await fixture(),evidence={documentId:h.excluded.id,quote:'record only'};h.run.criteria[0][field]=array?[evidence]:evidence;if(field==='evidenceCells')delete h.run.criteria[0].sourceEvidence;
    assert.throws(()=>h.engine[boundary](h.run,{expectedCriterionVersion:1,...(boundary==='revise'?{feedback:'Keep the threshold'}:{})}),/제외된 문서/);
    assert.equal(h.run.criterionVersion,1);assert.equal(h.run.approvedCriteria,null);assert.equal(h.run.criteriaFeedback.length,0);assert.equal(h.modelCalls,0);
  });
}
test('client-forged excluded provenance is overwritten by trusted server provenance',async()=>{
  const h=await fixture(),forged={...h.run.criteria[0],sourceEvidence:[{documentId:h.excluded.id,quote:'forged'}],hierarchyEvidence:[{documentId:h.excluded.id,quote:'forged'}]};
  h.engine.confirm(h.run,{expectedCriterionVersion:1,criteria:[forged]});assert.equal(h.run.status,'awaiting_documents');assert.deepEqual(h.run.approvedCriteria.criteria[0].sourceEvidence,h.valid.sourceEvidence);assert.equal(h.run.approvedCriteria.criteria[0].hierarchyEvidence,undefined);
});
test('eligible generic citation permissiveness and discarded aliases remain unchanged',async()=>{
  const h=await fixture(({valid,excluded,eligible})=>[{...valid,sourceEvidence:[{documentId:eligible.id,quote:'not in original',cell:'invalid'}],evidenceCells:[{documentId:excluded.id,quote:'discarded alias'}],citations:[{documentId:excluded.id,quote:'unsupported alias'}]}]);
  assert.equal(h.run.criteria.length,1);h.engine.confirm(h.run,{expectedCriterionVersion:1});assert.equal(h.run.approvedCriteria.criteria[0].comparison.value,30);assert.equal(h.run.approvedCriteria.criteria[0].sourceEvidence[0].quote,'not in original');
});
test('unsafe revision response preserves draft and does not advance approval version',async()=>{
  const h=await fixture();h.engine.analyzer.reviseCriteria=async criteria=>({criteria:criteria.map(c=>({...c,hierarchyEvidence:[{documentId:h.excluded.id,quote:'record only'}]}))});
  h.engine.revise(h.run,{expectedCriterionVersion:1,feedback:'Keep the threshold'});await h.run.job;
  assert.equal(h.run.status,'awaiting_confirmation');assert.equal(h.run.criterionVersion,1);assert.equal(h.run.criteriaRevision,0);assert.equal(h.run.criteriaFeedback[0].status,'failed');assert.deepEqual(h.run.criteria[0].sourceEvidence,h.valid.sourceEvidence);assert.equal(h.run.approvedCriteria,null);
});

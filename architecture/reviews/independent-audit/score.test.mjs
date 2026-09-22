import test from 'node:test';
import assert from 'node:assert/strict';
import {scorePopulation as rawScore} from './score.mjs';
const snapshot='a'.repeat(64);
const scorePopulation=(population,reports)=>rawScore(population,reports,{expectedSnapshotSha256:snapshot});
const population=[{id:'A',moduleId:'M',stepIds:['STEP-00','STEP-01']},{id:'B',moduleId:'N',stepIds:['STEP-01']}];
const check=(id,status='PASS')=>({id,moduleId:id==='A'?'M':'N',status,rationale:'Independent evidence reviewed',evidence:['contract section']});
const review=(role,questionResults,issues=[])=>({role,reviewerId:role,evaluatedInputsSha256:snapshot,questionResults,issues});
test('missing and unverified remain in denominator; steps deduplicate questions',()=>{
  const s=scorePopulation(population,[review('clarity',[check('A')]),review('accuracy',[check('A'),check('B','UNVERIFIED')])]);
  assert.equal(s.total.clarity.score,50);assert.equal(s.total.ambiguityScore,50);
  assert.equal(s.total.accuracy.reviewCoverage,50);assert.equal(s.total.unresolvedAmbiguityQuestions,1);
  assert.equal(s.steps[1].denominator,2);assert.equal(s.accepted,false);
});
test('duplicate and unknown assessments cannot inflate score',()=>{
  assert.throws(()=>scorePopulation(population,[review('clarity',[check('A'),check('A')])]));
  assert.throws(()=>scorePopulation(population,[review('accuracy',[check('C')])]));
  assert.throws(()=>scorePopulation([...population,population[0]],[]));
});
test('all questions and no open issues are both necessary',()=>{
  const reports=['clarity','accuracy'].map(role=>review(role,population.map(q=>check(q.id))));
  assert.equal(scorePopulation(population,reports).accepted,true);
  reports[0].issues=[{id:'open',status:'open'}]; assert.equal(scorePopulation(population,reports).accepted,false);
  reports[0].issues[0].status='resolved';assert.equal(scorePopulation(population,reports).accepted,true);
});
test('empty population, missing evidence and wrong module reject',()=>{
  assert.throws(()=>scorePopulation([],[]));
  assert.throws(()=>scorePopulation(population,[review('clarity',[{...check('A'),evidence:[]}])]));
  assert.throws(()=>scorePopulation(population,[review('clarity',[{...check('A'),moduleId:'N'}])]));
});
test('missing/stale input seal and same person across roles reject',()=>{
  const r=review('clarity',[check('A')]);
  assert.throws(()=>rawScore(population,[r]));
  assert.throws(()=>scorePopulation(population,[{...r,evaluatedInputsSha256:'b'.repeat(64)}]));
  assert.throws(()=>scorePopulation(population,[{...r,evaluatedInputsSha256:undefined}]));
  assert.throws(()=>scorePopulation(population,[r,{...review('accuracy',[check('A')]),reviewerId:r.reviewerId}]));
});
test('blank rationale and evidence strings masquerading as arrays reject',()=>{
  for(const mutation of [{rationale:' '},{evidence:'x'},{evidence:[' ']},{evidence:[{}]}])
    assert.throws(()=>scorePopulation(population,[review('clarity',[{...check('A'),...mutation}])]));
});

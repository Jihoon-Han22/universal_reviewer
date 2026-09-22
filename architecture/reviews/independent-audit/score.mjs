// Strict question accounting. This tool computes opinions, not product acceptance.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const nonblank=value=>typeof value==='string' && value.trim().length>0;
const validEvidence=value=>nonblank(value) || (value && typeof value==='object' && nonblank(value.path) && nonblank(value.section));
export function scorePopulation(population, reports, {expectedSnapshotSha256}={}) {
  if (!Array.isArray(population) || !population.length) throw new Error('Empty population');
  if(!/^[a-f0-9]{64}$/.test(expectedSnapshotSha256||'')) throw new Error('Expected evaluation snapshot hash required');
  const ids=new Set(), byRole={clarity:new Map(),accuracy:new Map()};
  const reviewers={clarity:new Set(),accuracy:new Set()};
  for(const q of population) {
    if(!nonblank(q.id) || !nonblank(q.moduleId) || !Array.isArray(q.stepIds) || !q.stepIds.length || !q.stepIds.every(nonblank) || new Set(q.stepIds).size!==q.stepIds.length || ids.has(q.id)) throw new Error('Invalid or duplicate question');
    ids.add(q.id);
  }
  const issues=[];
  for(const r of reports) {
    if(!['clarity','accuracy'].includes(r.role) || !nonblank(r.reviewerId) || r.reviewerId!==r.reviewerId.trim() || !Array.isArray(r.questionResults) || (r.issues!==undefined&&!Array.isArray(r.issues))) throw new Error('Invalid review');
    if(r.evaluatedInputsSha256!==expectedSnapshotSha256) throw new Error('Missing or stale review snapshot: '+r.reviewerId);
    reviewers[r.role].add(r.reviewerId);
    if(reviewers.clarity.has(r.reviewerId)&&reviewers.accuracy.has(r.reviewerId)) throw new Error('Clarity/accuracy reviewer must differ');
    for(const q of r.questionResults) {
      if(!ids.has(q.id) || byRole[r.role].has(q.id)) throw new Error('Unknown or duplicate assessment: '+q.id);
      const status=String(q.status).toUpperCase();
      if(!['PASS','FAIL','UNVERIFIED'].includes(status) || !nonblank(q.rationale) || !Array.isArray(q.evidence) || !q.evidence.length || !q.evidence.every(validEvidence)) throw new Error('Invalid opinion/evidence: '+q.id);
      const expected=population.find(p=>p.id===q.id);
      if(q.moduleId!==expected.moduleId) throw new Error('Wrong module: '+q.id);
      byRole[r.role].set(q.id,{...q,status,reviewerId:r.reviewerId});
    }
    issues.push(...(r.issues||[]).filter(x=>x.status!=='resolved' && x.status!=='RESOLVED').map(x=>({...x,reviewerId:r.reviewerId})));
  }
  function group(qs) {
    const row={denominator:qs.length};
    for(const role of ['clarity','accuracy']) {
      const passed=qs.filter(q=>byRole[role].get(q.id)?.status==='PASS').length;
      const failed=qs.filter(q=>byRole[role].get(q.id)?.status==='FAIL').length;
      row[role]={passed,failed,unverified:qs.length-passed-failed,score:100*passed/qs.length,reviewCoverage:100*(passed+failed)/qs.length};
    }
    row.ambiguityScore=100-row.clarity.score;
    row.unresolvedAmbiguityQuestions=qs.length-row.clarity.passed;
    return row;
  }
  return {schemaVersion:1,scope:'declared design questions only; no implementation or universal coverage claim',
    completeProductAcceptance:false,total:group(population),
    modules:[...new Set(population.map(q=>q.moduleId))].map(moduleId=>({moduleId,...group(population.filter(q=>q.moduleId===moduleId))})),
    steps:[...new Set(population.flatMap(q=>q.stepIds))].sort().map(stepId=>({stepId,...group(population.filter(q=>q.stepIds.includes(stepId)))})),
    openIssues:issues,openIssueCount:issues.length,
    accepted:issues.length===0 && population.every(q=>['clarity','accuracy'].every(role=>byRole[role].get(q.id)?.status==='PASS'))};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [populationPath,output,...reportPaths]=process.argv.slice(2);
  if(!populationPath||!output||!reportPaths.length) throw new Error('Usage: score.mjs POPULATION.json OUTPUT.json REVIEW.json...');
  const sha=b=>createHash('sha256').update(b).digest('hex');
  const inputFiles=[];
  async function read(p){const bytes=await readFile(p);inputFiles.push({path:p.replaceAll('\\','/'),sha256:sha(bytes)});return JSON.parse(bytes);}
  const p=await read(populationPath), reviews=[];
  for(const path of reportPaths) reviews.push(await read(path));
  const snapshot=await readFile(resolve(p.evaluationSnapshot));
  const snapshotHash=sha(snapshot);
  if(p.evaluatedInputsSha256!==snapshotHash) throw new Error('Population snapshot hash mismatch');
  inputFiles.push({path:p.evaluationSnapshot,sha256:snapshotHash});
  const result=scorePopulation(p.questions,reviews,{expectedSnapshotSha256:snapshotHash});
  result.inputFiles=inputFiles; result.scoredAt=new Date().toISOString();
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({accepted:result.accepted,total:result.total,openIssues:result.openIssueCount}));
  if(!result.accepted) process.exitCode=1;
}

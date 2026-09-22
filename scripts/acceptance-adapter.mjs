import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotImplementation } from '../architecture/validation/acceptance.mjs';
import { PROFILE, HASH, ref, readRef, safeFile, writeJson } from './acceptance/shared.mjs';
import { executeBuiltin } from './acceptance/builtins.mjs';
import { loadExecutionEvidence, evaluateRecordedCase, validateGateOrigin } from './acceptance/evidence.mjs';
export { runContract } from './acceptance/contract.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function runGate(gateId,{projectRoot=ROOT,inputDirectory,runId,signal,acceptanceProfile}={}) {
  const root=path.resolve(projectRoot);
  if(acceptanceProfile!==PROFILE) throw Object.assign(new Error('Only the explicitly frozen CURRENT_REPRODUCTION scope is implemented.'),{code:'UNSUPPORTED_PROFILE'});
  if(typeof runId!=='string'||!runId||!/^[A-Za-z0-9-]+$/.test(runId))throw new Error('INVALID_RUN_ID');
  const registryRef=await ref(root,'scripts/acceptance/case-registry.json');
  const registry=JSON.parse(await readRef(root,registryRef));
  const gate=registry.gates[gateId];if(!gate)throw new Error('UNKNOWN_GATE');
  const definitions=registry.cases.filter(c=>c.gateId===gateId);
  if(definitions.length!==gate.caseIds.length||!definitions.length||definitions.some(c=>!gate.caseIds.includes(c.id)))throw new Error('INVALID_FROZEN_SCOPE');
  const errors=[];let freeze,freezeValid=false,loaded={cases:new Map(),artifacts:[],errors:[]};
  try {
    freeze=JSON.parse(await readFile(await safeFile(root,'.cache/rebuild/freeze.json'),'utf8'));
    if(freeze.schemaVersion!=='1.0'||freeze.acceptanceProfile!==PROFILE||!/^LOOP-\d{3}$/.test(freeze.loop)||!Number.isFinite(Date.parse(freeze.frozenAt))||!HASH.test(freeze.codeDigest??'')||freeze.registrySha256!==registryRef.sha256)throw new Error('INVALID_IMPLEMENTATION_FREEZE');
    const current=await snapshotImplementation(root);
    if(current.digest!==freeze.codeDigest)throw new Error('IMPLEMENTATION_CHANGED_SINCE_FREEZE');
    for(const source of registry.sourceReferences)await readRef(root,source);
    freezeValid=true;
    loaded=await loadExecutionEvidence(root,gateId,freeze,registryRef.sha256);
    errors.push(...loaded.errors,...validateGateOrigin(gateId,gate.executionKind,loaded));
    for(const caseId of loaded.cases.keys())if(!gate.caseIds.includes(caseId))errors.push(`CASE_OUTSIDE_FROZEN_SCOPE:${caseId}`);
  } catch(error) {errors.push(error.code==='ENOENT'?'IMPLEMENTATION_NOT_FROZEN':error.message);}
  const outputDirectory=`.cache/rebuild/acceptance-runs/${freeze?.loop??'UNFROZEN'}/${runId}/${gateId}`;
  const results=[];
  for(const definition of definitions) {
    signal?.throwIfAborted();
    if(!freezeValid)results.push({caseId:definition.id,state:'not_run',errors:['VALID_FREEZE_REQUIRED']});
    else if(definition.driver==='observations')results.push(await evaluateRecordedCase(root,definition,loaded.cases.get(definition.id),loaded.evidence));
    else results.push(await executeBuiltin(root,definition,{signal,outputDirectory}));
  }
  const tests={selected:definitions.length,passed:results.filter(c=>c.state==='passed').length,failed:results.filter(c=>c.state==='failed').length,skipped:results.filter(c=>c.state==='not_run').length};
  const compared=results.filter(r=>r.assertions?.length),matched=compared.filter(r=>r.state==='passed');
  const baselineReferences=[...new Map(definitions.flatMap(c=>c.baselineReferences).map(r=>[r.path,r])).values()];
  const details=await writeJson(root,`${outputDirectory}/cases.json`,{schemaVersion:'1.0',acceptanceProfile:PROFILE,gateId,runId,registry:registryRef,implementationDigest:freeze?.codeDigest??null,tests,errors,cases:results,completeProductAcceptance:false});
  const observations={tests,implementationExecutionVerified:gateId!=='G00'&&gateId!=='G14'&&tests.skipped===0&&tests.failed===0&&errors.length===0,oracleAccess:false,
    reproduction:{comparedCases:compared.length,matchedCases:matched.length,unexpectedDifferences:tests.failed,baselineLimitationsPreserved:tests.passed===tests.selected&&errors.length===0,baselineReferences},
    ...(loaded.evidence?.providerCalls?{providerCalls:loaded.evidence.providerCalls}:{}),
    ...(gateId==='G14'?{independentReviewer:loaded.evidence?.independentReviewer===true,reviewerId:loaded.evidence?.reviewerId??'',openCriticalHigh:loaded.evidence?.openCriticalHigh??null,openReproductionIssues:loaded.evidence?.openReproductionIssues??null}:{}),
    scope:{registry:registryRef,population:registry.population},notRun:tests.skipped,errors};
  const inputs=[registryRef,...new Map(definitions.flatMap(c=>c.inputs).map(r=>[r.path,r])).values()];
  const artifacts=[details,...loaded.artifacts,...results.flatMap(r=>r.artifacts??[])];
  return {gateId,acceptanceProfile:PROFILE,runId,state:tests.passed===tests.selected&&errors.length===0?'passed':tests.skipped===tests.selected?'not_run':'failed',executionKind:gate.executionKind,inputs,observations,artifacts,limitations:['Package/selftest, current reproduction, diagnostic ideal truth, provider execution and browser evidence remain distinct.','Missing/unsupported/unexecuted cases are retained in the selected denominator.','Unsigned command and observation artifacts require independent G14 inspection.']};
}

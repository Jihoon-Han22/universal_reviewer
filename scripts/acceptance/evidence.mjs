import { readFile } from 'node:fs/promises';
import { PROFILE, readRef, ref, safeFile, jsonPointer, compare } from './shared.mjs';

function requireCondition(condition, code) { if (!condition) throw new Error(code); }
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nonempty = value => Array.isArray(value) && value.length > 0;
export async function loadExecutionEvidence(root, gateId, freeze, registrySha256) {
  const name = `.cache/rebuild/evidence/${freeze.loop}/${gateId}-observations.json`;
  let evidence;
  try { evidence = JSON.parse(await readFile(await safeFile(root,name), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { missing: true, cases:new Map(), artifacts:[], errors:[] }; throw error; }
  const errors = [];
  try {
    requireCondition(evidence.schemaVersion === '1.0' && evidence.acceptanceProfile === PROFILE && evidence.gateId === gateId, 'EVIDENCE_PROFILE_OR_GATE');
    requireCondition(evidence.codeDigest === freeze.codeDigest && evidence.registrySha256 === registrySha256, 'STALE_EXECUTION_SCOPE');
    requireCondition(stamp(evidence.startedAt) && stamp(evidence.endedAt) && Date.parse(evidence.endedAt) >= Date.parse(evidence.startedAt) && Date.parse(evidence.startedAt) >= Date.parse(freeze.frozenAt), 'INVALID_EXECUTION_TIMES');
    requireCondition(evidence.exitCode === 0 && nonempty(evidence.command) && evidence.command.every(x=>typeof x==='string' && x.trim()), 'EXECUTION_COMMAND_FAILED');
    requireCondition(typeof evidence.origin === 'string' && evidence.origin.trim() && evidence.oracleAccess === false, 'EXECUTION_ORIGIN_OR_ORACLE');
    const plan = JSON.parse(await readRef(root, evidence.planRef));
    requireCondition(plan.schemaVersion === '1.0' && plan.acceptanceProfile === PROFILE && plan.gateId === gateId && plan.codeDigest === freeze.codeDigest && plan.registrySha256 === registrySha256, 'STALE_PLAN');
    requireCondition(stamp(plan.preparedAt) && Date.parse(plan.preparedAt) <= Date.parse(evidence.startedAt), 'PLAN_NOT_FROZEN_BEFORE_EXECUTION');
    requireCondition(Array.isArray(plan.cases) && Array.isArray(evidence.cases), 'INVALID_CASE_LIST');
    requireCondition(new Set(plan.cases.map(c=>c.caseId)).size === plan.cases.length && new Set(evidence.cases.map(c=>c.caseId)).size === evidence.cases.length, 'DUPLICATE_EXECUTION_CASE');
    const cases = new Map(evidence.cases.map(record=>[record.caseId,{record,plan:plan.cases.find(p=>p.caseId===record.caseId)}]));
    const artifacts = [await ref(root,name), evidence.planRef];
    for (const key of ['providerTraceRef','browserTraceRef','reviewTraceRef']) if (evidence[key]) { await readRef(root,evidence[key]); artifacts.push(evidence[key]); }
    return { evidence, plan, cases, artifacts, errors };
  } catch(error) { errors.push(error.message); return {evidence,cases:new Map(),artifacts:[await ref(root,name)],errors}; }
}

export async function evaluateRecordedCase(root, definition, entry, evidence) {
  if (!entry) return {caseId:definition.id,state:'not_run',errors:['MISSING_CASE_EXECUTION']};
  const {record,plan} = entry;
  try {
    requireCondition(record.state === 'passed' || record.state === 'failed', record.state === 'not_run' ? 'CASE_NOT_RUN' : 'CASE_SKIPPED_OR_INVALID_STATE');
    requireCondition(plan && nonempty(plan.assertions) && Array.isArray(plan.inputs) && nonempty(plan.baselineReferences) && Object.hasOwn(plan,'initialState') && nonempty(plan.actions), 'INCOMPLETE_CASE_PLAN');
    requireCondition(stamp(record.startedAt) && stamp(record.endedAt) && Date.parse(record.endedAt) >= Date.parse(record.startedAt) && Date.parse(record.startedAt) >= Date.parse(evidence.startedAt) && Date.parse(record.endedAt) <= Date.parse(evidence.endedAt), 'INVALID_CASE_TIMES');
    requireCondition(new Set(plan.assertions.map(a=>a.name)).size === plan.assertions.length, 'DUPLICATE_ASSERTION');
    for (const input of plan.inputs) await readRef(root,input);
    for (const required of definition.inputs) requireCondition(plan.inputs.some(r=>r.path===required.path && r.sha256===required.sha256), 'MISSING_FROZEN_INPUT');
    for (const baseline of plan.baselineReferences) {
      await readRef(root,baseline);
      requireCondition(definition.baselineReferences.some(r=>r.path===baseline.path&&r.sha256===baseline.sha256), 'BASELINE_OUTSIDE_CASE_SCOPE');
    }
    const actual = JSON.parse(await readRef(root,record.actualRef));
    const artifacts = [record.actualRef];
    for (const artifact of record.artifactRefs??[]) { await readRef(root,artifact); artifacts.push(artifact); }
    if (definition.kind === 'reference-state') {
      requireCondition(artifacts.some(a=>a.path.endsWith('.png')) && artifacts.some(a=>/dom.*\.json$|\.dom\.json$/i.test(a.path)), 'MISSING_BROWSER_PNG_OR_DOM');
      requireCondition(evidence.browser && typeof evidence.browser.userAgent === 'string' && evidence.browser.userAgent.length > 0, 'MISSING_ACTUAL_BROWSER');
    }
    const assertions = plan.assertions.map(assertion=>{
      requireCondition(typeof assertion.name === 'string' && assertion.name.trim() && Object.hasOwn(assertion,'expected'),'INVALID_ASSERTION');
      const observed = jsonPointer(actual,assertion.pointer);
      return {...assertion,actual:observed,passed:compare(observed,assertion.expected,assertion.operator)};
    });
    const passed = record.state === 'passed' && assertions.every(a=>a.passed);
    return {caseId:definition.id,state:passed?'passed':'failed',inputs:plan.inputs,baselineReferences:plan.baselineReferences,initialState:plan.initialState,actions:plan.actions,assertions,artifacts,errors:passed?[]:['BASELINE_DIFFERENCE_OR_EXECUTION_FAILURE']};
  } catch(error) { return {caseId:definition.id,state:error.message==='CASE_NOT_RUN'?'not_run':'failed',errors:[error.message]}; }
}

export function validateGateOrigin(gateId, executionKind, loaded) {
  const e=loaded.evidence, errors=[];
  if (['G03','G09'].includes(gateId) || executionKind==='live_implementation') {
    if (!e || !['gemini','e2b'].every(p=>Number.isSafeInteger(e.providerCalls?.[p]) && e.providerCalls[p]>0) || !e.providerTraceRef || !e.models || !e.templates || !e.versions) errors.push('MISSING_LIVE_PROVIDER_TRACE');
  }
  if (['G10','G11','G13'].includes(gateId)) {
    if (!e?.browserTraceRef || !e?.browser || !['name','version','userAgent'].every(k=>typeof e.browser[k]==='string'&&e.browser[k].trim())) errors.push('MISSING_BROWSER_EXECUTION');
  }
  if (gateId==='G14') {
    if (e?.independentReviewer!==true || typeof e.reviewerId!=='string' || !e.reviewerId.trim() || e.openCriticalHigh!==0 || e.openReproductionIssues!==0 || !e.reviewTraceRef) errors.push('MISSING_INDEPENDENT_REVIEW_OR_OPEN_ISSUES');
  }
  return errors;
}

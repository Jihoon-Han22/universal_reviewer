// Scope preparation only. This writes no execution result and must run before acceptance.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE, ref, parseCsv, writeJson } from './shared.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.version !== 'v24.13.1') throw new Error('SCOPE_PREPARATION_REQUIRES_PINNED_NODE_24_13_1');
const gateKinds = { G00: 'specification', G01: 'offline_implementation', G02: 'offline_implementation', G03: 'live_implementation', G04: 'offline_implementation', G05: 'offline_implementation', G06: 'offline_implementation', G07: 'offline_implementation', G08: 'offline_implementation', G09: 'live_implementation', G10: 'browser_implementation', G11: 'browser_implementation', G12: 'offline_implementation', G13: 'browser_implementation', G14: 'independent_review' };
const baselinePaths = ['architecture/DECISIONS.md', 'architecture/specs/06-verification.md', 'architecture/decomposition/core-modules.json', 'architecture/decomposition/ui-modules.json', 'architecture/traceability.csv', 'architecture/validation/dataset-inventory.json'];
const cache = new Map();
async function reference(name) { if (!cache.has(name)) cache.set(name, await ref(ROOT, name)); return cache.get(name); }
const modules = (await Promise.all(baselinePaths.slice(2, 4).map(async p => JSON.parse(await readFile(path.join(ROOT, p), 'utf8')).modules))).flat();
const traces = parseCsv(await readFile(path.join(ROOT, 'architecture/traceability.csv'), 'utf8'));
const questions = modules.flatMap(module => module.acceptanceQuestions.map(question => ({ module, question })));
if (new Set(modules.map(m => m.id)).size !== modules.length || new Set(questions.map(q => q.question.id)).size !== questions.length || traces.length !== questions.length) throw new Error('INVALID_SCOPE_POPULATION');
const cases = [];
const primaryGates = { 'CORE-01':'G01','CORE-02':'G02','CORE-03':'G12','CORE-04':'G03','CORE-05':'G03','CORE-06':'G03','CORE-07':'G04','CORE-08':'G04','CORE-09':'G04','CORE-10':'G04','CORE-11':'G05','CORE-12':'G05','CORE-13':'G02','CORE-14':'G05','CORE-15':'G09','CORE-16':'G11','CORE-17':'G11','CORE-18':'G11','CORE-19':'G03','CORE-20':'G01','CORE-21':'G00' };
function primaryGate(module, question, related) {
  if (module.id === 'CORE-21') {
    if (question.id.endsWith('C06')) return 'G06';
    if (['C01','C10','C14'].some(suffix=>question.id.endsWith(suffix))) return 'G14';
  }
  if (module.layer === 'ui') {
    if (['accessibility','performance'].includes(question.category)) return 'G13';
    if (Number(module.id.slice(3)) >= 15) return 'G11';
    return 'G10';
  }
  return primaryGates[module.id] ?? related.find(g=>g!=='G14');
}
const additionalSurfaces = {
  'CORE-14-C01':['G10'],'CORE-14-C02':['G10'],'CORE-14-C03':['G10','G11'],'CORE-14-C04':['G10'],'CORE-14-C05':['G11','G12'],'CORE-14-C06':['G10'],
  'CORE-19-C01':['G02','G11','G13'],'CORE-19-C02':['G04','G05'],'CORE-19-C03':['G02'],'CORE-19-C04':['G02','G10','G13'],'CORE-19-C05':['G13'],'CORE-19-X01':['G05'],
  'UI-01-C02':['G02'],'UI-01-C05':['G02'],'UI-11-C02':['G05'],'UI-11-C06':['G05'],'UI-11-C07':['G05'],'UI-17-C02':['G05'],
};
async function add(id, gateId, detail) {
  const baselineFiles = detail.baselineFiles ?? ['architecture/specs/06-verification.md'];
  cases.push({ id, gateId, executionKind: gateKinds[gateId], driver: 'observations', questionIds: [], implementationFiles: [], inputs: [], ...detail, baselineReferences: await Promise.all(baselineFiles.map(reference)) });
  delete cases.at(-1).baselineFiles;
}
for (const {module, question} of questions) {
  const trace = traces.find(t => t.question_id === question.id);
  if (!trace || trace.module_id !== module.id) throw new Error('TRACEABILITY_MISMATCH');
  const relatedGateIds = trace.future_product_gates.split(/\s+/).filter(Boolean);
  const gates = [...new Set([primaryGate(module, question, relatedGateIds), ...(additionalSurfaces[question.id]??[]), 'G14'])];
  for (const gateId of gates) await add(`${gateId}:${question.id}`, gateId, {
    kind: 'requirement', moduleId: module.id, questionIds: [question.id], relatedGateIds, requirement: question.question,
    mappingReason: gateId === 'G14' ? 'Independent inspection of the entire question and linked execution surfaces.' : `Owning ${module.layer} feature execution in ${gateId}; ${additionalSurfaces[question.id]?.length ? 'additional distinct algorithm/API/browser/resource surfaces retain separate cases' : 'original module-level related gate links remain provenance, not automatic duplicate execution'}.`,
    expectedScope: 'Compare CURRENT_REPRODUCTION behavior only; preserve the original question and independently document any OPTIONAL_FUTURE interpretation. An untested requirement remains NOT_RUN.',
    requiredEvidence: question.requiredEvidence, implementationFiles: module.sourceFiles,
    baselineFiles: [...new Set(['architecture/DECISIONS.md', 'architecture/specs/06-verification.md', ...module.specFiles.map(f => `architecture/${f}`)])],
  });
}
for (const [id, args] of [
  ['PACKAGE', ['architecture/tools/verify-package.mjs']],
  ['VALIDATOR-SELFTESTS', ['--test', 'architecture/validation/selftest.mjs', 'architecture/validation/acceptance-selftest.mjs', 'architecture/validation/package-validator-selftest.mjs']],
  ['V3-EVALUATOR-SELFTEST', ['architecture/validation/evaluate-v3.mjs', 'ralph-golden-v3', '--selftest']],
  ['PORTABILITY', ['architecture/tools/test-bootstrap.mjs']],
]) await add(`G00:${id}`, 'G00', { kind: 'package', driver: 'command', command: [process.execPath, ...args], expectedScope: 'Command exits 0; selftests include their positive and negative controls.', baselineFiles: ['architecture/validation/README.md'] });
for(const [gateId,features]of Object.entries({G01:['fresh-scaffold-and-both-lock-installs','actual-test-and-build','runtime-versions-and-browser-secret-scan'],G03:['PDF-reader-context','multi-sheet-XLSX-reader-context','DOCX-reader-context','CSV-reader-context','image-reader-context','bounded-repair-partial-timeout-cancel'],G09:['criteria-HITL-target-source-export-dashboard','actual-provider-error','actual-provider-cancellation']}))for(const feature of features)await add(`${gateId}:${feature}`,gateId,{kind:gateId==='G01'?'environment-execution':'live-integration',requirement:feature,expectedScope:'Execute the complete named current contract path with source-derived expectations, actual inputs, initial state, event order, error/limit branches and measured artifacts.',baselineFiles:['architecture/specs/01-state-api.md','architecture/specs/02-backend-pipeline.md','architecture/specs/06-verification.md']});
for (const [family, count, extension] of [['criteria', 20, 'xlsx'], ['ledger', 6, 'xlsx']]) {
  const prefix = family === 'criteria' ? 'C' : 'L';
  for (let n = 1; n <= count; n++) {
    const id = `${prefix}${String(n).padStart(2, '0')}`, input = `golden/${family}/${id}.${extension}`;
    await add(`G06:${id}`, 'G06', { kind: `golden-${family}`, requirement: `Run the actual ${family} implementation on ${id}; compare current behavior, flags and limits.`, inputs: [await reference(input)], evaluatorOnly: [`golden/${family}/${id}.json`], implementationFiles: family === 'criteria' ? ['server/documents.mjs', 'server/sandbox-documents.mjs', 'server/review.mjs', 'server/criteria-normalization.mjs'] : ['server/ledger.mjs'], expectedScope: family === 'criteria' ? 'Original bytes → reader/context → discovery → HITL projection, explicit exclusion/confirmation flags and source; no ideal-oracle replay.' : 'Original bytes → mapping → confirmed copy or current blocked state; preserve non-target cells, formulas, notes, and original bytes.' });
  }
}
for (let n = 1; n <= 13; n++) for (const extension of ['pdf', 'png']) {
  const id = `P${String(n).padStart(2, '0')}`;
  await add(`G06:${id}-${extension}`, 'G06', { kind: 'golden-cert', requirement: `Exercise ${id} ${extension} through the actual reader and extraction pipeline.`, inputs: [await reference(`golden/certs/${id}.${extension}`)], evaluatorOnly: [`golden/certs/${id}.json`], implementationFiles: ['server/documents.mjs', 'server/sandbox-documents.mjs', 'server/visual-transcription.mjs', 'server/review.mjs'], expectedScope: n === 10 ? (extension === 'png' ? 'First physical page only: 4 visible fields. The other 4 PDF fields are not PNG missing errors. Denominator remains 26 paths.' : 'All 8 fields across the complete PDF are diagnostic; preserve current cap and uncertainty.') : n === 13 ? 'Known fixture conflict: source 0.025 vs provided evaluator JSON 0.015. Record fixture-conflict separately; never inject or prefer 0.015.' : 'Compare extraction/source/current limits after execution. Semantic oracle agreement is diagnostic; undocumented failures are mismatches.', diagnostic: { p10VisibleFields: n === 10 ? (extension === 'png' ? 4 : 8) : null, fixtureConflict: n === 13 } });
}
const rules = JSON.parse(await readFile(path.join(ROOT, 'golden/rules.json'), 'utf8'));
if (rules.length !== 20) throw new Error('RULE_SCOPE_CHANGED');
for (const [index, rule] of rules.entries()) await add(`G06:R${String(index + 1).padStart(2, '0')}`, 'G06', { kind: 'golden-rule', driver: 'rule', ruleIndex: index, input: { raw: rule.raw }, inputs: [await reference('golden/rules.json')], implementationFiles: ['server/algorithms.mjs'], expectedScope: 'Compare parseRule to current spec §5, with the ideal fixture separately diagnostic. Do not feed op/value/unit oracle to product.', baselineFiles: ['architecture/specs/03-algorithms.md'], expected: index < 14 ? { comparison: { operator: ({'>=':'gte','<=':'lte','>':'gt','<':'lt','between':'range'})[rule.op], value: Array.isArray(rule.value) ? rule.value[0] : rule.value, ...(Array.isArray(rule.value) ? {upper:rule.value[1]} : {}), unit:rule.unit??'' }, needsConfirmation:false } : { comparison:null, needsConfirmation: index >= 16 } });
const requestFiles = (await readdir(path.join(ROOT, 'ralph-golden-v3/inputs/requests'))).filter(f => f.endsWith('.json')).sort();
if (requestFiles.length !== 8) throw new Error('V3_SCOPE_CHANGED');
for (const file of requestFiles) {
  const requestPath = `ralph-golden-v3/inputs/requests/${file}`, request = JSON.parse(await readFile(path.join(ROOT, requestPath), 'utf8'));
  await add(`G07:${request.case_id}`, 'G07', { kind: 'v3-report', requirement: 'Exercise the supplied request and its original report, criteria, and specified template.', inputs: await Promise.all([...new Set([requestPath, `ralph-golden-v3/${request.report}`, `ralph-golden-v3/${request.criteria}`, `ralph-golden-v3/${request.output_template}`])].map(reference)), implementationFiles: ['server/documents.mjs', 'server/sandbox-documents.mjs', 'server/visual-transcription.mjs', 'server/review.mjs', 'server/ledger.mjs'], expectedScope: 'Separate physical inventory from reader/context/visual coverage. Preserve 8 auxiliary images, 3 pages per VLM call, 30 pages per document, 180 seconds, omissions/stopReason/partial/review; 35 fields and 105 writer cells are diagnostics across the 8 reports.', baselineFiles: ['architecture/specs/02-backend-pipeline.md', 'architecture/specs/06-verification.md', 'architecture/specs/08-rebuild-coverage-geometry.md'] });
}
await add('G07:PHYSICAL-INVENTORY', 'G07', { kind: 'v3-inventory', expected: { reports:8, physicalPages:575, diagnosticFields:35, diagnosticWriterCells:105 }, expectedScope: 'Derive physical page inventory from original report bytes; do not equate inventory, local preview, reader, context, or VLM coverage.', inputs: await Promise.all(requestFiles.map(f => reference(`ralph-golden-v3/inputs/requests/${f}`))) });
for (const variant of ['baseline', 'shift', 'columns', 'transpose', 'blocks-hidden', 'renamed', 'scaled-both', 'changed-values', 'incompatible-unit', 'missing-required', 'unreadable', 'condition-mismatch', 'csv']) await add(`G08:${variant}`, 'G08', { kind:'public-transform', variant, expectedScope:'Run actual implementation with input-only documents and independently recorded/replayed model candidates. Compare the current source-derived relation; no case-ID branch, oracle output copy, new geometry, or sealed holdout requirement.', baselineFiles:['architecture/specs/06-verification.md','architecture/validation/fixture-generator.mjs'] });
for (const feature of ['keyboard-focus-dialog-Escape','ARIA-current-limitations','zoom-200-percent','OS-reduced-motion','app-motion-OFF','mobile-overflow','PDF-iframe-objectURL-cleanup','unmount-disconnect-cancel','measured-performance-no-invented-target']) await add(`G13:${feature}`,'G13',{kind:'browser-observation',requirement:feature,expectedScope:'Measure actual browser behavior and compare the current source-defined behavior/limitations; do not require OPTIONAL_FUTURE corrections or unmeasured absolute p95 targets.',baselineFiles:['architecture/specs/04-ui-motion.md','architecture/specs/05-dashboard-exports.md','architecture/specs/06-verification.md']});
const ui = JSON.parse(await readFile(path.join(ROOT, 'architecture/ui/reference/manifest.json'), 'utf8'));
for (const capture of ui.captures) await add(`G10:${capture.id}`, 'G10', { kind:'reference-state', requirement:capture.state, viewport:capture.viewport, motion:capture.motion, origin:'synthetic-source-replay', implementationFiles:['src/App.tsx','src/styles.css'], expectedScope:'Capture the actual implemented UI in this state and viewport; compare source-defined geometry, fonts, CSS, timing, event/lifecycle and existing limitations. Synthetic origin does not prove live provider execution.', baselineFiles:['architecture/specs/04-ui-motion.md','architecture/ui/reference/manifest.json',`architecture/ui/reference/${capture.screenshot.path}`,`architecture/ui/reference/${capture.dom.path}`] });
const algorithmCatalog = JSON.parse(await readFile(path.join(ROOT,'architecture/contracts/algorithm-edge-cases.json'),'utf8'));
for (const fixture of algorithmCatalog.fixtures.filter(f => f.mode === 'baseline' || f.profile === PROFILE)) await add(`G05:${fixture.id}`,'G05',{kind:'algorithm-baseline', driver:'algorithm', fixtureId:fixture.id, operation:fixture.operation, implementationFiles:['server/algorithms.mjs'], expectedScope:'Deep partial baseline projection, omitted-property and mutation/identity assertions as explicitly declared. OPTIONAL_FUTURE cases excluded.', baselineFiles:['architecture/contracts/algorithm-edge-cases.json','architecture/specs/03-algorithms.md']});
cases.sort((a,b)=>a.id.localeCompare(b.id,'en'));
if (new Set(cases.map(c=>c.id)).size !== cases.length) throw new Error('DUPLICATE_CASE');
const registry = {schemaVersion:'1.0',acceptanceProfile:PROFILE,frozenAt:new Date().toISOString(),executionStatus:'NOT_RUN',policy:'Scope freeze is not test execution. Every case is required; absent/invalid evidence is NOT_RUN or FAIL. Only CURRENT_REPRODUCTION source-derived assertions count. Runtime never receives evaluator-only values.',sourceReferences:await Promise.all(baselinePaths.map(reference)),population:{modules:modules.length,questions:questions.length,cases:cases.length,golden:{criteria:20,certPaths:26,ledger:6,rules:20},v3:{requests:8,reports:8,physicalPages:575,diagnosticFields:35,diagnosticWriterCells:105},publicTransforms:13,referenceStates:ui.captures.length},gates:Object.fromEntries(Object.entries(gateKinds).map(([gateId,executionKind])=>[gateId,{executionKind,caseIds:cases.filter(c=>c.gateId===gateId).map(c=>c.id)}])),modules:modules.map(m=>({id:m.id,questionIds:m.acceptanceQuestions.map(q=>q.id),implementationFiles:m.sourceFiles})),cases};
console.log(JSON.stringify({scope:await writeJson(ROOT,'scripts/acceptance/case-registry.json',registry),population:registry.population,gates:Object.fromEntries(Object.entries(registry.gates).map(([id,g])=>[id,g.caseIds.length])),executionStatus:'NOT_RUN'}));

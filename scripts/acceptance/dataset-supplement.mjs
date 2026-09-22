import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ref, readRef, sha256, writeJson } from './shared.mjs';
import { dependencyIdentity, verifyDependencyIdentity } from './dataset-supplement-dependencies.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROFILE = 'CURRENT_REPRODUCTION';
const [mode, argument, extra] = process.argv.slice(2);
if (process.version !== 'v24.13.1') throw new Error('PINNED_NODE_REQUIRED');
const runtime = { version: process.version, executable: process.execPath, executableSha256: sha256(await readFile(process.execPath)) };
const now = () => new Date().toISOString();
const helpers = ['scripts/acceptance/dataset-supplement.mjs', 'scripts/acceptance/dataset-supplement.py', 'scripts/acceptance/dataset-supplement-dependencies.mjs', 'scripts/acceptance/shared.mjs'];
async function documentJson(name) { const artifact = await ref(root, name); return { artifact, data: JSON.parse(await readRef(root, artifact)) }; }
async function stable(references) { const after = await Promise.all(references.map(item => ref(root, item.path))); return { after, matched: JSON.stringify(after) === JSON.stringify(references) }; }
async function freshPlan(loop, label, fields, sources) {
  if (!/^LOOP-\d{3}$/.test(loop)) throw new Error('EXPECTED_LOOP');
  const outputDirectory = `.cache/rebuild/evidence/${loop}/${label}-${now().replace(/[:.]/g, '-')}`;
  await mkdir(path.join(root, outputDirectory), { recursive: true });
  const implementationReferences = await Promise.all([...sources, ...helpers].map(name => ref(root, name)));
  const pythonExecutableRef = await ref(root, '.cache/rebuild/python/Scripts/python.exe');
  const dependencies = await dependencyIdentity(root, fields.kind);
  const plan = { schemaVersion: '1.0', acceptanceProfile: PROFILE, loop, preparedAt: now(), outputDirectory, runtime, pythonExecutableRef, implementationReferences, dependencies,
    finalGateFreeze: false, oracleAccess: false, providerCalls: { gemini: 0, e2b: 0 }, completeProductAcceptance: false, ...fields };
  const planRef = await writeJson(root, `${outputDirectory}/plan.json`, plan);
  console.log(JSON.stringify({ planRef, kind: plan.kind, scope: plan.scope, execution: plan.execution }));
}
if (mode === 'prepare-readers') {
  const { artifact: priorAuditRef, data: prior } = await documentJson(extra);
  const priorPlan = JSON.parse(await readRef(root, prior.planRef));
  const priorProgress = JSON.parse(await readRef(root, prior.readerProgressRef));
  const readerRef = await ref(root, 'server/sandbox-document-reader.py');
  if (readerRef.sha256 !== prior.dependencySeparation.physicalReader.programRef.sha256) throw new Error('PRIOR_READER_HASH_CHANGED');
  const retained = priorProgress.records.filter(record => record.readerExecuted);
  if (priorPlan.documents.length !== 70 || retained.length !== 54) throw new Error('EXPECTED_PRIOR_70_SCOPE_AND_54_READERS');
  for (const record of retained) { await readRef(root, record.input); await readRef(root, record.profileRef); for (const image of record.images) await readRef(root, image); }
  const documents = priorPlan.documents.filter(d => ['v3-criteria', 'v3-template'].includes(d.category));
  if (documents.length !== 10 || documents.some(d => retained.some(r => r.caseId === d.id))) throw new Error('EXPECTED_DISTINCT_10_SUPPLEMENT');
  for (const document of documents) await readRef(root, document.input);
  await freshPlan(argument, 'dataset-supplement', {
    kind: 'pre-execution-original-dataset-reader-supplement', priorAuditRef, priorPlanRef: prior.planRef, priorReaderProgressRef: prior.readerProgressRef,
    priorInventoryRef: prior.inventoryRef, priorAdmissionRef: prior.uploadsRef,
    priorReaderProgramRef: prior.dependencySeparation.physicalReader.programRef,
    priorAdmissionProgramRef: prior.dependencySeparation.uploadAdmission.programRef,
    originalScope: priorPlan.documents.map(d => ({ id: d.id, input: d.input, category: d.category })),
    retainedReaderRecords: retained.map(r => ({ caseId: r.caseId, input: r.input, profileRef: r.profileRef, images: r.images, status: r.status })),
    documents, scope: { originalDenominator: 70, retainedReaderCalls: 54, supplementalAdmissions: 10, supplementalReaderCalls: 10, originalOversizeRejections: 6 },
    execution: { upload: 'pinned-node scripts/acceptance/dataset-supplement.mjs upload <plan.json>', reader: 'pinned-python -B scripts/acceptance/dataset-supplement.py <plan.json>', finalize: 'pinned-node scripts/acceptance/dataset-supplement.mjs finalize <plan.json>' },
    policy: 'New actual admissions use the new DocumentStore hash. The 54 unchanged-reader artifacts and six older oversize admissions retain their original exact hashes and are never relabeled current admission evidence.',
  }, ['server/documents.mjs', 'server/sandbox-document-reader.py']);
} else if (mode === 'upload') {
  const { artifact: planRef, data: plan } = await documentJson(argument);
  if (plan.kind !== 'pre-execution-original-dataset-reader-supplement' || plan.documents.length !== 10 || plan.runtime.executableSha256 !== runtime.executableSha256) throw new Error('WRONG_SUPPLEMENT_PLAN_OR_RUNTIME');
  for (const item of plan.implementationReferences) await readRef(root, item);
  const dependencyBefore = await verifyDependencyIdentity(root, plan.kind, plan.dependencies);
  if (!dependencyBefore.matched) throw new Error('STALE_DEPENDENCY_IDENTITY');
  await writeFile(path.join(root, plan.outputDirectory, 'upload-started.json'), JSON.stringify({ planRef, runtime, startedAt: now(), pid: process.pid }), { flag: 'wx' });
  const { DocumentStore } = await import('../../server/documents.mjs');
  const records = [];
  for (const document of plan.documents) {
    const startedAt = now(), bytes = await readRef(root, document.input), store = new DocumentStore();
    let actual;
    try {
      const result = await store.add({ name: path.basename(document.input.path), role: document.role, buffer: bytes });
      const publicDocument = store.public(result);
      actual = { accepted: true, publicDocument, originalBufferUnchanged: sha256(result.buffer) === document.input.sha256,
        publicContainsPrivateData: ['buffer', 'modelParts', 'sandboxProfile', 'sourceRows', 'sourceSheets'].some(key => Object.hasOwn(publicDocument, key)) };
    } catch (error) { actual = { accepted: false, status: error.status ?? null, error: String(error.message) }; }
    records.push({ caseId: document.id, input: document.input, startedAt, endedAt: now(), actual,
      assertions: [{ name: 'valid under-limit original admits', expected: true, actual: actual.accepted, passed: actual.accepted === true },
        ...(actual.accepted ? [{ name: 'original buffer unchanged', expected: true, actual: actual.originalBufferUnchanged, passed: actual.originalBufferUnchanged }, { name: 'public DTO privacy', expected: false, actual: actual.publicContainsPrivateData, passed: !actual.publicContainsPrivateData }] : [])] });
    await writeJson(root, `${plan.outputDirectory}/upload-progress.json`, { records });
    console.log(JSON.stringify({ caseId: document.id, accepted: actual.accepted }));
  }
  const identity = await stable(plan.implementationReferences);
  const dependencyAfter = await verifyDependencyIdentity(root, plan.kind, plan.dependencies);
  identity.dependencies = { before: dependencyBefore, after: dependencyAfter };
  identity.matched = identity.matched && dependencyBefore.matched && dependencyAfter.matched;
  const uploadsRef = await writeJson(root, `${plan.outputDirectory}/uploads.json`, { planRef, runtime, records, identity, completedAt: now(), providerCalls: { gemini: 0, e2b: 0 } });
  console.log(JSON.stringify({ uploadsRef, accepted: records.filter(r => r.actual.accepted).length, implementationStable: identity.matched }));
  process.exitCode = !identity.matched || records.some(r => r.assertions.some(a => !a.passed)) ? 1 : 0;
} else if (mode === 'finalize') {
  const { artifact: planRef, data: plan } = await documentJson(argument);
  const { artifact: uploadsRef, data: uploads } = await documentJson(`${plan.outputDirectory}/uploads.json`);
  const { artifact: physicalRef, data: physical } = await documentJson(`${plan.outputDirectory}/physical-report.json`);
  if (plan.kind !== 'pre-execution-original-dataset-reader-supplement' || uploads.planRef.sha256 !== planRef.sha256 || physical.planRef.sha256 !== planRef.sha256 || physical.uploadsRef.sha256 !== uploadsRef.sha256) throw new Error('SUPPLEMENT_IDENTITY_MISMATCH');
  if (uploads.records.length !== 10 || physical.records.length !== 10 || new Set(physical.records.map(r => r.caseId)).size !== 10) throw new Error('MISSING_SUPPLEMENT_PATH');
  const prior = JSON.parse(await readRef(root, plan.priorReaderProgressRef));
  const currentReader = await ref(root, 'server/sandbox-document-reader.py');
  if (currentReader.sha256 !== plan.priorReaderProgramRef.sha256) throw new Error('RETAINED_READER_PROGRAM_CHANGED');
  for (const record of [...plan.retainedReaderRecords, ...physical.records.filter(r => r.profileRef)]) {
    await readRef(root, record.input); await readRef(root, record.profileRef); for (const image of record.images) await readRef(root, image);
  }
  const identity = await stable(plan.implementationReferences);
  identity.dependencies = await verifyDependencyIdentity(root, plan.kind, plan.dependencies);
  identity.matched = identity.matched && identity.dependencies.matched;
  const readerCalls = physical.records.filter(r => r.readerExecuted).length;
  const completedReaderCalls = physical.records.filter(r => r.readerExecuted && r.exitCode === 0 && r.profileRef).length;
  const assertions = [...uploads.records.flatMap(r => r.assertions), ...physical.records.flatMap(r => r.assertions ?? [])];
  const cases = plan.originalScope.map(d => {
    const newRecord = physical.records.find(r => r.caseId === d.id), oldRecord = prior.records.find(r => r.caseId === d.id);
    return { caseId: d.id, input: d.input, origin: newRecord ? 'supplemental-current-admission-and-reader' : oldRecord?.readerExecuted ? 'retained-exact-hash-reader-old-admission' : 'retained-old-oversize-admission', readerExecuted: newRecord ? newRecord.readerExecuted : oldRecord?.readerExecuted ?? false, recordRef: newRecord ? physicalRef : plan.priorReaderProgressRef, fullGateCaseStatus: 'not_run' };
  });
  const uploadIdentityMatched = uploads.identity?.matched === true;
  const exitCode = !uploadIdentityMatched || !identity.matched || physical.implementationStable !== true || physical.dependenciesStable !== true || physical.exitCode !== 0 || readerCalls !== 10 || completedReaderCalls !== 10 || assertions.some(a => !a.passed) ? 1 : 0;
  const reportRef = await writeJson(root, `${plan.outputDirectory}/report.json`, { schemaVersion: '1.0', acceptanceProfile: PROFILE, loop: plan.loop, kind: plan.testOnly === true ? 'synthetic-dataset-supplement-control' : 'actual-original-dataset-physical-supplement', testOnly: plan.testOnly === true, planRef, uploadsRef, physicalRef,
    priorAuditRef: plan.priorAuditRef, priorInventoryRef: plan.priorInventoryRef, priorAdmissionRef: plan.priorAdmissionRef, priorAdmissionProgramRef: plan.priorAdmissionProgramRef,
    currentAdmissionProgramRef: plan.implementationReferences.find(r => r.path === 'server/documents.mjs'), readerProgramRef: currentReader,
    runtime, pythonRuntime: physical.runtime, identity, uploadIdentityMatched, historicalRuntimeQualification: 'Retained 54 reader records keep the runtime recorded by the prior plan/progress; current runtime applies only to this supplement.', endedAt: now(), exitCode,
    counts: { originalDenominator: 70, retainedReaderCalls: 54, supplementalAdmissions: uploads.records.length, supplementalReaderCalls: readerCalls, supplementalCompletedReaderCalls: completedReaderCalls, totalCompletedReaderCalls: 54 + completedReaderCalls, originalOversizeRejections: 6, assertions: assertions.length, assertionFailures: assertions.filter(a => !a.passed).length, fullGateCasesPassed: 0 }, cases,
    providerCalls: { gemini: 0, e2b: 0 }, oracleAccess: false, finalGateFreeze: false, completeProductAcceptance: false,
    limitations: ['This is a version-qualified physical artifact inventory, not final gate or semantic acceptance.', 'Old admission observations retain the old DocumentStore hash. Only the ten supplemental admissions use the new code.', 'The 575-page inventory includes rejected reports and does not mean semantic coverage.'] });
  console.log(JSON.stringify({ reportRef, readerCalls, combinedCompletedReaderCalls: 54 + completedReaderCalls, originalDenominator: cases.length, exitCode })); process.exitCode = exitCode;
} else if (mode === 'prepare-workbook-inventory') {
  const { artifact: originalPlanRef, data: original } = await documentJson(extra);
  const documents = original.documents.filter(d => d.role === 'criteria' && d.kind === 'xlsx');
  if (documents.length !== 26 || original.documents.length !== 70) throw new Error('EXPECTED_26_ORIGINAL_CRITERIA_WORKBOOKS');
  for (const document of documents) await readRef(root, document.input);
  await freshPlan(argument, 'dataset-workbook-inventory', { kind: 'pre-execution-original-workbook-inventory', originalPlanRef, documents,
    scope: { originalDatasetDenominator: 70, criteriaWorkbookDenominator: 26, inventoryCalls: 26, rangeCalls: 0 },
    operations: documents.map(d => ({ caseId: d.id, input: d.input, operation: 'inventory' })),
    execution: 'pinned-python -B scripts/acceptance/dataset-supplement.py <plan.json>',
    policy: 'Physical helper only. After actual inventory, freeze bounded exact range requests separately; no oracle, model responses or criterion authoring.' }, ['server/criteria-workbook-profile.py']);
} else if (mode === 'prepare-workbook-ranges') {
  const { artifact: inventoryReportRef, data: inventory } = await documentJson(argument);
  const sourcePlan = JSON.parse(await readRef(root, inventory.planRef));
  if (sourcePlan.kind !== 'pre-execution-original-workbook-inventory' || inventory.records.length !== 26 || inventory.exitCode !== 0) throw new Error('COMPLETE_26_INVENTORIES_REQUIRED');
  if (inventory.implementationStable !== true || inventory.dependenciesStable !== true) throw new Error('STABLE_INVENTORY_EXECUTION_REQUIRED');
  if (!(await verifyDependencyIdentity(root, sourcePlan.kind, sourcePlan.dependencies)).matched) throw new Error('INVENTORY_DEPENDENCIES_CHANGED');
  const helper = await ref(root, 'server/criteria-workbook-profile.py');
  if (sourcePlan.implementationReferences.find(r => r.path === helper.path).sha256 !== helper.sha256) throw new Error('INVENTORY_HELPER_CHANGED');
  const operations = [], deferred = [];
  for (const record of inventory.records) {
    const actual = JSON.parse(await readRef(root, record.outputRef));
    const pending = actual.sheets.flatMap(sheet => sheet.regions.map(region => ({ sheet: sheet.name, range: region.range })));
    let usedArea = 0;
    for (let round = 1; round <= 2 && pending.length; round++) {
      const ranges = [], remaining = [];
      for (const selection of pending) {
        const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(selection.range);
        const column = text => [...text].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0);
        const area = match ? (column(match[3]) - column(match[1]) + 1) * (+match[4] - +match[2] + 1) : Infinity;
        if (!Number.isSafeInteger(area) || area <= 0 || area > 12000) { deferred.push({ caseId: record.caseId, ...selection, reason: 'invalid-or-over-current-12000-range-cap' }); continue; }
        if (ranges.length >= 18 || usedArea + area > 24000) { remaining.push(selection); continue; }
        usedArea += area; ranges.push(selection);
      }
      pending.splice(0, pending.length, ...remaining);
      if (!ranges.length) break;
      operations.push({ caseId: record.caseId, input: record.input, operation: 'read', round, request: { ranges }, requestedAreaCumulative: usedArea });
    }
    deferred.push(...pending.map(selection => ({ caseId: record.caseId, ...selection, reason: 'remaining-after-current-two-round-24000-area-budget' })));
  }
  await freshPlan(sourcePlan.loop, 'dataset-workbook-ranges', { kind: 'pre-execution-original-workbook-ranges', inventoryReportRef, inventoryPlanRef: inventory.planRef, documents: sourcePlan.documents, operations, deferred,
    scope: { criteriaWorkbookDenominator: 26, helperRangeCalls: operations.length, maximumRoundsPerWorkbook: 2, maximumRangesPerCall: 18, maximumSingleRangeArea: 12000, maximumCumulativeAreaPerWorkbook: 24000 },
    execution: 'pinned-python -B scripts/acceptance/dataset-supplement.py <plan.json>',
    policy: 'Inventory-region-only physical development slices. No normative criteria or model plan is authored here. Semantic replay requiring different canonical requests needs new pre-execution exact-request artifacts. Deferred ranges remain unresolved.' }, ['server/criteria-workbook-profile.py']);
} else throw new Error('Modes: prepare-readers LOOP audit.json; upload plan.json; finalize plan.json; prepare-workbook-inventory LOOP original-plan.json; prepare-workbook-ranges inventory-report.json');

// Synthetic metadata tests; no production application or provider is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { ACCEPTANCE_PROFILES, snapshotImplementation, checkAcceptance } from './acceptance.mjs';
import { sha256 } from './fixture-generator.mjs';
import { runGate } from './run-gate.mjs';
import { makePackage } from './test-package-fixture.mjs';
import { verifyPackage } from '../tools/verify-package.mjs';
const cache = path.resolve('.cache/architecture-verification'); await mkdir(cache, { recursive: true });
async function setup(acceptanceProfile = 'CURRENT_REPRODUCTION') {
  const root = await mkdtemp(path.join(cache, 'acceptance-selftest-'));
  for (const name of ['src/app.js', 'server/app.mjs', 'integrations/src/client.mjs', 'package.json', 'package-lock.json', 'integrations/package.json', 'integrations/package-lock.json']) { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), '{}'); }
  await makePackage({ root: path.join(root, 'architecture'), cache });
  const manifest = await snapshotImplementation(root);
  async function put(name, value) { const bytes = JSON.stringify(value); await writeFile(path.join(root, name), bytes); return { path: name, sha256: sha256(bytes) }; }
  const implementationManifest = await put('implementation.json', manifest), packageManifest = { path: 'architecture/package-manifest.json', sha256: sha256(await readFile(path.join(root, 'architecture/package-manifest.json'))) }, proof = await put('synthetic-proof.json', { synthetic: true });
  const reports = [];
  for (const [gateId, kinds] of Object.entries(ACCEPTANCE_PROFILES[acceptanceProfile])) {
    const r = { schemaVersion: '1.0', acceptanceProfile, gateId, state: 'passed', executionKind: kinds[0], implementationDigest: manifest.digest, packageManifestSha256: packageManifest.sha256, command: ['synthetic-selftest'], startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:01Z', exitCode: 0, inputs: [proof], artifacts: [proof], limitations: ['Synthetic metadata positive control only'], observations: { tests: { selected: 1, passed: 1, failed: 0, skipped: 0 }, reproduction: { comparedCases: 1, matchedCases: 1, unexpectedDifferences: 0, baselineLimitationsPreserved: true, baselineReferences: [proof] }, implementationExecutionVerified: true, oracleAccess: false, providerCalls: { gemini: 1, e2b: 1 }, sealedBeforeExecution: true, generatedAfterImplementationFreeze: true, independentEvaluator: true, heldoutSeedCount: 3, independentReviewer: true, reviewerId: 'synthetic-selftest', openCriticalHigh: 0 } };
    r.observations.openReproductionIssues = 0;
    reports.push(await put(gateId + '.json', r));
  }
  return { root, put, index: { schemaVersion: '1.0', acceptanceProfile, implementationManifest, packageManifest, gateReports: reports } };
}
test('consistent metadata is never a complete product pass, even with fabricated positive declarations', async () => {
  const { root, index } = await setup(), result = await checkAcceptance(root, index);
  assert.equal(result.evidenceConsistent, true); assert.equal(result.completeProductAcceptance, false); assert.equal(result.implementationExecuted, false);
});
test('missing required module report and an empty index fail', async () => {
  const { root, index } = await setup(); index.gateReports.pop();
  assert.equal((await checkAcceptance(root, index)).evidenceConsistent, false);
  assert.equal((await checkAcceptance(root, {})).evidenceConsistent, false);
});
test('stale artifact and changed implementation hashes fail', async () => {
  const { root, index } = await setup(); await writeFile(path.join(root, 'synthetic-proof.json'), 'changed');
  assert.equal((await checkAcceptance(root, index)).evidenceConsistent, false);
  await writeFile(path.join(root, 'src/app.js'), 'new code');
  assert.ok((await checkAcceptance(root, index)).errors.includes('implementation_digest_stale'));
});
test('validator selftests, raw fake adapter reports, skips, and zero selected tests cannot fill product gates', async () => {
  for (const change of [r => r.executionKind = 'evaluator_selftest', r => r.observations.tests = { selected: 0, passed: 0, failed: 0, skipped: 0 }, r => r.observations.tests.skipped = 1, r => r.observations.oracleAccess = true, r => { for (const k of Object.keys(r)) delete r[k]; Object.assign(r, { kind: 'contract-run', passed: true, completeProductAcceptance: false }); }]) {
    const { root, index, put } = await setup(); const r = JSON.parse(await readFile(path.join(root, 'G06.json'))); change(r); index.gateReports[6] = await put('G06.json', r);
    assert.equal((await checkAcceptance(root, index)).evidenceConsistent, false);
  }
});
test('gate runner rejects missing exports, stale nonce and zero test adapters', async () => {
  for (const body of ['export const noGate = true;', 'export async function runGate(gateId, c) { return {gateId,runId:"old",state:"passed",executionKind:"offline_implementation",observations:{tests:{selected:1,passed:1,failed:0,skipped:0}},inputs:[{}],artifacts:[{}]}; }', 'export async function runGate(gateId, c) { return {gateId,runId:c.runId,state:"passed",executionKind:"offline_implementation",observations:{tests:{selected:0,passed:0,failed:0,skipped:0}},inputs:[{}],artifacts:[{}]}; }']) {
    const { root } = await setup(), adapter = path.join(root, 'adapter.mjs'); await writeFile(adapter, body);
    const r = await runGate({ gateId: 'G02', adapter, projectRoot: root, output: path.join(root, '.cache/gates'), timeoutMs: 3000 });
    assert.equal(r.state, 'failed'); assert.equal(r.completeProductAcceptance, false);
  }
});

test('timeout followed by a late normal adapter return cannot pass', async () => {
  const { root } = await setup(), adapter = path.join(root, 'scripts/late-adapter.mjs');
  await mkdir(path.dirname(adapter), { recursive: true });
  await writeFile(adapter, `export async function runGate(gateId, c) { await new Promise(r => setTimeout(r, 100)); return {gateId,runId:c.runId,state:'passed',executionKind:'offline_implementation',observations:{tests:{selected:1,passed:1,failed:0,skipped:0}},inputs:[{}],artifacts:[{}]}; }`);
  const result = await runGate({ gateId:'G02', adapter, projectRoot:root, output:path.join(root,'.cache/late'), timeoutMs:20 });
  assert.equal(result.state, 'failed'); assert.equal(result.exitCode, 1);
  assert.ok(result.errors.includes('ADAPTER_TIMEOUT_OR_OUTPUT_LIMIT'));
});

test('successful gate records current package identity and a package mutation during execution fails', async () => {
  for (const mutate of [false, true]) {
    const { root, index } = await setup(), adapter = path.join(root, 'scripts/package-adapter.mjs');
    await mkdir(path.dirname(adapter), { recursive: true });
    const proof = { path:'synthetic-proof.json', sha256:sha256(await readFile(path.join(root,'synthetic-proof.json'))) };
    await writeFile(adapter, `import { writeFile } from 'node:fs/promises'; export async function runGate(gateId,c){ ${mutate ? "await writeFile(c.projectRoot+'/architecture/README.md','Mutation during the gate.');" : ''} return {gateId,acceptanceProfile:c.acceptanceProfile,runId:c.runId,state:'passed',executionKind:'offline_implementation',observations:{tests:{selected:1,passed:1,failed:0,skipped:0}},inputs:[${JSON.stringify(proof)}],artifacts:[${JSON.stringify(proof)}]}; }`);
    const result = await runGate({ gateId:'G02', adapter, projectRoot:root, output:path.join(root,'.cache/package-check'), timeoutMs:30000 });
    assert.equal(result.packageManifestSha256,index.packageManifest.sha256);
    assert.equal(result.state,mutate?'failed':'passed');
    if(mutate)assert.ok(result.errors.includes('package_mutated_or_invalid'));
  }
});

test('package manifest must be current, nonempty, and at the architecture path', async () => {
  const { root, index, put } = await setup();
  index.packageManifest = await put('empty-manifest.json', { files:[] });
  let r = await checkAcceptance(root,index);
  assert.ok(r.errors.includes('package_manifest_path'));
  index.packageManifest = await put('architecture/package-manifest.json',{schemaVersion:1,files:[]});
  r = await checkAcceptance(root,index);
  assert.ok(r.errors.includes('package_integrity_invalid'));
});

test('changed package contents and refreshed packages invalidate old gate evidence', async () => {
  const { root, index } = await setup();
  await writeFile(path.join(root,'architecture/README.md'),'Changed architecture contract.\n');
  let result = await checkAcceptance(root,index);
  assert.ok(result.errors.includes('package_integrity_invalid'));
  const refresh = await verifyPackage({packageRoot:path.join(root,'architecture'),args:['--refresh-manifest']});
  assert.equal(refresh.status,'pass');
  index.packageManifest.sha256 = sha256(await readFile(path.join(root,index.packageManifest.path)));
  result = await checkAcceptance(root,index);
  assert.ok(result.errors.some(e => e.endsWith(':package_manifest_digest')));
});

test('provider call and holdout counts reject strings, fractions, booleans and unsafe integers', async () => {
  const {root,index,put}=await setup('OPTIONAL_FUTURE');
  const original = JSON.parse(await readFile(path.join(root,'G08.json'),'utf8'));
  for(const value of ['3',3.5,true,null,0,-1,Number.MAX_SAFE_INTEGER+1]) {
    for(const field of ['gemini','e2b','heldoutSeedCount']) {
      const report = structuredClone(original);
      if(field==='heldoutSeedCount')report.observations[field]=value;else report.observations.providerCalls[field]=value;
      index.gateReports[8]=await put('G08.json',report);
      const result=await checkAcceptance(root,index);
      assert.ok(result.errors.includes(field==='heldoutSeedCount'?'G08:holdout_protocol':'G08:live_provider_calls'),String(value)+':'+field);
    }
  }
});

test('missing, unknown and mixed acceptance profiles fail closed', async () => {
  const {root,index,put}=await setup();
  for (const acceptanceProfile of [undefined, 'unknown', 'OPTIONAL_FUTURE']) {
    const copy=structuredClone(index); copy.acceptanceProfile=acceptanceProfile;
    assert.equal((await checkAcceptance(root,copy)).evidenceConsistent,false);
  }
  const report=JSON.parse(await readFile(path.join(root,'G02.json'),'utf8'));
  delete report.acceptanceProfile;
  index.gateReports[2]=await put('G02.json',report);
  assert.ok((await checkAcceptance(root,index)).errors.includes('G02:acceptance_profile_mismatch'));
});

test('current reproduction rejects every unresolved issue even when critical and high counts are zero', async () => {
  const {root,index,put}=await setup();
  assert.equal((await checkAcceptance(root,index)).evidenceConsistent,true);
  const report=JSON.parse(await readFile(path.join(root,'G14.json'),'utf8'));
  for(const openReproductionIssues of [undefined,1,'0',false,null]) {
    const changed=structuredClone(report); changed.observations.openReproductionIssues=openReproductionIssues;
    index.gateReports[14]=await put('G14.json',changed);
    assert.ok((await checkAcceptance(root,index)).errors.includes('G14:unresolved_reproduction_issues'));
  }
});

test('current reproduction requires measured baseline comparison and preserves existing limits without future holdout', async () => {
  const {root,index,put}=await setup();
  const report=JSON.parse(await readFile(path.join(root,'G08.json'),'utf8'));
  for(const key of ['providerCalls','sealedBeforeExecution','generatedAfterImplementationFreeze','independentEvaluator','heldoutSeedCount']) delete report.observations[key];
  index.gateReports[8]=await put('G08.json',report);
  assert.equal((await checkAcceptance(root,index)).evidenceConsistent,true);
  for(const change of [r=>delete r.observations.reproduction, r=>r.observations.reproduction.comparedCases=0, r=>r.observations.reproduction.matchedCases=0, r=>r.observations.reproduction.unexpectedDifferences=1, r=>r.observations.reproduction.baselineLimitationsPreserved=false, r=>r.observations.reproduction.baselineReferences=[], r=>r.observations.reproduction.baselineReferences[0].sha256='0'.repeat(64)]) {
    const changed=structuredClone(report); change(changed); index.gateReports[8]=await put('G08.json',changed);
    assert.equal((await checkAcceptance(root,index)).evidenceConsistent,false);
  }
});

test('gate runner rejects an adapter that does not echo the selected profile', async () => {
  const {root}=await setup(), adapter=path.join(root,'adapter.mjs');
  await writeFile(adapter, `export async function runGate(gateId,c){return {gateId,acceptanceProfile:'OPTIONAL_FUTURE',runId:c.runId,state:'passed',executionKind:'offline_implementation',observations:{tests:{selected:1,passed:1,failed:0,skipped:0}},inputs:[{}],artifacts:[{}]};}`);
  const result=await runGate({gateId:'G02',adapter,projectRoot:root,output:path.join(root,'.cache/profile'),timeoutMs:30000});
  assert.equal(result.state,'failed'); assert.deepEqual(result.errors,['acceptance_profile_mismatch']);
});

test('gate runner rejects inherited profile names before touching paths or dispatching adapters', async () => {
  for(const [acceptanceProfile,gateId] of [['__proto__','toString'],['toString','length'],['constructor','name'],['unknown','G02']]) {
    await assert.rejects(runGate({acceptanceProfile,gateId}),/invalid acceptance profile/);
  }
});

test('evidence cannot escape the project through an ancestor directory junction', async () => {
  const {root,index,put}=await setup();
  const outside=await mkdtemp(path.join(cache,'outside-proof-'));
  const bytes=JSON.stringify({synthetic:true});
  await writeFile(path.join(outside,'proof.json'),bytes);
  await symlink(outside,path.join(root,'proofs'),process.platform==='win32'?'junction':'dir');
  const report=JSON.parse(await readFile(path.join(root,'G02.json'),'utf8'));
  report.artifacts=[{path:'proofs/proof.json',sha256:sha256(bytes)}];
  index.gateReports[2]=await put('G02.json',report);
  const result=await checkAcceptance(root,index);
  assert.equal(result.evidenceConsistent,false);
  assert.ok(result.errors.includes('G02:artifacts:missing_invalid_or_stale_artifact'));
});

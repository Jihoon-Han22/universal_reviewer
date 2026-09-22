// Evidence consistency check, not an oracle of application correctness or honesty.
import { readFile, readdir, lstat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './fixture-generator.mjs';
import { verifyPackage } from '../tools/verify-package.mjs';
const FUTURE_GATES = Object.freeze({
  G00: ['specification'], G01: ['offline_implementation'], G02: ['offline_implementation'],
  G03: ['live_implementation'], G04: ['offline_implementation', 'live_implementation'],
  G05: ['offline_implementation', 'live_implementation'], G06: ['live_implementation'],
  G07: ['live_implementation'], G08: ['live_implementation'], G09: ['live_implementation'],
  G10: ['browser_implementation'], G11: ['browser_implementation'], G12: ['offline_implementation', 'browser_implementation'],
  G13: ['browser_implementation'], G14: ['independent_review'],
});
export const DEFAULT_ACCEPTANCE_PROFILE = 'CURRENT_REPRODUCTION';
export const GATES = Object.freeze({ ...FUTURE_GATES,
  G06: ['offline_implementation', 'live_implementation'],
  G07: ['offline_implementation', 'live_implementation'],
  G08: ['offline_implementation', 'live_implementation'],
});
export const ACCEPTANCE_PROFILES = Object.freeze({ CURRENT_REPRODUCTION: GATES, OPTIONAL_FUTURE: FUTURE_GATES });
const SCOPE = ['src', 'server', 'integrations', 'scripts', 'public', 'package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'vite.config.ts'];
const REQUIRED = ['src', 'server', 'integrations/src', 'package.json', 'package-lock.json', 'integrations/package.json', 'integrations/package-lock.json'];
const hashPattern = /^[a-f0-9]{64}$/;
const positiveCount = value => Number.isSafeInteger(value) && value > 0;
export const PACKAGE_MANIFEST_PATH = 'architecture/package-manifest.json';
export async function currentPackageManifestSha256(root) {
  const packageRoot = path.resolve(root, 'architecture');
  const info = await lstat(packageRoot);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('invalid architecture directory');
  const manifest = path.join(packageRoot, 'package-manifest.json'), manifestInfo = await lstat(manifest);
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) throw new Error('invalid package manifest');
  const before = await readFile(manifest);
  const validation = await verifyPackage({ packageRoot });
  if (validation.status !== 'pass') throw new Error('invalid or stale architecture package');
  const after = await readFile(manifest);
  if (!before.equals(after)) throw new Error('package manifest changed during verification');
  return sha256(after);
}
function local(root, name) {
  if (typeof name !== 'string' || !name || path.isAbsolute(name) || name.split(/[\\/]/).some(p => p === '..' || p === '.env' || p.startsWith('.env.'))) throw new Error('invalid evidence path');
  const p = path.resolve(root, name);
  if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error('path outside project');
  return p;
}
async function regularArtifactPath(root, name) {
  const destination = local(root, name), parts = path.relative(path.resolve(root), destination).split(path.sep);
  let current = path.resolve(root);
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink() || (index === parts.length - 1 ? !info.isFile() : !info.isDirectory())) throw new Error('unsafe evidence path');
  }
  return destination;
}
export async function snapshotImplementation(root) {
  root = path.resolve(root);
  for (const name of REQUIRED) await lstat(local(root, name));
  const files = [];
  async function walk(p) {
    const info = await lstat(p);
    if (info.isSymbolicLink()) throw new Error('implementation symlink not allowed');
    if (info.isDirectory()) { for (const name of (await readdir(p)).sort()) { if (['node_modules', '.git', '.cache', 'dist'].includes(name)) continue; await walk(path.join(p, name)); } }
    else if (info.isFile()) { const rel = path.relative(root, p).replaceAll('\\', '/'); local(root, rel); files.push({ path: rel, sha256: sha256(await readFile(p)) }); }
    else throw new Error('special implementation file not allowed');
  }
  for (const name of SCOPE) { const p = local(root, name); try { await lstat(p); } catch (e) { if (e.code === 'ENOENT') continue; throw e; } await walk(p); }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  if (!files.some(f => f.path.startsWith('src/')) || !files.some(f => f.path.startsWith('server/')) || !files.some(f => f.path.startsWith('integrations/src/'))) throw new Error('missing implementation module files');
  return { schemaVersion: '1.0', scope: SCOPE, files, digest: sha256(JSON.stringify(files)) };
}
export async function checkAcceptance(root, index) {
  const errors = [], checked = [];
  const add = (ok, message) => { if (!ok) errors.push(message); };
  async function artifact(ref, label) {
    try {
      if (!hashPattern.test(ref?.sha256 ?? '')) throw new Error('invalid hash');
      const p = await regularArtifactPath(root, ref.path);
      const bytes = await readFile(p); if (sha256(bytes) !== ref.sha256) throw new Error('stale hash');
      return bytes;
    } catch { errors.push(label + ':missing_invalid_or_stale_artifact'); return null; }
  }
  add(index?.schemaVersion === '1.0', 'index_schema');
  const acceptanceProfile = index?.acceptanceProfile;
  add(Object.hasOwn(ACCEPTANCE_PROFILES, acceptanceProfile), 'acceptance_profile_missing_or_unknown');
  const gates = ACCEPTANCE_PROFILES[acceptanceProfile] ?? GATES;
  let current;
  try { current = await snapshotImplementation(root); } catch { errors.push('implementation_inventory_missing'); }
  const manifestBytes = await artifact(index?.implementationManifest, 'implementation_manifest');
  if (manifestBytes) try { const saved = JSON.parse(manifestBytes); add(current && saved.digest === current.digest && JSON.stringify(saved.files) === JSON.stringify(current.files), 'implementation_digest_stale'); } catch { errors.push('implementation_manifest_invalid'); }
  add(index?.packageManifest?.path === PACKAGE_MANIFEST_PATH, 'package_manifest_path');
  await artifact(index?.packageManifest, 'package_manifest');
  let packageDigest;
  try { packageDigest = await currentPackageManifestSha256(root); } catch { errors.push('package_integrity_invalid'); }
  add(hashPattern.test(packageDigest ?? '') && index?.packageManifest?.sha256 === packageDigest, 'package_manifest_not_current');
  const refs = Array.isArray(index?.gateReports) ? index.gateReports : [];
  add(refs.length === Object.keys(gates).length, 'required_gate_count');
  const ids = new Set();
  for (const [n, ref] of refs.entries()) {
    const bytes = await artifact(ref, 'gate_report_' + n); if (!bytes) continue;
    let r; try { r = JSON.parse(bytes); } catch { errors.push('gate_report_invalid_json'); continue; }
    const id = r.gateId, prefix = `${id ?? 'unknown'}:`;
    add(Object.hasOwn(gates, id), prefix + 'unknown_gate');
    add(r.acceptanceProfile === acceptanceProfile && Object.hasOwn(ACCEPTANCE_PROFILES, r.acceptanceProfile), prefix + 'acceptance_profile_mismatch');
    add(!ids.has(id), prefix + 'duplicate_gate'); ids.add(id);
    add(r.schemaVersion === '1.0' && r.state === 'passed', prefix + 'not_passed');
    add(gates[id]?.includes(r.executionKind), prefix + 'wrong_execution_kind');
    add(hashPattern.test(r.packageManifestSha256 ?? '') && r.packageManifestSha256 === packageDigest, prefix + 'package_manifest_digest');
    add(r.implementationDigest === current?.digest && hashPattern.test(r.implementationDigest ?? ''), prefix + 'implementation_digest');
    add(Array.isArray(r.command) && r.command.length > 0 && r.command.every(v => typeof v === 'string' && v.length > 0), prefix + 'command');
    add(Number.isFinite(Date.parse(r.startedAt)) && Number.isFinite(Date.parse(r.endedAt)) && Date.parse(r.endedAt) >= Date.parse(r.startedAt), prefix + 'timestamps');
    add(r.exitCode === 0, prefix + 'exit_code');
    add(Array.isArray(r.limitations), prefix + 'limitations');
    const o = r.observations, t = o?.tests;
    add(t && Number.isSafeInteger(t.selected) && t.selected > 0 && t.passed === t.selected && t.failed === 0 && t.skipped === 0, prefix + 'zero_failed_or_skipped_tests');
    if (id !== 'G00' && id !== 'G14') add(o?.implementationExecutionVerified === true && o?.oracleAccess === false, prefix + 'execution_or_oracle_not_verified');
    if (['G03', 'G09'].includes(id) || r.executionKind === 'live_implementation' || (acceptanceProfile === 'OPTIONAL_FUTURE' && ['G06', 'G07', 'G08'].includes(id))) add(positiveCount(o?.providerCalls?.gemini) && positiveCount(o?.providerCalls?.e2b), prefix + 'live_provider_calls');
    if (acceptanceProfile === 'OPTIONAL_FUTURE' && id === 'G08') add(o?.sealedBeforeExecution === true && o?.generatedAfterImplementationFreeze === true && o?.independentEvaluator === true && Number.isSafeInteger(o?.heldoutSeedCount) && o.heldoutSeedCount >= 3, prefix + 'holdout_protocol');
    if (acceptanceProfile === 'CURRENT_REPRODUCTION' && id !== 'G00' && id !== 'G14') {
      const comparison = o?.reproduction;
      add(positiveCount(comparison?.comparedCases) && comparison.matchedCases === comparison.comparedCases && comparison.unexpectedDifferences === 0 && comparison.baselineLimitationsPreserved === true, prefix + 'reproduction_comparison');
      add(Array.isArray(comparison?.baselineReferences) && comparison.baselineReferences.length > 0, prefix + 'baseline_references_empty');
      for (const ref of Array.isArray(comparison?.baselineReferences) ? comparison.baselineReferences : []) await artifact(ref, prefix + 'baseline_reference');
    }
    if (id === 'G14') add(o?.independentReviewer === true && typeof o?.reviewerId === 'string' && o.reviewerId.length > 0 && o?.openCriticalHigh === 0, prefix + 'independent_review');
    if (id === 'G14' && acceptanceProfile === 'CURRENT_REPRODUCTION') add(o?.openReproductionIssues === 0, prefix + 'unresolved_reproduction_issues');
    for (const group of ['inputs', 'artifacts']) {
      add(Array.isArray(r[group]) && r[group].length > 0, prefix + group + '_empty');
      for (const entry of Array.isArray(r[group]) ? r[group] : []) await artifact(entry, prefix + group);
    }
    checked.push(id);
  }
  for (const id of Object.keys(gates)) add(ids.has(id), id + ':missing_required_gate');
  return { schemaVersion: '1.0', acceptanceProfile: acceptanceProfile ?? null, kind: 'acceptance-evidence-consistency', status: errors.length ? 'fail' : 'ready_for_independent_verification', evidenceConsistent: errors.length === 0, completeProductAcceptance: false, implementationExecuted: false, checkedGates: checked, errors, limitations: ['File hashes and structured declarations do not authenticate provider calls, independence, baseline comparisons, or semantic correctness. Independently inspect the recorded artifacts and execute the selected profile in specs/06-verification.md.'] };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [verb, root, target] = process.argv.slice(2);
  if (!['snapshot', 'check'].includes(verb) || !root || !target || process.argv.length !== 5) { console.error('Usage: node acceptance.mjs snapshot PROJECT_ROOT OUTPUT_MANIFEST | check PROJECT_ROOT EVIDENCE_INDEX_JSON'); process.exitCode = 2; }
  else try {
    if (verb === 'snapshot') { const result = await snapshotImplementation(root); await mkdir(path.dirname(path.resolve(target)), { recursive: true }); await writeFile(target, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ kind: 'implementation-inventory', files: result.files.length, digest: result.digest, completeProductAcceptance: false })); }
    else { const result = await checkAcceptance(path.resolve(root), JSON.parse(await readFile(target, 'utf8'))); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.evidenceConsistent ? 0 : 1; }
  } catch { console.error(JSON.stringify({ status: 'fail', error: 'ACCEPTANCE_INPUT_INVALID', completeProductAcceptance: false })); process.exitCode = 1; }
}

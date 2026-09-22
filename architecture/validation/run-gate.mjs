// Dispatch a future implementation's tests. Adapter declarations still need independent verification.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCEPTANCE_PROFILES, DEFAULT_ACCEPTANCE_PROFILE, snapshotImplementation, currentPackageManifestSha256 } from './acceptance.mjs';
import { sha256 } from './fixture-generator.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
export async function runGate({ gateId, adapter, projectRoot, output, timeoutMs = 3600000, acceptanceProfile = DEFAULT_ACCEPTANCE_PROFILE }) {
  if (!Object.hasOwn(ACCEPTANCE_PROFILES, acceptanceProfile)) throw new Error('invalid acceptance profile');
  const gates = ACCEPTANCE_PROFILES[acceptanceProfile];
  if (!gates || !Object.hasOwn(gates, gateId) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 21600000) throw new Error('invalid profile, gate or timeout');
  projectRoot = path.resolve(projectRoot); adapter = path.resolve(adapter); output = path.resolve(output);
  await mkdir(output, { recursive: true });
  const packageManifestSha256 = await currentPackageManifestSha256(projectRoot);
  const before = await snapshotImplementation(projectRoot), adapterDigest = sha256(await readFile(adapter));
  const runId = randomUUID(), startedAt = new Date().toISOString(), requestPath = path.join(output, `${gateId}.${runId}.request.json`);
  await writeFile(requestPath, JSON.stringify({ gateId, acceptanceProfile }));
  const call = await new Promise(resolve => {
    const deadline = performance.now() + timeoutMs;
    const child = spawn(process.execPath, [path.join(here, 'adapter-worker.mjs'), adapter, requestPath, projectRoot, runId, String(timeoutMs), 'gate'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', bytes = 0, killed = false, expired = false;
    const timer = setTimeout(() => { expired = true; }, timeoutMs);
    const killTimer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeoutMs + 10000);
    const clearTimers = () => { clearTimeout(timer); clearTimeout(killTimer); };
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) { killed = true; child.kill('SIGKILL'); } else stdout += chunk; });
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimers(); resolve({ error: 'ADAPTER_PROCESS_FAILED' }); });
    child.on('close', code => { clearTimers(); expired ||= performance.now() >= deadline; if (killed || expired || code !== 0) return resolve({ error: killed || expired ? 'ADAPTER_TIMEOUT_OR_OUTPUT_LIMIT' : 'ADAPTER_FAILED' }); try { const marker = '\nGSPEC_CONTRACT_RESULT:', start = stdout.lastIndexOf(marker); if (start < 0) throw new Error(); resolve({ result: JSON.parse(stdout.slice(start + marker.length).trim()) }); } catch { resolve({ error: 'ADAPTER_RESULT_INVALID' }); } });
  });
  const r = call.result, tests = r?.observations?.tests, errors = [];
  if (call.error) errors.push(call.error);
  if (r?.runId !== runId || r?.gateId !== gateId) errors.push('stale_or_wrong_gate');
  if (r?.acceptanceProfile !== acceptanceProfile) errors.push('acceptance_profile_mismatch');
  if (r?.state !== 'passed' || !gates[gateId].includes(r?.executionKind)) errors.push('gate_not_passed');
  if (!tests || !Number.isSafeInteger(tests.selected) || tests.selected < 1 || tests.passed !== tests.selected || tests.failed !== 0 || tests.skipped !== 0) errors.push('invalid_test_counts');
  if (!Array.isArray(r?.inputs) || !r.inputs.length || !Array.isArray(r?.artifacts) || !r.artifacts.length) errors.push('missing_artifacts');
  if ((await snapshotImplementation(projectRoot)).digest !== before.digest || sha256(await readFile(adapter)) !== adapterDigest) errors.push('implementation_or_adapter_mutated');
  try { if (await currentPackageManifestSha256(projectRoot) !== packageManifestSha256) errors.push('package_mutated'); } catch { errors.push('package_mutated_or_invalid'); }
  const report = { schemaVersion: '1.0', acceptanceProfile, gateId, runId, state: errors.length ? 'failed' : 'passed', executionKind: r?.executionKind ?? 'specification', implementationDigest: before.digest, packageManifestSha256, adapterSha256: adapterDigest, command: ['node', 'architecture/validation/run-gate.mjs', gateId, adapter, projectRoot, output, String(timeoutMs), acceptanceProfile], startedAt, endedAt: new Date().toISOString(), exitCode: errors.length ? 1 : 0, inputs: r?.inputs ?? [], observations: r?.observations ?? {}, artifacts: r?.artifacts ?? [], limitations: [...(Array.isArray(r?.limitations) ? r.limitations : []), 'Adapter declarations are unverified until independent artifact review.'], errors, completeProductAcceptance: false };
  await writeFile(path.join(output, `${gateId}.json`), JSON.stringify(report, null, 2) + '\n'); return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [gateId, adapter, projectRoot, output, timeout, acceptanceProfile] = process.argv.slice(2);
  if (!gateId || !adapter || !projectRoot || !output || process.argv.length > 8) { console.error('Usage: node run-gate.mjs GATE_ID ADAPTER_MJS PROJECT_ROOT OUTPUT_DIRECTORY [TIMEOUT_MS] [CURRENT_REPRODUCTION|OPTIONAL_FUTURE]'); process.exitCode = 2; }
  else try { const r = await runGate({ gateId, adapter, projectRoot, output, ...(timeout ? { timeoutMs: Number(timeout) } : {}), ...(acceptanceProfile ? { acceptanceProfile } : {}) }); console.log(JSON.stringify({ gateId, acceptanceProfile: r.acceptanceProfile, state: r.state, errors: r.errors, completeProductAcceptance: false })); process.exitCode = r.exitCode; }
  catch { console.error(JSON.stringify({ state: 'failed', error: 'GATE_INPUT_INVALID', completeProductAcceptance: false })); process.exitCode = 1; }
}

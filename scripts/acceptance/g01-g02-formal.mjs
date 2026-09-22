// Preparation candidate. Importing this module performs no product/network work.
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { spawn } from 'node:child_process';

export const PROFILE = 'CURRENT_REPRODUCTION';
export const PROBES = Object.freeze(['configuration', 'adapter', 'adapter-queues', 'local-session', 'resource-order', 'http', 'restart', 'legacy', 'cancellation', 'workers', 'run-limits', 'request-limits']);
const SELF = fileURLToPath(import.meta.url);
const DRAFT = 'scripts/acceptance/g01-g02-runtime.mjs';
const REGISTRY = 'scripts/acceptance/case-registry.json';
const PINNED = '.cache/runtime/node-v24.13.1-win-x64/node.exe';
const DEADLINE_MS = 180000;
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const CLEANUP_GRACE_MS = 5000;
const now = () => new Date().toISOString();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (value, message) => { if (!value) throw new Error(message); };
const rel = (root, file) => path.relative(root, file).replaceAll('\\', '/');
const same = isDeepStrictEqual;
const a = (name, pointer, expected) => ({ name, pointer, expected, operator: 'deepEqual' });
const errorRecord = error => ({ name: error?.name ?? 'Error', code: error?.code ?? 'COLLECTOR_ERROR', message: String(error?.message ?? error) });

// These are additional *unexecuted* facets found by comparing the draft with
// the owning registry/contracts. They never turn a source inspection into PASS.
export const ADDITIONAL_GAPS = Object.freeze({
  'G01:CORE-01-C01': ['Required/optional key checks, invalid model configuration, template default/override, CONFIG_READ, frozen config object, and the complete role/default matrix are not invoked by this configuration probe. No template-format validator is claimed.'],
  'G02:CORE-02-C02': ['The restart probe creates two in-process app/store instances; actual OS entry-process restart is not observed.'],
  'G02:CORE-02-C03': ['Only one retained target and one unreferenced target deletion are invoked; criteria/analysis reference variants remain unexecuted.'],
  'G02:CORE-13-C01': ['The normal criteria-first and legacy paths do not establish the complete run/document enum, empty-result and terminal aggregation matrix.'],
  'G02:CORE-13-C05': ['Partial/failed edit eligibility, cancelled rejection, repeated edits preserving the first machine status, and exported audit content remain unexecuted.']
});
// Narrow stale draft descriptions after wiring its previously orphan probes.
// Preserve required scope without demanding impossible multipart combinations.
const REMAINING = {
  'G01:CORE-01-C02': ['The full prompt/contents/systemInstruction/default-role and validation callback matrix remains unexecuted; the draft records a single callback rejection and contents-priority example.'],
  'G01:CORE-01-C03': ['Document deadline/cleanup precedence, active-abort slot retention in both real provider adapters, and late-create timeout ordering remain incomplete. Added actual adapter queued-abort, stream-break and late-create abort observations cover bounded subfacets only.'],
  'G02:CORE-02-C04': ['Exercise total-parts13/14 middleware error precedence, multipart field-name/wrong-file-field branches, exact safe messages and retained state after every failure. Fourteen parts necessarily exceed files10 or fields3; do not require an impossible independent14-part request under both caps.'],
  'G02:CORE-19-C03': ['Nested-slot deadlock, active adapter abort/cleanup ordering, engine-queue admission/drain boundaries and complete resource ownership timelines remain unexecuted. Global Gemini/E2B2+100 and local requery1+100/same-session probes are now invoked, but do not prove these other facets.']
};
const EXTRA_PROBES = {
  'G01:CORE-01-C03': ['adapter-queues'],
  'G01:CORE-01-C04': ['adapter-queues'],
  'G02:CORE-19-C03': ['adapter-queues', 'local-session']
};
const queueAssertions = () => ['gemini', 'e2b'].flatMap(runtime => [
  a(`${runtime} global active2/pending100`, `/adapter-queues/${runtime}/peak`, { active: 2, pending: 100 }),
  a(`${runtime} maximum active2`, `/adapter-queues/${runtime}/maximum`, 2),
  a(`${runtime} queued abort removes waiter`, `/adapter-queues/${runtime}/pendingAfterAbort`, 99)
]);
function extraAssertions(caseId) {
  if (caseId === 'G01:CORE-01-C03') return [
    ...queueAssertions(), a('late created sandbox does not run work', '/adapter-queues/lateCreate/workCalls', 0),
    a('late created sandbox is killed', '/adapter-queues/lateCreate/killCalls', 1),
    a('stream break closes underlying iterator', '/adapter-queues/stream/iteratorFinally', true),
    a('stream break releases global slot', '/adapter-queues/stream/slotsAfter', 0)
  ];
  if (caseId === 'G01:CORE-01-C04') return [
    a('sandbox timeout accepted and rejected boundaries', '/adapter-queues/sandboxTimeoutCodes', ['CONFIG_INVALID', 'ok', 'ok', 'CONFIG_INVALID']),
    a('command timeout accepted and rejected boundaries', '/adapter-queues/commandTimeoutCodes', ['CONFIG_INVALID', 'ok', 'ok', 'CONFIG_INVALID'])
  ];
  if (caseId === 'G02:CORE-19-C03') return [
    ...queueAssertions(), a('same sandbox session serializes commands', '/local-session/maximum', 1),
    a('source written once in retained session', '/local-session/sourceWriteCount', 1),
    a('retained source identity', '/local-session/identityStable', true),
    a('one active plus100 pending rejects one', '/local-session/rejectedWhileHeld', 1)
  ];
  return [];
}

export function safeName(name) {
  check(typeof name === 'string' && name.length > 0 && !path.isAbsolute(name) && !/[\\:\u0000]/.test(name), 'UNSAFE_PATH');
  check(!name.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^\.env(?:\.|$)/i.test(p)), 'UNSAFE_PATH');
  return name;
}
async function file(root, name) {
  safeName(name); let current = root;
  for (const [i, segment] of name.split('/').entries()) {
    current = path.join(current, segment); const stat = await lstat(current);
    check(!stat.isSymbolicLink() && (i === name.split('/').length - 1 ? stat.isFile() : stat.isDirectory()), 'UNSAFE_FILE');
  }
  return current;
}
async function reference(root, name) { return { path: safeName(name), sha256: hash(await readFile(await file(root, name))) }; }
async function readReference(root, ref) {
  check(/^[a-f0-9]{64}$/.test(ref?.sha256 ?? ''), 'INVALID_HASH');
  const bytes = await readFile(await file(root, ref.path)); check(hash(bytes) === ref.sha256, 'STALE_REF:' + ref.path); return bytes;
}
async function jsonRef(root, ref) { return JSON.parse(await readReference(root, ref)); }
async function freshBytes(root, name, bytes) {
  safeName(name); check(name.startsWith('.cache/rebuild/'), 'OUTPUT_SCOPE');
  let current = root;
  for (const segment of name.split('/').slice(0, -1)) {
    current = path.join(current, segment);
    try { await mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await lstat(current); check(stat.isDirectory() && !stat.isSymbolicLink(), 'UNSAFE_OUTPUT_PARENT');
  }
  await writeFile(path.join(root, name), bytes, { flag: 'wx' }); return reference(root, name);
}
async function freshJson(root, name, value) { return freshBytes(root, name, JSON.stringify(value, null, 2) + '\n'); }
function outputName(value) { safeName(value); check(value.startsWith('.cache/rebuild/') && value.split('/').length > 2, 'OUTPUT_SCOPE'); return value; }
function pinned(root) {
  check(process.version === 'v24.13.1' && path.resolve(process.execPath).toLowerCase() === path.resolve(root, PINNED).toLowerCase(), 'PINNED_NODE_REQUIRED');
}
async function modules(root) {
  const draft = await import(pathToFileURL(await file(root, DRAFT)).href);
  const shared = await import(pathToFileURL(await file(root, 'scripts/acceptance/shared.mjs')).href);
  return { draft, shared };
}
async function sourceSnapshot(root) {
  const { snapshotImplementation } = await import(pathToFileURL(await file(root, 'architecture/validation/acceptance.mjs')).href);
  return snapshotImplementation(root);
}
async function scope(root) {
  root = path.resolve(root); pinned(root);
  const freezeRef = await reference(root, '.cache/rebuild/freeze.json'), freeze = await jsonRef(root, freezeRef);
  const registryRef = await reference(root, REGISTRY), registry = await jsonRef(root, registryRef);
  check(freeze.schemaVersion === '1.0' && freeze.acceptanceProfile === PROFILE && /^LOOP-\d{3}$/.test(freeze.loop) && Number.isFinite(Date.parse(freeze.frozenAt)), 'INVALID_FREEZE');
  check(registry.acceptanceProfile === PROFILE && freeze.registrySha256 === registryRef.sha256, 'STALE_REGISTRY');
  const snapshot = await sourceSnapshot(root); check(snapshot.digest === freeze.codeDigest, 'STALE_SOURCE');
  return { root, freeze, freezeRef, registry, registryRef, snapshot, ...await modules(root) };
}
export function makePlans({ registry, blueprints, codeDigest, registrySha256, preparedAt, fixtureRef }) {
  check(registry.acceptanceProfile === PROFILE, 'WRONG_REGISTRY_PROFILE');
  const definitions = registry.cases.filter(d => ['G01', 'G02'].includes(d.gateId));
  const ids = definitions.map(d => d.id);
  check(ids.length === 27 && new Set(ids).size === 27 && same([...ids].sort(), Object.keys(blueprints).sort()), 'EXACT_27_CASES_REQUIRED');
  return ['G01', 'G02'].map((gateId, index) => {
    const cases = definitions.filter(d => d.gateId === gateId).map(definition => {
      const blueprint = blueprints[definition.id];
      const probes = [...new Set([...blueprint.probes, ...(EXTRA_PROBES[definition.id] ?? [])])];
      check(probes.every(id => PROBES.includes(id)), 'UNIMPLEMENTED_PLANNED_PROBE');
      const unresolvedFacets = [...(REMAINING[definition.id] ?? blueprint.missing), ...(ADDITIONAL_GAPS[definition.id] ?? [])];
      const measured = [...blueprint.assertions, ...extraAssertions(definition.id)].map(assertion => {
        const probeId = assertion.pointer.split('/')[1];
        // The draft explicitly returns null without performing this test. Keep
        // the mandatory250 expectation, but do not call that null a product fail.
        const unmeasured = assertion.pointer === '/run-limits/retainedItems';
        return { ...assertion, ...(PROBES.includes(probeId) ? { probeId } : {}), ...(unmeasured ? { unmeasured: 'Draft placeholder; no 249/250/251 invocation.' } : {}) };
      });
      const assertions = [
        a('All planned product probes actually completed', '/_collection/completedProbes', probes),
        a('No mandatory facet remains unexecuted', '/_collection/unresolvedFacets', []),
        ...measured
      ];
      check(new Set(assertions.map(item => item.name)).size === assertions.length, 'DUPLICATE_ASSERTION');
      return {
        caseId: definition.id, probes, unresolvedFacets, assertions,
        inputs: [...definition.inputs, fixtureRef], baselineReferences: definition.baselineReferences,
        initialState: { isolatedProbeProcess: true, syntheticSourcesOnly: true, providerBoundary: 'Input-authored fake model/reader/sandbox transports; actual composed app, adapters, stores and engines.', noProviderOrBrowserExecution: true },
        actions: [
          ...probes.map(probeId => ({ operation: 'Spawn one owned pinned Node worker; invoke actual offline draft probe; retain native exit and raw output', probeId, deadlineMs: DEADLINE_MS })),
          ...unresolvedFacets.map(reason => ({ operation: 'Required facet has no invocation in this collector', reason }))
        ]
      };
    });
    check(cases.length === [12, 15][index], 'DENOMINATOR_CHANGED');
    return { schemaVersion: '1.0', acceptanceProfile: PROFILE, gateId, codeDigest, registrySha256, preparedAt, cases };
  });
}
const helperNames = root => [...new Set([rel(root, SELF), DRAFT, 'scripts/acceptance/shared.mjs', 'scripts/acceptance/evidence.mjs', 'architecture/validation/acceptance.mjs', 'architecture/validation/fixture-generator.mjs', 'architecture/tools/verify-package.mjs'])];
async function verifyAll(root, refs) { for (const ref of refs) await readReference(root, ref); }
async function verifyPlanRefs(root, plans) {
  const refs = new Map(plans.flatMap(p => p.cases.flatMap(c => [...c.inputs, ...c.baselineReferences])).map(r => [r.path, r]));
  await verifyAll(root, [...refs.values()]);
}
export async function prepare({ projectRoot = process.cwd(), out }) {
  const s = await scope(projectRoot); out = outputName(out);
  const helperRefs = await Promise.all(helperNames(s.root).map(name => reference(s.root, name)));
  const preparedAt = now();
  const fixtureRef = await freshJson(s.root, out + '/authored-inputs.json', {
    origin: 'collector-authored synthetic data', providerCallsPlanned: { gemini: 0, e2b: 0 }, oracleAccess: false,
    definitionRef: helperRefs.find(r => r.path === DRAFT),
    definition: 'Exact synthetic strings, model callbacks, multipart sizes, gates, signal schedules and expected boundary probes are literals in the hashed draft. This manifest is provenance, not a replacement input consumed by product APIs.',
    probes: PROBES, wholeProbeDeadlineMs: DEADLINE_MS
  });
  const plans = makePlans({ registry: s.registry, blueprints: s.draft.CASE_BLUEPRINTS, codeDigest: s.freeze.codeDigest, registrySha256: s.registryRef.sha256, preparedAt, fixtureRef });
  await verifyPlanRefs(s.root, plans);
  const planRefs = [];
  for (const plan of plans) planRefs.push(await freshJson(s.root, out + '/' + plan.gateId + '-plan.json', plan));
  await verifyAll(s.root, helperRefs); check((await sourceSnapshot(s.root)).digest === s.freeze.codeDigest, 'SOURCE_CHANGED_DURING_PREPARE');
  const sessionRef = await freshJson(s.root, out + '/session.json', {
    schemaVersion: '1.0', acceptanceProfile: PROFILE, preparedAt, codeDigest: s.freeze.codeDigest, registrySha256: s.registryRef.sha256,
    freezeRef: s.freezeRef, registryRef: s.registryRef, helperRefs, fixtureRef, planRefs, probes: PROBES,
    nodeVersion: process.version, nodeExecutable: process.execPath, out
  });
  return { sessionRef, cases: { G01: 12, G02: 15 }, probes: PROBES.length, execution: 'NOT_RUN' };
}
async function loadSession(root, out, { withSnapshot = true } = {}) {
  root = path.resolve(root); pinned(root); out = outputName(out);
  const sessionRef = await reference(root, out + '/session.json'), session = await jsonRef(root, sessionRef);
  check(session.schemaVersion === '1.0' && session.acceptanceProfile === PROFILE && session.out === out && session.nodeVersion === process.version && same(session.probes, PROBES), 'INVALID_SESSION');
  check(same(session.helperRefs.map(r => r.path), helperNames(root)), 'HELPER_SET_CHANGED');
  await verifyAll(root, [session.freezeRef, session.registryRef, session.fixtureRef, ...session.helperRefs]);
  const freeze = await jsonRef(root, session.freezeRef), registry = await jsonRef(root, session.registryRef);
  check(freeze.acceptanceProfile === PROFILE && /^LOOP-\d{3}$/.test(freeze.loop) && freeze.codeDigest === session.codeDigest && freeze.registrySha256 === session.registrySha256 && session.registryRef.sha256 === session.registrySha256, 'STALE_SESSION');
  check(session.freezeRef.path === '.cache/rebuild/freeze.json' && session.registryRef.path === REGISTRY && Number.isFinite(Date.parse(session.preparedAt)) && Date.parse(session.preparedAt) >= Date.parse(freeze.frozenAt), 'INVALID_SESSION_SCOPE_OR_TIME');
  const { draft, shared } = await modules(root);
  const expected = makePlans({ registry, blueprints: draft.CASE_BLUEPRINTS, codeDigest: freeze.codeDigest, registrySha256: session.registrySha256, preparedAt: session.preparedAt, fixtureRef: session.fixtureRef });
  check(same(session.planRefs.map(r => r.path), ['G01', 'G02'].map(g => out + '/' + g + '-plan.json')), 'INVALID_PLAN_PATHS');
  const plans = [];
  for (const ref of session.planRefs) plans.push(await jsonRef(root, ref));
  check(same(plans, expected), 'PLAN_RECONSTRUCTION_FAILED');
  await verifyPlanRefs(root, plans);
  if (withSnapshot) check((await sourceSnapshot(root)).digest === freeze.codeDigest, 'STALE_SOURCE');
  return { root, out, session, sessionRef, freeze, registry, plans, draft, shared };
}
function childEnvironment() {
  // Do not forward API keys, NODE_OPTIONS or other loader/config overrides.
  const allow = /^(SystemRoot|WINDIR|TEMP|TMP|PATH|PATHEXT|COMSPEC|SYSTEMDRIVE)$/i;
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => allow.test(name)));
}
// Reviewed direct-child policy: lifecycle-control-v2 (d9fddbfa).
// Kept here to avoid making a product script depend on mutable cache files.
function stopLatch() {
  let reason = null;
  const controller = new AbortController();
  return {
    get reason() { return reason; }, signal: controller.signal,
    stop(value) { if (reason === null) { reason = value; controller.abort(new Error('COLLECTOR_INTERRUPTED:' + value)); } },
    check() { if (reason !== null) throw new Error('COLLECTOR_INTERRUPTED:' + reason); }
  };
}
function requestTermination(child, reason, attempts, time = () => new Date().toISOString()) {
  const row = { reason, requestedAt: time(), returned: null, error: null };
  try { row.returned = child.kill(); }
  catch (error) { row.error = { name: error.name, code: error.code ?? null, message: error.message }; }
  attempts.push(row); return row;
}
async function boundedClose({ child, closed, exitPromise, attempts, deadlineMs = CLEANUP_GRACE_MS, schedule = setTimeout, unschedule = clearTimeout }) {
  if (!closed()) requestTermination(child, 'final-cleanup', attempts);
  let timer;
  const deadline = new Promise(resolve => { timer = schedule(() => resolve('deadline'), deadlineMs); });
  let outcome;
  try { outcome = closed() ? 'closed' : await Promise.race([exitPromise.then(() => 'closed'), deadline]); }
  finally { if (timer !== undefined) unschedule(timer); }
  const cleanupIncomplete = outcome !== 'closed' || !closed();
  const detachErrors = [];
  if (cleanupIncomplete) {
    // The child may still exist. Stop the collector from waiting forever on its
    // pipes/IPC, retain its identity for root cleanup, and never report an exit.
    for (const [operation, work] of [
      ['disconnect', () => { if (child.connected) child.disconnect(); }],
      ['stdout.destroy', () => child.stdout?.destroy()],
      ['stderr.destroy', () => child.stderr?.destroy()],
      ['unref', () => child.unref()]
    ]) try { work(); } catch (error) { detachErrors.push({ operation, name: error.name, code: error.code ?? null, message: error.message }); }
  }
  return { cleanupIncomplete, rootCleanupNeeded: cleanupIncomplete, detachErrors, closeObserved: Boolean(closed()) };
}

async function runWorker(s, probeId, latch) {
  const prefix = s.out + '/probes/' + probeId;
  latch.check();
  await freshJson(s.root, prefix + '/invocation.json', { probeId, startedAt: now(), sessionRef: s.sessionRef });
  latch.check();
  const args = [SELF, 'probe-worker', '--root', s.root, '--out', s.out, '--probe', probeId, '--allow-loopback'];
  const startedAt = now(), stdout = [], stderr = [], attempts = [];
  let bytes = 0, timedOut = false, overflow = false, spawnError = null, closed = false, ending = null, finishClose;
  const exitPromise = new Promise(resolve => { finishClose = resolve; });
  // No asynchronous gap between launch and registration of the owned child.
  const child = spawn(process.execPath, args, { cwd: s.root, env: childEnvironment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  child.once('close', (exitCode, signal) => { closed = true; ending = { exitCode, signal }; finishClose(ending); });
  child.on('error', error => { spawnError = errorRecord(error); latch.stop('spawn-error:' + probeId); });
  const identity = { probeId, pid: child.pid ?? null, command: [process.execPath, ...args], startedAt, sessionRef: s.sessionRef, codeDigest: s.freeze.codeDigest, ownershipScope: 'direct child only; descendant absence is not claimed' };
  const timer = setTimeout(() => { timedOut = true; latch.stop('deadline:' + probeId); }, DEADLINE_MS);
  for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) stream.on('data', chunk => {
    bytes += chunk.length;
    if (bytes <= MAX_LOG_BYTES) chunks.push(chunk);
    else if (!overflow) { overflow = true; latch.stop('output-limit:' + probeId); }
  });
  let stopListener;
  const stopSignal = new Promise(resolve => {
    if (latch.signal.aborted) resolve();
    else { stopListener = () => resolve(); latch.signal.addEventListener('abort', stopListener, { once: true }); }
  });
  let ownedStartRef = null, ownedCleanupRef = null;
  const artifactErrors = [];
  try {
    // Parent-owned identity is persisted before waiting or optional producer IO.
    ownedStartRef = await freshJson(s.root, prefix + '/owned-start.json', { ...identity, exitCode: null, signal: null, closeObserved: false });
  } catch (error) {
    artifactErrors.push({ operation: 'owned-start', error: errorRecord(error) });
    latch.stop('ownership-write:' + probeId);
    console.error(JSON.stringify({ kind: 'OWNED_START_WRITE_FAILED', identity, error: errorRecord(error) }));
  }
  await Promise.race([exitPromise, stopSignal]);
  clearTimeout(timer);
  if (stopListener) latch.signal.removeEventListener('abort', stopListener);
  const cleanup = await boundedClose({ child, closed: () => closed, exitPromise, attempts });
  if (cleanup.cleanupIncomplete) latch.stop('cleanup-incomplete:' + probeId);
  // Snapshot native observations before optional logs/raw files. A kill return,
  // timeout or detached pipe never supplies an unobserved OS exit.
  const owned = JSON.parse(JSON.stringify({ ...identity, endedAt: now(), exitCode: closed ? ending?.exitCode ?? null : null, signal: closed ? ending?.signal ?? null : null, closeObserved: closed, cleanupComplete: !cleanup.cleanupIncomplete, cleanup, attempts, timedOut, interrupted: ['SIGINT', 'SIGTERM'].includes(latch.reason) ? latch.reason : null, terminationReason: latch.reason, logOverflow: overflow, outputBytes: bytes, spawnError, ownedStartRef }));
  try { ownedCleanupRef = await freshJson(s.root, prefix + '/owned-cleanup.json', owned); }
  catch (error) {
    latch.stop('cleanup-receipt-write:' + probeId);
    error.owned = owned; error.ownedStartRef = ownedStartRef;
    console.error(JSON.stringify({ kind: 'OWNED_CLEANUP_WRITE_FAILED', owned, error: errorRecord(error) }));
    throw error;
  }
  const capturedStdout = Buffer.concat(stdout), capturedStderr = Buffer.concat(stderr);
  let stdoutRef = null, stderrRef = null, actualRef = null, state = 'failed', error = null;
  for (const [name, data] of [['stdout', capturedStdout], ['stderr', capturedStderr]]) {
    try {
      const ref = await freshBytes(s.root, prefix + '/' + name + '.txt', data);
      if (name === 'stdout') stdoutRef = ref; else stderrRef = ref;
    } catch (cause) { artifactErrors.push({ operation: name, error: errorRecord(cause) }); latch.stop('artifact-write:' + probeId); }
  }
  try { actualRef = await reference(s.root, prefix + '/runtime-actual.json'); }
  catch (cause) { if (cause.code !== 'ENOENT') { artifactErrors.push({ operation: 'raw-reference', error: errorRecord(cause) }); latch.stop('artifact-read:' + probeId); } }
  try {
    check(ownedStartRef && ownedCleanupRef && artifactErrors.length === 0, 'OWNED_PROBE_ARTIFACTS_INCOMPLETE');
    check(owned.closeObserved && owned.cleanupComplete && !owned.cleanup.rootCleanupNeeded && !owned.terminationReason && !timedOut && !overflow && !spawnError && owned.exitCode === 0 && owned.signal === null, 'OWNED_PROBE_PROCESS_FAILED');
    check(actualRef, 'NO_RAW_PROBE_ARTIFACT');
    const raw = await jsonRef(s.root, actualRef);
    check(raw.origin === 'actual-app-offline-transport-replay' && raw.nodeVersion === process.version && raw.nodeExecutable.toLowerCase() === process.execPath.toLowerCase() && same(raw.providerCalls, { gemini: 0, e2b: 0 }), 'INVALID_RAW_PROBE');
    check(same(Object.keys(raw.probes), [probeId]), 'WRONG_RAW_PROBE_ID');
    const observed = raw.probes[probeId];
    check(Number.isFinite(Date.parse(observed.startedAt)) && Date.parse(observed.startedAt) >= Date.parse(startedAt) && Date.parse(observed.endedAt) >= Date.parse(observed.startedAt) && Date.parse(observed.endedAt) <= Date.parse(owned.endedAt), 'INVALID_RAW_PROBE_TIME');
    check(observed.state === 'completed' && Object.hasOwn(raw, probeId), 'PRODUCT_PROBE_DID_NOT_COMPLETE');
    state = 'completed';
  } catch (cause) { error = errorRecord(cause); }
  const record = { ...owned, state, error, ownedCleanupRef, artifactErrors, stdoutRef, stderrRef, actualRef };
  try { return { probeId, ref: await freshJson(s.root, prefix + '/process.json', record) }; }
  catch (cause) {
    latch.stop('process-receipt-write:' + probeId);
    cause.owned = owned; cause.ownedStartRef = ownedStartRef; cause.ownedCleanupRef = ownedCleanupRef;
    console.error(JSON.stringify({ kind: 'PROCESS_RECEIPT_WRITE_FAILED', owned, ownedStartRef, ownedCleanupRef, error: errorRecord(cause) }));
    throw cause;
  }
}
async function probeWorker({ projectRoot, out, probe, allowLoopback }) {
  check(allowLoopback && PROBES.includes(probe), 'EXPLICIT_KNOWN_PROBE_REQUIRED');
  const s = await loadSession(projectRoot, out, { withSnapshot: false });
  await s.draft.collectDraftRuntime({ projectRoot: s.root, outputDirectory: path.join(s.root, out, 'probes', probe), allowLoopback: true, probes: [probe] });
  await verifyAll(s.root, s.session.helperRefs);
  // Natural process exit is required by the parent. A leaked handle times out;
  // no process.exit(0) conceals unfinished cleanup.
  return { probe, collectionReturned: true };
}
export async function execute({ projectRoot = process.cwd(), out, allowLoopback = false }) {
  check(allowLoopback, 'EXPLICIT_LOOPBACK_EXECUTION_REQUIRED');
  const s = await loadSession(projectRoot, out), startedAt = now(), latch = stopLatch();
  await freshJson(s.root, out + '/execution-started.json', { sessionRef: s.sessionRef, startedAt });
  const records = [], collectorErrors = [], handlers = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, () => latch.stop(signal)]));
  for (const [signal, handler] of handlers) process.on(signal, handler);
  try {
    for (const probeId of PROBES) {
      if (latch.reason) {
        const record = { probeId, state: 'not_run', reason: latch.reason, startedAt: now(), endedAt: now(), pid: null, command: null, exitCode: null, signal: null, sessionRef: s.sessionRef };
        try { records.push({ probeId, ref: await freshJson(s.root, s.out + '/probes/' + probeId + '/process.json', record) }); }
        catch (error) { records.push({ probeId, ref: null, state: 'not_run', reason: latch.reason }); collectorErrors.push({ probeId, error: errorRecord(error) }); }
        continue;
      }
      try { records.push(await runWorker(s, probeId, latch)); }
      catch (error) {
        latch.stop('collector-error:' + probeId);
        const failure = { probeId, state: 'incomplete', ref: null, error: errorRecord(error), owned: error.owned ?? null, ownedStartRef: error.ownedStartRef ?? null, ownedCleanupRef: error.ownedCleanupRef ?? null };
        records.push(failure); collectorErrors.push(failure);
      }
    }
  } finally { for (const [signal, handler] of handlers) process.removeListener(signal, handler); }
  const after = await sourceSnapshot(s.root), sourceParity = after.digest === s.freeze.codeDigest;
  let guardError = null;
  try { await verifyAll(s.root, [s.session.freezeRef, s.session.registryRef, ...s.session.helperRefs]); } catch (error) { guardError = errorRecord(error); }
  const endedAt = now();
  const execution = { schemaVersion: '1.0', acceptanceProfile: PROFILE, codeDigest: s.freeze.codeDigest, codeDigestAfter: after.digest, registrySha256: s.session.registrySha256, sourceParity, guardError, sessionRef: s.sessionRef, startedAt, endedAt, records, stopReason: latch.reason, collectorErrors, origin: 'actual-app-offline-transport-replay', oracleAccess: false, nodeVersion: process.version, nodeExecutable: process.execPath, providerCalls: { gemini: 0, e2b: 0 }, command: [process.execPath, SELF, 'execute', '--root', s.root, '--out', out, '--allow-loopback'] };
  const executionRef = await freshJson(s.root, out + '/execution.json', execution);
  return { executionRef, sourceParity, guardError, stopReason: latch.reason, collectorErrors, collectionOnly: true, exitCode: sourceParity && !guardError && !latch.reason && !collectorErrors.length ? 0 : 1 };
}

export function evaluateCase(entry, records, helpers) {
  const actual = { probes: {}, _collection: { completedProbes: [], missingProbes: [], unresolvedFacets: [...entry.unresolvedFacets], probeErrors: [] } };
  const artifacts = [];
  for (const probeId of entry.probes) {
    const record = records.get(probeId);
    if (!record || record.state === 'not_run') { actual._collection.missingProbes.push(probeId); continue; }
    if (record.state !== 'completed' || record.raw?.probes?.[probeId]?.state !== 'completed' || !Object.hasOwn(record.raw, probeId)) {
      actual._collection.probeErrors.push({ probeId, error: record.error ?? 'MISSING_COMPLETED_RAW_PROBE' }); continue;
    }
    actual[probeId] = record.raw[probeId]; actual.probes[probeId] = record.raw.probes[probeId];
    actual._collection.completedProbes.push(probeId);
    actual.providerCalls = record.raw.providerCalls;
    artifacts.push(...(record.artifactRefs ?? []));
  }
  const assertions = entry.assertions.slice(2).map(assertion => {
    if (assertion.unmeasured || assertion.probeId && !actual._collection.completedProbes.includes(assertion.probeId) || !assertion.probeId && !actual._collection.completedProbes.length)
      return { ...assertion, state: 'not_run', reason: assertion.unmeasured ?? 'REQUIRED_INVOCATION_NOT_COMPLETED' };
    try { const value = helpers.jsonPointer(actual, assertion.pointer); return { ...assertion, actual: value, passed: helpers.compare(value, assertion.expected, assertion.operator), state: 'observed' }; }
    catch (error) { return { ...assertion, state: 'observed', passed: false, error: error.message }; }
  });
  actual.assertionResults = assertions;
  const failed = actual._collection.probeErrors.length > 0 || assertions.some(r => r.passed === false);
  const incomplete = actual._collection.unresolvedFacets.length > 0 || actual._collection.missingProbes.length > 0 || assertions.some(r => r.state === 'not_run') || !entry.probes.length;
  return { state: failed ? 'failed' : incomplete ? 'not_run' : 'passed', actual, artifactRefs: artifacts };
}
async function loadExecution(s) {
  const executionRef = await reference(s.root, s.out + '/execution.json'), e = await jsonRef(s.root, executionRef);
  check(e.schemaVersion === '1.0' && e.acceptanceProfile === PROFILE && e.origin === 'actual-app-offline-transport-replay' && e.oracleAccess === false && e.sourceParity === true && e.guardError === null, 'INVALID_EXECUTION');
  check(e.codeDigest === s.freeze.codeDigest && e.codeDigestAfter === s.freeze.codeDigest && e.registrySha256 === s.session.registrySha256 && same(e.sessionRef, s.sessionRef), 'STALE_EXECUTION');
  check(e.nodeVersion === process.version && e.nodeExecutable.toLowerCase() === process.execPath.toLowerCase() && same(e.providerCalls, { gemini: 0, e2b: 0 }), 'INVALID_EXECUTION_RUNTIME');
  check(same(e.command, [process.execPath, SELF, 'execute', '--root', s.root, '--out', s.out, '--allow-loopback']), 'INVALID_EXECUTION_COMMAND');
  check(Number.isFinite(Date.parse(e.startedAt)) && Date.parse(e.startedAt) >= Date.parse(s.session.preparedAt) && Date.parse(e.endedAt) >= Date.parse(e.startedAt), 'INVALID_EXECUTION_TIMES');
  check(same(e.records.map(r => r.probeId), PROBES), 'EXACT_PROBE_RECORDS_REQUIRED');
  check(Array.isArray(e.collectorErrors) && e.collectorErrors.length === 0 && (e.stopReason === null || typeof e.stopReason === 'string'), 'INCOMPLETE_COLLECTOR_RECEIPTS');
  let observedStop = null;
  const records = new Map();
  for (const row of e.records) {
    check(row.ref.path === s.out + '/probes/' + row.probeId + '/process.json', 'WRONG_PROBE_RECORD_PATH');
    const record = await jsonRef(s.root, row.ref);
    check(record.probeId === row.probeId && ['completed', 'failed', 'not_run'].includes(record.state), 'INVALID_PROCESS_RECORD');
    check(Date.parse(record.startedAt) >= Date.parse(e.startedAt) && Date.parse(record.endedAt) >= Date.parse(record.startedAt) && Date.parse(record.endedAt) <= Date.parse(e.endedAt), 'INVALID_PROCESS_TIMES');
    const prefix = s.out + '/probes/' + row.probeId;
    if (record.state === 'not_run') {
      check(observedStop && observedStop === e.stopReason && record.reason === observedStop && same(record.sessionRef, s.sessionRef) && record.pid === null && record.command === null && record.exitCode === null && record.signal === null, 'INVALID_NOT_RUN_RECORD');
      records.set(row.probeId, { ...record, raw: null, artifactRefs: [row.ref] }); continue;
    }
    check(observedStop === null, 'WORK_ADMITTED_AFTER_STOP');
    check(same(record.command, [process.execPath, SELF, 'probe-worker', '--root', s.root, '--out', s.out, '--probe', row.probeId, '--allow-loopback']), 'INVALID_WORKER_COMMAND');
    check(record.ownedCleanupRef?.path === prefix + '/owned-cleanup.json', 'WRONG_OWNED_CLEANUP_PATH');
    const owned = await jsonRef(s.root, record.ownedCleanupRef);
    const ownedKeys = ['probeId', 'pid', 'command', 'startedAt', 'sessionRef', 'codeDigest', 'ownershipScope', 'endedAt', 'exitCode', 'signal', 'closeObserved', 'cleanupComplete', 'cleanup', 'attempts', 'timedOut', 'interrupted', 'terminationReason', 'logOverflow', 'outputBytes', 'spawnError', 'ownedStartRef'];
    check(same(Object.keys(owned).sort(), ownedKeys.slice().sort()) && same(owned, Object.fromEntries(ownedKeys.map(key => [key, record[key]]))), 'OWNED_CLEANUP_IDENTITY_MISMATCH');
    check(same(owned.sessionRef, s.sessionRef) && owned.codeDigest === e.codeDigest && owned.ownershipScope === 'direct child only; descendant absence is not claimed', 'WRONG_OWNED_SESSION');
    check(typeof owned.closeObserved === 'boolean' && typeof owned.cleanupComplete === 'boolean' && owned.closeObserved === owned.cleanup.closeObserved && owned.cleanupComplete === !owned.cleanup.cleanupIncomplete && owned.cleanup.rootCleanupNeeded === owned.cleanup.cleanupIncomplete, 'INVALID_CLEANUP_STATE');
    check(owned.closeObserved || owned.exitCode === null && owned.signal === null, 'INVENTED_NATIVE_EXIT');
    const artifactRefs = [row.ref, record.ownedCleanupRef];
    if (record.ownedStartRef) {
      check(record.ownedStartRef.path === prefix + '/owned-start.json', 'WRONG_OWNED_START_PATH');
      const start = await jsonRef(s.root, record.ownedStartRef);
      check(same(start, { probeId: owned.probeId, pid: owned.pid, command: owned.command, startedAt: owned.startedAt, sessionRef: s.sessionRef, codeDigest: e.codeDigest, ownershipScope: owned.ownershipScope, exitCode: null, signal: null, closeObserved: false }), 'OWNED_START_IDENTITY_MISMATCH');
      artifactRefs.push(record.ownedStartRef);
    }
    check(Array.isArray(record.artifactErrors), 'MISSING_ARTIFACT_ERROR_RECORD');
    // Terminal collector failure belongs to this launched row, even when the
    // following row was forged as completed instead of honestly NOT_RUN.
    const artifactStop = record.artifactErrors[0];
    const artifactReasons = { 'owned-start': 'ownership-write:', stdout: 'artifact-write:', stderr: 'artifact-write:', 'raw-reference': 'artifact-read:' };
    check(record.artifactErrors.every(item => Object.hasOwn(artifactReasons, item.operation)), 'UNKNOWN_ARTIFACT_FAILURE');
    const terminalReason = record.terminationReason ?? (artifactStop ? artifactReasons[artifactStop.operation] + row.probeId : null);
    const terminalFlags = record.timedOut || record.logOverflow || record.interrupted || record.spawnError || !record.cleanupComplete || record.artifactErrors.length > 0;
    check(!terminalFlags || typeof terminalReason === 'string' && terminalReason.length > 0, 'TERMINAL_FAILURE_WITHOUT_STOP');
    if (terminalReason !== null) {
      const causes = {
        ['deadline:' + row.probeId]: record.timedOut === true,
        ['output-limit:' + row.probeId]: record.logOverflow === true,
        ['spawn-error:' + row.probeId]: Boolean(record.spawnError),
        ['ownership-write:' + row.probeId]: record.artifactErrors.some(item => item.operation === 'owned-start'),
        ['cleanup-incomplete:' + row.probeId]: !record.cleanupComplete,
        ['artifact-write:' + row.probeId]: artifactStop?.operation === 'stdout' || artifactStop?.operation === 'stderr',
        ['artifact-read:' + row.probeId]: artifactStop?.operation === 'raw-reference',
        SIGINT: record.interrupted === 'SIGINT', SIGTERM: record.interrupted === 'SIGTERM'
      };
      check(record.state === 'failed' && causes[terminalReason] === true && terminalReason === e.stopReason, 'TERMINAL_STOP_MISMATCH');
      observedStop = terminalReason;
    }

    for (const name of ['stdout', 'stderr']) if (record[name + 'Ref']) {
      check(record[name + 'Ref'].path === prefix + '/' + name + '.txt', 'WRONG_PROCESS_LOG_PATHS'); artifactRefs.push(record[name + 'Ref']);
    }
    await verifyAll(s.root, artifactRefs);
    let raw = null;
    if (record.actualRef) {
      check(record.actualRef.path === prefix + '/runtime-actual.json', 'WRONG_RAW_PATH');
      raw = await jsonRef(s.root, record.actualRef); artifactRefs.push(record.actualRef);
    }
    if (record.state === 'completed') {
      check(record.ownedStartRef && record.stdoutRef && record.stderrRef && record.artifactErrors.length === 0 && record.closeObserved && record.cleanupComplete && !record.cleanup.rootCleanupNeeded && !record.terminationReason, 'COMPLETED_PROCESS_CLEANUP_CONTRADICTION');
      check(record.exitCode === 0 && record.signal === null && !record.timedOut && !record.interrupted && !record.logOverflow && !record.spawnError && !record.error && Number.isSafeInteger(record.pid) && record.pid > 0, 'COMPLETED_PROCESS_CONTRADICTION');
      check(raw?.origin === e.origin && raw.nodeVersion === process.version && raw.nodeExecutable.toLowerCase() === process.execPath.toLowerCase() && same(raw.providerCalls, e.providerCalls) && same(Object.keys(raw.probes), [row.probeId]), 'INVALID_RAW_IDENTITY');
      check(raw.probes[row.probeId].state === 'completed' && Object.hasOwn(raw, row.probeId), 'UNCOMPLETED_RAW');
      check(Date.parse(raw.probes[row.probeId].startedAt) >= Date.parse(record.startedAt) && Date.parse(raw.probes[row.probeId].endedAt) >= Date.parse(raw.probes[row.probeId].startedAt) && Date.parse(raw.probes[row.probeId].endedAt) <= Date.parse(record.endedAt), 'RAW_TIME_OUTSIDE_PROCESS');
    }
    records.set(row.probeId, { ...record, raw, artifactRefs });
  }
  check(e.stopReason === observedStop, 'AGGREGATE_STOP_MISMATCH');
  return { executionRef, execution: e, records };
}
export async function exportObservations({ projectRoot = process.cwd(), out }) {
  const s = await loadSession(projectRoot, out), { executionRef, execution: e, records } = await loadExecution(s);
  // No historical suite/browser artifact is silently adopted. A future adapter
  // must predeclare and independently validate any additional invocation.
  const envelopes = [];
  for (const plan of s.plans) {
    const cases = [];
    for (const entry of plan.cases) {
      const result = evaluateCase(entry, records, s.shared);
      const actualRef = await freshJson(s.root, out + '/cases/' + entry.caseId.replaceAll(':', '-') + '.json', result.actual);
      cases.push({ caseId: entry.caseId, state: result.state, startedAt: e.startedAt, endedAt: e.endedAt, actualRef, artifactRefs: [executionRef, s.sessionRef, ...result.artifactRefs], unresolvedFacets: entry.unresolvedFacets });
    }
    const envelope = { schemaVersion: '1.0', acceptanceProfile: PROFILE, gateId: plan.gateId, codeDigest: s.freeze.codeDigest, registrySha256: s.session.registrySha256, startedAt: e.startedAt, endedAt: e.endedAt, exitCode: 0, command: e.command, origin: e.origin, oracleAccess: false, providerCalls: e.providerCalls, planRef: s.session.planRefs.find(r => r.path.endsWith('/' + plan.gateId + '-plan.json')), cases, collectionExitCodeMeaning: 'Formal export completed; individual cases remain failed/not_run. This is not a gate-pass exit code.' };
    const ref = await freshJson(s.root, '.cache/rebuild/evidence/' + s.freeze.loop + '/' + plan.gateId + '-observations.json', envelope);
    envelopes.push({ gateId: plan.gateId, ref, passed: cases.filter(c => c.state === 'passed').length, failed: cases.filter(c => c.state === 'failed').length, notRun: cases.filter(c => c.state === 'not_run').length });
  }
  return { envelopes, completeProductAcceptance: false };
}
function options(argv) {
  const result = {}; const values = new Map([['--root', 'projectRoot'], ['--out', 'out'], ['--probe', 'probe']]);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--allow-loopback') { check(!result.allowLoopback, 'DUPLICATE_FLAG'); result.allowLoopback = true; continue; }
    const key = values.get(flag); check(key && !Object.hasOwn(result, key) && typeof argv[i + 1] === 'string' && !argv[i + 1].startsWith('--'), 'INVALID_CLI_ARGUMENT'); result[key] = argv[++i];
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  try {
    const [verb, ...args] = process.argv.slice(2), parsed = options(args);
    const handlers = { prepare, execute, export: exportObservations, 'probe-worker': probeWorker };
    check(Object.hasOwn(handlers, verb), 'EXPECTED_PREPARE_EXECUTE_EXPORT');
    if (verb !== 'probe-worker') check(!parsed.probe, 'PROBE_SELECTION_WOULD_SHRINK_DENOMINATOR');
    const result = await handlers[verb](parsed); console.log(JSON.stringify(result)); process.exitCode = result.exitCode ?? 0;
  } catch (error) { console.error(JSON.stringify(errorRecord(error))); process.exitCode = 1; }
}

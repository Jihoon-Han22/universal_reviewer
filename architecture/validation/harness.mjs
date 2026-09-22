import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './fixture-generator.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const key = e => `${e.file}\u0000${e.sheet ?? ''}\u0000${e.cell}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = a => [...a].sort();
const comparisonEqual = (a, b) => a === null && b === null || a && b && a.operator === b.operator && a.value === b.value && (a.upper ?? null) === (b.upper ?? null) && a.unit === b.unit;
const safeName = s => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s) && !s.includes('..');
export function validateFixture(fixture) {
  const errors = [];
  if (!fixture || !safeName(fixture.id)) errors.push('fixture_id');
  if (!Array.isArray(fixture?.expected) || !fixture.expected.length) errors.push('empty_fixture_expected');
  if (!Array.isArray(fixture?.sources) || !fixture.sources.length) errors.push('empty_fixture_sources');
  const docs = fixture?.request?.documents;
  if (!Array.isArray(docs) || docs.length < 2 || !docs.some(d => d.role === 'criteria') || !docs.some(d => d.role === 'target')) errors.push('fixture_documents');
  if (Array.isArray(docs) && (new Set(docs.map(d => d.file)).size !== docs.length || docs.some(d => !safeName(d.file) || !/^[a-f0-9]{64}$/.test(d.sha256)))) errors.push('fixture_document_identity');
  if (Array.isArray(fixture?.expected) && new Set(fixture.expected.map(e => `${e.sampleName}\u0000${e.criterionLabel}`)).size !== fixture.expected.length) errors.push('fixture_duplicate_expected');
  return errors;
}
export function validateResult(fixture, result, runId) {
  const errors = validateFixture(fixture), add = (ok, code) => { if (!ok) errors.push(code); };
  if (errors.length) return { passed: false, errors };
  add(result && result.schemaVersion === '1.0', 'schema_version'); add(result?.runId === runId, 'stale_or_wrong_run');
  add(result?.completion === 'completed', 'run_not_completed');
  const items = Array.isArray(result?.items) ? result.items : [];
  add(items.length === fixture.expected.length, 'item_count');
  add(new Set(items.map(i => `${i.sampleName}\u0000${i.criterionLabel}`)).size === items.length, 'duplicate_items');
  const source = new Map(fixture.sources.map(e => [key(e), e]));
  function citation(c) { return c && typeof c.quote === 'string' && source.get(key(c))?.quote === c.quote; }
  for (const expected of fixture.expected) {
    const i = items.find(item => item.criterionLabel === expected.criterionLabel && item.sampleName === expected.sampleName), prefix = `item:${expected.criterionLabel}:`;
    if (!i) { errors.push(prefix + 'missing'); continue; }
    for (const name of ['sourceValue', 'unit', 'status', 'presence', 'classificationStatus']) add(i[name] === expected[name], prefix + name);
    add(same(i.categoryPath, []), prefix + 'invented_type');
    add(Array.isArray(i.conditions) && same(sorted(i.conditions), sorted(expected.conditions)), prefix + 'conditions_or_notes');
    add(comparisonEqual(i.comparison, expected.comparison), prefix + 'comparison');
    const ce = i.criterionEvidence ?? [], ve = i.valueEvidence ?? [], highlights = i.highlightEvidence ?? [];
    add(Array.isArray(ce) && ce.length > 0 && ce.every(citation) && ce.some(c => key(c) === key(expected.criterionEvidence)), prefix + 'criterion_source');
    add(Array.isArray(ve) && ve.length > 0 && ve.every(citation) && ve.some(c => key(c) === key(expected.valueEvidence)), prefix + 'value_source');
    add(Array.isArray(highlights) && highlights.every(c => citation(c) && c.quote.trim() && key(c) === key(expected.valueEvidence) && ve.some(v => key(v) === key(c) && v.quote === c.quote)), prefix + 'fabricated_highlight');
    if (expected.presence !== 'present') add(highlights.length === 0, prefix + 'absent_highlight');
    else if (expected.status !== 'review') add(highlights.some(c => key(c) === key(expected.valueEvidence)), prefix + 'measurement_highlight_missing');
    if (expected.presence === 'missing') add(i.missingVerified === true, prefix + 'missing_not_verified');
  }
  const coverageRows = Array.isArray(result?.coverage) ? result.coverage : [];
  add(coverageRows.length === fixture.request.documents.length && new Set(coverageRows.map(c => c.file)).size === coverageRows.length, 'coverage_document_count');
  for (const d of fixture.request.documents) {
    const coverage = coverageRows.find(c => c.file === d.file);
    add(coverage?.inputSha256 === d.sha256, `coverage:${d.file}:input_hash`);
    add(coverage?.readerComplete === true && coverage?.contextComplete === true, `coverage:${d.file}:reader_context`);
    if (d.role === 'criteria') add(coverage?.criteriaComplete === true, `coverage:${d.file}:criteria`);
    const cells = coverage?.coveredCells ?? [], got = new Set(cells.map(c => key({ ...c, file: d.file })));
    const wanted = fixture.sources.filter(s => s.file === d.file && s.quote.trim()).map(key);
    add(wanted.every(k => got.has(k)), `coverage:${d.file}:unread_cells`);
    add(cells.every(c => source.has(key({ ...c, file: d.file }))), `coverage:${d.file}:invented_cells`);
  }
  return { passed: errors.length === 0, errors };
}
function invoke(adapter, requestPath, inputDirectory, runId, timeoutMs) {
  return new Promise(resolve => {
    const deadline = performance.now() + timeoutMs;
    const child = spawn(process.execPath, [path.join(HERE, 'adapter-worker.mjs'), adapter, requestPath, inputDirectory, runId, String(timeoutMs)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', bytes = 0, forced = false, settled = false, expired = false;
    const timer = setTimeout(() => { expired = true; }, timeoutMs);
    const killTimer = setTimeout(() => { forced = true; child.kill('SIGKILL'); }, timeoutMs + 10000);
    child.stdout.on('data', c => { bytes += c.length; if (bytes > 8 * 1024 * 1024) { forced = true; child.kill('SIGKILL'); } else stdout += c; });
    child.stderr.on('data', () => {}); // Adapter/provider logs are deliberately not persisted.
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); clearTimeout(killTimer); resolve(value); } };
    child.on('error', () => finish({ error: 'ADAPTER_PROCESS_START_FAILED' }));
    child.on('close', code => {
      expired ||= performance.now() >= deadline;
      if (forced || expired || code !== 0) return finish({ error: forced || expired ? 'ADAPTER_TIMEOUT_OR_OUTPUT_LIMIT' : 'ADAPTER_EXIT_FAILED' });
      try { const marker = '\nGSPEC_CONTRACT_RESULT:'; const start = stdout.lastIndexOf(marker); if (start < 0) throw new Error(); finish({ result: JSON.parse(stdout.slice(start + marker.length).trim()) }); }
      catch { finish({ error: 'ADAPTER_RESULT_INVALID' }); }
    });
  });
}
export async function runSuite({ suiteDirectory, adapter, output, mode = 'offline', timeoutMs = 900000 }) {
  if (!['offline', 'live'].includes(mode)) throw new Error('mode must be offline or live');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 21600000) throw new Error('invalid timeout');
  const oraclePath = path.join(suiteDirectory, 'oracle.json'), oracleBytes = await readFile(oraclePath), adapterBytes = await readFile(adapter);
  const oracle = JSON.parse(oracleBytes);
  if (!Array.isArray(oracle.cases) || !oracle.cases.length) throw new Error('empty suite cannot pass');
  if (new Set(oracle.cases.map(f => f.id)).size !== oracle.cases.length) throw new Error('duplicate fixture ID');
  for (const fixture of oracle.cases) if (validateFixture(fixture).length) throw new Error('invalid fixture: ' + validateFixture(fixture).join(','));
  output = path.resolve(output); await mkdir(output, { recursive: true });
  const runId = randomUUID(), records = [], startedAt = new Date().toISOString();
  for (const fixture of oracle.cases) {
    const inputDirectory = path.resolve(suiteDirectory, fixture.inputDirectory), requestPath = path.join(output, `${fixture.id}.request.json`);
    if (!inputDirectory.startsWith(path.resolve(suiteDirectory) + path.sep)) throw new Error('invalid input directory');
    for (const doc of fixture.request.documents) if (sha256(await readFile(path.join(inputDirectory, doc.file))) !== doc.sha256) throw new Error('input digest mismatch before execution');
    await writeFile(requestPath, JSON.stringify(fixture.request));
    const begin = Date.now(), call = await invoke(path.resolve(adapter), requestPath, inputDirectory, runId, timeoutMs);
    let checked;
    try { checked = call.error ? { passed: false, errors: [call.error] } : validateResult(fixture, call.result, runId); }
    catch { checked = { passed: false, errors: ['OUTPUT_CONTRACT_INVALID'] }; }
    for (const doc of fixture.request.documents) if (sha256(await readFile(path.join(inputDirectory, doc.file))) !== doc.sha256) { checked.passed = false; checked.errors.push('input_mutated'); }
    const resultFile = `${fixture.id}.result.json`, payload = JSON.stringify(call.result ?? { error: call.error }, null, 2);
    await writeFile(path.join(output, resultFile), payload);
    records.push({ caseId: fixture.id, variant: fixture.variant, state: checked.passed ? 'passed' : 'failed', durationMs: Date.now() - begin, errors: checked.errors, artifacts: [{ path: resultFile, sha256: sha256(payload) }] });
    console.log(`${fixture.variant}: ${checked.passed ? 'PASS' : 'FAIL'}`);
  }
  const integrityErrors = [];
  if (sha256(await readFile(adapter)) !== sha256(adapterBytes)) integrityErrors.push('adapter_mutated');
  if (sha256(await readFile(oraclePath)) !== sha256(oracleBytes)) integrityErrors.push('oracle_mutated');
  const report = { schemaVersion: '1.0', kind: 'contract-run', scope: 'adapter output matches synthetic expectations only', runId, mode, startedAt, endedAt: new Date().toISOString(), nodeVersion: process.version, adapterSha256: sha256(adapterBytes), oracleSha256: sha256(oracleBytes), adapterExecuted: true, implementationExecuted: false, implementationExecutionVerified: false, completeProductAcceptance: false, integrityErrors, cases: records, totals: { selected: records.length, passed: records.filter(r => r.state === 'passed').length, failed: records.filter(r => r.state === 'failed').length, skipped: 0 }, passed: !integrityErrors.length && records.every(r => r.state === 'passed') };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [suiteDirectory, adapter, output, mode = 'offline'] = process.argv.slice(2);
  if (!suiteDirectory || !adapter || !output || process.argv.length > 7) { console.error('Usage: node harness.mjs SUITE_DIRECTORY ADAPTER_MJS OUTPUT_DIRECTORY [offline|live]'); process.exitCode = 2; }
  else { const result = await runSuite({ suiteDirectory, adapter, output, mode }); console.log(JSON.stringify(result.totals)); process.exitCode = result.passed ? 0 : 1; }
}

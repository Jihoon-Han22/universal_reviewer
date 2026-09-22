// Tests the evaluator, NOT GSPEC or any OCR/model quality.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateSuite, sha256, crc32, VARIANTS } from './fixture-generator.mjs';
import { validateResult, runSuite } from './harness.mjs';
import { evaluateV3 } from './evaluate-v3.mjs';
const cache = path.resolve('.cache/architecture-verification'); await mkdir(cache, { recursive: true });
const directory = await mkdtemp(path.join(cache, 'harness-selftest-'));
const suite = await generateSuite(directory, 'evaluator-selftest-only');
function fixtureResponse(f) {
  return { schemaVersion: '1.0', runId: 'selftest', completion: 'completed',
    items: f.expected.map(original => { const e = structuredClone(original); return { ...e, criterionEvidence: [e.criterionEvidence], valueEvidence: [e.valueEvidence], highlightEvidence: e.presence === 'present' && e.status !== 'review' ? [e.valueEvidence] : [], ...(e.presence === 'missing' ? { missingVerified: true } : {}) }; }),
    coverage: f.request.documents.map(d => ({ file: d.file, inputSha256: d.sha256, readerComplete: true, contextComplete: true, criteriaComplete: d.role === 'criteria', coveredCells: f.sources.filter(s => s.file === d.file).map(s => ({ sheet: s.sheet, cell: s.cell })) })) };
}
const rejects = (f, mutate, code) => { const response = fixtureResponse(f); mutate(response); const result = validateResult(f, response, 'selftest'); assert.equal(result.passed, false); assert.ok(result.errors.some(e => e.includes(code)), result.errors.join(',')); };
test('generator writes all thirteen real-file variants with matching input hashes', async () => {
  assert.equal(suite.cases.length, VARIANTS.length);
  for (const f of suite.cases) for (const d of f.request.documents) {
    const bytes = await readFile(path.join(directory, f.inputDirectory, d.file)); assert.equal(sha256(bytes), d.sha256);
    if (d.file.endsWith('.xlsx')) assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  }
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});
test('oracle-shaped answers validate only as evaluator positive controls', () => {
  for (const f of suite.cases) assert.deepEqual(validateResult(f, fixtureResponse(f), 'selftest'), { passed: true, errors: [] });
});
test('stale nonce, zero items, duplicates, wrong verdict and altered numbers are rejected', () => {
  const f = suite.cases[0];
  rejects(f, r => r.runId = 'old', 'stale_or_wrong_run');
  rejects(f, r => r.items = [], 'item_count');
  rejects(f, r => r.items.push(r.items[0]), 'duplicate_items');
  rejects(f, r => r.items[0].status = 'fail', 'status');
  rejects(f, r => r.items[0].sourceValue = '999', 'sourceValue');
});
test('real-cell quotes at wrong locations and invented header highlights are rejected', () => {
  const f = suite.cases[0];
  rejects(f, r => r.items[0].valueEvidence[0] = { ...r.items[0].valueEvidence[0], cell: 'A1' }, 'value_source');
  rejects(f, r => { const header = f.sources.find(s => s.file === 'target.xlsx' && s.cell === 'A1'); r.items[0].valueEvidence.push(header); r.items[0].highlightEvidence = [header]; }, 'fabricated_highlight');
  rejects(f, r => r.items[0].criterionEvidence[0] = { ...r.items[0].criterionEvidence[0], quote: 'invented' }, 'criterion_source');
});
test('reader-complete cannot mask context gaps or omitted cells', () => {
  const f = suite.cases[0];
  rejects(f, r => r.coverage[0].contextComplete = false, 'reader_context');
  rejects(f, r => r.coverage[0].criteriaComplete = false, ':criteria');
  rejects(f, r => r.coverage[0].coveredCells = [], 'unread_cells');
  rejects(f, r => r.coverage[0].inputSha256 = '0'.repeat(64), 'input_hash');
});
test('notes leakage, fake types, manufactured missing highlights and unit conversion are rejected', () => {
  const f = suite.cases[0];
  rejects(f, r => r.items[0].conditions.push('습윤'), 'conditions_or_notes');
  rejects(f, r => r.items[0].categoryPath = ['invented'], 'invented_type');
  const missing = suite.cases.find(c => c.variant === 'missing-required');
  rejects(missing, r => r.items[0].highlightEvidence = [r.items[0].valueEvidence[0]], 'absent_highlight');
  rejects(missing, r => r.items[0].missingVerified = false, 'missing_not_verified');
  const incompatible = suite.cases.find(c => c.variant === 'incompatible-unit');
  rejects(incompatible, r => r.items[0].status = 'pass', 'status');
});
test('transposition, hidden sheets and shifted geometry alter physical evidence', () => {
  const base = suite.cases.find(c => c.variant === 'baseline'), shifted = suite.cases.find(c => c.variant === 'shift');
  assert.notEqual(base.expected[0].criterionEvidence.cell, shifted.expected[0].criterionEvidence.cell);
  assert.ok(suite.cases.find(c => c.variant === 'blocks-hidden').sources.some(c => c.sheet.startsWith('추가')));
  rejects(shifted, r => r.items[0].criterionEvidence[0].cell = base.expected[0].criterionEvidence.cell, 'criterion_source');
});
test('empty fixtures and missing or duplicate coverage fail closed', () => {
  assert.equal(validateResult({ id: 'empty', expected: [], sources: [], request: { documents: [] } }, { schemaVersion: '1.0', runId: 'selftest', completion: 'completed', items: [], coverage: [] }, 'selftest').passed, false);
  rejects(suite.cases[0], r => r.coverage.push(r.coverage[0]), 'coverage_document_count');
  rejects(suite.cases[0], r => delete r.items[1].conditions, 'conditions_or_notes');
});
test('empty and incomplete v3 truth cannot produce a passing comparison', () => {
  assert.throws(() => evaluateV3({}, { fields: [], writer_cells: [] }), /empty/);
  assert.throws(() => evaluateV3({}, { fields: [{ case_id: 'x', field_id: 'x', report_pages: [] }], writer_cells: [{}] }), /truth/);
});
test('oracle-copy adapter is only a positive control, never product execution evidence', async () => {
  const one = path.join(directory, 'single'); await mkdir(one);
  const f = structuredClone(suite.cases[0]);
  f.inputDirectory = 'inputs/one'; await mkdir(path.join(one, f.inputDirectory), { recursive: true });
  for (const d of f.request.documents) await writeFile(path.join(one, f.inputDirectory, d.file), await readFile(path.join(directory, suite.cases[0].inputDirectory, d.file)));
  await writeFile(path.join(one, 'oracle.json'), JSON.stringify({ cases: [f] }));
  const adapter = path.join(one, 'fake-adapter.mjs');
  await writeFile(adapter, `export async function runContract(request, context) { return {...${JSON.stringify(fixtureResponse(f))}, runId: context.runId}; }`);
  const report = await runSuite({ suiteDirectory: one, adapter, output: path.join(one, 'out'), mode: 'live' });
  assert.equal(report.passed, true); assert.equal(report.adapterExecuted, true);
  assert.equal(report.implementationExecuted, false); assert.equal(report.implementationExecutionVerified, false); assert.equal(report.completeProductAcceptance, false);
  const bytes = await readFile(path.join(one, f.inputDirectory, f.request.documents[0].file));
  await writeFile(path.join(one, f.inputDirectory, f.request.documents[0].file), Buffer.concat([bytes, Buffer.from('tampered')]));
  await assert.rejects(runSuite({ suiteDirectory: one, adapter, output: path.join(one, 'tampered-out') }), /digest mismatch/);
});

test('harness rejects a valid-shaped result returned after adapter timeout', async () => {
  const root = await mkdtemp(path.join(cache,'late-contract-'));
  const single = await generateSuite(path.join(root,'suite'),'late-contract-selftest');
  single.cases=single.cases.slice(0,1);
  await writeFile(path.join(root,'suite/oracle.json'),JSON.stringify(single));
  const response=fixtureResponse(single.cases[0]);
  const adapter=path.join(root,'late.mjs');
  await writeFile(adapter,`export async function runContract(request,c){await new Promise(r=>setTimeout(r,100));return {...${JSON.stringify(response)},runId:c.runId};}`);
  const result=await runSuite({suiteDirectory:path.join(root,'suite'),adapter,output:path.join(root,'out'),timeoutMs:20});
  assert.equal(result.passed,false);
  assert.ok(result.cases[0].errors.includes('ADAPTER_TIMEOUT_OR_OUTPUT_LIMIT'));
});

test('harness rejects unsupported timeout values before reading files or starting a child', async () => {
  for (const timeoutMs of [0, -1, 0.5, '10', Number.NaN, Number.POSITIVE_INFINITY, 21600001, 2147483648, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(runSuite({ suiteDirectory:'must-not-read', adapter:'must-not-import', output:'must-not-write', timeoutMs }), /invalid timeout/);
  }
});

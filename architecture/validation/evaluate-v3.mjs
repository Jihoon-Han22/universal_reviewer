// Node-only evaluator for the supplied v3 prediction contract. This performs no OCR.
import { readFile, readdir } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const equal = (a, b) => typeof a === 'number' && typeof b === 'number' ? Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-10, 1e-8 * Math.max(Math.abs(a), Math.abs(b))) : isDeepStrictEqual(a, b);
const fieldKey = x => `${x.case_id}\u0000${x.field_id}`;
const writerKey = x => `${x.case_id}\u0000${x.sheet}\u0000${x.cell}`;
export function evaluateV3(prediction, truth) {
  if (!Array.isArray(truth?.fields) || !truth.fields.length || !Array.isArray(truth?.writer_cells) || !truth.writer_cells.length) throw new Error('empty or invalid truth cannot pass');
  if (new Set(truth.fields.map(fieldKey)).size !== truth.fields.length || new Set(truth.writer_cells.map(writerKey)).size !== truth.writer_cells.length) throw new Error('duplicate truth identity');
  const nonempty = v => typeof v === 'string' && v.length > 0;
  const finiteValue = v => v === null || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v) || Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'number' && Number.isFinite(x));
  const validSource = s => nonempty(s?.file) && (nonempty(s.sheet) && Array.isArray(s.cells) && s.cells.length > 0 && s.cells.every(nonempty) || Number.isInteger(s.page) && s.page > 0 && nonempty(s.clause));
  for (const f of truth.fields) {
    if (!nonempty(f.case_id) || !nonempty(f.field_id) || !['value', 'unit', 'qualifier', 'operator', 'limit', 'criterion_unit', 'verdict', 'report_pages', 'criterion_source'].every(k => Object.hasOwn(f, k)) || !finiteValue(f.value) || !finiteValue(f.limit) || typeof f.unit !== 'string' || typeof f.criterion_unit !== 'string' || !nonempty(f.qualifier) || !['pass', 'fail', 'review'].includes(f.verdict) || ![null, 'lt', 'lte', 'gt', 'gte', 'eq', 'between'].includes(f.operator) || !Array.isArray(f.report_pages) || !f.report_pages.length || !f.report_pages.every(p => Number.isInteger(p) && p > 0) || !validSource(f.criterion_source)) throw new Error('incomplete truth field');
  }
  for (const w of truth.writer_cells) if (!nonempty(w.case_id) || !nonempty(w.sheet) || !/^[A-Z]+[1-9][0-9]*$/.test(w.cell) || !Object.hasOwn(w, 'value') || !finiteValue(w.value)) throw new Error('incomplete writer truth');
  if (!prediction || typeof prediction !== 'object') prediction = {};
  const errors = [], fields = Array.isArray(prediction.fields) ? prediction.fields : [], writers = Array.isArray(prediction.writer_cells) ? prediction.writer_cells : [];
  const p = new Map(fields.map(f => [fieldKey(f), f])), w = new Map(writers.map(f => [writerKey(f), f]));
  if (p.size !== fields.length) errors.push('duplicate_fields'); if (w.size !== writers.length) errors.push('duplicate_writer_cells');
  if (fields.length !== truth.fields.length) errors.push('field_count');
  const counts = { value: 0, criterion: 0, verdict: 0, source: 0, retrieval: 0, writer: 0 };
  for (const f of truth.fields) {
    const actual = p.get(fieldKey(f));
    for (const [metric, keys] of Object.entries({ value: ['value', 'unit', 'qualifier'], criterion: ['operator', 'limit', 'criterion_unit'], verdict: ['verdict'], source: ['criterion_source'] })) {
      const ok = actual && keys.every(k => equal(actual[k], f[k]));
      if (ok) counts[metric]++; else errors.push(`${f.case_id}:${f.field_id}:${metric}`);
    }
    const actualPages = actual?.report_pages;
    const ok = Array.isArray(actualPages) && actualPages.every(p => Number.isInteger(p) && p > 0) && isDeepStrictEqual([...new Set(actualPages)].sort((a, b) => a - b), [...new Set(f.report_pages)].sort((a, b) => a - b));
    if (ok) counts.retrieval++; else errors.push(`${f.case_id}:${f.field_id}:retrieval`);
  }
  const expectedWriters = new Set(truth.writer_cells.map(writerKey));
  for (const expected of truth.writer_cells) {
    const actual = w.get(writerKey(expected));
    if (actual && equal(actual.value, expected.value)) counts.writer++; else errors.push(`${expected.case_id}:${expected.sheet}:${expected.cell}:writer`);
  }
  for (const key of w.keys()) if (!expectedWriters.has(key)) errors.push('unexpected_writer_cell');
  return { kind: 'v3-prediction-comparison', exactPass: !errors.length, counts, expectedFields: truth.fields.length, expectedWriterCells: truth.writer_cells.length, errors, checksBoundingBoxes: false, executesOCR: false, implementationExecuted: false, completeProductAcceptance: false };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [datasetRoot, predictionPath] = process.argv.slice(2);
  if (!datasetRoot || !predictionPath || process.argv.length !== 4) { console.error('Usage: node evaluate-v3.mjs V3_DIRECTORY PREDICTION_JSON|--selftest'); process.exitCode = 2; }
  else {
    const truth = JSON.parse(await readFile(path.join(datasetRoot, 'golden/canonical_answer.json'), 'utf8'));
    if (predictionPath === '--selftest') {
      const positive = evaluateV3(truth, truth); const negative = [];
      for (const name of (await readdir(path.join(datasetRoot, 'failed_predictions'))).filter(n => /^F\d{2}_.+\.json$/.test(n)).sort()) {
        const result = evaluateV3(JSON.parse(await readFile(path.join(datasetRoot, 'failed_predictions', name), 'utf8')), truth);
        negative.push({ name, rejected: !result.exactPass, errorCount: result.errors.length });
      }
      const passed = positive.exactPass && negative.length === 10 && negative.every(r => r.rejected);
      console.log(JSON.stringify({ kind: 'evaluator-selftest', positivePass: positive.exactPass, negative, passed, implementationExecuted: false, completeProductAcceptance: false }, null, 2)); process.exitCode = passed ? 0 : 1;
    } else {
      const result = evaluateV3(JSON.parse(await readFile(predictionPath, 'utf8')), truth); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.exactPass ? 0 : 1;
    }
  }
}

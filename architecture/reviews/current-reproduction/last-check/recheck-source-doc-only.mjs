// Independent transcription of specs/02-backend-pipeline.md sections 2.4.1/2.4.2.
// Only architecture fixtures are read; no original application code is imported.
import { readFileSync } from 'node:fs';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { createHash } from 'node:crypto';
const J = JSON.stringify;
const lineSplit = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/;
function sourceLines(value) {
  const text = String(value ?? '');
  if (!text) return [];
  const lines = text.split(lineSplit);
  if (/[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]$/.test(text)) lines.pop();
  return lines;
}
function column(n) { let out = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out; return out; }
function source(profile) {
  const records = [];
  const emit = text => records.push(text);
  const value = cell => cell.formula && (cell.cachedValue == null || cell.cachedValue === '')
    ? '[계산 결과 없음: 수식 재계산 필요]' : String(cell.formula ? cell.cachedValue : (cell.value ?? ''));
  emit('SANDBOX_READER: original bytes physically opened in E2B');
  emit('INVENTORY: ' + J(profile.inventory || {}));
  emit('READ_COVERAGE: ' + J(profile.coverage || {}));
  for (const sheet of profile.sheets || []) {
    emit(`SHEET ${J(sheet.name)} state=${sheet.state} size=${sheet.maxRow}x${sheet.maxColumn}`);
    emit('MERGED_RANGES ' + J(sheet.mergedRanges || []));
    emit('HIDDEN_ROWS ' + J(sheet.hiddenRows || []) + ' HIDDEN_COLUMNS ' + J(sheet.hiddenColumns || []));
    emit('SHEET_METADATA ' + J({ autoFilter: sheet.autoFilter, tables: sheet.tables, headersFooters: sheet.headersFooters, imageInventory: sheet.imageInventory }));
    for (const row of sheet.rows || []) {
      const cells = row.cells.map(cell => `${J(sheet.name)}!${cell.cell}: ${J(value(cell))}`
        + (cell.formula ? ` [FORMULA ${J(cell.formula)}; cached, not recalculated]` : '')
        + (cell.comment ? ` COMMENT: ${J(cell.comment)}` : '')
        + (cell.numberFormat ? ` FORMAT: ${J(cell.numberFormat)}` : '')
        + (cell.hyperlink ? ` LINK_DATA_NOT_FETCHED: ${J(cell.hyperlink)}` : ''));
      emit(`${profile.kind === 'csv' ? 'CSV' : 'XLSX'}_ROW ${row.row} | ${cells.join(' | ')}`);
    }
  }
  for (const page of profile.pages || []) {
    emit(`PAGE ${page.page} size=${page.width || '?'}x${page.height || '?'} rotation=${page.rotation || 0}\n${page.text || ''}`);
    for (const table of page.tables || []) emit(`PAGE ${page.page} TABLE ${J(table)}`);
    for (const block of page.blocks || []) emit(`PAGE ${page.page} BLOCK ${J(block)}`);
  }
  for (const block of profile.blocks || []) emit(`BLOCK ${block.index ?? ''} ${J(block)}`);
  if (profile.sections?.length) emit('DOCUMENT_SECTIONS ' + J(profile.sections));
  for (const extra of profile.supplementaryText || []) emit('SUPPLEMENTARY_TEXT ' + J(extra));
  if (profile.text) emit('FULL_TEXT_WITH_SOURCE_LINE_NUMBERS\n' + sourceLines(profile.text).map((line, i) => `L${i + 1}: ${line}`).join('\n'));
  for (const row of profile.rows || []) emit(`CSV_ROW ${row.row} | ` + row.cells.map((v, i) => `${column(i + 1)}${row.row}: ${J(v)}`).join(' | '));
  for (const image of profile.images || []) emit('EMBEDDED_IMAGE ' + J({ ...image, path: undefined }));
  if (profile.warnings?.length) emit('READER_WARNINGS ' + J(profile.warnings));
  return records.join('\n');
}
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
function measure(text) {
  const retained = text.slice(0, 1200000);
  return { sourceChars: text.length, sourceUtf8Bytes: Buffer.byteLength(text, 'utf8'), sourceSha256Utf8: sha(text), contextChars: retained.length,
    contextSegmentsTotal: Math.max(1, Math.ceil(retained.length / 150000)), sourceTruncated: text.length > 1200000, retainedSha256Utf8: sha(retained) };
}
const fixture = JSON.parse(readFileSync('architecture/contracts/source-serialization-cases.json', 'utf8'));
for (const test of fixture.cases) { const actual = source(test.input); strictEqual(actual, test.expectedSource, test.id); deepStrictEqual(measure(actual), test.expected, test.id); }
for (const test of fixture.boundaryCases) {
  const actual = source({ ...test.inputRecipe.baseProfile, text: test.inputRecipe.text.repeat.repeat(test.inputRecipe.text.count) });
  strictEqual(actual, test.expectedSourceRecipe.prefix + test.expectedSourceRecipe.suffix.repeat.repeat(test.expectedSourceRecipe.suffix.count), test.id);
  deepStrictEqual(measure(actual), test.expected, test.id);
}
// This checks that the documented Reader.text equality rule selects each fixture
// answer; it does not execute or claim parity of a real Python/E2B reader.
for (const test of fixture.readerTextBoundaryCases) {
  const count = test.inputRecipe.bytes.count;
  const truncated = count > 1500000;
  const retained = Math.min(count, 1500000);
  const reasons = truncated ? ['Text extraction limit (1500000 characters) reached.'] : [];
  deepStrictEqual({ inputChars: count, retainedChars: retained, status: truncated ? 'partial' : 'ready', coverage: {
    complete: !truncated, unitsTotal: 1, unitsRead: 1, cellsTotal: 0, cellsRead: 0, textChars: retained, truncated, truncatedReasons: reasons,
  }, warnings: reasons }, test.expected, test.id);
}
const originalResults = [];
for (const [rows, charsPerCell] of [[4, 30500], [40, 29300]]) {
  const profile = { kind: 'xlsx', inventory: { sheetCount: 1, definedNames: Array.from({ length: 500 }, (_, i) => ({ name: `N${String(i + 1).padStart(3, '0')}`, reference: `S!${String.fromCharCode(65 + i % 26)}1` })) },
    coverage: { complete: true, unitsTotal: 1, unitsRead: 1, cellsTotal: rows, cellsRead: rows, textChars: rows * charsPerCell, truncated: false, truncatedReasons: [] },
    sheets: [{ name: 'S', state: 'visible', maxRow: rows, maxColumn: 1, mergedRanges: [], hiddenRows: [], hiddenColumns: [], autoFilter: null, tables: [], headersFooters: { header: '', footer: '' }, imageInventory: [], rows: Array.from({ length: rows }, (_, i) => ({ row: i + 1, cells: [{ cell: 'A' + (i + 1), value: 'x'.repeat(charsPerCell) }] })) }] };
  const m = measure(source(profile));
  originalResults.push({ rows, charsPerCell, sourceChars: m.sourceChars, contextSegmentsTotal: m.contextSegmentsTotal, sourceTruncated: m.sourceTruncated });
}
deepStrictEqual(originalResults.map(v => [v.sourceChars, v.contextSegmentsTotal, v.sourceTruncated]), [[140039, 1, false], [1190969, 8, false]]);
console.log(JSON.stringify({ method: 'independent-code-from-prose', sourceRead: false, exactStringCasesPassed: fixture.cases.length, boundaryCasesPassed: fixture.boundaryCases.length, readerBoundaryRulesMatched: fixture.readerTextBoundaryCases.length, actualReaderExecuted: false, originalCounterexamplesResolved: 2, originalResults, providerExecuted: false }));

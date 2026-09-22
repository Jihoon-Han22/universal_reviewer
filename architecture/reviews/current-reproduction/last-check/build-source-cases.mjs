import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { profileSource } from '../../server/sandbox-documents.mjs';

const prefix = (inventory, coverage) => `SANDBOX_READER: original bytes physically opened in E2B\nINVENTORY: ${inventory}\nREAD_COVERAGE: ${coverage}`;
const stats = source => ({ sourceChars: source.length, sourceUtf8Bytes: Buffer.byteLength(source, 'utf8'), sourceSha256Utf8: createHash('sha256').update(source, 'utf8').digest('hex'), contextChars: Math.min(source.length, 1_200_000), contextSegmentsTotal: Math.max(1, Math.ceil(Math.min(source.length, 1_200_000) / 150_000)), sourceTruncated: source.length > 1_200_000, retainedSha256Utf8: createHash('sha256').update(source.slice(0, 1_200_000), 'utf8').digest('hex') });
const cases = [
  {
    id: 'SRC-TEXT-LINES-ORDER',
    input: { kind: 'txt', inventory: { z: 2, a: 1 }, coverage: { complete: true }, text: 'A\r\nB\u2028C\n' },
    expectedSource: prefix('{"z":2,"a":1}', '{"complete":true}') + '\nFULL_TEXT_WITH_SOURCE_LINE_NUMBERS\nL1: A\nL2: B\nL3: C',
  },
  {
    id: 'SRC-SHEET-CELL-FORMULA',
    input: { kind: 'xlsx', inventory: {}, coverage: { complete: true }, sheets: [{ name: '품질', state: 'hidden', maxRow: 2, maxColumn: 3, mergedRanges: ['B1:C1'], hiddenRows: [2], hiddenColumns: [], autoFilter: null, rows: [{ row: 2, cells: [{ cell: 'B2', value: false, comment: '메모', numberFormat: '0', hyperlink: 'https://example.invalid/x' }, { cell: 'A2', value: null }, { cell: 'C2', formula: '=A1', cachedValue: '' }] }, { row: 1, cells: [{ cell: 'A1', formula: '=1-1', cachedValue: 0 }] }] }] },
    expectedSource: prefix('{}', '{"complete":true}') + '\nSHEET "품질" state=hidden size=2x3\nMERGED_RANGES ["B1:C1"]\nHIDDEN_ROWS [2] HIDDEN_COLUMNS []\nSHEET_METADATA {"autoFilter":null}\nXLSX_ROW 2 | "품질"!B2: "false" COMMENT: "메모" FORMAT: "0" LINK_DATA_NOT_FETCHED: "https://example.invalid/x" | "품질"!A2: "" | "품질"!C2: "[계산 결과 없음: 수식 재계산 필요]" [FORMULA "=A1"; cached, not recalculated]\nXLSX_ROW 1 | "품질"!A1: "0" [FORMULA "=1-1"; cached, not recalculated]',
  },
  {
    id: 'SRC-EXTRA-RECORDS-ORDER',
    input: { kind: 'pdf', inventory: { path: 'inventory-path-retained-here' }, coverage: {}, pages: [{ page: 2, width: 0, height: 842, rotation: 0, text: 'actual\ntext', tables: [{ b: 2, a: 1 }], blocks: [{ text: 'b', type: 'text' }] }], blocks: [{ index: 3, kind: 'paragraph', text: 'Word body' }], sections: [{ orientation: 'landscape' }], supplementaryText: [{ part: 'comments', text: 'note' }], text: 'tail', rows: [{ row: 9, cells: [0, false, null, 'x'] }], images: [{ path: '/home/user/document-image-1.png', mime: 'image/png', page: 2, description: 'img' }], warnings: ['z', 'a', 'z'] },
    expectedSource: prefix('{"path":"inventory-path-retained-here"}', '{}') + '\nPAGE 2 size=?x842 rotation=0\nactual\ntext\nPAGE 2 TABLE {"b":2,"a":1}\nPAGE 2 BLOCK {"text":"b","type":"text"}\nBLOCK 3 {"index":3,"kind":"paragraph","text":"Word body"}\nDOCUMENT_SECTIONS [{"orientation":"landscape"}]\nSUPPLEMENTARY_TEXT {"part":"comments","text":"note"}\nFULL_TEXT_WITH_SOURCE_LINE_NUMBERS\nL1: tail\nCSV_ROW 9 | A9: 0 | B9: false | C9: null | D9: "x"\nEMBEDDED_IMAGE {"mime":"image/png","page":2,"description":"img"}\nREADER_WARNINGS ["z","a","z"]',
  },
  {
    id: 'SRC-CSV-SHEET-ROW',
    input: { kind: 'csv', sheets: [{ name: 'CSV', state: 'visible', maxRow: 1, maxColumn: 1, rows: [{ row: 1, cells: [{ cell: 'A1', value: 7 }] }] }] },
    expectedSource: prefix('{}', '{}') + '\nSHEET "CSV" state=visible size=1x1\nMERGED_RANGES []\nHIDDEN_ROWS [] HIDDEN_COLUMNS []\nSHEET_METADATA {}\nCSV_ROW 1 | "CSV"!A1: "7"',
  },
];
for (const entry of cases) {
  assert.equal(profileSource(entry.input), entry.expectedSource, entry.id);
  entry.expected = stats(entry.expectedSource);
}
const boundaryPrefix = prefix('{"encoding":"utf-8"}', '{"complete":true}') + '\nFULL_TEXT_WITH_SOURCE_LINE_NUMBERS\nL1: ';
const boundaries = [149_999, 150_000, 150_001, 1_199_999, 1_200_000, 1_200_001].map(length => {
  const repeat = length - boundaryPrefix.length;
  const source = boundaryPrefix + 'x'.repeat(repeat);
  const input = { kind: 'txt', inventory: { encoding: 'utf-8' }, coverage: { complete: true }, text: 'x'.repeat(repeat) };
  assert.equal(profileSource(input), source);
  return { id: `SRC-BOUNDARY-${length}`, inputRecipe: { baseProfile: { kind: 'txt', inventory: { encoding: 'utf-8' }, coverage: { complete: true } }, text: { repeat: 'x', count: repeat } }, expectedSourceRecipe: { prefix: boundaryPrefix, suffix: { repeat: 'x', count: repeat }, trailingNewline: false }, expected: stats(source) };
});
const reader = JSON.parse(await readFile(new URL('./core-reader-results.json', import.meta.url), 'utf8'));
const artifact = {
  profile: 'CURRENT_REPRODUCTION',
  description: 'Original profileSource exact output and trusted Python reader equality vectors. Mixed-format extra-record fixture tests the serialization port, not an uploaded document claim.',
  units: { sourceChars: 'JavaScript UTF-16 code units (String.length)', sourceUtf8Bytes: 'UTF-8 bytes', hashes: 'SHA-256 of UTF-8 encoded source/retained source; no BOM', readerTextChars: 'Python len(str), Unicode code points; ASCII x recipes make code units and code points equal' },
  serialization: { json: 'ECMAScript JSON.stringify(value), no replacer and no indentation; retain object property enumeration order and input array order', recordJoin: '\n', addsTrailingNewline: false },
  cases,
  boundaryCases: boundaries,
  readerTextBoundaryCases: reader.map(value => ({ id: `READER-TEXT-${value.inputChars}`, inputRecipe: { kind: 'txt', bytes: { repeatAscii: 'x', count: value.inputChars } }, expected: value })),
  execution: { command: 'node .cache/architecture-final-challenge/build-source-cases.mjs; python -B .cache/architecture-final-challenge/core-reader-probe.py', scope: 'Original deterministic functions only, manually specified expected source strings independently asserted against the original function. Real Python Reader.read for ASCII files. No provider or E2B execution, no .env reading.', implementationUnderTest: ['server/sandbox-documents.mjs:profileSource', 'server/sandbox-document-reader.py:Reader.read'], result: 'PASS: 4 exact source strings, 6 source length recipes, 3 observed reader equality cases' },
};
await writeFile(new URL('../../architecture/contracts/source-serialization-cases.json', import.meta.url), JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({ exactCases: cases.map(c => ({ id: c.id, ...c.expected })), boundaryCases: boundaries.map(c => ({ id: c.id, repeatCount: c.inputRecipe.text.count, ...c.expected })), readerTextCases: reader.length }, null, 2));

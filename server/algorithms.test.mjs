import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCriteria, approveCriteria, parseRule, numericVerdict, unitKey, preserveSourceConditions, normalizeHandlingCriteria, normalizeItems, validateAssessment, verifyConditions, verifyCriterionApplicability, verifiedVisualRegions, normalizeDocumentExtraction, reviewRowCoverage, recordRows, exactBlankEvidence, deduplicateCriteria, extractStaticCriteria, applyCriteriaRevision, columnName, tableLayouts } from './algorithms.mjs';

const criterion = (extra = {}) => ({ id: 'c', label: '강도', rule: '80 MPa 이상', conditions: [], categoryPath: [], needsConfirmation: false, comparison: { operator: 'gte', value: 80, unit: 'MPa' }, ...extra });
const finding = (extra = {}) => ({ criterionId: 'c', label: '강도', value: '92', unit: 'MPa', status: 'fail', uncertain: false, explanation: '모델 제안', evidence: [{ documentId: 'd', quote: '강도 92 MPa', cell: 'B2' }], ...extra });
const csv = (value = '92') => ({ id: 'd', name: 'x.csv', kind: 'csv', sourceRows: [{ row: 1, cells: ['id', '강도', '유형'] }, { row: 2, cells: ['R1', value, '금속 A1'] }, { row: 3, cells: ['R2', '91', '금속 A11'] }], analysis: { status: 'complete', coverage: { complete: true } } });
const decide = (raw = finding(), c = criterion(), d = { id: 'd', kind: 'csv' }) => normalizeItems([raw], d, [c], { idFactory: () => 'item' })[0];
const workbook = ({ conditions = true, notes = true, transpose = false } = {}) => {
  const rows = [['시험항목', '기준', ...(conditions ? ['시험조건'] : []), ...(notes ? ['비고'] : [])], ['강도', '80 이상', ...(conditions ? ['7일'] : []), ...(notes ? ['28일'] : [])]];
  const values = transpose ? rows[0].map((_, i) => rows.map(r => r[i])) : rows;
  return { id: 'd', kind: 'xlsx', name: '입력.xlsx', sourceSheets: [{ name: 'S', rows: values.map((r, i) => ({ row: i + 1, cells: r.map((text, j) => ({ address: `${String.fromCharCode(65 + j)}${i + 1}`, text })) })) }] };
};

test('ALG-N01/N02 inclusive/exclusive boundaries override model and set machineStatus', () => {
  for (const [operator, expected] of [['gte', 'pass'], ['gt', 'fail'], ['lte', 'pass'], ['lt', 'fail'], ['eq', 'pass']]) {
    const item = decide(finding({ value: '80', status: expected === 'pass' ? 'fail' : 'pass' }), criterion({ comparison: { operator, value: 80, unit: 'MPa' } }));
    assert.equal(item.status, expected); assert.equal(item.machineStatus, expected);
  }
});
test('ALG-N03/N04 numeric parser rejects qualifiers, ranges, exponent, omitted-leading decimals and unit conversions', () => {
  for (const value of ['ND', 'N.D.', '−', '<0.01', '1e3', '0.01±0.002', '1..2', '1.0 (평균)', '.5', '1,20', 'Infinity', '']) assert.equal(numericVerdict(value, 'MPa', criterion().comparison), null, value);
  assert.equal(numericVerdict('1', 'kg', { operator: 'gte', value: 1000, unit: 'g' }), null);
  assert.equal(numericVerdict('1,200', '원', { operator: 'lte', value: 1200, unit: 'KRW' }), 'pass');
  assert.equal(unitKey('㎎'), unitKey('mg')); assert.notEqual(unitKey('cm²/g'), unitKey('cm2/g'));
  assert.equal(numericVerdict('80', 'MPa', { operator: 'range', value: 80, upper: 90, unit: 'MPa' }), 'pass');
});
test('parseRule accepted grammar preserves raw rule and genuine parenthetical conditions', () => {
  for (const text of ['5 ~ 10', '5–10', '5—10', '5..10', '5 - 10', '5 이상 10 이하']) assert.deepEqual(parseRule(text).comparison, { operator: 'range', value: 5, upper: 10, unit: '' }, text);
  for (const text of ['5-10', '1e3', '.5 이상', 'KS F 1234', '---', '10 ~ 5', '5 kg ~ 10 g']) assert.equal(parseRule(text).needsConfirmation, true, text);
  const parsed = parseRule('>= 80 MPa (28일)'); assert.equal(parsed.rule, '>= 80 MPa (28일)'); assert.deepEqual(parsed.conditions, ['28일']); assert.equal(parsed.comparison.value, 80);
  assert.equal(parseRule('5 kg 이상', 'g').comparison, undefined); assert.equal(parseRule('N.D.').needsConfirmation, false);
  assert.equal(parseRule('>= 3 kg/m3').comparison.unit, 'kg/m3');
});
test('criterion validator shape limits and source alias preserve baseline classification limitation', () => {
  const result = validateCriteria([criterion({ categoryPath: ['원문에없는유형'], comparison: { operator: 'gte', value: '80', unit: 'MPa' }, evidenceCells: [{ documentId: 'd', quote: '강도', cell: 'A2' }] })])[0];
  assert.equal(result.classificationStatus, 'resolved'); assert.equal(result.needsConfirmation, false); assert.equal(result.comparison, undefined); assert.equal(result.evidenceCells, undefined); assert.equal(result.sourceEvidence.length, 1);
  assert.throws(() => validateCriteria([criterion(), criterion()])); assert.throws(() => validateCriteria([criterion({ categoryPath: Array(9).fill('x') })]));
  assert.equal(validateCriteria([criterion()])[0].classificationStatus, 'not_applicable'); assert.equal(validateCriteria([criterion({ sampleName: 's' })])[0].classificationStatus, 'resolved');
});
test('ALG-C01/C02 note removal and true condition recovery survive transposition', () => {
  for (const transpose of [false, true]) {
    const cs = [criterion({ sourceDocumentId: 'd', rule: '80 이상 (28일)', conditions: ['28일'] })];
    assert.equal(preserveSourceConditions(cs, [workbook({ transpose })]), cs); assert.deepEqual(cs[0].conditions, ['7일']); assert.equal(cs[0].ignoredSourceNotes[0].text, '28일');
  }
});
test('BKA-01 identical note text cannot erase a condition from the actual rule or item source', () => {
  for (const transpose of [false, true]) for (const conditionInItem of [false, true]) {
    const matrix = [['항목', '기준', '비고'], [conditionInItem ? '강도 (28일)' : '강도', conditionInItem ? '>= 80' : '>= 80 (28일)', '28일']];
    const values = transpose ? matrix[0].map((_, i) => matrix.map(row => row[i])) : matrix;
    const document = { id: 'source', kind: 'csv', name: 'renamed.csv', sourceRows: values.map((cells, i) => ({ row: i + 1, cells })) };
    const criteria = validateCriteria(extractStaticCriteria(document).criteria);
    // Item qualifiers can be supplied by semantic extraction as conditions.
    if (conditionInItem) { criteria[0].conditions = ['28일']; criteria[0].rule += ' (28일)'; }
    const before = structuredClone(criteria); preserveSourceConditions(criteria, [document]);
    assert.deepEqual(criteria[0].conditions, ['28일']); assert.equal(criteria[0].rule, before[0].rule);
    const raw = finding({ criterionId: criteria[0].id, label: criteria[0].label, unit: '', evidence: [{ documentId: 'd', cell: 'B2', quote: '92' }] });
    assert.equal(normalizeItems([raw], csv(), criteria)[0].status, 'review');
    const complete = csv(); complete.sourceRows[1].cells[2] = '28일';
    const completeItem = normalizeItems([{ ...raw, evidence: [{ documentId: 'd', cell: 'A2:C2', quote: 'R1 92 28일' }] }], complete, criteria)[0];
    assert.equal(completeItem.status, 'pass', JSON.stringify({ transpose, conditionInItem, criteria, completeItem }));
  }
});
test('BKA-02 note/result header-like content cannot terminate real tables or create transposed criteria', () => {
  for (const heading of ['비고', '참고', 'Notes', '결과']) for (const transpose of [false, true]) for (const shifted of [false, true]) {
    const matrix = [['항목', '기준', heading, heading, heading], ['강도', '>= 5', '항목', '가짜1', '가짜2'], ['', '', '기준', '>= 100', '>= 200']];
    const values = transpose ? matrix[0].map((_, i) => matrix.map(row => row[i])) : matrix;
    const rowOffset = shifted ? 3 : 0, colOffset = shifted ? 2 : 0;
    const table = { documentId: 'source', name: 'moved', rows: values.map((row, i) => ({ row: i + 1 + rowOffset, cells: row.map((text, j) => ({ address: `${columnName(j + 1 + colOffset)}${i + 1 + rowOffset}`, text })) })) };
    const source = { id: 'source', kind: 'xlsx', name: 'arbitrary.xlsx', sourceSheets: [table] };
    const extracted = extractStaticCriteria(source).criteria;
    assert.deepEqual(extracted.map(c => c.label), ['강도'], `${heading}/${transpose}/${shifted}`); assert.equal(extracted[0].comparison.value, 5);
    const excluded = tableLayouts(table).flatMap(l => l.excludedCells).map(v => v.cell.text);
    assert.ok(excluded.includes('>= 100')); assert.ok(excluded.includes('>= 200'));
  }
  const matrix = [['항목', '기준', '비고', '항목', '기준', '비고'], ['강도', '>= 5', '항목', '인장', '>= 6', '항목']];
  const source = { id: 'source', kind: 'csv', name: 'repeat.csv', sourceRows: matrix.map((cells, i) => ({ row: i + 1, cells })) };
  // The static adapter still selects its one highest-scored table; both real
  // repeated blocks remain available to the full workbook discovery consumer.
  const tables = { documentId: 'source', name: 'repeat', rows: matrix.map((row, i) => ({ row: i + 1, cells: row.map((text, j) => ({ address: `${columnName(j + 1)}${i + 1}`, text })) })) };
  assert.deepEqual(tableLayouts(tables).flatMap(l => l.rows.map(r => r.values.find(v => v.role === 'item').cell.text)), ['강도', '인장']);
  assert.equal(extractStaticCriteria(source).criteria[0].comparison.value, 5);
});
test('notes sourceEvidence-only leak remains baseline; natural-language and explicit user overrides retain notes', () => {
  const document = workbook({ conditions: false });
  const c = criterion({ sourceDocumentId: 'd', sourceEvidence: [{ documentId: 'd', sheet: 'S', cell: 'C2', quote: '28일' }], rule: '80 이상 (28일)', conditions: ['28일'] });
  preserveSourceConditions([c], [document]); assert.equal(c.sourceEvidence[0].quote, '28일');
  const edited = { ...c, rule: '28일', conditions: ['28일'], userOverride: true }; preserveSourceConditions([edited], [document]); assert.deepEqual(edited.conditions, ['28일']);
});
test('ALG-C03 conditions require full relations, verified source and exact duration units', () => {
  const document = { id: 'd', kind: 'txt', modelParts: [{ text: '28 days 92 MPa' }] }, evidence = [{ documentId: 'd', quote: '28 days 92 MPa' }];
  assert.equal(verifyConditions({ conditions: ['28일'] }, evidence, document).verified, true);
  assert.equal(verifyConditions({ conditions: ['28일 이상'] }, evidence, document).verified, false);
  assert.equal(verifyConditions({ conditions: ['672시간'] }, evidence, document).verified, false);
  assert.equal(verifyConditions({ conditions: ['28일'] }, evidence, { ...document, kind: 'png' }).verified, false);
  assert.equal(verifyConditions({ conditions: ['28일'] }, [{ documentId: 'd', quote: '28 days 93 MPa' }], document).verified, false);
});
test('ALG-H01/H02/H03 source record applicability enforces ordered path and literal numeric boundaries', () => {
  const d = csv(), c = criterion({ categoryPath: ['금속', 'A1'] });
  const app = { matched: true, uncertain: false, categoryPath: ['제품', '금속', 'A1'], evidence: [{ documentId: 'd', cell: 'C2', quote: '금속 A1' }] };
  assert.deepEqual(verifyCriterionApplicability(criterion(), undefined, d), { verified: true });
  assert.equal(verifyCriterionApplicability(c, app, d, finding().evidence).verified, true);
  assert.equal(verifyCriterionApplicability(c, { ...app, categoryPath: ['A1', '금속'] }, d, finding().evidence).verified, false);
  assert.equal(verifyCriterionApplicability(c, { ...app, evidence: [{ documentId: 'd', cell: 'C3', quote: '금속 A11' }] }, d, finding().evidence).verified, false);
  assert.equal(decide(finding({ applicability: app }), c, d).status, 'pass');
  assert.equal(decide(finding(), c, d).status, 'review');
});
test('visual applicability checks cited-page uncertainty but preserves noncited-page baseline gap', () => {
  const page = n => ({ page: n, complete: true, warnings: [], blocks: [{ text: '금속', uncertain: false }], tables: [] });
  const d = { id: 'd', kind: 'pdf', transcription: { quality: { status: 'verified', issues: [] }, warnings: [], issueDetails: [], requiresConfirmation: false, coverage: { complete: true, expectedPages: 2, transcribedPages: [1, 2], missingPages: [] }, pages: [page(1), page(2)] } };
  d.transcription.pages[1].blocks[0].uncertain = true; assert.deepEqual(verifiedVisualRegions(d, 1), ['금속']);
  d.transcription.pages[0].blocks[0].uncertain = true; assert.deepEqual(verifiedVisualRegions(d, 1), []);
});
test('ALG-M01/M02/M04 fully read exact blank fails; partial reads review; optional blank omitted', () => {
  const d = csv(''), raw = finding({ value: '', presence: 'missing', evidence: [{ documentId: 'd', cell: 'B2', quote: '' }] });
  const missing = decide(raw, criterion(), d); assert.equal(missing.status, 'fail'); assert.equal(missing.missingVerified, true); assert.equal(missing.evidence[0].blank, true);
  d.analysis.coverage.readerComplete = false; assert.equal(decide(raw, criterion(), d).status, 'review');
  assert.equal(decide(raw, criterion({ required: false }), d), undefined);
  assert.equal(decide(finding({ value: 'ND' }), criterion(), csv()).status, 'review');
});
test('ALG-M03 formula and every merged location cannot certify blank', () => {
  const d = { id: 'd', kind: 'xlsx', sourceSheets: [{ name: 'S', mergedRanges: [], rows: [{ row: 1, cells: [{ address: 'A1', text: 'id' }, { address: 'B1', text: '강도' }] }, { row: 2, cells: [{ address: 'A2', text: 'R1' }, { address: 'B2', text: '', formula: '=X1' }] }] }] };
  const e = { documentId: 'd', sheet: 'S', cell: 'B2' }; assert.equal(exactBlankEvidence(d, e), false);
  delete d.sourceSheets[0].rows[1].cells[1].formula; assert.equal(exactBlankEvidence(d, e), true);
  d.sourceSheets[0].mergedRanges = ['B2:C2']; assert.equal(exactBlankEvidence(d, e), false);
});
test('ALG-M05 independent real fact contradicts missing; ND and unknown never certify missing', () => {
  const d = csv(''); d.extraction = { fields: [{ label: '강도', value: '92', unit: 'MPa', evidence: finding().evidence }] };
  const raw = finding({ value: '', presence: 'missing', evidence: [{ documentId: 'd', cell: 'A2', quote: 'R1' }] });
  assert.equal(decide(raw, criterion(), d).status, 'review');
  assert.equal(decide({ ...raw, value: 'ND' }, criterion(), d).missingVerified, undefined);
  delete d.extraction;
  assert.equal(decide({ ...raw, evidence: [{ documentId: 'd', cell: 'B2', quote: 'invented missing quote' }] }, criterion(), d).missingVerified, undefined);
});
test('ALG-E01 independent extraction verifies numeric boundaries and guards model judgment', () => {
  const d = { id: 'd', kind: 'pdf', verificationPages: [{ page: 1, text: 'Report No 000-1\n강도 0.025 MPa' }] };
  const extracted = normalizeDocumentExtraction({ referenceNumber: '000-2', documentType: '시험성적서', fields: [{ label: '강도', value: '0.02', unit: 'MPa', uncertain: false, evidence: [{ documentId: 'd', page: 1, quote: '강도 0.025 MPa' }] }], warnings: [] }, d);
  assert.equal(extracted.fields[0].verification, 'mismatch'); assert.equal(extracted.fields[0].uncertain, true); assert.equal(extracted.referenceNumber, '');
  d.extraction = extracted; assert.equal(decide(finding(), criterion(), d).extractionMismatch, true);
});
test('extraction adjacent label guard preserves one-letter labels and does not take next item value', () => {
  const d = { id: 'd', kind: 'pdf', verificationPages: [{ page: 1, text: '납\n비소\n0.02' }] };
  const evidence = [{ documentId: 'd', page: 1, quote: '납 비소 0.02' }];
  const result = normalizeDocumentExtraction({ referenceNumber: '', documentType: '성적서', fields: ['납', '비소'].map(label => ({ label, value: '0.02', unit: '-', uncertain: false, evidence })), warnings: [] }, d);
  assert.equal(result.fields[0].verification, 'mismatch'); assert.equal(result.fields[1].verification, 'verified');
});
test('extraction admits 2500-character quotes, warns when digital verification is unavailable and marks empty facts uncertain', () => {
  const image = { id: 'd', kind: 'png' }, raw = { referenceNumber: '0001', documentType: '성적서', fields: [{ label: '납', value: 'N.D.', unit: '-', uncertain: false, evidence: [{ documentId: 'd', page: 1, quote: 'x'.repeat(2500) }] }, { label: '값', value: '', unit: '', uncertain: false, evidence: [] }], warnings: [] };
  const output = normalizeDocumentExtraction(raw, image); assert.equal(output.fields[0].verification, 'unverified'); assert.equal(output.fields[0].uncertain, false); assert.equal(output.fields[1].uncertain, true); assert.ok(output.warnings.some(w => /디지털 텍스트/.test(w)));
  raw.fields[0].evidence[0].quote += 'x'; assert.throws(() => normalizeDocumentExtraction(raw, image));
});
test('ALG-E02 finding/extraction caps prevent confirming missing', () => {
  const d = csv(''), raw = finding({ value: '', presence: 'missing', evidence: [{ documentId: 'd', cell: 'B2', quote: '' }] });
  const items = normalizeItems(Array.from({ length: 250 }, () => raw), d, [criterion()]); assert.ok(items.every(i => i.status === 'review' && !i.missingVerified));
  d.extraction = { fields: Array.from({ length: 300 }, () => ({ label: '별개', value: '1' })) }; assert.equal(decide(raw, criterion(), d).status, 'review');
});
test('ALG-R01/R02 context approval requires semantic edit and explicit changed numeric confirmation', () => {
  const original = criterion({ contextNeedsConfirmation: true, contextIssues: ['개정'], source: '원문', sourceEvidence: [{ documentId: 'd', quote: '80 이상' }] });
  const unchanged = approveCriteria([original], [{ ...original, rule: ' 80   MPa 이상 ', comparatorConfirmed: true, source: '위조' }])[0]; assert.equal(unchanged.needsConfirmation, true); assert.equal(unchanged.comparison, undefined); assert.equal(unchanged.source, '원문');
  const revised = approveCriteria([original], [{ ...original, rule: '85 MPa 이상', comparison: { operator: 'gte', value: 85, unit: 'MPa' }, comparatorConfirmed: true, sourceEvidence: [] }])[0];
  assert.equal(revised.contextNeedsConfirmation, undefined); assert.equal(revised.comparison.value, 85); assert.deepEqual(revised.sourceEvidence, original.sourceEvidence); assert.notEqual(revised.sourceEvidence, original.sourceEvidence);
  assert.equal(approveCriteria([criterion()], [{ ...criterion(), rule: '85 MPa 이상' }])[0].comparison, undefined);
  assert.throws(() => approveCriteria([original], [{ ...original, comparatorConfirmed: true, comparison: null }]));
  const noComparator = { ...original, comparison: undefined };
  const unconfirmedNumeric = approveCriteria([noComparator], [{ ...noComparator, comparison: { operator: 'gte', value: 99, unit: 'MPa' } }])[0];
  assert.equal(unconfirmedNumeric.contextNeedsConfirmation, true); assert.equal(unconfirmedNumeric.comparison, undefined);
});
test('draft permits empty fields without converting numeric blank to zero and validates IDs', () => {
  const draftState = { mode: 'numeric', operator: 'gte', value: '', upper: '', unit: 'MPa', issues: [] };
  const draft = approveCriteria([criterion()], [{ ...criterion(), label: '', rule: '', comparison: undefined, draftState }], { draft: true })[0]; assert.equal(draft.label, ''); assert.equal(draft.comparison, undefined); assert.equal(draft.draftState.value, '');
  assert.deepEqual(approveCriteria([criterion()], [], { draft: true }), []); assert.throws(() => approveCriteria([criterion()], [{ ...criterion(), id: ' c ' }]));
});
test('new human criterion preserves allowed source group and drops invented provenance', () => {
  const input = { ...criterion(), id: 'human-12345678-abcd-4321-1234-123456789abc', sourceDocumentId: 'source', source: '위조', sourceEvidence: [{ documentId: 'source', quote: '위조' }] };
  const accepted = approveCriteria([], [input], { allowedSourceDocumentIds: ['source'] })[0]; assert.equal(accepted.sourceDocumentId, 'source'); assert.equal(accepted.source, '사용자 입력'); assert.equal(accepted.sourceEvidence, undefined); assert.equal(accepted.overrideSource, '사용자 직접 수정');
  assert.equal(approveCriteria([], [input])[0].sourceDocumentId, 'natural-language');
});
test('revision patches preserve current draft, reject cross-group/provenance changes and require authorized removals', () => {
  const cs = [criterion({ sourceDocumentId: 'a' }), criterion({ id: 'b', sourceDocumentId: 'b' })], copy = structuredClone(cs);
  const patch = change => ({ changes: [change], additions: [], removeIds: [], summary: '수정' });
  const options = { documents: [{ id: 'a' }, { id: 'b' }], documentId: 'a' };
  assert.throws(() => applyCriteriaRevision(cs, patch({ id: 'b', required: false }), options), { code: 'CRITERIA_REVISION_RESPONSE' });
  assert.throws(() => applyCriteriaRevision(cs, patch({ id: 'c', sourceDocumentId: 'b' }), options));
  assert.throws(() => applyCriteriaRevision(cs, { ...patch({ id: 'c' }), changes: [], removeIds: ['c'] }, options));
  const revised = applyCriteriaRevision(cs, patch({ id: 'c', rule: '숫자 없는 기준' }), options); assert.equal(revised.criteria[0].comparison, undefined); assert.equal(revised.criteria[0].overrideSource, '사용자 수정 요청'); assert.deepEqual(cs, copy);
});
test('revision numeric/choose draft needs an actual comparison or explicit qualitative null', () => {
  const cs = [criterion({ comparison: undefined, draftState: { mode: 'choose' } })], patch = comparison => ({ changes: [{ id: 'c', rule: '이상 없음', ...(comparison !== undefined ? { comparison } : {}) }], additions: [], removeIds: [], summary: '수정' });
  assert.throws(() => applyCriteriaRevision(cs, patch()), { code: 'CRITERIA_REVISION_RESPONSE' });
  assert.equal(applyCriteriaRevision(cs, patch(null)).criteria[0].draftState, undefined);
});
test('handling directives mutate substantive objects but retain original all-handling array', () => {
  const c = criterion(), instruction = { id: 'h', label: '강도 누락 처리', rule: '강도 누락이면 확인 필요' };
  const result = normalizeHandlingCriteria([c, instruction]); assert.equal(result.length, 1); assert.equal(result[0], c); assert.ok(c.handlingNotes.length);
  const only = [instruction]; assert.equal(normalizeHandlingCriteria(only), only);
});
test('row coverage preserves CSV weak exclusions and XLSX strict exclusion language', () => {
  const d = csv(); assert.equal(reviewRowCoverage(d, [decide(finding(), criterion(), d)], [{ row: 3, reason: 'missing' }]).complete, true);
  const x = { id: 'd', kind: 'xlsx', sourceSheets: [{ name: 'S', rows: [{ row: 1, cells: [{ address: 'A1', text: 'id' }, { address: 'B1', text: '값' }] }, { row: 2, cells: [{ address: 'A2', text: 'R1' }] }] }] };
  assert.equal(recordRows(x)[0].cells[1].value, ''); assert.equal(reviewRowCoverage(x, [], [{ sheet: 'S', row: 2, reason: 'missing' }]).complete, false);
  assert.equal(reviewRowCoverage(x, [], [{ sheet: 'S', row: 2, reason: '대상 아님' }]).complete, true);
});
test('semantic dedup retains first sampleEvidence and separates source, ordered path, conditions and units', () => {
  const a = criterion({ sourceDocumentId: 'd', sampleEvidence: [{ quote: 'first' }], evidenceCells: [{ documentId: 'd', cell: 'B2', quote: '80' }] });
  const b = { ...a, id: 'c2', sampleEvidence: [{ quote: 'second' }], evidenceCells: [{ documentId: 'd', cell: 'B3', quote: '80' }] };
  const [merged] = deduplicateCriteria([a, b]); assert.equal(merged.evidenceCells.length, 2); assert.deepEqual(merged.sampleEvidence, a.sampleEvidence);
  for (const change of [{ sourceDocumentId: 'x' }, { conditions: ['7일'] }, { categoryPath: ['a'] }, { comparison: { ...a.comparison, unit: 'kPa' } }]) assert.equal(deduplicateCriteria([a, { ...b, ...change }]).length, 2);
});
test('static adapter searches transposed tables while selecting one highest-scored table', () => {
  for (const transpose of [false, true]) { const result = extractStaticCriteria(workbook({ transpose })); assert.equal(result.criteria.length, 1); assert.equal(result.criteria[0].comparison.value, 80); }
});
test('static adapter infers only aligned header units and requires confirmation for code joins/comments', () => {
  const rows = [
    { row: 1, cells: [{ address: 'B1', text: '단위: MPa' }] },
    { row: 2, cells: [{ address: 'A2', text: '항목' }, { address: 'B2', text: '최소' }, { address: 'C2', text: '최대' }] },
    { row: 3, cells: [{ address: 'A3', text: 'T1' }, { address: 'B3', text: '80' }, { address: 'C3', text: '100' }] },
  ];
  const mapping = { name: '매핑', rows: [{ row: 1, cells: [{ address: 'A1', text: 'code' }, { address: 'B1', text: 'name' }] }, { row: 2, cells: [{ address: 'A2', text: 'T1' }, { address: 'B2', text: '강도' }] }] };
  const d = { id: 'd', kind: 'xlsx', name: 'renamed.xlsx', sourceSheets: [{ name: 'S', rows, mergedRanges: ['B1:C1'] }, mapping] };
  const result = extractStaticCriteria(d).criteria[0]; assert.equal(result.label, '강도'); assert.equal(result.comparison.unit, 'MPa'); assert.equal(result.needsConfirmation, true);
  d.sourceSheets.pop(); rows[1].cells[1].text = '최소(MPa)'; rows[1].cells[2].text = '최대(MPa)'; rows[2].cells[0].text = '강도'; rows[2].cells[1].comment = '변경 예정';
  assert.equal(extractStaticCriteria(d).criteria[0].needsConfirmation, true);
});
test('CURRENT_REPRODUCTION public baseline fixtures are evaluated without optional-future expectations', async () => {
  // Evaluator-only fixture access. Product modules never import the architecture oracle.
  const { fixtures } = JSON.parse(await readFile(new URL('../architecture/contracts/algorithm-edge-cases.json', import.meta.url), 'utf8'));
  const partial = (actual, expected) => { for (const [key, value] of Object.entries(expected)) { if (value && typeof value === 'object' && !Array.isArray(value)) partial(actual[key], value); else if (Array.isArray(value)) { assert.equal(actual[key].length, value.length); value.forEach((v, i) => typeof v === 'object' ? partial(actual[key][i], v) : assert.deepEqual(actual[key][i], v)); } else assert.deepEqual(actual[key], value); } };
  for (const fixture of fixtures.filter(f => f.mode === 'baseline')) {
    const input = structuredClone(fixture.input); let result;
    if (fixture.operation === 'reviseCriterionDraft') {
      const original = structuredClone(input.criteria);
      if (fixture.expected.errorCode) { assert.throws(() => applyCriteriaRevision(input.criteria, input.modelStub, { feedback: input.feedback }), { code: fixture.expected.errorCode }); assert.deepEqual(input.criteria, original); continue; }
      result = applyCriteriaRevision(input.criteria, input.modelStub, { feedback: input.feedback });
    }
    else if (fixture.operation === 'validateAssessment') result = input.assessments ? { statuses: input.assessments.map(raw => validateAssessment(raw, input.document).status) } : validateAssessment(input.assessment, input.document);
    else if (fixture.operation === 'normalizeItems') result = { items: normalizeItems(input.data.items, input.document, input.criteria) };
    else if (fixture.operation === 'validateCriteria') result = { criteria: validateCriteria(input.criteria) };
    else { const original = input.criteria[0], array = input.criteria; result = { criteria: preserveSourceConditions(array, input.documents), returnsSameArray: true, mutatesCriterion: original === array[0] }; }
    const expected = { ...fixture.expected }; delete expected.omittedProperties; delete expected.modelCalls; delete expected.humanApprovalRequired;
    assert.doesNotThrow(() => partial(result, expected), fixture.id);
  }
});

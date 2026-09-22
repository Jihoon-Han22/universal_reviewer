import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkbookDiscovery } from './criteria-workbook-validation.mjs';

// Spec 03 §§11–12 CURRENT_REPRODUCTION cases. No golden/oracle runtime input.
const doc = { id: 'd', name: '기준.xlsx', kind: 'xlsx' };
const citation = (cell, quote, sheet = '기준') => ({ sheet, cell, quote });
function workbook(entries, regions = [{ id: 's1-r1', range: 'A1:D2' }]) {
  const records = new Map(entries.map(([cell, text, extra = {}]) => [`기준\0${cell}`, { cell, text, styleId: 0, hiddenRow: false, hiddenColumn: false, ...extra }]));
  return { document: doc, inventory: { complete: true, sheets: [{ name: '기준', complete: true, regions }] }, records };
}
const flat = () => workbook([['A1', '항목'], ['B1', '기준'], ['C1', '단위'], ['D1', '시험조건'], ['A2', '강도'], ['B2', '20 이상'], ['C2', 'MPa'], ['D2', '28일']]);
const proposal = (changes = {}) => ({ label: '강도', rule: '20 이상', unit: 'MPa', scope: '', conditions: [], citations: [citation('A2', '강도'), citation('B2', '20 이상')], unitCitations: [citation('C2', 'MPa')], conditionCitations: [], scopeCitations: [], categoryPath: [], hierarchyCitations: [], sampleName: '', sampleCitations: [], classificationStatus: 'not_applicable', needsConfirmation: false, ...changes });
const assessment = (changes = {}) => ({ id: 's1-r1', classification: 'criteria', criterionCells: ['B2'], reason: '실제 강도 기준 표', evidence: [citation('B2', '20 이상')], ...changes });
const validate = (source, proposals = [proposal()], extra = {}) => validateWorkbookDiscovery({ ...source, proposals, regionAssessments: [assessment()], ...extra });

test('grounded numeric rule restores aligned condition and preserves exact provenance without mutating inputs', () => {
  const source = flat(), proposals = [proposal()], before = structuredClone({ source, proposals });
  const result = validate(source, proposals);
  assert.equal(result.criteria.length, 1);
  const criterion = result.criteria[0];
  assert.deepEqual(criterion.comparison, { operator: 'gte', value: 20, unit: 'MPa' });
  assert.deepEqual(criterion.conditions, ['28일']);
  assert.match(criterion.rule, /단위: MPa.*조건: 28일/);
  assert.equal(criterion.needsConfirmation, false);
  assert.deepEqual(criterion.sourceEvidence, { documentId: 'd', sheet: '기준', cell: 'A2', quote: '강도 | 20 이상 | MPa | 28일' });
  assert.deepEqual(result.omitted, []);
  assert.deepEqual(result.regionProblems, []);
  assert.deepEqual(result.examinedRegions, ['s1-r1']);
  assert.deepEqual({ source, proposals }, before);
});

test('citation numeric boundaries reject a fabricated 20 from an actual 120', () => {
  const source = flat(); source.records.get('기준\0B2').text = '120 이상';
  const result = validate(source);
  assert.equal(result.criteria.length, 0);
  assert.equal(result.droppedCriteria, 1);
  assert.equal(result.omitted[0].rule, '120 이상');
  assert.equal(result.regionProblems.length, 1);
  assert.match(result.validationErrors.join(' '), /실제 셀 인용/);
});

test('bare threshold remains a confirmation draft and does not invent an operator', () => {
  const source = flat(); source.records.get('기준\0B2').text = '20';
  const result = validate(source, [proposal({ rule: '20 이상', citations: [citation('A2', '강도'), citation('B2', '20')] })], { regionAssessments: [assessment({ evidence: [citation('B2', '20')] })] });
  assert.equal(result.criteria[0].comparison, undefined);
  assert.equal(result.criteria[0].needsConfirmation, true);
  assert.ok(result.unresolved.length);
});

test('separate min/max headers support a range, while missing upper anchor remains an omission', () => {
  const source = workbook([['A1', '항목'], ['B1', '최소'], ['C1', '최대'], ['D1', '단위'], ['A2', '강도'], ['B2', '20'], ['C2', '30'], ['D2', 'MPa']]);
  const rangeProposal = proposal({ rule: '20 ~ 30', citations: [citation('A2', '강도'), citation('B1', '최소'), citation('B2', '20'), citation('C1', '최대'), citation('C2', '30')], unitCitations: [citation('D2', 'MPa')] });
  const result = validate(source, [rangeProposal], { regionAssessments: [assessment({ criterionCells: ['B2', 'C2'], evidence: [citation('B2', '20')] })] });
  assert.deepEqual(result.criteria[0].comparison, { operator: 'range', value: 20, upper: 30, unit: 'MPa' });
  assert.equal(result.omitted.length, 0);
  const partial = validate(source, [proposal({ rule: '20 이상', citations: rangeProposal.citations.slice(0, 3), unitCitations: [citation('D2', 'MPa')] })]);
  assert.ok(partial.omitted.some(value => value.cell === 'C2'));
});

test('result columns and note-only candidates cannot establish a numeric limit', () => {
  const source = workbook([['A1', '항목'], ['B1', '결과'], ['C1', '비고'], ['A2', '강도'], ['B2', '20 이상'], ['C2', '30 이상']]);
  for (const [cell, quote] of [['B2', '20 이상'], ['C2', '30 이상']]) {
    const result = validate(source, [proposal({ rule: quote, unit: '', unitCitations: [], citations: [citation('A2', '강도'), citation(cell, quote)] })]);
    assert.equal(result.criteria.length, 0);
    assert.equal(result.droppedCriteria, 1);
  }
});

test('uncached formulas never produce numeric comparison from a cited comment', () => {
  const source = flat(); Object.assign(source.records.get('기준\0B2'), { text: '[계산 결과 없음: 수식 재계산 필요]', comment: '20 이상', formula: '=10+10', uncachedFormula: true });
  const result = validate(source);
  assert.equal(result.criteria[0].comparison, undefined);
  assert.equal(result.criteria[0].needsConfirmation, true);
});

test('inventory samples cannot support classifications and qualitative cells require accountability', () => {
  const source = workbook([['A1', '항목'], ['B1', '기준'], ['A2', '외관'], ['B2', '균열이 없어야 함']], [{ id: 's1-r1', range: 'A1:B2' }, { id: 's1-r2', range: 'F1:F2', sample: [{ cell: 'F1', text: '표지' }] }]);
  const result = validate(source, [], { regionAssessments: [assessment({ criterionCells: ['B2'], evidence: [citation('B2', '균열이 없어야 함')] }), { id: 's1-r2', classification: 'context', criterionCells: [], reason: '표지', evidence: [citation('F1', '표지')] }] });
  assert.equal(result.omitted.length, 0, 'numeric omission detector does not prove qualitative coverage');
  assert.equal(result.regionProblems.length, 2);
  assert.ok(result.regionProblems.some(value => /B2/.test(value.reason)));
});

test('hierarchy keeps a grounded prefix and never promotes an unsupported child', () => {
  const source = workbook([['A1', '재료', { mergedRange: 'A1:D1' }], ['E2', '2종', { mergedRange: 'E2:H2' }], ['A3', '항목'], ['B3', '기준'], ['C3', '단위'], ['A4', '강도'], ['B4', '20 이상'], ['C4', 'MPa']], [{ id: 's1-r1', range: 'A1:H4' }]);
  const p = proposal({ citations: [citation('A4', '강도'), citation('B4', '20 이상')], unitCitations: [citation('C4', 'MPa')], categoryPath: ['재료', '2종'], hierarchyCitations: [{ ...citation('A1', '재료'), level: 0, relation: 'section-header' }, { ...citation('E2', '2종'), level: 1, relation: 'column-header' }], classificationStatus: 'resolved' });
  const result = validate(source, [p]);
  assert.deepEqual(result.criteria[0].categoryPath, ['재료']);
  assert.equal(result.criteria[0].classificationStatus, 'ambiguous');
  assert.equal(result.criteria[0].comparison, undefined);
  assert.equal(result.droppedHierarchyLevels, 1);
});

test('missing sample citation is ambiguous and nine hierarchy levels report the current cap', () => {
  const source = flat();
  const sample = validate(source, [proposal({ sampleName: '시료 A', classificationStatus: 'resolved' })]);
  assert.equal(sample.criteria[0].sampleName, undefined);
  assert.equal(sample.criteria[0].classificationStatus, 'ambiguous');
  const capped = validate(source, [proposal({ categoryPath: Array.from({ length: 9 }, (_, i) => `재료${i}`) })]);
  assert.equal(capped.classificationLimitReached, true);
  assert.equal(capped.droppedHierarchyLevels, 9);
});

test('record-only and dedicated revoked status deterministically exclude actual anchors', () => {
  for (const status of ['기록만', '폐기']) {
    const source = workbook([['A1', '항목'], ['B1', '기준'], ['C1', '단위'], ['D1', '상태'], ['A2', '강도'], ['B2', '20 이상'], ['C2', 'MPa'], ['D2', status]]);
    const result = validate(source);
    assert.equal(result.criteria.length, 0);
    assert.equal(result.omitted.length, 0);
    assert.equal(result.regionProblems.length, 0);
    assert.equal(result.contextProblems.length, 0);
  }
});

test('unresolved source replacement marks the criterion uncertain; a similar unrelated note cannot exclude it', () => {
  const source = flat(); source.records.set('기준\0E2', { cell: 'E2', text: '강도 기준 대체 예정', styleId: 0 });
  const unresolved = validate(source);
  assert.equal(unresolved.criteria[0].contextNeedsConfirmation, true);
  assert.equal(unresolved.criteria[0].comparison, undefined);
  const disposition = { kind: 'non_normative', reason: '기록 보관', targetCitations: [citation('B2', '20 이상')], evidence: [citation('E2', '강도 기준 대체 예정')], replacementCitations: [] };
  const invalid = validate(source, [proposal()], { dispositions: [disposition] });
  assert.equal(invalid.criteria.length, 1);
  assert.equal(invalid.rejectedDispositions.length, 1);
});

test('negative destructive text and ordinary archival wording do not remove a criterion', () => {
  for (const text of ['강도 폐기 아님', '강도 not superseded', '강도 기록 보관용']) {
    const source = flat(); source.records.set('기준\0E2', { cell: 'E2', text, styleId: 0 });
    const result = validate(source);
    assert.equal(result.criteria.length, 1);
    assert.equal(result.criteria[0].comparison.operator, 'gte');
    assert.equal(result.contextProblems.length, 0);
  }
});

test('validated override retains replacement, rejects cycles, and requires a different source anchor', () => {
  const source = workbook([['A1', '항목'], ['B1', '기준'], ['C1', '단위'], ['D1', '상태'], ['A2', '강도'], ['B2', '20 이상'], ['C2', 'MPa'], ['D2', '기준!B2 대체'], ['A3', '강도'], ['B3', '25 이상'], ['C3', 'MPa'], ['D3', '기준!B3 대체']], [{ id: 's1-r1', range: 'A1:D3' }]);
  const first = proposal(), second = proposal({ rule: '25 이상', citations: [citation('A3', '강도'), citation('B3', '25 이상')], unitCitations: [citation('C3', 'MPa')] });
  const override = { kind: 'overridden', reason: '명시 대체', targetCitations: [citation('B2', '20 이상')], evidence: [citation('D2', '기준!B2 대체')], replacementCitations: [citation('B3', '25 이상')] };
  const result = validate(source, [first, second], { dispositions: [override], regionAssessments: [assessment({ criterionCells: ['B2', 'B3'] })] });
  assert.equal(result.criteria.length, 1);
  assert.equal(result.criteria[0].evidenceCells.some(value => value.cell === 'B3'), true);
  const reverse = { kind: 'overridden', reason: '역방향 대체', targetCitations: [citation('B3', '25 이상')], evidence: [citation('D3', '기준!B3 대체')], replacementCitations: [citation('B2', '20 이상')] };
  const cycle = validate(source, [first, second], { dispositions: [override, reverse] });
  assert.equal(cycle.rejectedDispositions.length, 2);
  assert.equal(cycle.criteria.length, 2);
});

test('proposal cap reports dropped candidates without treating the truncated input as complete', () => {
  const result = validate(flat(), Array.from({ length: 251 }, () => proposal()));
  assert.equal(result.droppedCriteria, 1);
  assert.equal(result.criteria.length, 1, 'same-scope grounded duplicates are merged');
});

test('a unit embedded in the proposed rule still needs actual unit evidence', () => {
  const source = workbook([['A1', '항목'], ['B1', '기준'], ['A2', '강도'], ['B2', '20 이상']]);
  const result = validate(source, [proposal({ rule: '20 MPa 이상', unit: '', unitCitations: [] })]);
  assert.equal(result.criteria[0].comparison, undefined);
  assert.equal(result.criteria[0].needsConfirmation, true);
});

test('unmerged section hierarchy is retained as uncertain, including the current comparison limitation', () => {
  const source = workbook([['A1', '재료'], ['A2', '항목'], ['B2', '기준'], ['A3', '강도'], ['B3', '20 이상']], [{ id: 's1-r1', range: 'A1:B3' }]);
  const result = validate(source, [proposal({ unit: '', unitCitations: [], citations: [citation('A3', '강도'), citation('B3', '20 이상')], categoryPath: ['재료'], hierarchyCitations: [{ ...citation('A1', '재료'), level: 0, relation: 'section-header' }], classificationStatus: 'resolved' })]);
  assert.deepEqual(result.criteria[0].categoryPath, ['재료']);
  assert.equal(result.criteria[0].classificationStatus, 'ambiguous');
  assert.equal(result.criteria[0].comparison.operator, 'gte', 'uncertain hierarchy differs from rejected hierarchy in the current comparison predicate');
});

test('transposed layouts discover actual limit anchors', () => {
  const source = workbook([['A1', '항목'], ['A2', '최소'], ['A3', '단위'], ['B1', '강도'], ['B2', '20'], ['B3', 'MPa']], [{ id: 's1-r1', range: 'A1:B3' }]);
  const result = validate(source, [proposal({ citations: [citation('B1', '강도'), citation('A2', '최소'), citation('B2', '20')], unitCitations: [citation('B3', 'MPa')] })], { regionAssessments: [assessment({ evidence: [citation('B2', '20')] })] });
  assert.equal(result.criteria[0].comparison.operator, 'gte');
  assert.equal(result.omitted.length, 0);
  assert.equal(result.regionProblems.length, 0);
});

test('uncertain disposition evidence cannot authorize exclusion', () => {
  const source = flat(); source.records.set('기준\0E2', { cell: 'E2', text: '강도 기록만', uncertain: true });
  const result = validate(source, [proposal()], { dispositions: [{ kind: 'non_normative', reason: '기록 전용', targetCitations: [citation('B2', '20 이상')], evidence: [citation('E2', '강도 기록만')], replacementCitations: [] }] });
  assert.equal(result.criteria.length, 1);
  assert.equal(result.rejectedDispositions.length, 1);
});

test('BKA01 note cleanup preserves the same condition in actual rule, item, or condition cells', () => {
  for (const location of ['rule', 'item', 'condition']) {
    const label = location === 'item' ? '강도 (28일)' : '강도';
    const sourceRule = location === 'rule' ? '>= 80 (28일)' : '>= 80';
    const source = workbook([['A1', '항목'], ['B1', '기준'], ['C1', '비고'], ['D1', '시험조건'], ['A2', label], ['B2', sourceRule], ['C2', '28일'], ['D2', location === 'condition' ? '28일' : '']]);
    const result = validate(source, [proposal({ label, rule: '>= 80 (28일)', unit: '', conditions: ['28일'], unitCitations: [], citations: [citation('A2', label), citation('B2', sourceRule), citation('C2', '28일')] })]);
    const criterion = result.criteria[0];
    assert.deepEqual(criterion.conditions, ['28일'], location);
    assert.match(criterion.rule, /28일/, location);
    assert.equal(criterion.comparison.value, 80, location);
    assert.equal(criterion.evidenceCells.some(value => value.cell === 'C2'), false, location);
    assert.equal(criterion.ignoredSourceNotes[0].text, '28일', location);
  }
});

test('BKA01 wording found only in a note is removed while the real threshold remains usable', () => {
  const source = workbook([['A1', '항목'], ['B1', '기준'], ['C1', '비고'], ['A2', '강도'], ['B2', '>= 80'], ['C2', '28일']]);
  const result = validate(source, [proposal({ rule: '>= 80 (28일)', unit: '', conditions: ['28일'], unitCitations: [], citations: [citation('A2', '강도'), citation('B2', '>= 80'), citation('C2', '28일')] })]);
  assert.deepEqual(result.criteria[0].conditions, []);
  assert.equal(result.criteria[0].rule, '>= 80');
  assert.equal(result.criteria[0].comparison.value, 80);
});

test('BKA02 note/result ownership blocks fake transposed headers including unlabeled continuation cells', () => {
  for (const header of ['비고', '참고', 'Notes', '결과']) for (const transpose of [false, true]) for (const offset of [0, 3]) {
    const rows = [['항목', '기준', header, header, header], ['강도', '>= 5', '항목', '가짜1', '가짜2'], ['', '', '기준', '>= 100', '>= 200']];
    const cellAt = (row, column) => `${String.fromCharCode(65 + (transpose ? row : column) + offset)}${(transpose ? column : row) + offset + 1}`;
    const source = workbook(rows.flatMap((row, r) => row.map((text, c) => [cellAt(r, c), text])), []);
    const candidates = [
      { label: '강도', rule: '>= 5', citations: [citation(cellAt(1, 0), '강도'), citation(cellAt(1, 1), '>= 5')] },
      { label: '가짜1', rule: '>= 100', citations: [citation(cellAt(1, 3), '가짜1'), citation(cellAt(2, 3), '>= 100')] },
      { label: '가짜2', rule: '>= 200', citations: [citation(cellAt(1, 4), '가짜2'), citation(cellAt(2, 4), '>= 200')] }
    ];
    const result = validate(source, candidates, { regionAssessments: [] });
    assert.deepEqual(result.criteria.map(value => value.label), ['강도'], `${header} transpose=${transpose} offset=${offset}`);
    assert.equal(result.criteria[0].comparison.value, 5);
    assert.equal(result.droppedCriteria, 2);
    assert.deepEqual(result.omitted, []);
  }
});

test('BKA02 rejected note pseudo-table cannot hide an adjacent repeated criteria block', () => {
  const source = workbook([
    ['A1', '항목'], ['B1', '기준'], ['C1', '비고'], ['D1', '항목'], ['E1', '기준'],
    ['A2', '강도'], ['B2', '>= 5'], ['C2', '항목'], ['D2', '온도'], ['E2', '<= 30'],
    ['C3', '비고'], ['D3', '가짜'], ['E3', '>= 100']
  ], []);
  const result = validate(source, [
    { label: '강도', rule: '>= 5', citations: [citation('A2', '강도'), citation('B2', '>= 5')] },
    { label: '온도', rule: '<= 30', citations: [citation('D2', '온도'), citation('E2', '<= 30')] }
  ], { regionAssessments: [] });
  assert.deepEqual(result.criteria.map(value => value.label), ['강도', '온도']);
  assert.deepEqual(result.criteria.map(value => value.comparison.value), [5, 30]);
});

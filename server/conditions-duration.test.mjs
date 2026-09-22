import test from 'node:test';
import assert from 'node:assert/strict';
import {durationTokens, preserveSourceConditions, verifyConditions} from './conditions.mjs';
import {extractStaticCriteria} from './conditions.mjs';

test('strict greater-than words do not create seconds, while genuine durations survive', () => {
  for (const text of ['1.0 초과', '1.0초과', '1.0 초과 · 단위: %']) assert.deepEqual(durationTokens(text), [], text);
  for (const text of ['1.0 초', '1.0초', '1초 이상', '1초이내', '1초 초과', '1초초과']) assert.deepEqual(durationTokens(text), ['1 second'], text);
  assert.deepEqual(durationTokens('1.0 초과 · 2초 유지'), ['2 second']);
  assert.deepEqual(durationTokens('28일령 28일 2days 3시간 4hrs 5주 6months 7년 8분 9seconds'), ['28 day', '28 day', '2 day', '3 hour', '4 hour', '5 week', '6 month', '7 year', '8 minute', '9 second']);
});

test('source criteria preserve percentage comparator and real condition cells in either table direction', () => {
  for (const transpose of [false, true]) for (const rule of ['1.0 초과', '1.0초과']) {
    const matrix = [['항목', '기준', '단위', '시험조건', '비고'], ['함량', rule, '%', '', '28일'], ['강도', '5 이상', 'MPa', '1초 이상', '28일']];
    const values = transpose ? matrix[0].map((_, i) => matrix.map(row => row[i])) : matrix;
    const document = {id:'source', kind:'csv', name:'source.csv', sourceRows:values.map((cells, i) => ({row:i+1, cells}))};
    const criteria = extractStaticCriteria(document).criteria;
    assert.equal(criteria.length, 2);
    const original = structuredClone(criteria[0]);
    preserveSourceConditions(criteria, [document]);
    assert.deepEqual(criteria[0].conditions, []);
    assert.deepEqual(criteria[0].comparison, {operator:'gt', value:1, unit:'%'});
    assert.equal(criteria[0].rule, original.rule);
    assert.deepEqual(criteria[0].sourceEvidence, original.sourceEvidence);
    assert.ok(criteria[1].conditions.includes('1초 이상'));
    assert.ok(criteria.every(c => !c.conditions.includes('28일')));
  }
});

test('duration verification still requires source support and the whole relational phrase', () => {
  const source = quote => ({id:'d', kind:'csv', sourceRows:[{row:1,cells:['시간',quote]}]});
  const verify = (condition, quote) => verifyConditions({conditions:[condition]}, [{documentId:'d',cell:'B1',quote}], source(quote));
  assert.equal(verify('1초','1 second').verified, true);
  assert.equal(verify('1초','2 seconds').verified, false);
  assert.equal(verify('1초 이상','1초').verified, false);
  assert.equal(verify('1초 이상','1초 이상').verified, true);
});

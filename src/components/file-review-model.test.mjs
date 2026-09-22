import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFileReviewModels} from './file-review-model.ts';

test('file indexes retain source order, first duplicate identities, and own-document evidence', () => {
  const documents = [{id:'a',name:'same.txt'},{id:'b',name:'same.txt'},{id:'empty',name:'empty.txt'}];
  const criteria = [{id:'c2'},{id:'c1'},{id:'c1',label:'second duplicate'}];
  const items = [
    {id:'duplicate',documentId:'a',criterionId:'c1',status:'pass',evidence:[{documentId:'b',page:9},{documentId:'a',page:2},{documentId:'a',page:2}]},
    {id:'duplicate',documentId:'a',criterionId:'c2',status:'review',evidence:[]},
    {id:'b1',documentId:'b',criterionId:'unknown',status:'fail',evidence:[{documentId:'b',page:1.5}]},
  ];
  const model = buildFileReviewModels(items,documents,criteria,documents);
  const a = model.byDocument.get('a');
  assert.deepEqual(a.criteria,criteria);
  assert.equal(a.itemsById.get('duplicate'),items[0]);
  assert.equal(a.criteriaById.get('c1'),criteria[1]);
  assert.deepEqual(a.itemsByPage.get(2),[items[0]]);
  assert.deepEqual(a.itemsByPage.get(undefined),[items[1]]);
  assert.equal(model.evidenceByItem.get(items[0])[0],items[0].evidence[1]);
  assert.deepEqual(model.byDocument.get('b').unmappedItems,[items[2]]);
  assert.deepEqual(model.byDocument.get('b').itemsByPage.get(1.5),[items[2]]);
  assert.deepEqual(model.byDocument.get('empty').counts,{pass:0,fail:0,review:0,pending:0});
});

test('new immutable snapshots update verdicts and membership without changing prior indexes', () => {
  const documents=Object.freeze([Object.freeze({id:'a'}),Object.freeze({id:'b'})]);
  const criteria=Object.freeze([Object.freeze({id:'c'})]);
  const item=Object.freeze({id:'i',documentId:'a',criterionId:'c',status:'pass'});
  const previous=buildFileReviewModels(Object.freeze([item]),documents,criteria,documents);
  const replacement=Object.freeze({...item,documentId:'b',status:'fail'});
  const next=buildFileReviewModels(Object.freeze([replacement]),documents,[],documents);
  assert.deepEqual(previous.byDocument.get('a').items,[item]);
  assert.equal(previous.byDocument.get('a').counts.pass,1);
  assert.deepEqual(next.byDocument.get('a').items,[]);
  assert.deepEqual(next.byDocument.get('b').unmappedItems,[replacement]);
  assert.equal(next.byDocument.get('b').counts.fail,1);
  assert.equal(next.itemsById.get('i'),replacement);
});

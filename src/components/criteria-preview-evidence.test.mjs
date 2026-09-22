import test from 'node:test';
import assert from 'node:assert/strict';
import {criterionPreviewEvidence} from '../criteria-preview-evidence.ts';
const citation={documentId:'criteria',sheet:'Limits',cell:'B2',quote:'30'};
const criterion={id:'c',label:'Strength',rule:'>= 30',sourceEvidence:[citation]};
const document=(rows=[['Item','Limit','Unit'],['Strength','30','MPa']],extra={})=>({id:'criteria',role:'criteria',name:'limits.xlsx',preview:{type:'table',sheets:[{name:'Limits',rows}]},...extra});
const recover=(c=criterion,documents=[document()])=>criterionPreviewEvidence(c,documents);
test('criterion source variants merge and deduplicate without changing stored provenance',()=>{
 const c={...criterion,evidenceCells:[{...citation},{...citation,cell:'C2',quote:'MPa'}]},original=structuredClone(c);
 const result=recover(c);assert.equal(result.length,3);assert.deepEqual(result.at(-1),{documentId:'criteria',sheet:'Limits',cell:'A2',quote:'Strength'});assert.deepEqual(c,original);
});
test('structured source fallback respects explicit document id and single criteria-file admission',()=>{
 assert.equal(recover({...criterion,sourceEvidence:[],source:{documentId:'unknown',page:1,quote:'text'}})[0].documentId,'unknown');
 assert.equal(recover({...criterion,sourceEvidence:[],source:{sheet:'Limits',cell:'B2',quote:'30'}})[0].documentId,'criteria');
 assert.deepEqual(recover({...criterion,sourceEvidence:[],source:{quote:'text'}}),[]);
 assert.deepEqual(recover({...criterion,sourceEvidence:[],source:{cell:'B2'}},[document(),document(undefined,{id:'second'})]),[]);
});
test('stored citations suppress structured fallback and already cited item labels need no supplement',()=>{
 assert.equal(recover({...criterion,source:{documentId:'other',cell:'A1'}}).some(e=>e.documentId==='other'),false);
 const c={...criterion,sourceEvidence:[{...citation,cell:'A2:C2',quote:'Strength 30 MPa'}]};assert.deepEqual(recover(c),c.sourceEvidence);
});
test('recovery normalizes label spelling only and requires a real item header above',()=>{
 assert.equal(recover({...criterion,label:'Ｓｔｒｅｎｇｔｈ'},[document([['Test Item','Limit'],['S t r e n g t h','30']])]).at(-1).cell,'A2');
 for(const header of ['Name','Product','Limit'])assert.equal(recover(criterion,[document([[header,'Limit'],['Strength','30']])]).length,1);
 assert.equal(recover({...criterion,label:'30'}).length,1);
});
test('wrong quote, mismatched numeric tokens and blank record boundaries never manufacture label evidence',()=>{
 for(const quote of ['300','3','missing'])assert.equal(recover({...criterion,sourceEvidence:[{...citation,quote}]}).length,1);
 assert.equal(recover({...criterion,sourceEvidence:[{...citation,cell:'C2'}]},[document([['Item','Gap','Limit'],['Strength','','30']])]).length,1);
 assert.equal(recover({...criterion,sourceEvidence:[{...citation,cell:'B2:C2'}]},[document([['Item','Gap','Limit'],['Strength','','30']])]).length,1);
});
test('duplicate item labels and multiple recovered rows are ambiguous',()=>{
 assert.equal(recover(criterion,[document([['Item','Limit','Item'],['Strength','30','Strength']])]).length,1);
 const c={...criterion,sourceEvidence:[citation,{...citation,cell:'B3'}]};assert.equal(recover(c,[document([['Item','Limit'],['Strength','30'],['Strength','30']])]).length,2);
});
test('another item-header row and blank record boundary stop backward header recovery',()=>{
 const c={...criterion,sourceEvidence:[{...citation,cell:'B4'}]};
 assert.equal(recover(c,[document([['Item','Limit'],['Other','20'],['Limit','Item'],['Strength','30']])]).length,1);
 assert.equal(recover(c,[document([['Item','Limit'],['Other','20'],['',''],['Strength','30']])]).length,1);
});
test('ambiguous sheets and conflicting qualifiers do not recover a label from an arbitrary sheet',()=>{
 const doc=document();doc.preview.sheets.push({name:'Other',rows:doc.preview.sheets[0].rows});
 assert.equal(recover({...criterion,sourceEvidence:[{documentId:'criteria',cell:'B2',quote:'30'}]},[doc]).length,1);
 assert.equal(recover({...criterion,sourceEvidence:[{...citation,cell:'Other!B2'}]},[doc]).length,1);
});
test('recovery caps the full citation before clipping and rejects multiple rows',()=>{
 const row=['Strength',...Array(13).fill('30')],doc=document([['Item',...Array(13).fill('Limit')],row]);
 assert.equal(recover({...criterion,sourceEvidence:[{...citation,cell:'B2:M2'}]},[doc]).length,2);
 for(const cell of ['B2:N2','B2:ZZZ2','B2:B1000','B2;B3','B0','row 2'])assert.equal(recover({...criterion,sourceEvidence:[{...citation,cell}]},[doc]).length,1,cell);
});
test('qualified and reverse same-row ranges preserve a unique supported recovery',()=>{
 const c={...criterion,sourceEvidence:[{...citation,cell:"'Limits'!$C$2:$B$2",quote:'30 MPa'}]};assert.equal(recover(c).at(-1).cell,'A2');
});

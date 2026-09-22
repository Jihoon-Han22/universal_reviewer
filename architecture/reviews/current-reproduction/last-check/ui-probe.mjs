import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Extract unchanged pure helpers. No React mount, provider, env, HTTP or browser.
const path = 'src/components/DocumentAnalysis.tsx';
const source = fs.readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['record', 'plain', 'first', 'inventoryParts', 'structureGroups']);
const snippets = [];
for (const statement of ast.statements) {
  if (ts.isFunctionDeclaration(statement) && names.has(statement.name?.text)) snippets.push(statement.getText(ast));
  if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => names.has(d.name.getText(ast)))) snippets.push(statement.getText(ast));
}
assert.equal(snippets.length, names.size);
const js = ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const helpers = vm.runInNewContext(js + '\n({inventoryParts,structureGroups})');
const cases = [
  {
    id: 'inventory-before-structure',
    input: { inventory: { sheets: ['B', 'A'] }, structure: [{sheet:'A',name:'A1'}, {sheet:'C',name:'C1'}, {sheet:'B',name:'B1'}] },
    expected: [{id:'sheet:B',name:'B',regionNames:['B1']}, {id:'sheet:A',name:'A',regionNames:['A1']}, {id:'sheet:C',name:'C',regionNames:['C1']}],
  },
  {
    id: 'duplicate-inventory-overwrite-in-place',
    input: { inventory: { sheets: [{sheet:'B',title:'B first'},{sheet:'A',title:'A'},{sheet:'B',title:'B last'}] }, structure: [] },
    expected: [{id:'sheet:B',name:'B last',regionNames:[]}, {id:'sheet:A',name:'A',regionNames:[]}],
  },
  {
    id: 'direct-array-sheet-is-not-projected',
    input: { inventory: [{sheet:'A',name:'A inventory'},{sheet:'B',name:'B inventory'}], structure: [{sheet:'A',name:'A structure'}] },
    expected: [{id:'document',name:'B inventory',regionNames:[]},{id:'sheet:A',name:'A',regionNames:['A structure']}],
  },
  {
    id: 'page-order-and-fallback-name',
    input: { inventory: { pages: [{page:2,rows:3,columns:4,range:'R',regions:[{}],mergedRangeCount:2,state:'hidden',rotation:90},{page:1}] }, structure: [{page:3,name:'tail'}] },
    expected: [{id:'page:2',name:'2페이지',regionNames:[]},{id:'page:1',name:'1페이지',regionNames:[]},{id:'page:3',name:'3페이지',regionNames:['tail']}],
  },
  {
    id: 'page-wrapper-description-only-with-transcription',
    input: {transcription:{},inventory:{pages:[{page:2,rows:3}]},structure:[{kind:'text',page:2,name:'2쪽',description:'요약'},{kind:'table',page:2,name:'표'},{kind:'text',page:2,name:'2페이지',description:'카드 보존'}]},
    expected:[{id:'page:2',name:'2페이지',regionNames:['표','2페이지']}],
  },
  {
    id: 'page-wrapper-without-transcription-remains-region',
    input: {inventory:{pages:[{page:2}]},structure:[{kind:'text',page:2,name:'2쪽',description:'요약'}]},
    expected:[{id:'page:2',name:'2페이지',regionNames:['2쪽']}],
  },
  {
    id: 'empty-first-sheet-array-precedes-pages',
    input: {inventory:{sheets:[],worksheets:['ignored'],pages:[{page:1}]},structure:[{page:3,name:'tail'}]},
    expected:[{id:'page:3',name:'3페이지',regionNames:['tail']}],
  },
  {
    id: 'nullish-aliases-empty-name-and-description-order',
    input: {inventory:{sheets:null,worksheets:[{sheet:'S',title:'',name:'Ignored',rows:0,rowCount:99,columnCount:4,usedRange:'A1:D4',regions:[{},{}],mergedRangeCount:2,state:'veryHidden',rotation:-90}]},structure:[]},
    expected:[{id:'sheet:S',name:'영역 1',regionNames:[]}],
  },
];
const results = cases.map(test => {
  const groups = JSON.parse(JSON.stringify(helpers.structureGroups(test.input)));
  const actual = groups.map(g=>({id:g.id,name:g.name,regionNames:g.regions.map(r=>r.name)}));
  assert.deepEqual(actual,test.expected,test.id);
  return {id:test.id,input:test.input,expected:test.expected,actual,groups,status:'PASS_LOCAL_PURE_HELPER'};
});
assert.equal(results[3].groups[0].description,'3행 · 4열 · R · 1개 영역 · 병합 2곳 · 숨김 시트 · 회전 90°');
assert.equal(results[4].groups[0].description,'3행 · 요약');
assert.equal(results[7].groups[0].description,'0행 · 4열 · A1:D4 · 2개 영역 · 병합 2곳 · 숨김 시트 · 회전 -90°');
const fixturePath='architecture/ui/document-analysis-structure-cases.json';
if(fs.existsSync(fixturePath)){
  const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
  assert.equal(fixture.executionStatus,'NOT_RUN');
  for(const test of fixture.cases){
    assert.equal(test.executionStatus,'NOT_RUN');
    assert.deepEqual(JSON.parse(JSON.stringify(helpers.structureGroups(test.input))),test.expected,'published fixture '+test.id);
  }
}
fs.writeFileSync('.cache/architecture-final-challenge/ui-probe-results.json', JSON.stringify({source:path,method:'TypeScript AST unchanged helper extraction + transpileModule + VM; no React/browser execution',results},null,2)+'\n');
console.log(JSON.stringify({source:path,cases:results.length,status:'PASS_LOCAL_PURE_HELPER',browser:'NOT_RUN',output:'.cache/architecture-final-challenge/ui-probe-results.json'}));

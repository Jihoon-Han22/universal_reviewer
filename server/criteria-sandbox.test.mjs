import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverWorkbookCriteria,selectCriteriaRanges,upsertCriteriaProposals} from './criteria-sandbox.mjs';
import {createDocumentAnalyzer} from './document-analyzer.mjs';
import {createActivityStore} from '../integrations/src/activity.mjs';
const inventory={complete:true,warnings:[],sheets:[{name:'S',complete:true,images:0,regions:[{id:'s1-r1',range:'A1:B2',nonEmptyCells:4,sample:[],sampleOnly:false}]}]};
const cells=[{cell:'A1',text:'항목'},{cell:'B1',text:'기준'},{cell:'A2',text:'외관'},{cell:'B2',text:'적합'}];
function fakeDiscovery(){let sessions=0;const writes=[],commands=[],files=new Map();return {get sessions(){return sessions;},writes,commands,runner:async work=>{sessions++;const report=()=>{};report.taskId='discovery-session';return work({files:{write:async(path,data)=>{for(const p of Array.isArray(path)?path:[{path,data}]){writes.push(p.path);files.set(p.path,p.data);}},read:async path=>{if(path.endsWith('inventory.json'))return JSON.stringify(inventory);if(path.endsWith('details.json'))return JSON.stringify({complete:true,cellsRead:4,ranges:JSON.parse(files.get('/home/user/trace-criteria/request.json')).ranges.map(r=>({...r,cells,truncated:false}))});throw new Error('unexpected file');}},commands:{run:async command=>{commands.push(command);return {exitCode:0,stdout:'',stderr:''};}}},report);}};}
const validation=overrides=>({criteria:[{id:'c',label:'외관',rule:'적합',needsConfirmation:false,sourceDocumentId:'D'}],omitted:[],unresolved:[],regionProblems:[],contextSignals:[],contextProblems:[],rejectedDispositions:[],validationErrors:[],droppedCriteria:0,classificationLimitReached:false,droppedHierarchyLevels:0,examinedRegions:['s1-r1'],...overrides});
test('criteria range coordinate budget includes repeated reads',()=>{const seen=new Set([JSON.stringify({sheet:'S',range:'A1:B2'})]);assert.equal(selectCriteriaRanges([{sheet:'S',range:'A1:B2'}],inventory,{seen}).ranges.length,0);const repeated=selectCriteriaRanges([{sheet:'S',range:'A1:B2'}],inventory,{seen,repeat:true,usedArea:23998});assert.equal(repeated.ranges.length,0);assert.equal(repeated.remainingRanges.length,1);assert.equal(selectCriteriaRanges([{sheet:'S',range:'A1:XFD1048576'}],inventory).rejected.length,1);});
test('proposals cannot replace another source record merely by equal label',()=>{const proposals=[{label:'test',rule:'1 이상',unit:'%',citations:[{sheet:'S',cell:'B2'}]}];upsertCriteriaProposals(proposals,[{label:'test',rule:'2 이상',unit:'%',citations:[{sheet:'S',cell:'B3'}],replacesIndex:0}]);assert.equal(proposals.length,2);assert.equal(proposals[0].rule,'1 이상');});
test('two discovery reads share one physical sandbox and one pinned install',async()=>{const fixture=fakeDiscovery();let modelCalls=0,validations=0;const result=await discoverWorkbookCriteria({id:'D',name:'source.xlsx',kind:'xlsx',buffer:Buffer.from('private original')},{withSandbox:fixture.runner,gemini:{generateJson:async options=>{modelCalls++;if(options.role==='explore')return {data:{ranges:[],regions:[],warnings:[]}};assert.match(options.contents[0].text,/ALL ACTUAL CELLS READ SO FAR/);return {data:{criteria:[],followUpRanges:[],warnings:[],regionAssessments:[{id:'s1-r1',classification:'criteria',criterionCells:['B2'],reason:'source',evidence:[{sheet:'S',cell:'B2',quote:'적합'}]}],dispositions:[]}};}},validateDiscovery:()=>++validations===1?validation({regionProblems:[{id:'s1-r1',sheet:'S',range:'A1:B2',reason:'inspect again'}]}):validation()});assert.equal(fixture.sessions,1);assert.equal(fixture.commands.filter(c=>c.includes('pip install')).length,1);assert.equal(fixture.commands.filter(c=>c.includes(' read ')).length,2);assert.equal(fixture.writes.filter(p=>p.endsWith('workbook.xlsx')).length,1);assert.equal(result.coverage.requestedArea,8);assert.equal(result.coverage.extractedCriteriaComplete,true);assert.equal(modelCalls,3);});
test('workbook default grounding validates actual cells rather than samples',async()=>{const fixture=fakeDiscovery();const proposal={label:'외관',rule:'적합',unit:'',scope:'',conditions:[],citations:[{sheet:'S',cell:'A2',quote:'외관'},{sheet:'S',cell:'B2',quote:'적합'}],unitCitations:[],conditionCitations:[],scopeCitations:[],categoryPath:[],hierarchyCitations:[],sampleName:'',sampleCitations:[],classificationStatus:'not_applicable',classificationNeedsConfirmation:false,classificationReason:'',needsConfirmation:false,sharedScope:false,replacesIndex:-1};const result=await discoverWorkbookCriteria({id:'D',name:'source.xlsx',kind:'xlsx',buffer:Buffer.from('private original')},{withSandbox:fixture.runner,gemini:{generateJson:async options=>({data:options.role==='explore'?{ranges:[],regions:[],warnings:[]}:{criteria:[proposal],followUpRanges:[],warnings:[],regionAssessments:[{id:'s1-r1',classification:'criteria',criterionCells:['B2'],reason:'required appearance',evidence:[{sheet:'S',cell:'B2',quote:'적합'}]}],dispositions:[]}})}});assert.equal(result.criteria.length,1);assert.equal(result.criteria[0].label,'외관');assert.ok(result.criteria[0].sourceEvidence);assert.equal(result.coverage.cellsRead,4);});

test('analyzer discovery preserves two actual sheet inventories and their joined region assessments',async()=>{
  const workbookInventory={complete:true,warnings:[],sheets:[
    {name:'Requirements',complete:true,images:0,regions:[{id:'s1-r1',range:'A1:B2',nonEmptyCells:4,sample:[],sampleOnly:false}]},
    {name:'Contacts',complete:true,images:0,regions:[{id:'s2-r1',range:'A1:B2',nonEmptyCells:4,sample:[],sampleOnly:false}]}
  ]};
  const readCells={Requirements:cells,Contacts:[{cell:'A1',text:'작성자'},{cell:'B1',text:'이름'},{cell:'A2',text:'담당자'},{cell:'B2',text:'홍길동'}]};
  const assessments=[
    {id:'s1-r1',classification:'criteria',criterionCells:['B2'],reason:'Appearance requirement',evidence:[{sheet:'Requirements',cell:'B2',quote:'적합'}]},
    {id:'s2-r1',classification:'unrelated',criterionCells:[],reason:'Contact details',evidence:[{sheet:'Contacts',cell:'A2',quote:'담당자'}]}
  ];
  const document={id:'D',name:'two-sheets.xlsx',kind:'xlsx',buffer:Buffer.from('offline replay input'),modelParts:[],sourceSheets:Object.entries(readCells).map(([name,values])=>({name,rows:[1,2].map(row=>({row,cells:values.filter(cell=>cell.cell.endsWith(String(row)))}))}))};
  const proposal={label:'외관',rule:'적합',unit:'',scope:'',conditions:[],citations:[{sheet:'Requirements',cell:'A2',quote:'외관'},{sheet:'Requirements',cell:'B2',quote:'적합'}],unitCitations:[],conditionCitations:[],scopeCitations:[],categoryPath:[],hierarchyCitations:[],sampleName:'',sampleCitations:[],classificationStatus:'not_applicable',classificationNeedsConfirmation:false,classificationReason:'',needsConfirmation:false,sharedScope:false,replacesIndex:-1};
  const files=new Map(),commands=[],calls=[];let sessions=0;
  const analyzer=createDocumentAnalyzer({activityStore:createActivityStore(),withSandbox:async work=>{
    sessions++;const report=()=>{};report.taskId='offline-discovery';
    return work({files:{write:async(path,data)=>{for(const entry of Array.isArray(path)?path:[{path,data}])files.set(entry.path,entry.data);},read:async path=>{
      if(path.endsWith('inventory.json'))return JSON.stringify(workbookInventory);
      assert.ok(path.endsWith('details.json'));
      const ranges=JSON.parse(files.get('/home/user/trace-criteria/request.json')).ranges;
      return JSON.stringify({complete:true,cellsRead:ranges.reduce((sum,range)=>sum+readCells[range.sheet].length,0),ranges:ranges.map(range=>({...range,cells:readCells[range.sheet],truncated:false}))});
    }},commands:{run:async command=>{commands.push(command);return {exitCode:0,stdout:'',stderr:''};}}},report);
  },gemini:{generateJson:async request=>{
    calls.push(request.maxOutputTokens);
    if(request.maxOutputTokens===4096)return {data:{status:'criteria',hasNormativeContent:true,sourceKind:'mixed',reason:'Source includes a requirement',evidence:[{documentId:'D',sheet:'Requirements',cell:'B2',quote:'적합'}]}};
    if(request.maxOutputTokens===5000)return {data:{ranges:[],regions:[],warnings:[]}};
    assert.equal(request.maxOutputTokens,16000);
    return {data:{criteria:[proposal],followUpRanges:[],warnings:[],regionAssessments:assessments,dispositions:[]}};
  }}});
  const result=await analyzer.discoverCriteria([document]);
  assert.deepEqual(calls,[4096,5000,16000]);assert.equal(sessions,1);
  assert.equal(commands.filter(command=>command.includes(' read ')).length,1);
  assert.equal(result.criteria.length,1);assert.equal(result.criteriaAssessments[0].status,'criteria');
  assert.equal(result.criteriaDiscovery.length,1);
  const discovery=result.criteriaDiscovery[0];
  assert.equal(discovery.documentId,'D');assert.deepEqual(discovery.inventory,workbookInventory);assert.deepEqual(discovery.regionAssessments,assessments);
  assert.equal(Object.hasOwn(discovery,'regions'),false);assert.deepEqual(discovery.warnings,[]);
  assert.equal(discovery.coverage.cellsRead,8);assert.equal(discovery.coverage.allRegionsExamined,true);assert.equal(discovery.coverage.extractedCriteriaComplete,true);
  const joined=discovery.inventory.sheets.flatMap(sheet=>sheet.regions.map(region=>({sheet:sheet.name,range:region.range,classification:discovery.regionAssessments.find(assessment=>assessment.id===region.id)?.classification})));
  assert.deepEqual(joined,[{sheet:'Requirements',range:'A1:B2',classification:'criteria'},{sheet:'Contacts',range:'A1:B2',classification:'unrelated'}]);
});

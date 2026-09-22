// Test-only compilation of independently inspected source facts and recorded
// physical outputs. This never imports a product execution entrypoint or oracle.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {ref,readRef} from './shared.mjs';
import {schemas,criteriaSchemas} from '../../server/pipeline-prompts.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const [manifestPath,physicalPath,supplementPath]=process.argv.slice(2);
function allowed(value){if(typeof value!=='string'||!value.startsWith('.cache/rebuild/evidence/')||/(^|\/)evaluator(\/|$)|oracle\.json$/i.test(value))throw new Error('Only recorded source preparation artifacts are permitted');return value;}
const inputManifestRef=await ref(root,allowed(manifestPath)),physicalReportRef=await ref(root,allowed(physicalPath));
const supplementRef=supplementPath?await ref(root,allowed(supplementPath)):null;
const supplement=supplementRef?JSON.parse(await readRef(root,supplementRef)):null;
if(supplement){if(!supplement.complete||!supplement.implementationStable||supplement.exitCode!==0)throw new Error('Supplement execution is incomplete or failed');for(const program of supplement.implementationReferencesBefore)await readRef(root,program);await readRef(root,supplement.runnerRef);}
const input=JSON.parse(await readRef(root,inputManifestRef)),physical=JSON.parse(await readRef(root,physicalReportRef));
const physicalPlan=JSON.parse(await readRef(root,physical.planRef)),executions=JSON.parse(await readRef(root,physical.executionRef));
const authoredManifestRef=await ref(root,`${input.outputDirectory}/authored-manifest.json`),authored=JSON.parse(await readRef(root,authoredManifestRef));
if(input.cases.length!==13||authored.cases.length!==13||physical.cases.length!==13||!executions.complete||physical.counts.executionErrors||physical.counts.assertionFailures||!physical.implementationStable)throw new Error('Complete successful physical denominator required');
if(!isDeepStrictEqual(physical.inputManifestRef,inputManifestRef))throw new Error('Physical input manifest differs');
for(const reference of physical.implementationReferencesBefore)await readRef(root,reference);
if(!isDeepStrictEqual(physical.implementationReferencesBefore,physical.implementationReferencesAfter))throw new Error('Physical programs changed during prior execution');
const outputDirectory=`.cache/rebuild/evidence/LOOP-004/G08-compiled-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(path.join(root,outputDirectory),{recursive:true});
async function save(file,value,{raw=false}={}){const name=`${outputDirectory}/${file}`;await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),raw?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});return ref(root,name);}
const cell=value=>{const m=/^([A-Z]+)([1-9]\d*)$/.exec(value);if(!m)throw new Error('Bad source coordinate');return{column:[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),row:Number(m[2])};};
const canonical=value=>value.includes(':')?value:`${value}:${value}`;
const inside=(address,range)=>{const a=cell(address),[start,end]=canonical(range).split(':').map(cell);return a.row>=start.row&&a.row<=end.row&&a.column>=start.column&&a.column<=end.column;};
function schemaCheck(schema,value,at='response'){
  if(value?.$identity){if(schema.type!=='string'||!['document','criterion'].includes(value.$identity))throw new Error(`${at}: invalid identity substitution`);return;}
  const type=Array.isArray(value)?'array':value===null?'null':typeof value;
  if(schema.type==='integer'?!Number.isInteger(value):schema.type&&schema.type!==type)throw new Error(`${at}: expected ${schema.type}, received ${type}`);
  if(schema.enum&&!schema.enum.includes(value))throw new Error(`${at}: enum mismatch`);
  if(type==='array')value.forEach((v,i)=>schemaCheck(schema.items,v,`${at}/${i}`));
  if(type==='object'){
    for(const key of schema.required??[])if(!Object.hasOwn(value,key))throw new Error(`${at}: missing ${key}`);
    for(const [key,v]of Object.entries(value)){if(!schema.properties?.[key])throw new Error(`${at}: undeclared fixture field ${key}`);schemaCheck(schema.properties[key],v,`${at}/${key}`);}
  }
}
function context(draft,role,isCsv){
  const tables=draft.sourceFacts[`${role}Tables`],sheets=draft.sourceFacts[`${role}Sheets`];
  const structure=tables.map(table=>({name:'원문 표',kind:'table',sheet:isCsv?'CSV':table.sheet,range:canonical(table.range),headers:Object.values(table.headers).map(header=>`${header.cell} ${header.text}`),description:'원문 헤더와 셀 위치를 확인한 표',orientation:table.orientation,uncertain:false}));
  for(const sheet of sheets)if(sheet.cells.length&&!tables.some(table=>table.sheet===sheet.name)){
    if(sheet.cells.length!==1)throw new Error('Unreviewed non-table context');
    structure.push({name:'접수 안내',kind:'metadata',sheet:sheet.name,range:canonical(sheet.cells[0].cell),headers:[],description:sheet.cells[0].text,orientation:'unknown',uncertain:false});
  }
  return{summary:'표 헤더, 원문 값, 조건 및 참고 열을 구분했습니다.',documentType:'원문 표',structure,warnings:[],questions:[]};
}
function documentSession(document,record,readerRef){return{
  commands:[{command:'python -m pip install --disable-pip-version-check --no-input openpyxl==3.1.5 python-docx==1.1.2 PyMuPDF==1.26.4 Pillow==11.3.0',result:{exitCode:0,stdout:'',stderr:''},setupOnly:true},
    {command:`python /home/user/document-reader.py /home/user/document-input.bin ${path.extname(document.file).slice(1)} /home/user/document-profile.json`,result:{exitCode:record.exitCode,stdout:record.stdout,stderr:record.stderr},actualExecutionRef:physical.executionRef,actualRecordIndex:executions.records.indexOf(record)}],
  writes:[{path:'/home/user/document-input.bin',artifactRef:document.input},{path:'/home/user/document-reader.py',artifactRef:readerRef}],
  reads:[{path:'/home/user/document-profile.json',artifactRef:record.outputRef}]
};}
const readerRef=physical.implementationReferencesBefore.find(r=>r.path==='server/sandbox-document-reader.py'),helperRef=physical.implementationReferencesBefore.find(r=>r.path==='server/criteria-workbook-profile.py');
const cases=[],supplements=[];
for(const source of input.cases){
  const folder=source.caseId.replace(':','-'),authoredDraftRef=authored.cases.find(c=>c.caseId===source.caseId)?.artifact,draft=JSON.parse(await readRef(root,authoredDraftRef));
  if(!isDeepStrictEqual(draft.inputs,source.inputs))throw new Error('Source-authored input identity differs');
  for(const document of source.inputs)await readRef(root,document.input);
  const records=executions.records.filter(record=>record.caseId===source.caseId);
  if(records.length!==4||records.some(record=>record.exitCode!==0))throw new Error('Four actual physical operations per case required');
  for(const record of records)await readRef(root,record.outputRef);
  const find=phase=>records.find(record=>record.phase===phase),inventoryRecord=find('criteria-inventory');let detailsRecord=find('criteria-range-read'),detailsExecutionRef=physical.executionRef,detailsRecordIndex=executions.records.indexOf(detailsRecord);
  if(!inventoryRecord||!detailsRecord)throw new Error('Actual helper outputs missing');
  const inventory=JSON.parse(await readRef(root,inventoryRecord.outputRef));let details=JSON.parse(await readRef(root,detailsRecord.outputRef));
  const originalPhysical=physicalPlan.cases.find(c=>c.caseId===source.caseId);
  const oldRequest=JSON.parse(await readRef(root,originalPhysical.criteriaHelper.requestRef));
  const ranges=oldRequest.ranges.map(range=>({...range,range:canonical(range.range)}));
  const requestRef=await save(`${folder}/criteria-request.json`,JSON.stringify({ranges}),{raw:true});
  const supplementaryRecord=supplement?.records?.find(record=>record.caseId===source.caseId);
  if(supplementaryRecord){
    if(supplementaryRecord.exitCode!==0||supplementaryRecord.assertions.some(assertion=>assertion.passed!==true)||!isDeepStrictEqual(supplementaryRecord.input,source.inputs.find(d=>d.role==='criteria').input)||!(await readRef(root,supplementaryRecord.requestRef)).equals(await readRef(root,requestRef)))throw new Error('Supplement input/request identity differs');
    await readRef(root,supplementaryRecord.programRef);detailsRecord=supplementaryRecord;detailsExecutionRef=supplementRef;detailsRecordIndex=supplement.records.indexOf(detailsRecord);details=JSON.parse(await readRef(root,detailsRecord.outputRef));
  }
  const actualRanges=details.ranges.map(({sheet,range})=>({sheet,range}));
  const pendingPhysical=!isDeepStrictEqual(ranges,actualRanges);
  const criteriaDocument=source.inputs.find(d=>d.role==='criteria'),targetDocument=source.inputs.find(d=>d.role==='target'),isCsv=targetDocument.file.endsWith('.csv');
  const regionAssessments=[];
  for(const sheet of inventory.sheets)for(const region of sheet.regions){
    const tables=draft.sourceFacts.criteriaTables.filter(table=>table.sheet===sheet.name&&table.rows.some(row=>inside(row['기준'].cell,region.range)));
    const criterionCells=tables.flatMap(table=>table.rows.filter(row=>inside(row['기준'].cell,region.range)).map(row=>row['기준'].cell));
    const sourceSheet=draft.sourceFacts.criteriaSheets.find(value=>value.name===sheet.name);
    const anchor=sourceSheet?.cells.find(value=>value.text&&inside(value.cell,region.range));if(!anchor)throw new Error('Inventory region has no independently inspected source anchor');
    regionAssessments.push({id:region.id,classification:criterionCells.length?'criteria':'context',criterionCells,reason:criterionCells.length?'실제 기준 헤더와 연결된 규범 셀을 모두 추출했습니다.':'접수 안내만 있는 원문 영역이며 판정 기준이 없습니다.',evidence:[{sheet:sheet.name,cell:anchor.cell,quote:anchor.text}]});
  }
  const workbookCandidates=draft.draftResponses.workbookCandidates.map(({authoringEvidence,...candidate})=>candidate);
  const eligibility=structuredClone(draft.draftResponses.criteriaEligibility);eligibility.evidence.forEach(e=>e.documentId={$identity:'document',role:'criteria'});
  const items=draft.draftResponses.targetItems.map(({authoringEvidence,actualCondition,sampleName,...item})=>({...item,label:`${sampleName} · ${item.label}`,criterionId:{$identity:'criterion',label:item.label},evidence:item.evidence.map(({documentId,sheet,...e})=>({...e,...(!isCsv?{sheet}:{}),documentId:{$identity:'document',role:'target'}}))}));
  const sampleObservationBindings=draft.sourceFacts.targetTables.flatMap(table=>table.rows.map(row=>({role:'target',criterionLabel:row['항목'].text,sampleName:row['시료명'].text,sheet:table.sheet,cell:row['시료명'].cell,headerCell:table.headers['시료명'].cell,orientation:table.orientation})));
  // Guard exact source positions AND values, including blank fields, units,
  // conditions and notes. Labels alone could also occur in the criteria prompt.
  const sourceLiterals=(sheets,csv=false)=>sheets.flatMap(sheet=>sheet.cells.map(value=>`${JSON.stringify(csv?'CSV':sheet.name)}!${value.cell}: ${JSON.stringify(value.text)}`));
  const criteriaFacts=sourceLiterals(draft.sourceFacts.criteriaSheets);
  const targetFacts=sourceLiterals(draft.sourceFacts.targetSheets,isCsv);
  const workbookFacts=details.ranges.flatMap(region=>region.cells.map(value=>JSON.stringify({sheet:region.sheet,...value})));
  const criterionLabels=draft.sourceFacts.criteriaTables.flatMap(table=>table.rows.map(row=>row['항목'].text));
  const responses=[];
  async function response(stage,schemaGroup,schemaKey,role,maxOutputTokens,data,sourceAssertions){
    schemaCheck((schemaGroup==='schemas'?schemas:criteriaSchemas)[schemaKey],data);
    responses.push({stage,schemaGroup,schemaKey,role,maxOutputTokens,sourceAssertions,responseRef:await save(`${folder}/${stage}.json`,data)});
  }
  await response('01-criteria-context','schemas','documentContextSchema','extract',9000,context(draft,'criteria',false),criteriaFacts);
  await response('02-criteria-context-review','schemas','documentContextReviewSchema','extract',6000,{checked:true,issues:[]},criteriaFacts);
  await response('03-criteria-eligibility','criteriaSchemas','criteria-eligibility.SCHEMA','extract',4096,eligibility,criteriaFacts);
  await response('04-workbook-plan','criteriaSchemas','criteria-sandbox.planSchema','explore',5000,{ranges,regions:regionAssessments.map(({id,classification,reason})=>({id,classification,reason})),warnings:[]},[JSON.stringify(inventory)]);
  await response('05-workbook-extract','criteriaSchemas','criteria-sandbox.extractSchema','extract',16000,{criteria:workbookCandidates,followUpRanges:[],warnings:[],regionAssessments,dispositions:[]},workbookFacts);
  await response('06-workflow-overlay','schemas','overlaySchema','extract',8000,{changes:[],additions:[]},[source.request.criteriaText,...criterionLabels]);
  await response('07-target-context','schemas','documentContextSchema','extract',9000,context(draft,'target',isCsv),targetFacts);
  await response('08-target-context-review','schemas','documentContextReviewSchema','extract',6000,{checked:true,issues:[]},targetFacts);
  await response('09-target-items','schemas','itemSchema','extract',12000,{items,reviewCoverage:{complete:true,remainingWork:[]}},targetFacts);
  const helperSession={commands:[
    {command:'mkdir -p /home/user/trace-criteria',result:{exitCode:0,stdout:'',stderr:''},setupOnly:true},
    {command:'python -m pip install --disable-pip-version-check --no-input openpyxl==3.1.5',result:{exitCode:0,stdout:'',stderr:''},setupOnly:true},
    {command:'python /home/user/trace-criteria/profile.py /home/user/trace-criteria/workbook.xlsx inventory /home/user/trace-criteria/inventory.json',result:{exitCode:inventoryRecord.exitCode,stdout:inventoryRecord.stdout,stderr:inventoryRecord.stderr},actualExecutionRef:physical.executionRef,actualRecordIndex:executions.records.indexOf(inventoryRecord)},
    {command:'python /home/user/trace-criteria/profile.py /home/user/trace-criteria/workbook.xlsx read /home/user/trace-criteria/details.json /home/user/trace-criteria/request.json',result:pendingPhysical?null:{exitCode:detailsRecord.exitCode,stdout:detailsRecord.stdout,stderr:detailsRecord.stderr},actualExecutionRef:pendingPhysical?null:detailsExecutionRef,actualRecordIndex:pendingPhysical?null:detailsRecordIndex}
  ],writes:[{path:'/home/user/trace-criteria/profile.py',artifactRef:helperRef},{path:'/home/user/trace-criteria/workbook.xlsx',artifactRef:criteriaDocument.input},{path:'/home/user/trace-criteria/request.json',artifactRef:requestRef}],reads:[{path:'/home/user/trace-criteria/inventory.json',artifactRef:inventoryRecord.outputRef},{path:'/home/user/trace-criteria/details.json',artifactRef:pendingPhysical?null:detailsRecord.outputRef}]};
  if(pendingPhysical)supplements.push({caseId:source.caseId,inputRef:criteriaDocument.input,requestRef,helperRef,priorDetailsRef:detailsRecord.outputRef,reason:'The exact source range is canonicalized by the actual pipeline. Prior helper output is retained and cannot substitute for a different request.',expectedRanges:ranges,outputPath:`${outputDirectory}/${folder}/supplementary-details.json`,expectedNonemptyCells:draft.sourceFacts.criteriaSheets.flatMap(sheet=>sheet.cells.filter(c=>c.text).map(c=>({sheet:sheet.name,cell:c.cell,text:c.text})))});
  cases.push({...source,authoredDraftRef,state:'unresolved',semanticReview:{reviewed:false,reviewerId:null,reviewTraceRef:null,baselineReferences:[]},assertions:[],responses,sampleObservationBindings,sandboxSessions:[documentSession(criteriaDocument,find('reader-criteria'),readerRef),helperSession,documentSession(targetDocument,find('reader-target'),readerRef)],physicalEvidenceRefs:[physicalReportRef,physical.planRef,physical.executionRef,...records.map(r=>r.outputRef),...(supplementaryRecord?[supplementRef,detailsRecord.outputRef]:[])],pendingPhysical,fullGateCaseState:'not_run'});
}
const compilerRef=await ref(root,'scripts/acceptance/compile-public-replay.mjs'),harnessRef=await ref(root,'scripts/acceptance/public-replay-harness.mjs');
const supplementaryPlanRef=supplements.length?await save('supplementary-physical-plan.json',{schemaVersion:'1.0',acceptanceProfile:'CURRENT_REPRODUCTION',loop:'LOOP-004',preparedAt:new Date().toISOString(),origin:'preexecution exact canonical-range supplement',compilerRef,runnerRef:await ref(root,'scripts/acceptance/public-physical-supplement.py'),physicalReportRef,physicalProgramReferences:physical.implementationReferencesBefore,cases:supplements,expectedInvocations:supplements.length,oracleRead:false,providerCalls:{gemini:0,e2b:0},semanticExecutionAuthorized:false}):null;
const plan={schemaVersion:'1.0',acceptanceProfile:'CURRENT_REPRODUCTION',loop:'LOOP-004',preparedAt:new Date().toISOString(),kind:'source-authored-compiled-unresolved-semantic-replay-plan',outputDirectory,inputManifestRef,authoredManifestRef,physicalReportRef,physicalProgramReferences:physical.implementationReferencesBefore,compilerRef,harnessRef,codeDigest:null,supplementaryPlanRef,
  modelStagePolicy:'Nine independently authored response inputs per case: context, context review, eligibility, workbook plan, workbook extraction, workflow overlay, target context, target context review, target items. These do not represent observed Gemini output or model accuracy.',
  dispatchPolicy:'Runtime responds only to the next ordered schema/role/token request after checking observed source content. Only current document and exact-source-label criterion IDs are bound. Case IDs, variants, filenames and hashes are never semantic dispatch keys.',
  physicalPolicy:'Read-only replay of byte-identical separately executed trusted-reader/helper outputs. Install and mkdir are explicit test transport acknowledgments, not actual execution claims. Every physical input and program hash must still match.',
  baselinePolicy:'All semantic outcomes await independent current-contract review. Source-authored reviewCoverage is a model-input claim; the actual pipeline must derive its own coverage and verdicts. No oracle JSON or expected answer is passed to the application.',
  cases,productExecuted:false,oracleRead:false,providerCalls:{gemini:0,e2b:0},fullGateCasesPassed:0,completeProductAcceptance:false};
const planRef=await save('compiled-plan.json',plan);
console.log(JSON.stringify({planRef,supplementaryPlanRef,cases:cases.length,compiledResponses:cases.reduce((n,c)=>n+c.responses.length,0),pendingPhysical:supplements.map(c=>c.caseId),semanticCasesResolved:0,productExecuted:false}));

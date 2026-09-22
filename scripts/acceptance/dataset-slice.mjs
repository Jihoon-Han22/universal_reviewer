// Actual read-only dataset subphases. This deliberately does not manufacture full-gate results.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { snapshotImplementation } from '../../architecture/validation/acceptance.mjs';
import { DocumentStore, MAX_FILE_BYTES } from '../../server/documents.mjs';
import { ref, readRef, sha256, writeJson, PROFILE } from './shared.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.version!=='v24.13.1')throw new Error('PINNED_NODE_REQUIRED');
const loop=process.argv[2];if(!/^LOOP-\d{3}$/.test(loop??''))throw new Error('Usage: node scripts/acceptance/dataset-slice.mjs LOOP-NNN');
const registryRef=await ref(root,'scripts/acceptance/case-registry.json'),registry=JSON.parse(await readRef(root,registryRef));
const chosen=registry.cases.filter(c=>['golden-criteria','golden-cert','golden-ledger','v3-report'].includes(c.kind));
if(chosen.length!==60)throw new Error('Full 20 criteria / 26 cert / 6 ledger / 8 report scope required.');
for(const definition of [...chosen].filter(c=>c.kind==='v3-report')) {
  for(const input of definition.inputs.filter(i=>i.path.includes('/inputs/criteria/')||i.path.includes('/inputs/templates/'))) {
    const kind=input.path.includes('/inputs/criteria/')?'v3-criteria':'v3-template';
    chosen.push({...definition,id:`${definition.id}:${kind==='v3-criteria'?'criteria':'template'}`,kind,inputs:[input]});
  }
}
if(chosen.length!==70)throw new Error('Full 70 original document scope required.');
const timestamp=new Date().toISOString().replace(/[:.]/g,'-'),outputDirectory=`.cache/rebuild/evidence/${loop}/dataset-reader-${timestamp}`;
const sourceNames=['server/documents.mjs','server/sandbox-document-reader.py','server/document-source.mjs','scripts/acceptance/dataset-reader.py','scripts/acceptance/dataset-slice.mjs','scripts/acceptance/finalize-dataset-slice.mjs','scripts/acceptance/shared.mjs'];
const implementationReferences=await Promise.all(sourceNames.map(name=>ref(root,name)));
const documents=[];
for(const definition of chosen) {
  const input=definition.kind==='v3-report'?definition.inputs.find(i=>i.path.endsWith('.pdf')):definition.inputs[0];
  await readRef(root,input);
  const size=(await stat(path.join(root,input.path))).size,kind=path.extname(input.path).slice(1),role=['golden-criteria','v3-criteria'].includes(definition.kind)?'criteria':['golden-ledger','v3-template'].includes(definition.kind)?'ledger':'target';
  documents.push({id:definition.id,category:definition.kind,kind,role,input,inputBytes:size,expected:{sourceUnchanged:true,uploadSizeAccepted:size<=MAX_FILE_BYTES,readerStatuses:size<=MAX_FILE_BYTES?['ready','partial']:['not_run_upload_rejected'],maximumUploadBytes:MAX_FILE_BYTES,maximumAuxiliaryImages:8,maximumReaderCells:100000,maximumReaderTextCharacters:1500000},baselineReferences:definition.baselineReferences,fullCaseStatus:'not_run',pendingPhases:role==='criteria'?['context','eligibility','discovery','HITL','source comparison']:role==='ledger'?['mapping','confirmed copy','non-target preservation']:['context/VLM','extraction','source comparison','verdict/export']});
}
if(documents.filter(d=>d.expected.uploadSizeAccepted).length!==64)throw new Error('Expected 64 admitted originals and 6 oversize rejections.');
const codeBefore=await snapshotImplementation(root);
const plan={schemaVersion:'1.0',acceptanceProfile:PROFILE,loop,kind:'pre-execution-dataset-subphase-plan',preparedAt:new Date().toISOString(),registry:registryRef,codeDigest:codeBefore.digest,implementationReferences,outputDirectory,scope:{criteria:20,certPaths:26,ledger:6,v3Reports:8,physicalV3Pages:575},initialState:'Fresh DocumentStore per input; real unchanged trusted-reader module with local guest filesystem mapping; no model context or provider calls.',actions:['Hash original input','Execute real DocumentStore.add/public on input','Execute actual trusted Reader.main via Python with only guest image-write path mapping','Read real PDF physical page inventory','Rehash source and implementation files'],documents,oracleAccess:false,completeProductAcceptance:false};
plan.scope={...plan.scope,v3Criteria:8,v3Templates:2,uniqueOriginalPaths:70,expectedAdmittedReaderCalls:64,expectedUploadRejections:6};
plan.runtime={version:process.version,executable:process.execPath,executableSha256:sha256(await readFile(process.execPath))};
plan.finalGateFreeze=false;
const planRef=await writeJson(root,`${outputDirectory}/plan.json`,plan),startedAt=new Date().toISOString(),uploads=[];
console.log(JSON.stringify({phase:'immutable-pre-execution-plan',planRef,scope:plan.scope,runtime:plan.runtime}));
await writeFile(path.join(root,outputDirectory,'execution-started.json'),JSON.stringify({startedAt,pid:process.pid,planRef,runtime:plan.runtime}),{flag:'wx'});
for(const document of documents) {
  const input=await readRef(root,document.input),store=new DocumentStore();let actual;
  const start=new Date().toISOString();
  try {
    const doc=await store.add({name:path.basename(document.input.path),role:document.role,buffer:input}),publicDoc=store.public(doc);
    actual={accepted:true,publicDocument:publicDoc,privateKeys:Object.keys(doc),originalBufferUnchanged:Buffer.isBuffer(doc.buffer)&&sha256(doc.buffer)===document.input.sha256,publicContainsPrivateData:['buffer','modelParts','sandboxProfile','sourceRows','sourceSheets'].some(key=>Object.hasOwn(publicDoc,key))};
  } catch(error) {actual={accepted:false,status:error.status??null,error:String(error.message)};}
  const assertions=[{name:'current 20 MiB upload boundary',expected:document.expected.uploadSizeAccepted,actual:actual.accepted,passed:actual.accepted===document.expected.uploadSizeAccepted}];
  if(actual.accepted)assertions.push({name:'original buffer remains unchanged',expected:true,actual:actual.originalBufferUnchanged,passed:actual.originalBufferUnchanged},{name:'public DTO excludes private buffer/model/source',expected:false,actual:actual.publicContainsPrivateData,passed:!actual.publicContainsPrivateData});
  else if(!document.expected.uploadSizeAccepted)assertions.push({name:'oversize HTTP status',expected:413,actual:actual.status,passed:actual.status===413});
  uploads.push({caseId:document.id,startedAt:start,endedAt:new Date().toISOString(),actual,assertions,fullCaseStatus:'not_run'});
  await writeJson(root,`${outputDirectory}/uploads-progress.json`,{records:uploads});
  console.log(JSON.stringify({caseId:document.id,phase:'actual-upload',accepted:actual.accepted,assertionsPassed:assertions.every(a=>a.passed)}));
}
await writeJson(root,`${outputDirectory}/uploads.json`,{kind:'actual-DocumentStore-subphase',planRef,runtime:plan.runtime,records:uploads,providerCalls:{gemini:0,e2b:0},completeProductAcceptance:false});
const python=path.join(root,'.cache/rebuild/python/Scripts/python.exe');
const readerCommand=[python,'-B','scripts/acceptance/dataset-reader.py',path.join(root,planRef.path)];
const readerExit=await new Promise((resolve,reject)=>{
  const child=spawn(readerCommand[0],readerCommand.slice(1),{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  child.stdout.on('data',chunk=>process.stdout.write(chunk));child.stderr.on('data',chunk=>process.stderr.write(chunk));child.on('error',reject);child.on('close',resolve);
});
if(readerExit!==0)throw new Error(`Actual trusted reader subprocess failed with exit ${readerExit}. See preserved pre-execution plan and upload artifacts.`);
const reader=JSON.parse(await readFile(path.join(root,outputDirectory,'reader-report.json'),'utf8'));
const cases=[];
for(const document of documents) {
  const upload=uploads.find(u=>u.caseId===document.id),read=reader.records.find(r=>r.caseId===document.id);
  if(!read)throw new Error(`Reader did not execute ${document.id}`);
  const assertions=[...upload.assertions,{name:'source bytes unchanged after reader',expected:true,actual:read.sourceUnchanged,passed:read.sourceUnchanged},{name:'supported input physical reader or explicit size rejection',expected:document.expected.readerStatuses,actual:read.status,passed:document.expected.readerStatuses.includes(read.status)},{name:'auxiliary image cap',expected:[0,8],actual:read.images.length,passed:read.images.length<=8},{name:'reader cell cap',expected:[0,100000],actual:read.coverage.cellsRead,passed:Number.isSafeInteger(read.coverage.cellsRead)&&read.coverage.cellsRead<=100000},{name:'reader text cap',expected:[0,1500000],actual:read.coverage.textChars,passed:Number.isSafeInteger(read.coverage.textChars)&&read.coverage.textChars<=1500000}];
  if(document.expected.uploadSizeAccepted)assertions.push({name:'reader source identity',expected:document.input.sha256,actual:read.readerSha256,passed:read.readerSha256===document.input.sha256});
  else assertions.push({name:'reader is not called after upload rejection',expected:'not_run_upload_rejected',actual:read.status,passed:read.status==='not_run_upload_rejected'&&!read.readerExecuted});
  if(read.physicalPages!==null&&document.expected.uploadSizeAccepted)assertions.push({name:'physical PDF inventory equals reader inventory',expected:read.physicalPages,actual:read.inventory.pageCount,passed:read.inventory.pageCount===read.physicalPages});
  if(!read.readerExecuted)for(let index=assertions.length-1;index>=0;index--)if(['auxiliary image cap','reader cell cap','reader text cap'].includes(assertions[index].name))assertions.splice(index,1);
  assertions.push({name:'reader only executes for actual admitted upload',expected:upload.actual.accepted,actual:read.readerExecuted,passed:read.readerExecuted===upload.actual.accepted});
  cases.push({caseId:document.id,input:document.input,upload,reader:read,assertions,subphaseAssertionsMatched:assertions.every(a=>a.passed),fullCaseStatus:'not_run',pendingPhases:document.pendingPhases});
}
const v3=reader.records.filter(r=>r.category==='v3-report'),physicalPages=v3.reduce((n,r)=>n+r.physicalPages,0);
const currentSourceReferences=await Promise.all(sourceNames.map(name=>ref(root,name))),implementationStable=JSON.stringify(currentSourceReferences)===JSON.stringify(implementationReferences),codeAfter=await snapshotImplementation(root);
const report={schemaVersion:'1.0',acceptanceProfile:PROFILE,loop,kind:'actual-offline-dataset-subphases',planRef,startedAt,endedAt:new Date().toISOString(),command:[process.execPath,'scripts/acceptance/dataset-slice.mjs',loop],readerCommand,exitCode:0,origin:'offline-implementation-with-local-guest-filesystem-test-double',providerCalls:{gemini:0,e2b:0},oracleAccess:false,implementationReferences,currentSourceReferences,implementationStable,codeDigestBefore:codeBefore.digest,codeDigestAfter:codeAfter.digest,wholeImplementationChanged:codeBefore.digest!==codeAfter.digest,counts:{selectedPaths:cases.length,uploadAttempted:uploads.length,readerAttempted:reader.records.length,subphaseAssertions:cases.flatMap(c=>c.assertions).length,subphaseAssertionFailures:cases.flatMap(c=>c.assertions).filter(a=>!a.passed).length,fullGateCasesPassed:0},v3PhysicalInventory:{reports:v3.length,physicalPages,expectedReports:8,expectedPhysicalPages:575,matched:v3.length===8&&physicalPages===575,byReport:v3.map(r=>({caseId:r.caseId,pages:r.physicalPages,input:r.input}))},diagnostics:{fieldDenominator:35,writerCellDenominator:105,fieldsEvaluated:0,writerCellsEvaluated:0,state:'not_run',P10:{pdfFields:8,pngVisibleFields:4,certPathDenominator:26},P13:{state:'fixture-conflict',sourceValue:0.025,evaluatorValue:0.015,actualValueExtraction:'not_run'}},cases,completeProductAcceptance:false,limitations:['Upload and physical-reader subphases do not prove context, model extraction, current semantic/source match, HITL, VLM, ledger writing, browser or full G06/G07 acceptance.','No E2B or Gemini provider was called. Original guest reader image paths are mapped to local test artifacts.','A preserved partial/unsupported profile is an observation; it is not automatically classified as a matched original limitation.','Concurrent unrelated implementation changes invalidate reuse as a final gate; relevant source hashes are recorded before and after.']};
report.runtime=plan.runtime;report.pythonRuntime=reader.runtime;report.finalGateFreeze=false;
report.counts.readerAttempted=reader.records.filter(r=>r.readerExecuted).length;
report.counts.readerNotRunUploadRejected=reader.records.filter(r=>!r.readerExecuted).length;
report.counts.uploadAccepted=uploads.filter(r=>r.actual.accepted).length;
report.counts.uploadRejected=uploads.filter(r=>!r.actual.accepted).length;
report.limitations.push('Six actual upload rejections have no trusted-reader calls. Their PDF page counts are independent physical inventory only.');
report.exitCode=report.counts.subphaseAssertionFailures||!implementationStable||!report.v3PhysicalInventory.matched||report.counts.readerAttempted!==64||report.counts.uploadRejected!==6?1:0;
const output=await writeJson(root,`${outputDirectory}/report.json`,report);
console.log(JSON.stringify({report:output,counts:report.counts,v3PhysicalInventory:report.v3PhysicalInventory,implementationStable,wholeImplementationChanged:report.wholeImplementationChanged,completeProductAcceptance:false}));
process.exitCode=report.exitCode;

// Resume bookkeeping only: read the preserved plan, actual uploads and actual reader report.
// No upload/reader/provider execution is retried here.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotImplementation } from '../../architecture/validation/acceptance.mjs';
import { ref, readRef, writeJson } from './shared.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.version!=='v24.13.1')throw new Error('PINNED_NODE_REQUIRED');
const name=process.argv[2];if(!name?.startsWith('.cache/rebuild/evidence/')||!name.endsWith('/plan.json'))throw new Error('Pass the preserved project-relative plan.json path.');
const planRef=await ref(root,name),plan=JSON.parse(await readRef(root,planRef));
const uploads=JSON.parse(await readFile(path.join(root,plan.outputDirectory,'uploads.json'),'utf8')).records;
const readerRef=await ref(root,`${plan.outputDirectory}/reader-report.json`),reader=JSON.parse(await readRef(root,readerRef));
if(plan.documents.length!==70||uploads.length!==70||reader.records.length!==70)throw new Error('Full70-path scope must be retained.');
if(reader.planSha256!==planRef.sha256)throw new Error('Reader plan identity mismatch.');
const cases=[];
for(const definition of plan.documents) {
  await readRef(root,definition.input);
  const upload=uploads.find(u=>u.caseId===definition.id),read=reader.records.find(r=>r.caseId===definition.id);
  if(!upload||!read)throw new Error(`Missing executed path ${definition.id}`);
  if(read.readerExecuted)await readRef(root,read.profileRef);for(const image of read.images)await readRef(root,image);
  const assertions=[...upload.assertions,
    {name:'source bytes unchanged after reader',expected:true,actual:read.sourceUnchanged,passed:read.sourceUnchanged},
    {name:'supported input physical reader or explicit size rejection',expected:definition.expected.readerStatuses,actual:read.status,passed:definition.expected.readerStatuses.includes(read.status)},
    {name:'auxiliary image cap',expected:[0,8],actual:read.images.length,passed:read.images.length<=8},
    {name:'reader cell cap',expected:[0,100000],actual:read.coverage.cellsRead,passed:Number.isSafeInteger(read.coverage.cellsRead)&&read.coverage.cellsRead<=100000},
    {name:'reader text cap',expected:[0,1500000],actual:read.coverage.textChars,passed:Number.isSafeInteger(read.coverage.textChars)&&read.coverage.textChars<=1500000},
  ];
  if(definition.expected.uploadSizeAccepted)assertions.push({name:'reader source identity',expected:definition.input.sha256,actual:read.readerSha256,passed:read.readerSha256===definition.input.sha256});
  else assertions.push({name:'reader is not called after upload rejection',expected:'not_run_upload_rejected',actual:read.status,passed:read.status==='not_run_upload_rejected'&&!read.readerExecuted});
  if(read.physicalPages!==null&&definition.expected.uploadSizeAccepted)assertions.push({name:'physical PDF inventory equals reader inventory',expected:read.physicalPages,actual:read.inventory.pageCount,passed:read.inventory.pageCount===read.physicalPages});
  if(!read.readerExecuted)for(let index=assertions.length-1;index>=0;index--)if(['auxiliary image cap','reader cell cap','reader text cap'].includes(assertions[index].name))assertions.splice(index,1);
  assertions.push({name:'reader only executes for actual admitted upload',expected:upload.actual.accepted,actual:read.readerExecuted,passed:read.readerExecuted===upload.actual.accepted});
  cases.push({caseId:definition.id,input:definition.input,upload,reader:read,assertions,subphaseAssertionsMatched:assertions.every(a=>a.passed),fullCaseStatus:'not_run',pendingPhases:definition.pendingPhases});
}
const v3=reader.records.filter(r=>r.category==='v3-report'),physicalPages=v3.reduce((n,r)=>n+r.physicalPages,0);
const currentSourceReferences=await Promise.all(plan.implementationReferences.map(r=>ref(root,r.path))),implementationStable=JSON.stringify(currentSourceReferences)===JSON.stringify(plan.implementationReferences),codeAfter=await snapshotImplementation(root);
const report={schemaVersion:'1.0',acceptanceProfile:plan.acceptanceProfile,loop:plan.loop,kind:'actual-offline-dataset-subphases',planRef,readerRef,verifierReference:await ref(root,'scripts/acceptance/finalize-dataset-slice.mjs'),
  startedAt:uploads[0].startedAt,endedAt:new Date().toISOString(),command:[process.execPath,'scripts/acceptance/finalize-dataset-slice.mjs',name],exitCode:0,
  executionRecordReferences:[await ref(root,`${plan.outputDirectory}/execution-started.json`),await ref(root,`${plan.outputDirectory}/reader-started.json`)],
  origin:'offline-implementation-with-local-guest-filesystem-test-double',providerCalls:{gemini:0,e2b:0},oracleAccess:false,implementationReferences:plan.implementationReferences,currentSourceReferences,implementationStable,codeDigestBefore:plan.codeDigest,codeDigestAfter:codeAfter.digest,wholeImplementationChanged:plan.codeDigest!==codeAfter.digest,
  counts:{selectedPaths:plan.documents.length,uploadAttempted:uploads.length,readerAttempted:reader.records.filter(r=>r.readerExecuted).length,subphaseAssertions:cases.flatMap(c=>c.assertions).length,subphaseAssertionFailures:cases.flatMap(c=>c.assertions).filter(a=>!a.passed).length,fullGateCasesPassed:0},
  v3PhysicalInventory:{reports:v3.length,physicalPages,expectedReports:8,expectedPhysicalPages:575,matched:v3.length===8&&physicalPages===575,byReport:v3.map(r=>({caseId:r.caseId,pages:r.physicalPages,input:r.input}))},
  diagnostics:{fieldDenominator:35,writerCellDenominator:105,fieldsEvaluated:0,writerCellsEvaluated:0,state:'not_run',P10:{pdfFields:8,pngVisibleFields:4,certPathDenominator:26},P13:{state:'fixture-conflict',sourceValue:0.025,evaluatorValue:0.015,actualValueExtraction:'not_run'}},cases,completeProductAcceptance:false,
  limitations:['Full gate cases remain NOT_RUN: this measures upload and physical-reader subphases, not context, model/VLM extraction, semantic/source fidelity, HITL, writer or browser completion.','No E2B or Gemini provider was called. The only guest filesystem substitution maps image writes to local evidence artifacts.','Original unsupported/partial statuses are observed and retained; they are not automatically accepted as matching original limitations.','Relevant source hashes are checked before/after. Changes elsewhere in the concurrent implementation prevent reuse as final frozen-code gate evidence.']};
// Dispatch records identify actual starts; finalization never infers prior failures or retries.
report.runtime=plan.runtime;report.pythonRuntime=reader.runtime;report.finalGateFreeze=false;
report.counts.readerNotRunUploadRejected=reader.records.filter(r=>!r.readerExecuted).length;
report.counts.uploadAccepted=uploads.filter(r=>r.actual.accepted).length;
report.counts.uploadRejected=uploads.filter(r=>!r.actual.accepted).length;
report.limitations.push('Six actual oversize upload rejections have no trusted-reader calls. Their PDF page counts are independent physical inventory only.');
report.exitCode=report.counts.subphaseAssertionFailures||!implementationStable||!report.v3PhysicalInventory.matched||report.counts.readerAttempted!==64||report.counts.uploadRejected!==6?1:0;
const output=await writeJson(root,`${plan.outputDirectory}/report.json`,report);
console.log(JSON.stringify({report:output,counts:report.counts,v3PhysicalInventory:report.v3PhysicalInventory,implementationStable,wholeImplementationChanged:report.wholeImplementationChanged,completeProductAcceptance:false}));
process.exitCode=report.exitCode;

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sha256, safeFile, HASH } from './shared.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const array=value=>Array.isArray(value)?value:value?[value]:[];
function projectCitations(evidence,names) {
  return array(evidence).flatMap(source=>{
    const file=names.get(source.documentId);
    if(!file || typeof source.quote!=='string' || typeof source.cell!=='string' || !/^[A-Z]+[1-9][0-9]*$/.test(source.cell))return[];
    return[{file,sheet:source.sheet??'',cell:source.cell,quote:source.quote}];
  });
}
export function projectContractResult({request,runId,snapshot,run,documents,inputNames,error,observedHighlights,observedSamples}) {
  const names=new Map(documents.map((doc,index)=>[doc.id,inputNames[index]]));
  const items=(snapshot?.items??[]).map(item=>{
    const criterion=(snapshot.criteria??[]).find(c=>c.id===item.criterionId);
    const presence=['present','missing','unreadable','unknown'].includes(item.presence)?item.presence:'unknown';
    const valueEvidence=projectCitations(item.evidence,names);
    // The evaluator projection deliberately cannot invent PDF/image geometry or cells.
    const highlightEvidence=presence==='present' ? projectCitations(observedHighlights?.get(item.id),names) : [];
    const classification=criterion?.classificationStatus;
    return {criterionLabel:criterion?.label??item.label??'',sampleName:observedSamples?.byItemId?.get(item.id)??'',sourceValue:typeof item.value==='string'?item.value:'',unit:item.unit??'',comparison:criterion?.comparison??null,conditions:criterion?.conditions??[],categoryPath:criterion?.categoryPath??[],classificationStatus:classification==='resolved'?'classified':classification==='not_applicable'?'not_applicable':'uncertain',presence,status:['pass','fail','review'].includes(item.status)?item.status:'review',...(typeof item.missingVerified==='boolean'?{missingVerified:item.missingVerified}:{}),criterionEvidence:projectCitations(criterion?.sourceEvidence,names),valueEvidence,highlightEvidence};
  });
  const coverage=request.documents.map((input,index)=>{
    const doc=documents[index],analyzed=doc&&run?.analyzedDocuments?.get(doc.id),observed=analyzed?.analysis?.coverage;
    const discovery=doc&&run?.criteriaDiscovery?.find(report=>report.documentId===doc.id)?.coverage;
    // Only explicit reader/context instrumentation is promoted to coverage. Local
    // previews, result counts and evaluator source cells are never substitutes.
    const profile=analyzed?.sandboxProfile;
    const recorded=profile?.sha256===input.sha256&&Array.isArray(profile.sheets)
      ?profile.sheets.flatMap(sheet=>(sheet.rows??[]).flatMap(row=>(row.cells??[]).map(cell=>({sheet:sheet.name,cell:cell.cell}))))
      :observed?.coveredCells??[];
    const coveredCells=Array.isArray(recorded)?[...new Map(recorded.filter(c=>typeof c.sheet==='string'&&typeof c.cell==='string'&&/^[A-Z]+[1-9][0-9]*$/.test(c.cell)).map(c=>[`${c.sheet}\0${c.cell}`,{sheet:c.sheet,cell:c.cell}])).values()]:[];
    return {file:input.file,inputSha256:input.sha256,readerComplete:observed?.readerComplete===true,contextComplete:observed?.contextComplete===true,criteriaComplete:input.role==='criteria'&&discovery?.extractedCriteriaComplete===true,coveredCells};
  });
  const completion=error?'failed':snapshot?.status==='cancelled'?'cancelled':snapshot?.status==='completed'?'completed':snapshot?.status==='partial'?'partial':'failed';
  return {schemaVersion:'1.0',runId,completion,items,coverage,...(error?{error:{code:error.code??'CONTRACT_EXECUTION_FAILED'}}:{}),observations:{implementationRunId:snapshot?.id??null,runStatus:snapshot?.status??null,stage:snapshot?.stage??null,documentStates:(snapshot?.documents??[]).map(d=>({id:d.id,status:d.status,...(d.error?{error:d.error}:{})})),approvalAudit:run?.audit?.filter(a=>a.action==='criteria.confirmed')??[],sampleObservations:observedSamples?.observations??[],projectionLimitations:['coveredCells contains exact physically returned source cell records; it does not assert semantic understanding of each cell.','A blank projected sampleName means unobserved unless a source-bound sample observation is recorded; it is not an asserted product limitation.','PDF/image evidence cannot be expressed by the spreadsheet-only evaluation citation schema.','This projection does not itself certify browser highlighting or provider execution.']}};
}
async function resolveRuntime(root,context) {
  if(context.runtime?.analyzer)return context.runtime;
  if(context.analyzer)return{analyzer:context.analyzer,config:context.config??{},geminiConfigured:true};
  // A root-owned factory may be injected by an explicitly launched live runner.
  // The harness's label "live" alone never authorizes provider calls or bypasses cost control.
  if(typeof context.createRuntime==='function')return context.createRuntime({root,signal:context.signal});
  if(context.providerMode==='live'||process.env.GSPEC_ACCEPTANCE_PROVIDER_MODE==='live') {
    const [{createServiceRuntime},{createDocumentAnalyzer}]=await Promise.all([
      import(pathToFileURL(path.join(root,'scripts/provider-runtime.mjs')).href),
      import(pathToFileURL(path.join(root,'server/document-analyzer.mjs')).href),
    ]);
    const service=await createServiceRuntime({live:true});
    return{...service,geminiConfigured:true,analyzer:createDocumentAnalyzer({gemini:service.gemini,withSandbox:service.withSandbox,activityStore:service.activityStore})};
  }
  throw Object.assign(new Error('An explicit, budget-controlled runtime or deterministic dependency injection is required.'),{code:'ACCEPTANCE_RUNTIME_NOT_CONFIGURED'});
}
export async function runContract(request,context={}) {
  const {inputDirectory,runId,signal}=context;
  if(request?.schemaVersion!=='1.0'||!Array.isArray(request.documents)||!request.documents.length||typeof inputDirectory!=='string'||typeof runId!=='string'||!runId)throw Object.assign(new Error('Invalid contract request.'),{code:'CONTRACT_REQUEST_INVALID'});
  if(request.documents.some(d=>typeof d.file!=='string'||!['criteria','target'].includes(d.role)||!HASH.test(d.sha256??''))||new Set(request.documents.map(d=>d.file)).size!==request.documents.length)throw Object.assign(new Error('Invalid input identity.'),{code:'CONTRACT_INPUT_INVALID'});
  const documents=[],inputNames=[],root=context.implementationRoot??ROOT;let engine,run,snapshot,error,runtime;
  const abort=()=>{if(run)engine.cancel(run.id);};
  try {
    signal?.throwIfAborted();
    const bytes=[];
    for(const input of request.documents) {
      const buffer=await readFile(await safeFile(inputDirectory,input.file));
      if(sha256(buffer)!==input.sha256)throw Object.assign(new Error('Input digest mismatch.'),{code:'CONTRACT_INPUT_DIGEST'});
      bytes.push(buffer);
    }
    runtime=await resolveRuntime(root,context);
    const [{DocumentStore},{ReviewEngine}]=await Promise.all([import(pathToFileURL(path.join(root,'server/documents.mjs')).href),import(pathToFileURL(path.join(root,'server/review.mjs')).href)]);
    const store=new DocumentStore();
    engine=new ReviewEngine({documents:store,analyzer:runtime.analyzer,config:runtime.config??{},geminiConfigured:runtime.geminiConfigured??true,gemini:runtime.gemini});
    for(const [index,input]of request.documents.entries()){documents.push(await store.add({name:path.basename(input.file),role:input.role,buffer:bytes[index]}));inputNames.push(input.file);}
    run=engine.start({mode:'criteria_first',criteriaDocumentIds:documents.filter(d=>d.role==='criteria').map(d=>d.id),criteriaText:request.criteriaText??''});
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    await run.job;signal?.throwIfAborted();snapshot=engine.snapshot(run.id);
    if(snapshot.status!=='awaiting_confirmation')throw Object.assign(new Error('Criteria preparation did not reach approval.'),{code:'CONTRACT_CRITERIA_NOT_READY'});
    // Automated evaluator action, explicitly recorded by the real engine's audit.
    // No oracle correction, candidate replacement or fabricated criterion is supplied.
    engine.confirm(run.id,{expectedCriterionVersion:snapshot.criterionVersion});
    snapshot=engine.snapshot(run.id);
    engine.attachDocuments(run.id,{expectedCriterionVersion:snapshot.criterionVersion,documentIds:documents.filter(d=>d.role==='target').map(d=>d.id)});
    await run.job;signal?.throwIfAborted();snapshot=engine.snapshot(run.id);
    for(const input of request.documents)if(sha256(await readFile(await safeFile(inputDirectory,input.file)))!==input.sha256)throw Object.assign(new Error('Input mutated during execution.'),{code:'CONTRACT_INPUT_MUTATED'});
  } catch(cause) {error=cause;if(run)snapshot=engine.snapshot(run.id);}
  finally {signal?.removeEventListener('abort',abort);await runtime?.close?.();}
  const observedSamples=typeof context.observeSamples==='function'?context.observeSamples({snapshot,run,documents,inputNames}):undefined;
  const result=projectContractResult({request,runId,snapshot,run,documents,inputNames,error,observedSamples});
  if(signal?.aborted)result.completion='cancelled';
  return result;
}

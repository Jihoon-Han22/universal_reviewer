import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readRef, writeJson } from './shared.mjs';

export function partialMatch(actual, expected) {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value,index)=>partialMatch(actual[index],value));
  if (expected && typeof expected === 'object') return !!actual && typeof actual === 'object' && Object.entries(expected).every(([key,value])=>Object.hasOwn(actual,key)&&partialMatch(actual[key],value));
  return isDeepStrictEqual(actual,expected);
}
function hasProperty(value, selector) {
  for (const key of selector.replace(/\[(\d+)\]/g,'.$1').split('.')) {
    if (!value || typeof value!=='object' || !Object.hasOwn(value,key)) return false;
    value=value[key];
  }
  return true;
}
export async function executeCommand(command, {root,signal,timeoutMs=300000}) {
  signal?.throwIfAborted();
  return new Promise(resolve=>{
    const startedAt=new Date().toISOString(); let stdout='',stderr='',outputBytes=0,termination=null,settled=false;
    const child=spawn(command[0],command.slice(1),{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const stop=reason=>{ termination??=reason; child.kill(); };
    const abort=()=>stop('ABORTED'); signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>stop('TIMEOUT'),timeoutMs);
    const finish=(exitCode,error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve({command,startedAt,endedAt:new Date().toISOString(),exitCode,stdout,stderr,error:termination??error??null});};
    for (const [stream,key] of [[child.stdout,'stdout'],[child.stderr,'stderr']]) stream.on('data',bytes=>{outputBytes+=bytes.length;if(outputBytes>8*1024*1024)return stop('OUTPUT_LIMIT');if(key==='stdout')stdout+=bytes.toString();else stderr+=bytes.toString();});
    child.on('error',error=>finish(null,error.code??'PROCESS_FAILED'));
    child.on('close',code=>finish(code));
  });
}
async function executeAlgorithm(root,definition) {
  const algorithms=await import(pathToFileURL(path.join(root,'server/algorithms.mjs')).href);
  if (definition.driver==='rule') {
    if(typeof algorithms.parseRule!=='function') return {notRun:'MISSING_PARSE_RULE'};
    const result=algorithms.parseRule(definition.input.raw);
    return {actual:{comparison:result.comparison??null,needsConfirmation:result.needsConfirmation},expected:definition.expected};
  }
  const catalog=JSON.parse(await readFile(path.join(root,'architecture/contracts/algorithm-edge-cases.json'),'utf8'));
  const fixture=catalog.fixtures.find(f=>f.id===definition.fixtureId);
  if(!fixture || fixture.mode!=='baseline') return {notRun:'MISSING_CURRENT_BASELINE_FIXTURE'};
  const input=structuredClone(fixture.input),expected=structuredClone(fixture.expected);
  let actual;
  if(definition.operation==='validateAssessment') {
    if(typeof algorithms.validateAssessment!=='function') return {notRun:'MISSING_VALIDATE_ASSESSMENT'};
    actual=input.assessments?{statuses:input.assessments.map(a=>algorithms.validateAssessment(a,input.document).status)}:algorithms.validateAssessment(input.assessment,input.document);
  } else if(definition.operation==='preserveSourceConditions') {
    if(typeof algorithms.preserveSourceConditions!=='function')return{notRun:'MISSING_PRESERVE_SOURCE_CONDITIONS'};
    const before=structuredClone(input.criteria),original=input.criteria[0],result=algorithms.preserveSourceConditions(input.criteria,input.documents);
    actual={criteria:result,returnsSameArray:result===input.criteria,mutatesCriterion:result?.[0]===original&&!isDeepStrictEqual(before[0],original)};
  } else if(definition.operation==='validateCriteria') {
    if(typeof algorithms.validateCriteria!=='function')return{notRun:'MISSING_VALIDATE_CRITERIA'};
    actual={criteria:algorithms.validateCriteria(input.criteria)};
  } else if(definition.operation==='normalizeItems') {
    if(typeof algorithms.normalizeItems!=='function')return{notRun:'MISSING_NORMALIZE_ITEMS'};
    actual={items:algorithms.normalizeItems(input.data.items,input.document,input.criteria)};
  } else if(definition.operation==='reviseCriterionDraft') {
    const [{createDocumentAnalyzer},{ReviewEngine},{DocumentStore}]=await Promise.all([
      import(pathToFileURL(path.join(root,'server/document-analyzer.mjs')).href),
      import(pathToFileURL(path.join(root,'server/review.mjs')).href),
      import(pathToFileURL(path.join(root,'server/documents.mjs')).href),
    ]);
    let modelCalls=0,revisionError;
    const pipeline=createDocumentAnalyzer({gemini:{generateJson:async()=>{modelCalls++;return{data:structuredClone(input.modelStub)};}},withSandbox:async()=>{throw new Error('UNEXPECTED_SANDBOX_IN_REVISION_REPLAY');}});
    const analyzer={analyze:async document=>document,discoverCriteria:async()=>({criteria:structuredClone(input.criteria)}),reviseCriteria:async(...args)=>{try{return await pipeline.reviseCriteria(...args);}catch(error){revisionError=error;throw error;}}};
    const engine=new ReviewEngine({documents:new DocumentStore(),analyzer,geminiConfigured:true});
    const run=engine.start({mode:'criteria_first',criteriaText:input.criteria.map(c=>`${c.label}: ${c.rule}`).join('\n')});await run.job;
    if(run.status!=='awaiting_confirmation')throw new Error('REVISION_REPLAY_NOT_READY');
    const draft=structuredClone(run.criteria);
    engine.revise(run.id,{expectedCriterionVersion:run.criterionVersion,feedback:input.feedback});await run.job;
    actual={criteria:engine.snapshot(run.id).criteria,modelCalls,humanApprovalRequired:run.status==='awaiting_confirmation'&&run.approvedCriteria===null,draftUnchanged:isDeepStrictEqual(run.criteria,draft),...(revisionError?{errorCode:revisionError.code??revisionError.name}:{})};
  } else return {notRun:`NO_EXECUTABLE_BINDING:${definition.operation}`};
  const omittedProperties=expected.omittedProperties??[];delete expected.omittedProperties;
  return {actual,expected,omittedProperties};
}
export async function executeBuiltin(root,definition,{signal,outputDirectory}) {
  const startedAt=new Date().toISOString();
  try {
    for(const reference of [...definition.inputs,...definition.baselineReferences])await readRef(root,reference);
    let result,assertions;
    if(definition.driver==='command') {
      result=await executeCommand(definition.command,{root,signal});
      assertions=[{name:'command exit code',expected:0,actual:result.exitCode,passed:result.exitCode===0&&!result.error}];
    } else {
      result=await executeAlgorithm(root,definition);
      if(result.notRun) return {caseId:definition.id,state:'not_run',errors:[result.notRun],startedAt,endedAt:new Date().toISOString()};
      assertions=[{name:'current baseline projection',expected:result.expected,actual:result.actual,passed:partialMatch(result.actual,result.expected)},...(result.omittedProperties??[]).map(selector=>({name:`omitted ${selector}`,expected:false,actual:hasProperty(result.actual,selector),passed:!hasProperty(result.actual,selector)}))];
    }
    const passed=assertions.every(a=>a.passed);
    const payload={caseId:definition.id,origin:definition.driver==='command'?'actual-node-command':'actual-implementation-deterministic-call',startedAt,endedAt:new Date().toISOString(),inputs:definition.inputs,baselineReferences:definition.baselineReferences,initialState:'fresh deterministic invocation',actions:definition.driver==='command'?[definition.command]:[{operation:definition.operation??'parseRule',input:definition.input??definition.fixtureId}],result,assertions};
    const artifact=await writeJson(root,`${outputDirectory}/${definition.id.replaceAll(':','-')}.json`,payload);
    return {...payload,state:passed?'passed':'failed',artifacts:[artifact],errors:passed?[]:['BASELINE_DIFFERENCE_OR_COMMAND_FAILURE']};
  } catch(error) {
    const missing=['ERR_MODULE_NOT_FOUND','ENOENT'].includes(error.code);
    const payload={caseId:definition.id,state:missing?'not_run':'failed',startedAt,endedAt:new Date().toISOString(),errors:[error.code??error.name??'EXECUTION_FAILED'],message:String(error.message).slice(0,2000)};
    return {...payload,artifacts:[await writeJson(root,`${outputDirectory}/${definition.id.replaceAll(':','-')}.json`,payload)]};
  }
}

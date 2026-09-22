import {analyzeDocumentInSandbox,isVisualDocument} from './sandbox-documents.mjs';
import {transcribeVisualDocument,applyVisualAnalysis} from './visual-transcription.mjs';
import {discoverWorkbookCriteria} from './criteria-sandbox.mjs';
import {prompt,schemas,criteriaSchemas,systemInstruction} from './pipeline-prompts.mjs';
import * as algorithms from './algorithms.mjs';
import {observeActivity} from '../integrations/src/index.mjs';
const abort=signal=>{if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');};
export class CriteriaRevisionError extends Error {constructor(code,message,status=400){super(message);this.name='CriteriaRevisionError';this.code=`CRITERIA_REVISION_${code}`;this.status=status;}}
export function completeAnalysis(document){const a=document.analysis,c=a?.coverage,p=document.sandboxProfile;return p?.coverage?.complete===true&&p.status!=='unsupported'&&a?.status==='complete'&&c?.complete===true&&c.readerComplete===true&&c.contextComplete===true&&c.sourceTruncated!==true&&c.truncated!==true&&p.coverage.truncated!==true&&c.visualAnalysisPending!==true&&!(Number.isFinite(c.sourceChars)&&Number.isFinite(c.contextChars)&&c.contextChars<c.sourceChars)&&!(Number.isFinite(c.contextSegmentsTotal)&&Number.isFinite(c.contextSegmentsRead)&&c.contextSegmentsRead<c.contextSegmentsTotal)&&!c.missingContextSheets?.length&&a.needsConfirmation!==true&&(a.quality===undefined||a.quality.status==='verified')&&(a.questions===undefined||Array.isArray(a.questions)&&!a.questions.length);}
export function prepareEligibilityInput(document){const parts=(document.modelParts||[]).map(part=>part.text?{text:part.text.replace(/^(DOCUMENT_ID: [^\n]*\n)DOCUMENT_NAME: [^\n]*\n(DOCUMENT_KIND: [^\n]*\n)DOCUMENT_ROLE: [^\n]*\n/,'$1$2')}:part);const text=parts.reduce((n,p)=>n+(p.text?.length||0),0),binary=parts.reduce((n,p)=>n+(p.inlineData?Buffer.from(p.inlineData.data,'base64').length:0),0);return {parts,complete:parts.length<=64&&text<=160000&&binary<=8*1024*1024};}
export async function assessCriteriaDocument(document,{gemini,signal,report=()=>{},commonSystem=true}={}){
  const input=prepareEligibilityInput(document),uncertain=reason=>({documentId:document.id,name:document.name,status:'uncertain',reason,evidence:[]});
  if(!input.complete)return uncertain('전체 원문이 자격 판별 입력 한도를 초과하여 기준서 여부를 확인해야 합니다.');
  let repair='';for(let attempt=0;attempt<2;attempt++){
    abort(signal);report({step:'eligibility',status:'running',title:'기준서 자격 판별',documentId:document.id});
    let response;try{response=await gemini.generateJson({role:'extract',schema:criteriaSchemas['criteria-eligibility.SCHEMA'],systemInstruction:systemInstruction('criteria-eligibility.SYSTEM',commonSystem),contents:[{text:prompt('criteria-eligibility.assess',{repair,document,completeAnalysis})},...input.parts],maxOutputTokens:4096,signal});}catch(error){abort(signal);if(attempt===0&&error.code==='INVALID_RESPONSE'){repair=prompt('criteria-eligibility.repair',{result:{reason:'모델 응답 형식이 올바르지 않습니다.'}});continue;}return uncertain('기준서 자격 판별 요청을 완료하지 못했습니다.');}
    try{return algorithms.validateAssessment(response.data,document,{inputComplete:input.complete,strict:true});}catch{if(attempt===0){repair=prompt('criteria-eligibility.repair',{result:{reason:'응답의 출처, 인용 또는 자격 판단을 검증하지 못했습니다.'}});continue;}return uncertain('원문 근거로 기준서 자격을 확정하지 못했습니다.');}
  }
}
async function workers(values,work){const results=Array(values.length);let next=0;await Promise.all(Array.from({length:Math.min(2,values.length)},async()=>{for(;;){const index=next++;if(index>=values.length)return;results[index]=await work(values[index],index);}}));return results;}
function criterionEvaluationView(criterion){return algorithms.semanticCriteria([criterion])[0];}
function groupFor(criterion,documents){return algorithms.criterionSourceGroup(criterion,documents);}
export function createDocumentAnalyzer({gemini,withSandbox,activityStore}={}){
  if(!gemini?.generateJson||typeof withSandbox!=='function')throw new Error('Document analyzer needs Gemini and sandbox adapters');
  function scopedModel(options,document,phase){return {generateJson:request=>observeActivity({kind:'document',runtime:'gemini',title:phase||'문서 모델 분석',runId:options.runId,contextId:options.contextId||document?.id||options.runId,documentId:document?.id,documentName:document?.name,parentTaskId:document?.activityContext?.taskId},()=>gemini.generateJson(request),{signal:options.signal,store:activityStore,deferStart:true})};}
  return {
    async analyze(document,options={}){
      abort(options.signal);const {analysisPromise,sandboxAnalysisResult,previousAnalysis,...original}=document;
      const model=scopedModel(options,document,'문서 구조 분석'),result=await analyzeDocumentInSandbox(original,{...options,gemini:model,withSandbox}),analyzed={...original,...result,sandboxProfile:result.profile};delete analyzed.profile;
      if(isVisualDocument(analyzed)&&analyzed.analysis.status!=='unsupported'){const transcription=await transcribeVisualDocument(analyzed,{...options,gemini:scopedModel(options,document,'원본 시각 전사')});return applyVisualAnalysis(analyzed,transcription);}return analyzed;
    },
    async discoverCriteria(documents,criteriaText='',options={}){
      abort(options.signal);if(!Array.isArray(documents)||documents.length>30||typeof criteriaText!=='string'||criteriaText.length>12000)throw new Error('Invalid criteria discovery input');
      const assessments=await workers(documents,document=>assessCriteriaDocument(document,{...options,gemini:scopedModel(options,document,'기준서 자격 판별')})),eligible=documents.filter((_,i)=>assessments[i].status!=='not_criteria'),otherDocuments=eligible.filter(d=>d.kind!=='xlsx'),reports=[];let criteria=[];
      for(const document of eligible.filter(d=>d.kind==='xlsx')){const result=await discoverWorkbookCriteria(document,{...options,gemini:scopedModel(options,document,'기준 통합문서 탐색'),withSandbox});criteria.push(...result.criteria);reports.push({documentId:document.id,name:document.name,inventory:result.inventory,regionAssessments:result.regionAssessments,coverage:result.coverage,warnings:result.warnings});}
      const model=scopedModel(options,undefined,'기준 추출');
      if(criteria.length&&(criteriaText.trim()||otherDocuments.length)){
        const overlay=(await model.generateJson({role:'extract',schema:schemas.overlaySchema,systemInstruction:systemInstruction(),contents:[{text:prompt('review:text-part:441',{base:criteria,criteriaText,otherDocuments})},...otherDocuments.flatMap(d=>d.modelParts||[])],maxOutputTokens:8000,signal:options.signal})).data;
        if(!Array.isArray(overlay?.changes)||!Array.isArray(overlay?.additions))throw new Error('Invalid criteria overlay');const existing=new Map(criteria.map(c=>[c.id,c]));for(const change of overlay.changes){if(!existing.has(change.id))throw new Error('Unknown criterion overlay ID');existing.set(change.id,{...existing.get(change.id),...change});}criteria=[...existing.values(),...overlay.additions];
      } else if(!criteria.length&&(criteriaText.trim()||otherDocuments.length)) {
        const response=await model.generateJson({role:'extract',schema:schemas.criteriaSchema,systemInstruction:systemInstruction(),contents:['review:text-part:467','review:text-part:469','review:text-part:470','review:text-part:471'].map(id=>({text:prompt(id,{criteriaText,otherDocuments})})).concat(otherDocuments.flatMap(d=>d.modelParts||[])),maxOutputTokens:32768,signal:options.signal});criteria=response.data.criteria;
      }
      criteria=algorithms.validateCriteria(criteria,{allowEmpty:true});for(const criterion of criteria){const source=documents.find(d=>d.id===criterion.sourceDocumentId);if(source)criterion.sourceName=source.name;}
      criteria=algorithms.normalizeHandlingCriteria(algorithms.preserveSourceConditions(criteria,eligible));
      return {criteria,criteriaAssessments:assessments,criteriaDocumentAssessments:assessments,criteriaDiscovery:reports,excludedCriteriaDocuments:assessments.filter(a=>a.status==='not_criteria').map(({documentId,name,reason})=>({documentId,name,reason}))};
    },
    async reviseCriteria(criteria,feedback,options={}){
      const documents=options.documents||[],instruction=String(feedback??'').trim(),originalCriteriaText=options.criteriaText||'',scopeText=options.scope||'',documentId=options.documentId;
      if(!instruction||instruction.length>12000||typeof originalCriteriaText!=='string'||originalCriteriaText.length>12000||typeof scopeText!=='string'||scopeText.length>1000||!Array.isArray(criteria)||criteria.length>250||!Array.isArray(documents)||documents.length>30||criteria.some(c=>typeof c.id!=='string'||!c.id||c.id.length>100||c.id!==c.id.trim())||new Set(criteria.map(c=>c.id)).size!==criteria.length)throw new CriteriaRevisionError('INPUT','기준 수정 입력이 올바르지 않습니다.');
      const originals=structuredClone(criteria),groups=new Map(originals.map(c=>[c.id,groupFor(c,documents)])),selected=originals.filter(c=>documentId===undefined||groups.get(c.id)===documentId),documentsById=new Map(documents.map(d=>[d.id,d])),editable=c=>Object.fromEntries(['id','label','rule','scope','required','conditions','comparison','categoryPath','sampleName','classificationNeedsConfirmation','classificationStatus','needsConfirmation'].filter(key=>Object.hasOwn(c,key)).map(key=>[key,c[key]])),has=(value,key)=>Object.hasOwn(value,key);
      const contents=[{text:prompt('criteria-revision.revise',{originals,instruction,scopeText,originalCriteriaText,documentId,documentsById,selected,editable,has,groups})}];for(const document of documents)contents.push({text:prompt('criteria-revision.document-separator',{document})},...(document.modelParts||[]));
      let response;try{abort(options.signal);response=await scopedModel(options,undefined,'사용자 기준 수정').generateJson({role:'extract',schema:criteriaSchemas['criteria-revision.PATCH_SCHEMA'],systemInstruction:systemInstruction('criteria-revision.SYSTEM'),contents,maxOutputTokens:16384,signal:options.signal});abort(options.signal);}catch{if(options.signal?.aborted)throw new CriteriaRevisionError('ABORTED','기준 수정 요청을 중단했습니다.');throw new CriteriaRevisionError('MODEL','기준 수정 모델 요청을 완료하지 못했습니다.',502);}
      return algorithms.applyCriteriaRevision(originals,response.data,{documents,documentId,feedback:instruction});
    },
    async extractTarget(document,criteria,options={}){
      abort(options.signal);let extraction;const model=scopedModel(options,document,'대상 원문 검토');
      if(isVisualDocument(document)){
        let remaining=150000;const textPages=(document.verificationPages||[]).map(p=>{const text=p.text.slice(0,remaining);remaining-=text.length;return {page:p.page,text,...(text.length<p.text.length?{truncated:true}:{})};}).filter(p=>p.text);
        const contents=[{text:prompt('field-extraction:prompt:162',{document})},...(document.modelParts||[])];if(textPages.length)contents.push({text:prompt('field-extraction:text-part:179',{document,textPages})});
        const result=await model.generateJson({role:'extract',schema:schemas.documentFieldsSchema,systemInstruction:systemInstruction('field-extraction:SYSTEM:5'),contents,maxOutputTokens:14000,signal:options.signal});extraction=algorithms.normalizeDocumentExtraction(result.data,document);document={...document,extraction};options.onExtraction?.(extraction);
      }
      options.onReview?.();const records=document.kind==='xlsx'?algorithms.recordRows(document):[],run={criteria},contents=[{text:prompt('review:text-part:533',{document,run,criterionEvaluationView})},{text:prompt('review:text-part:536')},{text:prompt('review:text-part:537')}];
      if(extraction)contents.push({text:prompt('review:text-part:535',{extraction})});if(document.kind==='csv'&&document.sourceRows?.length)contents.push({text:prompt('review:text-part:538',{document})});if(document.kind==='xlsx'&&records.length)contents.push({text:prompt('review:text-part:539',{records})});contents.push(...(document.modelParts||[]));
      const response=await model.generateJson({role:'extract',schema:schemas.itemSchema,systemInstruction:systemInstruction(),contents,maxOutputTokens:criteria.length>50?32768:12000,signal:options.signal});return {data:response.data,...(extraction?{extraction}:{}),model:response.model,usage:response.usage};
    }
  };
}

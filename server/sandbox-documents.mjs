import {documentSandboxResources,SandboxDocumentError} from './document-sandbox-resources.mjs';
import {profileSource,sourceSegments,profileDocumentSources,documentHeader,publicInventory,SOURCE_CHUNK} from './document-source.mjs';
import {validateDocumentContext,verifyDocumentContext} from './document-quality.mjs';
import {prompt,schemas,systemInstruction} from './pipeline-prompts.mjs';
export {profileSource,profileDocumentSources} from './document-source.mjs';
export {validateDocumentContext} from './document-quality.mjs';
export {SandboxDocumentError};
export const isVisualDocument=document=>['pdf','png','jpg','jpeg','webp'].includes(document.kind);
export async function analyzeDocumentInSandbox(document,{gemini,withSandbox,signal,runId,contextId=document.id,report=()=>{},commonSystem=true,sessionTimeoutMs=300000}={}) {
  const wallTimeoutMs=Number.isFinite(sessionTimeoutMs)&&sessionTimeoutMs>=1&&sessionTimeoutMs<=300000?sessionTimeoutMs:300000;
  const deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(new SandboxDocumentError('문서 분석 제한 시간을 초과하여 같은 샌드박스의 작업을 종료했습니다.','SANDBOX_DOCUMENT_TIMEOUT')),wallTimeoutMs),combined=signal?AbortSignal.any([signal,deadline.signal]):deadline.signal;
  try{return await withSandbox(async(sandbox,sandboxReport)=>{
    const emit=event=>{sandboxReport(event);report(event);},activityContext={documentId:document.id,documentName:document.name,...(runId?{runId}:{}),contextId,...(sandboxReport.taskId?{taskId:sandboxReport.taskId}:{})};
    const resources=documentSandboxResources(sandbox,document,{signal:combined,report:emit}),profile=await resources.read(),split=sourceSegments(profileSource(profile)),header=documentHeader(document),images=[],pdfPageImages=[];
    let attachmentBytes=0;
    for(const img of profile.images||[]) {
      if(!/^\/home\/user\/document-image-\d+\.png$/.test(img.path)||img.mime!=='image/png'){profile.coverage.complete=false;profile.warnings.push('검증되지 않은 보조 이미지가 제외되었습니다.');continue;}
      if(img.sourceKind==='pdf-page'&&(document.kind!=='pdf'||!Number.isInteger(img.page)||img.page<1||!Number.isInteger(Number(profile.inventory.pageCount))||Number(profile.inventory.pageCount)<1||img.page>Number(profile.inventory.pageCount))){profile.coverage.complete=false;profile.warnings.push('원본 페이지에 연결되지 않은 이미지가 제외되었습니다.');continue;}
      const bytes=Buffer.from(await sandbox.files.read(img.path,{format:'bytes'}));attachmentBytes+=bytes.length;
      if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||attachmentBytes>16*1024*1024){profile.coverage.complete=false;profile.coverage.truncated=true;profile.warnings.push('보조 이미지 형식 또는 첨부 한도로 일부 이미지를 읽지 못했습니다.');continue;}
      const data=bytes.toString('base64');if(img.sourceKind==='pdf-page')pdfPageImages.push({page:img.page,mimeType:'image/png',data});else images.push({text:'EMBEDDED ORIGINAL IMAGE '+JSON.stringify({...img,path:undefined})},{inlineData:{mimeType:'image/png',data}});
    }
    let context={summary:'',documentType:document.kind,structure:[],warnings:[],questions:[]},initialChunksRead=0,quality;
    const supported=profile.status!=='unsupported',visual=isVisualDocument(document);
    if(supported&&!visual){const contexts=[];for(let index=0;index<split.chunks;index++){combined.throwIfAborted();emit({step:'structure',phase:'context',status:'running',title:`문서 구조 해석 ${index+1}/${split.chunks}`});try{const response=await gemini.generateJson({role:'extract',schema:schemas.documentContextSchema,systemInstruction:systemInstruction('sandbox-documents:CONTEXT_SYSTEM:35',commonSystem)+'\n\n'+prompt('document-quality:DOCUMENT_UNIT_POLICY:10'),contents:[{text:prompt('sandbox-documents:text-part:307',{header,index,chunks:split.chunks,profile,retainedSource:split.retainedSource})},...(index===0?images:[])],maxOutputTokens:9000,signal:combined});contexts.push(validateDocumentContext(response.data,profile));initialChunksRead++;}catch{combined.throwIfAborted();context.warnings.push(`원문 구간 ${index+1}의 구조 해석이 완료되지 않았습니다.`);}}
      context={summary:contexts.map(c=>c.summary).join('\n').slice(0,8000),documentType:contexts.find(c=>c.documentType)?.documentType||document.kind,structure:contexts.flatMap(c=>c.structure),warnings:[...context.warnings,...contexts.flatMap(c=>c.warnings)],questions:contexts.flatMap(c=>c.questions)};
      const verified=await verifyDocumentContext({document,profile,context,source:split.retainedSource,sourceTruncated:split.sourceTruncated,initialChunksRead,gemini,requery:resources.requery,images,signal:combined,report:emit,commonSystem});context=verified.context;quality=verified.quality;
    }
    const missingContextSheets=visual?[]:(profile.sheets||[]).filter(s=>(s.rows?.some(r=>r.cells?.length)||s.imageInventory?.length)&&!context.structure.some(e=>e.sheet===s.name)).map(s=>s.name),readerComplete=profile.coverage.complete===true,contextComplete=supported&&!visual&&quality?.status==='verified'&&!split.sourceTruncated&&!missingContextSheets.length,complete=readerComplete&&contextComplete;
    const analysis={status:!supported?'unsupported':complete?'complete':'partial',summary:context.summary.slice(0,8000),documentType:context.documentType,structure:context.structure.slice(0,1000),inventory:publicInventory(profile.inventory),warnings:[...new Set([...profile.warnings,...context.warnings])].slice(0,100).map(v=>String(v).slice(0,1000)),questions:context.questions.slice(0,40),needsConfirmation:!complete,...(quality?{quality}:{}),coverage:{...profile.coverage,complete,readerComplete,contextComplete,contextSegmentsTotal:split.chunks,contextSegmentsRead:quality?.status==='verified'?split.chunks:initialChunksRead,initialContextSegmentsRead:initialChunksRead,sourceChars:split.sourceChars,contextChars:split.contextChars,sourceTruncated:split.sourceTruncated,missingContextSheets,visualAnalysisPending:visual&&supported}};
    const modelParts=[{text:header+split.retainedSource},...images];if(visual)modelParts.push({inlineData:{mimeType:document.mime,data:Buffer.from(document.buffer).toString('base64')}});
    return {analysis,modelParts,profile,activityContext,...profileDocumentSources(profile),...(pdfPageImages.length?{pdfPageImages}:{})};
  },{signal:combined,timeoutMs:300000,activity:{kind:'document',title:'원본 문서 분석',documentId:document.id,documentName:document.name,runId,contextId}});}catch(error){
    if(error?.code==='CLEANUP_FAILED')throw error;
    if(deadline.signal.aborted&&combined.reason===deadline.signal.reason)throw deadline.signal.reason;
    throw error;
  }finally{clearTimeout(timer);}
}

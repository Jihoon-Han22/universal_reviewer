import {createHash} from 'node:crypto';
import {displayedValue,sourceLines,parseRange,parseAddress,inRange,SOURCE_CHUNK} from './document-source.mjs';
import {selectRequeryRequests} from './document-requery.mjs';
import {prompt,schemas,systemInstruction} from './pipeline-prompts.mjs';
const norm=value=>String(value??'').normalize('NFKC').replace(/[\s\p{P}\u200B-\u200D\uFEFF]+/gu,'').toLowerCase();
const strings=(values,count,length)=>{if(!Array.isArray(values)||values.length>count)throw new Error('Document context list limit');return values.map(v=>String(v??'').slice(0,length));};
export function validateDocumentContext(raw,profile,{maxStructure=160}={}) {
  if(!raw||typeof raw.summary!=='string'||raw.summary.length>4000||typeof raw.documentType!=='string'||raw.documentType.length>200||!Array.isArray(raw.structure)||raw.structure.length>maxStructure)throw new Error('Invalid document context');
  const pages=Number(profile.inventory?.pageCount)||profile.pages?.length||0;
  return {summary:raw.summary,documentType:raw.documentType,structure:raw.structure.map(region=>{
    if(!region||typeof region.name!=='string'||region.name.length>240||typeof region.description!=='string'||region.description.length>2000||typeof region.uncertain!=='boolean')throw new Error('Invalid structure region');
    const result={name:region.name,kind:['table','text','metadata','image','list','other'].includes(region.kind)?region.kind:'other',headers:strings(region.headers,100,300),description:region.description,orientation:['horizontal','vertical','mixed','unknown'].includes(region.orientation)?region.orientation:'unknown',uncertain:region.uncertain};
    if(region.sheet!==undefined){if(!(profile.sheets||[]).some(s=>s.name===region.sheet))throw new Error('Unknown source sheet');result.sheet=region.sheet;}
    if(region.page!==undefined&&pages>0&&!['xlsx','csv','docx'].includes(profile.kind)){if(!Number.isInteger(region.page)||region.page<1||region.page>pages)throw new Error('Unknown source page');result.page=region.page;}
    if(region.range!==undefined){if(typeof region.range!=='string'||region.range.length>180)throw new Error('Invalid source range');result.range=region.range;}
    return result;
  }),warnings:strings(raw.warnings,50,1000),questions:strings(raw.questions,20,1000)};
}
export function checkDocumentContext(context,profile,{sourceTruncated=false,contextSegmentsComplete=true}={}) {
  const issues=[],add=(code,message,request)=>issues.push({code,message,...(request?{request}:{})});
  if(profile.coverage?.complete!==true||sourceTruncated)add('source_limit','원문 읽기 또는 문맥 입력 한도에 도달했습니다.');
  if(!contextSegmentsComplete)add('context_incomplete','일부 원문 구간의 구조 해석이 완료되지 않았습니다.');
  if(!context.structure?.length)add('missing_region','원문 구조 해석이 비어 있습니다.');
  for(const entry of context.structure||[]){if(entry.uncertain)add('ambiguity',`${entry.name}: 구조 해석 확인이 필요합니다.`);if(entry.sheet&&!(profile.sheets||[]).some(s=>s.name===entry.sheet))add('wrong_header','실제 없는 시트가 참조되었습니다.');}
  for(const sheet of profile.sheets||[]) {
    const cells=(sheet.rows||[]).flatMap(row=>row.cells),entries=(context.structure||[]).filter(e=>e.sheet===sheet.name),ranges=[];
    if((cells.length||sheet.imageInventory?.length)&&!entries.length)add('missing_region',`${sheet.name}: 시트 해석이 없습니다.`);
    for(const entry of entries){const range=parseRange(entry.range);if(!range){add('missing_region',`${sheet.name}: 유효한 셀 범위가 없습니다.`);continue;}ranges.push(range);if(entry.kind==='table'&&!entry.headers.length)add('wrong_header',`${sheet.name} ${entry.range}: 표 머리글이 없습니다.`,{kind:'sheet',sheet:sheet.name,range:entry.range});
      for(const header of entry.headers){const match=header.match(/\$?[A-Z]{1,3}\$?[1-9]\d*/i),cell=match&&cells.find(c=>c.cell===parseAddress(match[0])?.address);if(!cell||!norm(displayedValue(cell))||!norm(header).includes(norm(displayedValue(cell))))add('wrong_header',`${sheet.name}: 머리글 위치와 원문이 일치하지 않습니다.`,{kind:'sheet',sheet:sheet.name,range:range.range});}
    }
    for(const cell of cells)if(!ranges.some(range=>inRange(cell.cell,range))) {add('missing_region',`${sheet.name}!${cell.cell}: 구조 설명에 없는 원문 셀입니다.`,{kind:'sheet',sheet:sheet.name,range:cell.cell});if(issues.length>=100)break;}
  }
  if(profile.blocks?.length){const covered=(context.structure||[]).map(e=>/^BLOCK([1-9]\d*):BLOCK([1-9]\d*)$/i.exec(e.range||'')).filter(Boolean).map(m=>[+m[1],+m[2]]).filter(([a,b])=>a<=b&&b<=profile.blocks.length);for(const block of profile.blocks)if((block.text?.trim()||block.rows?.length)&&!covered.some(([a,b])=>block.index>=a&&block.index<=b))add('missing_region',`BLOCK${block.index}: 구조 설명에서 빠졌습니다.`,{kind:'blocks',start:block.index,end:block.index});}
  if(profile.text){const lines=sourceLines(profile.text),ranges=(context.structure||[]).map(e=>/^L([1-9]\d*):L([1-9]\d*)$/i.exec(e.range||'')).filter(Boolean).map(m=>[+m[1],+m[2]]).filter(([a,b])=>a<=b&&b<=lines.length).sort((a,b)=>a[0]-b[0]);let index=0,end=0;for(let n=1;n<=lines.length;n++){while(index<ranges.length&&ranges[index][0]<=n)end=Math.max(end,ranges[index++][1]);if(lines[n-1].trim()&&end<n)add('missing_region',`L${n}: 구조 설명에서 빠졌습니다.`,{kind:'text',start:n,end:n});if(issues.length>=100)break;}}
  for(const question of context.questions||[])add('ambiguity',question);
  return issues;
}
export function isQualitativeBlankUnit(issue,profile) {
  if(issue.code!=='missing_unit'||!issue.unitEvidence)return false;
  const e=issue.unitEvidence,sheet=profile.sheets?.find(s=>s.name===e.sheet),c=parseAddress(e.criterionCell),u=parseAddress(e.unitCell),h=parseAddress(e.unitHeaderCell);
  if(!sheet||!c||!u||!h||!(c.row===u.row&&h.col===u.col||c.col===u.col&&h.row===u.row))return false;
  const cells=sheet.rows.flatMap(r=>r.cells),criterion=cells.find(v=>v.cell===c.address),unit=cells.find(v=>v.cell===u.address),header=cells.find(v=>v.cell===h.address);
  if(!criterion||!header||!['단위','unit','units'].includes(norm(displayedValue(header)))||!['정상','적합','이상없음','yes','no','양호','true','false'].includes(norm(e.quote))||norm(e.quote)!==norm(displayedValue(criterion)))return false;
  if(unit&&(displayedValue(unit).trim()||unit.formula||unit.comment))return false;
  for(const value of sheet.mergedRanges||[]){const range=parseRange(value);if(range&&inRange(u.address,range)){const master=cells.find(v=>v.cell===range.start.address);if(master&&(displayedValue(master).trim()||master.formula||master.comment))return false;}}
  return true;
}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
function abort(signal){if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');}
export async function verifyDocumentContext({document,profile,context:initial,source,sourceTruncated=false,initialChunksRead,gemini,requery,images=[],signal,report=()=>{},commonSystem=true}) {
  const segments=Math.max(1,Math.ceil(source.length/SOURCE_CHUNK)),rounds=[];let context=initial,segmentsComplete=initialChunksRead===segments,previous='',issues=[],status='needs_review';
  for(let attempt=1;attempt<=3;attempt++) {
    abort(signal);report({step:'quality',phase:'context',status:'running',attempt,maxAttempts:3,title:'문서 구조 독립 검증'});
    issues=checkDocumentContext(context,profile,{sourceTruncated,contextSegmentsComplete:segmentsComplete});
    for(let index=0;index<segments;index++)try{const response=await gemini.generateJson({role:'extract',schema:schemas.documentContextReviewSchema,systemInstruction:systemInstruction('document-quality:REVIEW_SYSTEM:188',commonSystem),contents:[{text:prompt('document-quality:text-part:212',{document,profile,context,index,segments,source})},...(index===0?images:[])],maxOutputTokens:6000,signal});const result=response.data;if(result?.checked!==true||!Array.isArray(result.issues)||result.issues.length>80)throw new Error('Invalid verifier result');for(const issue of result.issues){if(typeof issue.code!=='string'||typeof issue.message!=='string')throw new Error('Invalid verifier issue');if(!isQualitativeBlankUnit(issue,profile))issues.push({code:issue.code,message:issue.message.slice(0,2000),...(issue.request?{request:issue.request}:{})});}}catch{abort(signal);issues.push({code:'review_failed',message:'독립 문맥 검증 요청을 완료하지 못했습니다.'});}
    issues=[...new Map(issues.map(i=>[i.code+'|'+norm(i.message),i])).values()].slice(0,80);
    const fingerprint=createHash('sha256').update(JSON.stringify(stable({structure:context.structure,issues:issues.map(i=>({code:i.code,request:i.request})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))}))).digest('hex');
    if(!issues.length){status='verified';rounds.push({attempt,status:'verified',issueCount:0,rereadRanges:[]});break;}
    if(issues.some(i=>i.code==='source_limit')){status='limited';rounds.push({attempt,status:'needs_review',issueCount:issues.length,rereadRanges:[]});break;}
    if(attempt===3||fingerprint===previous){rounds.push({attempt,status:'needs_review',issueCount:issues.length,rereadRanges:[]});break;}
    previous=fingerprint;const requests=selectRequeryRequests(issues,profile),rangeLabels=requests.map(r=>r.kind==='sheet'?`${r.sheet}!${r.range}`:`${r.kind}:${r.start}-${r.end}`),round={attempt,status:'retry',issueCount:issues.length,rereadRanges:rangeLabels};rounds.push(round);
    try { if(!requests.length)throw new Error('No valid selectors');const evidence=await requery(requests);abort(signal);if(!evidence.coverage?.complete||!Array.isArray(evidence.selections)||evidence.selections.length!==requests.length){issues.push({code:'source_limit',message:'원문 재조회가 일부 범위를 읽지 못했습니다.'});status='limited';round.status='needs_review';break;}
      const response=await gemini.generateJson({role:'extract',schema:schemas.documentContextSchema,systemInstruction:systemInstruction('sandbox-documents:CONTEXT_SYSTEM:35',commonSystem)+'\n\n'+prompt('document-quality:DOCUMENT_UNIT_POLICY:10'),contents:[{text:prompt('document-quality:text-part:263',{document,profile,context,issues,evidence})},...images],maxOutputTokens:12000,signal});context=validateDocumentContext(response.data,profile);segmentsComplete=true;
    } catch{abort(signal);round.status='needs_review';break;}
  }
  const quality={status,attempts:rounds.length,maxAttempts:3,issues:issues.map(i=>i.message),rounds};report({step:'quality',phase:'context',status:'completed',roundStatus:status==='verified'?'verified':'needs_review',issueCount:issues.length,title:'문서 구조 검증 완료'});return {context,quality,segmentsComplete};
}

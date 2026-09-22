import type {AnalysisActivity,Doc,DocumentStructureRegion,PublicAnalysis} from './types';
export const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
export const plain=(value:unknown)=>typeof value==='string'?value:typeof value==='number'&&Number.isFinite(value)?String(value):'';
export const first=(value:Record<string,any>,keys:string[])=>keys.map(key=>value[key]).find(item=>item!==undefined&&item!==null);
export type InventoryPart={name:string;description:string;sheet?:string;page?:number;range?:string};
export function inventoryParts(value:unknown):InventoryPart[]{const root=record(value),rawSheets=first(root,['sheets','worksheets','sheetInventory']),rawPages=first(root,['pages','pageInventory']);const entries=Array.isArray(value)?value:Array.isArray(rawSheets)?rawSheets:Array.isArray(rawPages)?rawPages:[];return entries.map((entry,index)=>{if(typeof entry==='string')return {name:entry,description:'',...(Array.isArray(rawSheets)?{sheet:entry}:{})};const item=record(entry),sheet=plain(first(item,['sheet','sheetName','name'])),pageValue=first(item,['page','pageNumber','number']),page=typeof pageValue==='number'?pageValue:Array.isArray(rawPages)?index+1:undefined,range=plain(first(item,['range','usedRange','dimension','dimensions'])),rows=plain(first(item,['rows','rowCount','maxRow','max_row'])),cols=plain(first(item,['columns','columnCount','maxColumn','max_column']));return {name:plain(first(item,['title','name','sheet','sheetName']))||(page?`${page}페이지`:`영역 ${index+1}`),description:[rows&&`${rows}행`,cols&&`${cols}열`,range,Array.isArray(item.regions)&&`${item.regions.length}개 영역`,typeof item.mergedRangeCount==='number'&&item.mergedRangeCount>0&&`병합 ${item.mergedRangeCount}곳`,(item.hidden===true||item.state==='hidden'||item.state==='veryHidden')&&'숨김 시트',typeof item.rotation==='number'&&item.rotation!==0&&`회전 ${item.rotation}°`].filter(Boolean).join(' · '),...(Array.isArray(rawSheets)&&sheet?{sheet}:{}),...(page?{page}:{}),...(range?{range}:{})};});}
export type StructureGroup=InventoryPart&{id:string;regions:DocumentStructureRegion[]};
export function structureGroups(analysis:unknown):StructureGroup[]{const root=record(analysis),groups=new Map<string,StructureGroup>(),key=(value:{sheet?:string;page?:number})=>value.sheet?`sheet:${value.sheet}`:value.page?`page:${value.page}`:'document';for(const part of inventoryParts(root.inventory))groups.set(key(part),{...part,id:key(part),regions:[]});for(const region of root.structure||[]){const id=key(region);if(!groups.has(id))groups.set(id,{id,name:region.sheet||(region.page?`${region.page}페이지`:'문서 전체'),description:'',sheet:region.sheet,page:region.page,regions:[]});const group=groups.get(id)!;if(root.transcription&&region.kind==='text'&&region.page&&region.name===`${region.page}쪽`)group.description=[group.description,region.description].filter(Boolean).join(' · ');else group.regions.push(region);}return [...groups.values()];}
export const finishedStatus=(status?:string)=>['ready','complete','completed','analyzed','done'].includes(status||'');
export const attentionStatus=(status?:string)=>['review','needs_confirmation','confirmation','partial','unsupported','failed','blocked','error','limited'].includes(status||'');
export const analysisFinished=(analysis?:PublicAnalysis)=>!!analysis&&finishedStatus(analysis.status)&&(!analysis.quality||analysis.quality.status==='verified');
export function analysisPhase(step:string){if(/quality|validate|repair|retry/.test(step))return 'structure';if(/extract|field|normalize|organize|ground|verif/.test(step))return 'extract';if(/transcri|vision|vlm|content|read_page/.test(step))return 'transcribe';if(/struct|profile|header|explor|inventory|analy|context/.test(step))return 'structure';return 'read';}
// I7: the file row follows its own latest document event, independently of the completion count.
export function analysisFileStatus(documentId:string,analysis:PublicAnalysis|undefined,events:AnalysisActivity[],busy:boolean):string {
 const latest=[...events].reverse().find(event=>event.documentId===documentId);
 if(busy&&latest?.status==='running'&&/reread|repair|retry|quality|validate|verify/.test(latest.step))return latest.step;
 if(analysis?.quality&&analysis.quality.status!=='verified')return analysis.quality.status==='limited'?'limited':'partial';
 if(analysis?.status)return analysis.status;
 if(latest?.status==='failed')return 'failed';
 if(latest&&busy)return latest.step||'reading';
 return 'waiting';
}
export function analysisStatusLabel(status:string):string {
 if(finishedStatus(status))return '완료';
 if(status==='limited')return '검증 제한';
 if(attentionStatus(status))return '확인 필요';
 if(['queued','pending','waiting','idle',''].includes(status))return '대기';
 if(/reread/i.test(status))return '재조회';
 if(/repair|retry/i.test(status))return '보완 중';
 if(/quality|validate|verify/i.test(status))return '검증 중';
 return {read:'탐색 중',structure:'구조 분석',transcribe:'전사',extract:'항목 정리'}[analysisPhase(status)];
}

export function selectedAnalysisDocument(documents:Doc[],events:AnalysisActivity[],selectedId:string|null){return documents.find(doc=>doc.id===selectedId)||[...events].reverse().map(event=>documents.find(doc=>doc.id===event.documentId)).find(Boolean)||documents[0];}
export function readingSummary(analysis?:PublicAnalysis){const coverage=record(analysis?.coverage);if(coverage.readerComplete===false)return '원문 일부 미확인';if(coverage.readerComplete===true&&coverage.complete===false)return coverage.visualAnalysisPending||coverage.transcription?.complete===false?'원본 파일 확인 · 전사 확인 필요':'원문 읽기 완료 · 해석 확인 필요';return '';}
export function coverageRatio(numerator:unknown,denominator:unknown,complete:unknown){return typeof numerator==='number'&&Number.isFinite(numerator)&&typeof denominator==='number'&&Number.isFinite(denominator)&&denominator>0?Math.max(0,Math.min(1,numerator/denominator)):complete===true?1:0;}

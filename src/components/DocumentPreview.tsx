import {useEffect,useMemo,useRef,useState} from 'react';
import {ExternalLink,ChevronLeft,ChevronRight,Minus,Plus,FileText,FileSpreadsheet,Image as ImageIcon,ScanLine} from 'lucide-react';
import {AnimatePresence,motion} from 'motion/react';
import type {PDFDocumentProxy,RenderTask} from 'pdfjs-dist';
import type {Doc,Evidence,Item} from '../types';
import {statusLabels} from './ReviewItems';
import '../visual-contract/src/components/document-preview.css';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {isMissingItem,itemPriority,sourceEvidence,tableEvidenceCells,textMatches,pdfRunBox,pdfHighlightRuns,normalizePreview,previewRenderer,evidenceSheet,requestedPdfPage,sourceChipPdfPage,type PdfTextRun} from '../source-highlights';
import SourceText from './SourceText';
import SourceChips from './SourceChips';
import {useMotionPreference} from '../motion-preference';

export type DocumentPreviewProps={document:Doc|null;stage?:'idle'|'reading'|'extracting'|'reviewing'|'complete';evidence?:Evidence[];items?:Item[];selectedItemId?:string|null;onSelectItem?:(id:string)=>void;compact?:boolean;onPageChange?:(page:number)=>void};
const EMPTY_EVIDENCE:Evidence[]=[],EMPTY_ITEMS:Item[]=[];
export const columnName=(i:number):string=>{let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
function cellPosition(value:string){const m=/^\$?([A-Z]+)\$?(\d+)$/i.exec(value);if(!m)return null;return {col:[...m[1].toUpperCase()].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0)-1,row:Number(m[2])-1};}
export function inCellRange(cell:string|undefined,row:number,col:number){if(!cell)return false;const [a,b]=cell.split(':').map(cellPosition);if(!a)return false;const end=b||a;return row>=Math.min(a.row,end.row)&&row<=Math.max(a.row,end.row)&&col>=Math.min(a.col,end.col)&&col<=Math.max(a.col,end.col);}
export const sourceLocation=(e:Evidence)=>[e.page?`${e.page}쪽`:e.sheet,e.cell].filter(Boolean).join(' · ');

function revealSelected(container:HTMLDivElement|null,reduced:boolean){
 const target=container?.querySelector<HTMLElement>('.is-selected');if(!container||!target)return;
 const bounds=container.getBoundingClientRect(),mark=target.getBoundingClientRect();let top=container.scrollTop,left=container.scrollLeft;
 if(mark.top<bounds.top+40||mark.bottom>bounds.bottom-24)top+=mark.top-bounds.top-Math.min(90,container.clientHeight/4);
 if(mark.left<bounds.left+35||mark.right>bounds.right-12)left+=mark.left-bounds.left-45;
 if(top!==container.scrollTop||left!==container.scrollLeft)container.scrollTo({top:Math.max(0,top),left:Math.max(0,left),behavior:reduced||window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}

function PDFPage({document:doc,sources,items,selectedItemId,onSelectItem,onPageChange,compact}:{document:Doc;sources:Evidence[];items:Item[];selectedItemId?:string|null;onSelectItem?:(id:string)=>void;onPageChange?:(page:number)=>void;compact:boolean}){
 const {enabled}=useMotionPreference();const viewport=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[width,setWidth]=useState(440),[zoom,setZoom]=useState(1),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [dimensions,setDimensions]=useState({width:440,height:620}),[textPositions,setTextPositions]=useState<PdfTextRun[]>([]);
 const callback=useRef(onPageChange);callback.current=onPageChange;
 useEffect(()=>{callback.current?.(page);},[page]);
 useEffect(()=>{const container=viewport.current;if(!container)return;const observer=new ResizeObserver(entries=>{const entry=entries[0];if(entry)setWidth(Math.max(140,entry.contentRect.width));});observer.observe(container);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  let disposed=false,task:ReturnType<typeof import('pdfjs-dist')['getDocument']>|undefined;
  setPdf(null);setPage(1);setZoom(1);setTextPositions([]);setError('');setLoading(true);
  void import('pdfjs-dist').then(async module=>{
   if(disposed)return;module.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
   const root=`${import.meta.env.BASE_URL}pdfjs/${module.version}/`;
   task=module.getDocument({url:doc.url,cMapUrl:root+'cmaps/',cMapPacked:true,standardFontDataUrl:root+'standard_fonts/',wasmUrl:root+'wasm/',iccUrl:root+'iccs/',useSystemFonts:true});
   const loaded=await task.promise;if(!disposed)setPdf(loaded);
  }).catch(()=>{if(!disposed){setError('이 PDF의 미리보기를 열 수 없어요. 원본을 열어 확인해 주세요.');setLoading(false);}});
  return()=>{disposed=true;void task?.destroy();};
 },[doc.url]);
 const sourceKey=JSON.stringify(sources);
 useEffect(()=>{if(!pdf)return;const next=requestedPdfPage(sources.find(source=>source.page)?.page,pdf.numPages);if(next!==null)setPage(next);},[pdf,sourceKey]);
 useEffect(()=>{
  if(!pdf)return;let cancelled=false,render:RenderTask|undefined;setLoading(true);setError('');setTextPositions([]);
  void (async()=>{
   try{
    const pdfPage=await pdf.getPage(page);if(cancelled)return;const base=pdfPage.getViewport({scale:1}),view=pdfPage.getViewport({scale:width*zoom/base.width});
    const element=canvas.current;if(!element)return;const dpr=Math.min(window.devicePixelRatio||1,2);element.width=Math.ceil(view.width*dpr);element.height=Math.ceil(view.height*dpr);setDimensions({width:view.width,height:view.height});
    render=pdfPage.render({canvasContext:element.getContext('2d')!,canvas:element,viewport:view,transform:dpr===1?undefined:[dpr,0,0,dpr,0,0]});await render.promise;if(cancelled)return;setLoading(false);
    // A readable page stays visible when its optional text layer cannot be read.
    try{const content=await pdfPage.getTextContent();if(cancelled)return;setTextPositions(content.items.filter((item):item is typeof item&{str:string}=>'str' in item).map(item=>pdfRunBox(item,view.transform,content.styles)).filter((run):run is PdfTextRun=>run!==null));}catch{if(!cancelled)setTextPositions([]);}
   }catch(reason){if(!cancelled&&(reason as Error).name!=='RenderingCancelledException'){setError('페이지를 표시하지 못했어요. 원본을 열어 확인해 주세요.');setLoading(false);}}
  })();
  return()=>{cancelled=true;render?.cancel();};
 },[pdf,page,width,zoom]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>revealSelected(viewport.current,!enabled));return()=>cancelAnimationFrame(frame);},[selectedItemId,textPositions,enabled]);
 const marks=useMemo(()=>items.slice().sort((a,b)=>itemPriority(b,selectedItemId)-itemPriority(a,selectedItemId)).flatMap(item=>pdfHighlightRuns(textPositions,item,doc.id,page).map((run,index)=>({item,run,index}))),[items,textPositions,doc.id,page,selectedItemId]);
 const selectChip=(id:string)=>{const item=items.find(item=>item.id===id);if(pdf&&item){const next=sourceChipPdfPage(sourceEvidence(item,doc.id),pdf.numPages);if(next!==null)setPage(next);}onSelectItem?.(id);};
 return <><div ref={viewport} className="doc-preview__viewport doc-preview__viewport--pdf">{error?<p className="doc-preview__message" role="status">{error}</p>:<>{loading&&<div className="doc-preview__loading" role="status"><span/>원문을 불러오고 있습니다</div>}<motion.div className={`doc-preview__pdf-paper ${loading?'is-loading':''}`} style={dimensions} initial={enabled?{opacity:0,y:8}:false} animate={{opacity:loading?.35:1,y:enabled&&loading?4:0}} transition={{duration:enabled?.35:0,ease:[.2,.7,.3,1]}}><canvas ref={canvas} className="doc-preview__canvas" style={dimensions} aria-label={`PDF 원문 ${page}페이지. 자세한 내용은 원본 열기로 확인할 수 있습니다.`}/>{!loading&&<div className="doc-preview__pdf-highlights" aria-label="PDF 원문 판정 위치">{marks.map(({item,run,index})=><button type="button" key={`${item.id}-${index}`} className={`doc-preview__pdf-highlight source-mark--${item.status} ${item.id===selectedItemId?'is-selected':''}`} style={{left:run.x,top:run.y,width:run.width,height:run.height}} data-source-highlight-id={item.id} data-source-page={page} tabIndex={index===0?0:-1} aria-label={`${statusLabels[item.status]} · ${item.label} 원문 근거`} title={`${statusLabels[item.status]} · ${item.label}`} onClick={()=>onSelectItem?.(item.id)}/>)}</div>}</motion.div></>}</div><div className="doc-preview__page-controls"><span>PDF 원문</span><div><button type="button" aria-label="이전 페이지" disabled={!pdf||page<=1} onClick={()=>setPage(value=>Math.max(1,value-1))}><ChevronLeft size={15}/></button><span aria-live="polite">{pdf?`${page} / ${pdf.numPages}`:'—'}</span><button type="button" aria-label="다음 페이지" disabled={!pdf||page>=pdf.numPages} onClick={()=>setPage(value=>Math.min(pdf!.numPages,value+1))}><ChevronRight size={15}/></button></div><div className="doc-preview__zoom-controls"><button type="button" aria-label="PDF 축소" disabled={!pdf||zoom<=1} onClick={()=>setZoom(value=>Math.max(1,value-.25))}><Minus size={12}/></button><button type="button" className="doc-preview__zoom-reset" aria-label="PDF 너비에 맞춤" onClick={()=>setZoom(1)}>{zoom===1?'맞춤':`${Math.round(zoom*100)}%`}</button><button type="button" aria-label="PDF 확대" disabled={!pdf||zoom>=2} onClick={()=>setZoom(value=>Math.min(2,value+.25))}><Plus size={12}/></button></div></div><SourceChips items={items} documentId={doc.id} location={{page}} placed={new Set(marks.map(mark=>mark.item.id))} compact={compact} selectedId={selectedItemId} onSelect={selectChip}/></>;
}

export default function DocumentPreview(props:DocumentPreviewProps){
 if(!props.document)return <div className="doc-preview doc-preview--empty"><div className="doc-preview__empty-art" aria-hidden="true"><span className="doc-preview__empty-sheet doc-preview__empty-sheet--back"/><span className="doc-preview__empty-sheet doc-preview__empty-sheet--middle"/><span className="doc-preview__empty-sheet doc-preview__empty-sheet--front"><FileText size={34} strokeWidth={1.15}/><i/><i/><i/></span></div><p>원문에서 시작되는 검토</p><span>문서를 선택하면 원문을 볼 수 있어요</span><div className="doc-preview__empty-formats"><span>PDF</span><span>Word</span><span>Excel</span><span>CSV</span><span>Image</span></div></div>;
 return <RenderedDocumentPreview {...props} document={props.document}/>;
}

function RenderedDocumentPreview({document:doc,stage='idle',evidence=EMPTY_EVIDENCE,items=EMPTY_ITEMS,selectedItemId=null,compact=false,onSelectItem,onPageChange}:Omit<DocumentPreviewProps,'document'>&{document:Doc}){
 const [sheet,setSheet]=useState(''),[imageError,setImageError]=useState(false);const viewport=useRef<HTMLDivElement>(null);const {enabled}=useMotionPreference();
 const preview=useMemo(()=>normalizePreview(doc.preview),[doc.preview]),renderer=previewRenderer(doc,preview),sheets=preview.sheets,current=sheets.find(value=>value.name===sheet)||sheets[0],sheetNames=useMemo(()=>sheets.map(value=>value.name),[sheets]);
 const selectedItem=items.find(item=>item.id===selectedItemId),selectedContextOnly=!!selectedItem&&isMissingItem(selectedItem)&&selectedItem.documentId===doc.id;
 const explicit=evidence.filter(source=>source.documentId===doc.id),sources=explicit.length?explicit:selectedItem?sourceEvidence(selectedItem,doc.id):[],paintSources=selectedContextOnly?[]:sources,sourceKey=JSON.stringify(sources);
 const highlights=useMemo(()=>items.filter(item=>sourceEvidence(item,doc.id).length||!item.evidence?.length||item.documentId===doc.id),[items,doc.id]);
 useEffect(()=>{setSheet('');setImageError(false);},[doc.id]);
 useEffect(()=>{const names=[...new Set(sources.map(source=>evidenceSheet(source,sheetNames)).filter((name):name is string=>name!==null))];if(names.length===1)setSheet(names[0]);},[doc.id,sourceKey,sheetNames]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>revealSelected(viewport.current,!enabled));return()=>cancelAnimationFrame(frame);},[doc.id,sheet,selectedItemId,sourceKey,enabled]);
 const columns=current?Math.max(0,...current.rows.map(row=>row.length)):0;
 const cellMap=useMemo(()=>{
  const result=new Map<string,Item[]>();if(!current)return result;
  for(const item of highlights)for(const source of sourceEvidence(item,doc.id)){
   const address=tableEvidenceCells(source,current.name,sheetNames,current.rows.length,columns);if(address.ambiguous)continue;const positions=new Set(address.cells);
   if(!address.hasAddress&&source.quote&&evidenceSheet(source,sheetNames)===current.name)current.rows.forEach((row,r)=>row.forEach((value,c)=>{if(textMatches(value,source.quote!).length)positions.add(`${r}:${c}`);}));
   for(const key of positions){const list=result.get(key)||[];if(!list.some(value=>value.id===item.id))list.push(item);result.set(key,list);}
  }return result;
 },[highlights,doc.id,current,sheetNames,columns]);
 const evidenceCells=useMemo(()=>{const cells=new Set<string>();if(current)for(const source of paintSources)for(const cell of tableEvidenceCells(source,current.name,sheetNames,current.rows.length,columns).cells)cells.add(cell);return cells;},[current,sheetNames,columns,JSON.stringify(paintSources)]);
 const placed=new Set<string>(renderer==='table'?[...cellMap.values()].flat().map(item=>item.id):renderer==='text'?highlights.filter(item=>sourceEvidence(item,doc.id).some(source=>source.quote&&textMatches(preview.text!,source.quote).length)).map(item=>item.id):[]);
 const selectChip=(id:string)=>{const item=highlights.find(item=>item.id===id);if(item&&renderer==='table'){const names=[...new Set(sourceEvidence(item,doc.id).map(source=>evidenceSheet(source,sheetNames)).filter((name):name is string=>name!==null))];if(names.length===1)setSheet(names[0]);}onSelectItem?.(id);};
 const legend=(inline:boolean)=><div className={`doc-preview__legend${inline?' doc-preview__legend--inline':''}`} aria-label="원문 판정 색상 범례">{(['pass','fail','review'] as const).map(status=><span key={status} className={`source-mark--${status}`}><i/>{statusLabels[status]}</span>)}{!inline&&<small>색상 영역을 누르면 판정 근거를 볼 수 있어요</small>}</div>;
 const SourceIcon=renderer==='table'?FileSpreadsheet:renderer==='image'?ImageIcon:FileText,scanning=stage==='reading'||stage==='extracting';
 return <section className={`doc-preview${compact?' doc-preview--compact':''}`} aria-label={`${doc.name} 원문 미리보기`}>
  <header className="doc-preview__toolbar">{compact&&highlights.length>0?legend(true):<div className="doc-preview__filename"><SourceIcon size={compact?13:16}/><span>{compact?'원문':doc.name}</span></div>}<a className="doc-preview__open" href={doc.url} target="_blank" rel="noreferrer" title="원본 파일 열기">원본<ExternalLink size={13}/></a></header>
  {!compact&&highlights.length>0&&legend(false)}
  <div className={`doc-preview__body ${scanning?'is-scanning':''}`}>
   <AnimatePresence>{scanning&&<motion.div className="doc-preview__scan-status" initial={{opacity:0,y:enabled?-5:0}} animate={{opacity:1,y:0}} exit={{opacity:0,y:enabled?-5:0}} role="status"><ScanLine size={13}/><span>{stage==='reading'?'문서 내용 읽는 중':'검토 항목 추출 중'}</span><i/></motion.div>}</AnimatePresence>
   {renderer==='pdf'?<PDFPage key={doc.id} document={doc} sources={paintSources} items={highlights} selectedItemId={selectedItemId} onSelectItem={onSelectItem} onPageChange={onPageChange} compact={compact}/>:renderer==='image'?<div ref={viewport} className="doc-preview__viewport doc-preview__viewport--image">{imageError?<p className="doc-preview__message" role="status">이미지를 표시하지 못했어요. 원본을 열어 확인해 주세요.</p>:<img src={doc.url} alt={`${doc.name} 원본`} onError={()=>setImageError(true)}/>}</div>:renderer==='table'&&current?<>
    {(!compact||sheets.length>1)&&<div className="doc-preview__sheets" role="tablist" aria-label="워크시트">{sheets.map((value,index)=><button type="button" role="tab" aria-selected={value===current} key={`${value.name}-${index}`} className={value===current?'is-active':''} onClick={()=>setSheet(value.name)}>{value.name}{value.state&&value.state!=='visible'&&<span className="doc-preview__hidden-sheet">숨김</span>}</button>)}</div>}
    <div ref={viewport} className="doc-preview__viewport doc-preview__viewport--table"><table className="doc-preview__table" aria-label={`${current.name} 원문 셀`}><thead><tr><th aria-label="행 번호"/>{Array.from({length:columns},(_,index)=><th key={index}>{columnName(index)}</th>)}</tr></thead><tbody>{current.rows.map((row,r)=><tr key={r}><th>{r+1}</th>{Array.from({length:columns},(_,c)=>{
     const value=row[c]??'',address=`${columnName(c)}${r+1}`,cellHighlights=(cellMap.get(`${r}:${c}`)||[]).slice().sort((a,b)=>itemPriority(a,selectedItemId)-itemPriority(b,selectedItemId)),primary=cellHighlights[0];
     return <td key={c} title={`${current.name}!${address}`} data-source-cell={address} className={`${primary?`has-source-highlight source-mark--${primary.status}`:evidenceCells.has(`${r}:${c}`)?'is-evidence':''} ${primary?.id===selectedItemId?'is-selected':''}`}>{primary?<><button type="button" className="doc-preview__cell-highlight" data-source-highlight-id={primary.id} aria-label={`${address} · ${statusLabels[primary.status]} · ${primary.label}: ${value}`} onClick={()=>onSelectItem?.(primary.id)}>{value||'\u00a0'}</button>{cellHighlights.length>1&&<div className="doc-preview__cell-options" aria-label={`${address} 검토 항목`}>{cellHighlights.map(item=><button type="button" key={item.id} className={`source-mark--${item.status}`} aria-label={`${statusLabels[item.status]} · ${item.label}`} title={`${statusLabels[item.status]} · ${item.label}`} onClick={()=>onSelectItem?.(item.id)}><i/></button>)}</div>}</>:<SourceText text={value} items={[]} documentId={doc.id} evidence={paintSources}/>}</td>;
    })}</tr>)}</tbody></table></div>
   </>:renderer==='text'?<div ref={viewport} className="doc-preview__viewport doc-preview__viewport--text"><div className="doc-preview__text-paper"><SourceText text={preview.text!} items={highlights} documentId={doc.id} evidence={paintSources} selectedItemId={selectedItemId} onSelectItem={onSelectItem}/></div></div>:<div className="doc-preview__viewport doc-preview__unsupported"><FileText size={34} strokeWidth={1.2}/><p>이 파일은 원본을 열어 확인할 수 있어요.</p><a href={doc.url} target="_blank" rel="noreferrer"><ExternalLink size={13}/>원본 파일 열기</a></div>}
   {scanning&&<div className="doc-preview__scan-overlay" aria-hidden="true"><span/></div>}{scanning&&<div className="doc-preview__registration" aria-hidden="true"><i/><i/><i/><i/></div>}
  </div>
  {renderer!=='pdf'&&<SourceChips items={highlights} documentId={doc.id} location={renderer==='table'?{sheet:current?.name}:{}} placed={placed} compact={compact} selectedId={selectedItemId} onSelect={selectChip}/>}
  {preview.truncated&&<p className="doc-preview__truncated">미리보기는 문서 일부만 표시합니다. 전체 내용은 원본에서 확인하세요.</p>}{preview.warnings.map((warning,index)=><p className="doc-preview__warning" key={index}>{warning}</p>)}
  {sources.length>0&&<aside className="doc-preview__evidence" aria-label="선택한 항목의 원문 근거"><div className="doc-preview__evidence-heading"><span/>선택한 항목의 근거</div>{sources.slice(0,3).map((source,index)=><div key={index} className="doc-preview__evidence-item">{sourceLocation(source)&&<span className="doc-preview__evidence-location">{sourceLocation(source)}</span>}{source.quote&&<p>“{source.quote}”</p>}{source.blank&&<p>원문의 빈 셀</p>}</div>)}</aside>}
 </section>;
}

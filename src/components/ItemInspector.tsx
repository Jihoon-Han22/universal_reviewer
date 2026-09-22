import {useEffect,useRef,useState} from 'react';
import {Quote,ArrowUpRight,PencilLine,CheckCheck,Link2,X,ArrowDown} from 'lucide-react';
import {motion} from 'motion/react';
import type {Doc,Evidence,Item,Verdict} from '../types';
import {StatusIcon,statusLabels} from './ReviewItems';
import {formatValue} from '../format';
import {useMotionPreference} from '../motion-preference';

function VerdictBadge({status}:{status:Verdict}){
 return <span className={`verdict-badge ${status}`}><StatusIcon status={status}/>{statusLabels[status]}</span>;
}

export default function ItemInspector({item,documents,onSource,onResolve,compact=false,disabled=false,onClose}:{
 item:Item;documents:Doc[];onSource:(e:Evidence)=>void;
 onResolve:(item:Item,status:'pass'|'fail'|'review',note:string)=>Promise<boolean>;
 resolving:boolean;compact?:boolean;disabled?:boolean;onClose?:()=>void;
}){
 const reducedMotion=!useMotionPreference().enabled;
 const [error,setError]=useState('');
 const [editing,setEditing]=useState(false);
 const [status,setStatus]=useState<'pass'|'fail'|'review'>(item.status==='pending'?'review':item.status);
 const [note,setNote]=useState('');
 const [saving,setSaving]=useState(false);
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{
  setEditing(false);setError('');setStatus(item.status==='pending'?'review':item.status);setNote(item.humanNote||'');
  heading.current?.focus({preventScroll:true});
 },[item.id,item.status,item.humanNote]);
 const save=async()=>{
  if(saving||!note.trim())return;
  setError('');setSaving(true);
  try{if(await onResolve(item,status,note))setEditing(false);else setError('판정을 저장하지 못했습니다. 내용을 확인하고 다시 시도해 주세요.');}
  finally{setSaving(false);}
 };
 return <motion.section key={item.id} className={`inspector${compact?' inspector--focused':''}`} initial={reducedMotion||compact?false:{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{duration:reducedMotion?0:.22}} aria-label="판정 근거">
  {compact?<header className="inspector-focused-heading">
   <h3 ref={heading} tabIndex={-1}>{item.label}</h3>
   <div><VerdictBadge status={item.status}/>{item.reviewedByHuman&&<span className="human-stamp"><CheckCheck size={12}/>직접 확인</span>}</div>
  </header>:<div className="inspector-header"><span><Link2 size={15}/>판정 근거</span><button type="button" className="icon-button" aria-label="근거 패널 닫기" onClick={onClose}><X size={17}/></button></div>}
  <div className="evidence-flow">
   <div className={compact?'inspector-comparison':undefined}>
    <div className="evidence-value"><small>문서의 값</small><strong>{formatValue(item.value)} <span>{item.unit}</span></strong>{!compact&&<p>{item.label}</p>}</div>
    {!compact&&<div className="evidence-connector"><span/><ArrowDown size={15}/><span/></div>}
    <div className="criterion-match"><small>적용 기준</small><p>{item.criterion||'연결된 기준 없음'}</p></div>
   </div>
   {!compact&&<div className="decision-line"><VerdictBadge status={item.status}/>{item.reviewedByHuman&&<span className="human-stamp"><CheckCheck size={13}/>직접 확인</span>}</div>}
   {compact&&<small className="inspector-reason-label">판정 이유</small>}
   <p className="decision-reason">{item.explanation||'판정 설명을 확인해 주세요.'}</p>
  </div>
  {item.evidence?.map((source,index)=><button className="source-quote" key={index} onClick={()=>onSource(source)}>
   <div><Quote size={13}/><span>{documents.find(d=>d.id===source.documentId)?.name||'원문'} · {[source.page?`${source.page}쪽`:source.sheet,source.cell].filter(Boolean).join(' ')}</span><ArrowUpRight size={14}/></div>
   {source.quote&&<blockquote>{source.quote}</blockquote>}
  </button>)}
  {item.humanNote&&<p className="human-note">{item.humanNote}</p>}
  {!editing?<button className="button secondary resolve-button" disabled={disabled||item.status==='pending'} onClick={()=>setEditing(true)}><PencilLine size={15}/>직접 확인 · 판정 수정</button>:<div className="resolution-form">
   <label>최종 판정<select value={status} onChange={e=>setStatus(e.target.value as typeof status)}>{(['pass','fail','review'] as const).map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>
   <label>확인 근거 메모<textarea rows={3} maxLength={1000} placeholder="직접 확인한 근거를 남겨 주세요" value={note} onChange={e=>setNote(e.target.value)}/></label>
   {error&&<p className="inline-error" role="alert">{error}</p>}
   <div className="form-actions"><button type="button" className="button quiet" onClick={()=>setEditing(false)}>취소</button><button type="button" className="button primary" disabled={saving||!note.trim()} onClick={save}>{saving?'저장 중':'판정 저장'}</button></div>
  </div>}
 </motion.section>;
}

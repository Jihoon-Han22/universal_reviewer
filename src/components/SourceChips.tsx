import type {Item} from '../types';
import {sourceChip} from '../source-highlights';
import {statusLabels} from './ReviewItems';
export {sourceChip} from '../source-highlights';

export default function SourceChips({items,documentId,location,placed,compact,selectedId,onSelect}:{items:Item[];documentId:string;location:{page?:number;sheet?:string};placed:Set<string>;compact:boolean;selectedId?:string|null;onSelect?:(id:string)=>void}){
 const visible=items.map(item=>({item,...sourceChip(item,documentId,location,placed.has(item.id),compact)})).filter(chip=>chip.visible);
 return visible.length?<div className="doc-preview__source-chips" aria-label="원문 판정 항목">{visible.map(({item,hint,description})=><button type="button" key={item.id} className={`doc-preview__source-chip source-mark--${item.status} ${item.id===selectedId?'is-selected':''}`} aria-pressed={item.id===selectedId} title={`${statusLabels[item.status]} · ${item.label}${description?' · '+description:''}`} aria-label={`${statusLabels[item.status]} · ${item.label}${description?' · '+description:''}`} onClick={()=>onSelect?.(item.id)}><i aria-hidden="true"/><span>{item.label}</span>{hint&&<small>{hint}</small>}</button>)}</div>:null;
}

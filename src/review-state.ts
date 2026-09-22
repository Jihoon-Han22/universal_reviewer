import type {ReviewEvent,ReviewRun} from './types';
export type Ticket={generation:number;runId:string|null;sequence:number;revision:number;localRevision:number};
export class ReviewRequestGate {
  state:Ticket={generation:0,runId:null,sequence:0,revision:0,localRevision:0};
  ticket(){return {...this.state};}
  begin(runId:string|null=null){this.state={generation:this.state.generation+1,runId,sequence:0,revision:0,localRevision:0};return this.ticket();}
  current(t:Ticket){return t.generation===this.state.generation&&t.runId===this.state.runId;}
  bind(t:Ticket,id:string){if(!this.current(t))return false;this.state.runId=id;return true;}
  touch(){this.state.revision++;this.state.localRevision++;return this.ticket();}
  event(t:Ticket,e:ReviewEvent){if(!this.current(t)||e.runId!==this.state.runId||!Number.isSafeInteger(e.sequence)||e.sequence<=this.state.sequence)return false;this.state.sequence=e.sequence;this.state.revision++;return true;}
  snapshot(t:Ticket,r:ReviewRun,command=false){
    if(!this.current(t)||r.id!==this.state.runId)return false;
    const seq=Math.max(0,...(r.events||[]).filter(e=>e.runId===r.id&&Number.isSafeInteger(e.sequence)).map(e=>e.sequence));
    if(command&&r.events){if(t.localRevision!==this.state.localRevision||seq<this.state.sequence)return false;}
    else if(t.sequence!==this.state.sequence||t.revision!==this.state.revision)return false;
    this.state.sequence=Math.max(seq,this.state.sequence);this.state.revision++;return true;
  }
}
export const terminal=(status?:string)=>['completed','partial','failed','cancelled'].includes(status||'');
export function reduceReview(run:ReviewRun|null,event:ReviewEvent):ReviewRun|null {
  if(!run)return run;
  const next={...run,events:[...(run.events||[]),event].slice(-80)};
  if(event.runStatus)next.status=event.runStatus as ReviewRun['status'];
  else if(!event.type.startsWith('document.')&&event.status)next.status=event.status as ReviewRun['status'];
  if(event.stage)next.stage=event.stage as ReviewRun['stage'];
  for(const key of ['documents','criteriaDocuments','criteriaSources','criteriaDiscovery','analyses','criteria','criterionVersion','criteriaRevision','criteriaGroups','criteriaFeedback','criteriaDocumentAssessments','excludedCriteriaDocuments','approvedCriteria','summary','revisionError'] as const)if(event[key]!==undefined)(next as any)[key]=event[key];
  if(event.items)next.items=[...next.items.filter(i=>!event.items!.some(n=>n.id===i.id)),...event.items];
  if(event.item)next.items=next.items.some(i=>i.id===event.item!.id)?next.items.map(i=>i.id===event.item!.id?event.item!:i):[...next.items,event.item];
  if(event.documentId&&event.type.startsWith('document.'))next.documents=next.documents.map(d=>{if(d.id!==event.documentId)return d;const status=event.type==='document.started'?'processing':event.type==='document.failed'||event.type==='document.analysis.failed'?'failed':event.type==='document.incomplete'?'partial':event.type==='document.completed'?event.status:undefined;return {...d,...(event.document as object||{}),...(status?{status:status as any}:{}),...(event.extraction?{extraction:event.extraction as any}:{}),...(event.fields?{extraction:{referenceNumber:(event.referenceNumber as string)||null,fields:event.fields as any}}:{}),...((event.type.includes('failed')||event.type==='document.incomplete')&&event.message?{error:String(event.message)}:{})};});
  if(event.analysis){const a={...(event.analysis as any),documentId:event.documentId||(event.analysis as any).documentId};next.analyses=[...(next.analyses||[]).filter(v=>v.documentId!==a.documentId),a];}
  if(event.type==='run.failed')(next as any).error=event.message;
  if(event.activity){const a=event.activity as any;next.analysisActivity=[...(next.analysisActivity||[]).filter(v=>!a.id||v.id!==a.id),a].slice(-120);}
  return next;
}

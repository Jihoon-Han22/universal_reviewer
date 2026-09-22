import type {Doc,Item,Verdict} from './types';

export type ReviewPacket={key:string;id:string;item:Item;kind:'verdict'|'extraction';signature:string;delay:number;expires:number};
const itemSignature=(item:Item)=>JSON.stringify([item.status,item.value,item.unit,item.label]);
const fieldSignature=(item:Item)=>JSON.stringify([item.value,item.unit]);
export function terminalPresentationDelay({motion,live,flowBusy,presentationBusy}:{motion:boolean;live:boolean;flowBusy:boolean;presentationBusy:boolean}){return !motion||!live?0:flowBusy?1800:presentationBusy?1600:120;}

/** Sampling affects transient visuals only. Every item remains in the business snapshot. */
export class ReviewPresentation {
 context:string|null=null;seenItems=new Map<string,string>();seenFields=new Map<string,string>();packets:ReviewPacket[]=[];latestIds:Partial<Record<Verdict,string>>={};sequence=0;
 update(documents:Doc[],items:Item[],enabled:boolean,now:number){
  const context=documents.map(document=>document.id).sort().join('|');
  const fields:Item[]=documents.flatMap(document=>(document.extraction?.fields||[]).map((field,index)=>({id:`${document.id}:${index}:${field.label}`,documentId:document.id,label:field.label,value:field.value,unit:field.unit,status:'pending' as const})));
  const nextItems=new Map(items.map(item=>[item.id,itemSignature(item)])),nextFields=new Map(fields.map(field=>[field.id,fieldSignature(field)]));
  const changedContext=context!==this.context,baseline=this.context===null||changedContext||!enabled||!items.length&&!fields.length;
  if(baseline){this.packets=[];if(changedContext)this.latestIds={};}
  else {
   const changed=items.filter(item=>item.status!=='pending'&&this.seenItems.get(item.id)!==nextItems.get(item.id));
   const changedFields=fields.filter(field=>this.seenFields.get(field.id)!==nextFields.get(field.id));
   const candidates:Item[]=[];for(const status of ['pass','fail','review'] as const){const latest=changed.filter(item=>item.status===status).at(-1);if(latest){this.latestIds[status]=latest.id;candidates.push(latest);}}
   candidates.push(...changed.slice(-6));const unique=[...new Map(candidates.map(item=>[item.id,item])).values()],field=changedFields.at(-1);
   const additions:Array<{item:Item;kind:ReviewPacket['kind']}>=field?[{item:field,kind:'extraction'}]:[];additions.push(...unique.slice(0,6-additions.length).map(item=>({item,kind:'verdict' as const})));
   const retained=this.packets.filter(packet=>packet.expires>now&&packet.signature===(packet.kind==='verdict'?nextItems:nextFields).get(packet.id));
   this.packets=[...retained,...additions.map(({item,kind},index)=>({key:`${item.id}:${++this.sequence}`,id:item.id,item,kind,signature:(kind==='verdict'?nextItems:nextFields).get(item.id)!,delay:index*75,expires:now+index*75+1920}))].slice(-6);
  }
  this.context=context;this.seenItems=nextItems;this.seenFields=nextFields;return this.packets;
 }
 sweep(now:number){this.packets=this.packets.filter(packet=>packet.expires>now);return this.packets;}
}

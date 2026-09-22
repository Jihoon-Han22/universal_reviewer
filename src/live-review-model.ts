import type {ActivityTask,Doc,ReviewRun} from './types';
export type ObservedOperation=Pick<ActivityTask,'id'|'documentId'|'status'|'phase'|'runtime'|'title'> & {connectionLive:boolean};
export function liveReviewState(run:ReviewRun|null,documents:Doc[],busy:boolean,operation:ObservedOperation|null){
 const targets=documents.filter(document=>document.role==='target'),byId=new Map(targets.map(document=>[document.id,document]));
 const activeOperation=busy&&operation?.status==='running'&&operation.documentId&&byId.has(operation.documentId)?operation:null;
 const event=[...(run?.events||[])].reverse().find(event=>event.documentId&&byId.get(event.documentId)?.status==='processing');
 const analysis=[...(run?.analysisActivity||[])].reverse().find(event=>event.documentId&&byId.has(event.documentId));
 const active=(activeOperation?.documentId?byId.get(activeOperation.documentId):undefined)||(event?.documentId?byId.get(event.documentId):undefined)||targets.find(document=>document.status==='processing')||(analysis?.documentId?byId.get(analysis.documentId):undefined)||targets[0];
 const phase=activeOperation?.phase;
 const stage=phase&&['verify','review'].includes(phase)?'reviewing':phase==='extract'?'extracting':phase&&['read','files','structure','context','transcribe','reread','quality'].includes(phase)?'analyzing_targets':run?.stage||'analyzing';
 const analyzed=new Set((run?.analyses||[]).filter(analysis=>analysis.documentId&&byId.has(analysis.documentId)&&['complete','completed','ready'].includes(analysis.status)).map(analysis=>analysis.documentId));
 const counts=new Map<string,{total:number;pending:number;pass:number;fail:number;review:number}>();for(const item of run?.items||[]){const count=counts.get(item.documentId)||{total:0,pending:0,pass:0,fail:0,review:0};count.total++;count[item.status]++;counts.set(item.documentId,count);}
 const done=!busy&&!!run&&['completed','partial'].includes(run.status);
 const fileLabel=(document:Doc)=>{const status=String(document.status||''),count=counts.get(document.id);return ['completed','complete'].includes(status)?'검토 완료':status==='failed'?'읽기 확인 필요':status==='partial'?'일부 확인 필요':active?.id===document.id&&stage==='reviewing'||!!count?.pending?'기준 대조 중':count?.total?'판정 도착':analyzed.has(document.id)?'항목 추출 중':status==='processing'?'원문 읽는 중':busy?'원문 분석 중':done?'판정 없음':'대기';};
 return {targets,active,stage,analyzed,counts,done,fileLabel,observing:operation?.connectionLive??true};
}

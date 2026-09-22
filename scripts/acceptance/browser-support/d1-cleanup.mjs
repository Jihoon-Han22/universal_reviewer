// Diagnostic observation only. Importing this module starts no browser or timer.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';

const error=e=>({name:e?.name??'Error',message:String(e?.message??e),code:e?.code??null});
export const ARMS=Object.freeze(['D1-live-HMR-serial-trace','D2-close-owned-HMR-before-trace']);
export function createTelemetry(file){
 let sequence=0;
 fs.writeFileSync(file,'',{flag:'wx'});
 return (kind,data={})=>{const row={sequence:++sequence,at:new Date().toISOString(),monotonicMs:performance.now(),kind,...data};fs.appendFileSync(file,JSON.stringify(row)+'\n');return row;};
}

// An elapsed observation bound does not cancel the original promise. The caller
// must keep its owned worker alive and request parent termination on pending.
export async function observePhase(label,limitMs,work,emit,{milestoneMs=null,clock={setTimeout,clearTimeout}}={}){
 const start=emit('phase-start',{label,limitMs}),row={label,limitMs,startedAt:start.at,startMonotonicMs:start.monotonicMs,outcome:'pending'};
 let deadline,milestone,returned=false;
 const operation=Promise.resolve().then(work);
 const settled=operation.then(value=>{const end=emit('phase-settled',{label,settlement:'fulfilled',late:returned});Object.assign(row,{settlement:'fulfilled',settledAt:end.at,settledMonotonicMs:end.monotonicMs});return {kind:'fulfilled',value};},e=>{const detail=error(e),end=emit('phase-settled',{label,settlement:'rejected',late:returned,error:detail});Object.assign(row,{settlement:'rejected',settledAt:end.at,settledMonotonicMs:end.monotonicMs,settlementError:detail});return {kind:'rejected',error:detail};});
 if(milestoneMs!==null)milestone=clock.setTimeout(()=>{if(!row.settlement){row.pendingMilestone=emit('phase-pending-milestone',{label,elapsedLimitMs:milestoneMs});}},milestoneMs);
 let result;
 try{result=await Promise.race([settled,new Promise(resolve=>deadline=clock.setTimeout(()=>resolve({kind:'pending-timeout'}),limitMs))]);}
 finally{clock.clearTimeout(deadline);clock.clearTimeout(milestone);}
 returned=true;row.outcome=result.kind;const end=emit('phase-observation-ended',{label,outcome:result.kind});row.observedEndedAt=end.at;row.observedEndMonotonicMs=end.monotonicMs;
 return {row,...result};
}

// Retain handles without installing onClose/onMessage handlers, which would
// change Playwright's default forwarding. Page WebSocket listeners are passive.
export function retainHmrRoute(socket,scenario,handles,allow,emit){
 const url=new URL(socket.url()),protocols=socket.protocols(),allowed=allow(url.href,protocols),row={at:new Date().toISOString(),url:url.href,protocols,method:'WEBSOCKET',action:allowed?'allowed-local-vite-hmr':'blocked'};
 scenario.network.push(row);
 if(allowed){
  scenario.allowedLocalWebSockets.push(row);
  const server=socket.connectToServer(),handle={id:handles.length+1,page:socket,server};handles.push(handle);
  const event=emit('hmr-route-retained',{handleId:handle.id,url:url.href,phase:scenario.diagnosticPhase??'observing'});
  scenario.hmrHandles.push({id:handle.id,url:url.href,createdAt:event.at,monotonicMs:event.monotonicMs,phase:scenario.diagnosticPhase??'observing'});
  if(scenario.diagnosticPhase==='teardown')scenario.hmrReconnects.push({handleId:handle.id,at:event.at,monotonicMs:event.monotonicMs});
  return;
 }
 scenario.blockedWebSockets.push(row);socket.close({code:1008,reason:'Only declared local Vite HMR is allowed'});
}
export async function closeRetainedHmr(handles,scenario,emit,{clock={setTimeout,clearTimeout},monotonic=()=>performance.now()}={}){
 const selected=handles.slice(),results=[],start=monotonic(),limitMs=5000;
 scenario.hmrIntervention={requested:true,selectedHandleIds:selected.map(h=>h.id),results,complete:false,limitMs};
 for(const handle of selected)for(const side of ['page','server']){
  const left=Math.max(0,limitMs-(monotonic()-start));
  if(left<=0){scenario.hmrIntervention.pending=true;scenario.hmrIntervention.reason='Intervention deadline before all endpoint calls';return false;}
  const result=await observePhase('hmr-'+handle.id+'-'+side+'-close',left,()=>handle[side].close({code:1000,reason:'Declared D2 post-observation diagnostic teardown'}),emit,{clock});
  results.push({handleId:handle.id,side,...result.row});
  if(result.kind==='pending-timeout'){scenario.hmrIntervention.pending=true;scenario.hmrIntervention.reason='Owned endpoint close promise remains pending';return false;}
 }
 // Observe the remainder of the declared window without creating extra closes.
 const left=Math.max(0,limitMs-(monotonic()-start));if(left>0)await new Promise(resolve=>clock.setTimeout(resolve,left));
 scenario.hmrIntervention.complete=selected.length>0&&results.length===selected.length*2&&results.every(r=>r.outcome==='fulfilled')&&scenario.hmrReconnects.length===0;
 scenario.hmrIntervention.endedAt=new Date().toISOString();
 emit('hmr-intervention-ended',{complete:scenario.hmrIntervention.complete,reconnectCount:scenario.hmrReconnects.length,results:results.map(r=>({handleId:r.handleId,side:r.side,outcome:r.outcome}))});
 return true; // All invoked promises settled; this does not assert clean intervention.
}

export function inspectZipDirectory(bytes){
 // Structural central-directory/local-header checks only; not CRC/decompression.
 const result={byteLength:bytes.length,structuralCentralDirectoryValid:false,crcOrContentVerified:false};
 try{
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
  assert.ok(end>=0,'EOCD absent');assert.equal(bytes.readUInt16LE(end+4),0);assert.equal(bytes.readUInt16LE(end+6),0);
  const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);assert.equal(bytes.readUInt16LE(end+8),count);assert.ok(count>0&&count<65535&&offset+size===end,'Unsupported or invalid central directory');
  const names=[];let p=offset;
  for(let i=0;i<count;i++){
   assert.ok(p+46<=end);assert.equal(bytes.readUInt32LE(p),0x02014b50);
   const compressed=bytes.readUInt32LE(p+20),name=bytes.readUInt16LE(p+28),extra=bytes.readUInt16LE(p+30),comment=bytes.readUInt16LE(p+32),local=bytes.readUInt32LE(p+42);
   assert.ok(p+46+name+extra+comment<=end&&local+30<offset);assert.equal(bytes.readUInt32LE(local),0x04034b50);
   const localName=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28);assert.ok(local+30+localName+localExtra+compressed<=offset);
   names.push(bytes.subarray(p+46,p+46+name).toString('utf8'));p+=46+name+extra+comment;
  }
  assert.equal(p,end);Object.assign(result,{structuralCentralDirectoryValid:true,entries:count,centralDirectoryOffset:offset,centralDirectoryBytes:size,names});
 }catch(e){result.error=error(e);}
 return result;
}

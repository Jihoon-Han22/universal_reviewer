// In-memory acceptance-validator controls. Never actual browser/gate evidence.
import {createHash} from 'node:crypto';
import {deflateSync,crc32} from 'node:zlib';
import JSZip from 'jszip';
import {JSDOM} from 'jsdom';

export const controlStamp='2020-01-01T00:00:00.000Z';
const clone=value=>structuredClone(value),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const A='g12-item-a',B='g12-item-b',CHANNEL='trace-dashboard-evidence-v1';
const negatives=['wrongWindow','wrongOrigin','wrongChannel','wrongType','wrongToken','unknownItem','staleFrame','staleToken'];
const sentinel='GSPEC_G12_ORIGINAL_ONLY_SENTINEL',quote='Synthetic review quote';
export function controlPng(width=2,height=2,filter=0){
  const chunk=(name,data)=>{const type=Buffer.from(name),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);type.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([type,data])),out.length-4);return out;};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const raw=Buffer.alloc((width*3+1)*height,127);for(let row=0;row<height;row++)raw[row*(width*3+1)]=filter;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export async function controlTrace(){const zip=new JSZip();zip.file('trace.trace',[
  {type:'context-options',version:8,browserName:'chromium',origin:'validator-control'},
  {type:'before',callId:'call@1',apiName:'locator.click',startTime:1},
  {type:'after',callId:'call@1',endTime:2},
  {type:'frame-snapshot',snapshot:{frameId:'control-frame',html:['HTML',{},['BODY',{},'Validator control']],viewport:{width:2,height:2}}}
].map(value=>JSON.stringify(value)).join('\n')+'\n');return zip.generateAsync({type:'nodebuffer'});}

const frame=index=>({token:`validator-token-${index}`,windowId:`window-${index}`,sandbox:'allow-scripts',referrerPolicy:'no-referrer',srcdocLength:512});
const state=(current,selected=null,view='대시보드')=>({modal:true,view,selectedItemId:selected,focus:{tag:'SECTION',className:view==='원본과 판정'?'dbe-inspector':null},sourceText:view==='원본과 판정'?sentinel:null,listenerState:{frame:clone(current),events:[],messages:[],activeListeners:[{id:'production-listener',capture:false}],listenerCalls:[{operation:'add',id:'production-listener',capture:false,time:1}]}});
const positive=(kind,current)=>{
  const before=state(current),after=state(current,A,'원본과 판정');
  const sourceEvent={at:controlStamp,type:kind==='click'?'click':'keydown',key:kind==='enter'?'Enter':kind==='space'?' ':null,isTrusted:true,itemId:A,targetTag:'BUTTON'};
  const message={at:controlStamp,isTrusted:true,origin:'null',sourceWindow:current.windowId,currentFrameWindow:current.windowId,fromCurrentFrame:true,data:{channel:CHANNEL,type:'select-item',token:current.token,itemId:A}};
  return{isTrusted:true,accepted:true,selectedItemId:A,before,after,sourceEvent,newEvents:[sourceEvent],message,newMessages:[message]};
};

export async function makeBrowserControl(){
  const files=new Map(),add=(path,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));files.set(path,bytes);return{path,sha256:hash(bytes)};};
  const codeDigest='a'.repeat(64),registrySha256='b'.repeat(64),loop='LOOP-005',planRef={path:'g12-plan.json',sha256:'c'.repeat(64)};
  const events=[],event=(id,observed)=>events.push({id,at:controlStamp,action:'Synthetic validator control only',observed});
  const current=frame(4),old=frame(3),tokens=[1,2,3,4].map(index=>frame(index).token);
  const fixture={synthetic:true,sourceText:sentinel+'\n'+quote,run:{items:[{id:A,status:'pass'},{id:B,status:'fail'}]}};
  const fixtureRef=add('fixture.json',fixture),sourceFileRef=add('source.txt',Buffer.from(fixture.sourceText));
  const html='<html><head><script nonce="control">const marker="<script>";</script><script nonce="control">void 0;</script></head><body><main id="dashboard-root" data-visible-findings="2"><section data-dashboard="details">'+quote+'</section><button data-review-source="'+A+'" style="display:none">Source</button></main></body></html>';
  const bytes=Buffer.from(html),htmlRef=add('renderer.html',bytes),responseRef=add('response.json',{html});
  event('seed',{fixtureRef,sourceFileRef,responseRef,htmlRef,initialListeners:[]});
  for(const [index,kind]of ['click','enter','space'].entries())event(kind,{generation:index+1,frame:frame(index+1),...positive(kind,frame(index+1))});
  event('replacement',{old,current});
  for(const variant of negatives){
    const before=state(current,B,'원본과 판정'),after=clone(before),injection={sourceWindow:current.windowId,currentFrameWindow:current.windowId,origin:'null',data:{channel:CHANNEL,type:'select-item',token:current.token,itemId:A},syntheticNegative:true,isTrusted:false};
    if(variant==='wrongWindow')injection.sourceWindow='host-window';
    if(variant==='wrongOrigin')injection.origin='http://127.0.0.1:5210';
    if(variant==='wrongChannel')injection.data.channel='invalid-channel';
    if(variant==='wrongType')injection.data.type='invalid-type';
    if(variant==='wrongToken')injection.data.token='invalid-token';
    if(variant==='unknownItem')injection.data.itemId='g12-unknown-item';
    if(variant==='staleFrame')injection.sourceWindow=old.windowId;
    if(variant==='staleToken')injection.data.token=old.token;
    event(variant,{changedCondition:variant,before,injection,after,validCounterpart:positive('click',current),unchanged:true});
  }
  const actual={bridge:{positive:Object.fromEntries(['click','enter','space'].map(kind=>[kind,{isTrusted:true,accepted:true,selectedItemId:A}])),rejected:Object.fromEntries(negatives.map(kind=>[kind,{unchanged:true}])),unmount:{unchanged:true},iframe:{sandbox:'allow-scripts',referrerPolicy:'no-referrer',messageOrigin:'null'}},download:{nonempty:true,mime:'text/html;charset=utf-8',scriptCount:2,containsBridgeToken:false,containsBridgeScript:false,containsSourceDocumentSentinel:false,containsDocumentURL:false,containsSourceViewer:false,sourceButtonsHidden:true,externalRequests:0,containsExpectedQuote:true,urlRevoked:true,offlineFilterWorks:true,offlineDetailOpened:true}};
  const downloadRef=add('download.html',bytes),inspection=clone(actual.download);for(const key of ['containsSourceViewer','sourceButtonsHidden','externalRequests','offlineFilterWorks','offlineDetailOpened'])inspection[key]=null;
  event('download',{downloadRef,bytes:bytes.length,mime:actual.download.mime,previewTokens:tokens.slice(),urlLifecycle:[{operation:'create',url:'blob:validator-control',mime:actual.download.mime,size:bytes.length,time:1},{operation:'revoke',url:'blob:validator-control',time:1001}],inspection});
  const closed={modal:false,selectedItemId:null,listenerState:{frame:null,events:[],messages:[],activeListeners:[],listenerCalls:[{operation:'remove',id:'production-listener',capture:false,time:2000}]}};
  event('unmount',{beforeUnmount:{observation:state(current).listenerState,retained:current},closedBefore:clone(closed),closedAfter:clone(closed),injected:{sourceWindow:current.windowId,currentFrameWindow:null,origin:'null',data:{channel:CHANNEL,type:'select-item',token:current.token,itemId:A},syntheticNegative:true,isTrusted:false},initialListeners:[],activeAfter:[],unchanged:true});
  const parsed=new JSDOM(html),document=parsed.window.document;
  const controls=[{itemId:A,display:'none',visibility:'visible',rect:{x:0,y:0,width:0,height:0}}];
  const offlineDom={html:document.documentElement.outerHTML,scripts:2,detailText:quote,sourceControls:clone(controls),sourceViewerCount:0,rootAttributes:Object.fromEntries([...document.querySelector('#dashboard-root').attributes].map(attribute=>[attribute.name,attribute.value]))};parsed.window.close();
  const png=controlPng(),trace=await controlTrace();
  event('offline',{offlineDomRef:add('offline-dom.json',offlineDom),pngRef:add('offline.png',png),traceRef:add('offline-trace.zip',trace),filteredCount:'1',detailOpened:true,sourceControlCount:1,controls:clone(controls),attemptedRequests:[],downloadHash:downloadRef.sha256});
  const log={schemaVersion:'1.0',kind:'g12-browser-event-log',events,previewTokens:tokens,runError:null};
  const hostDom={html:'<html><body><div id="root"><dialog class="dashboard-modal" open><section class="dashboard-evidence" data-selected-item-id="'+A+'"><div class="dbe-source-preview">'+sentinel+'</div></section></dialog></div></body></html>',state:{frame:current,events:[],messages:[],activeListeners:[]}};
  const provenance={schemaVersion:'1.0',kind:'g12-browser-source-provenance',loop,registrySha256,codeDigestBefore:codeDigest,codeDigestAfter:codeDigest,serverCodeDigest:codeDigest,serverIdentityBefore:'validator-only',serverIdentityAfter:'validator-only'};
  const collectorPlanRef=add('bridge-plan.json',{codeDigest,registrySha256,loop,preparedAt:controlStamp,fixtureRef,sourceFileRef,responseRef,renderedHtmlRef:htmlRef,g12Binding:{ref:planRef}});
  const record={schemaVersion:'1.0',acceptanceProfile:'CURRENT_REPRODUCTION',caseId:'G12:CORE-14-C05',origin:'actual-browser',oracleAccess:false,loop,codeDigest,registrySha256,planRef,collectorPlanRef,runError:null,startedAt:controlStamp,endedAt:controlStamp,browser:{name:'synthetic validator control',version:'0',userAgent:'control',viewport:{width:2,height:2},deviceScaleFactor:1},providerCalls:{gemini:0,e2b:0},actual,browserTraceRef:add('control.trace.zip',trace),pngRef:add('control.png',png),domRef:add('control.json',hostDom),downloadRef,eventLogRef:add('events.json',log),sourceProvenanceRef:add('provenance.json',provenance)};
  const readRef=async(_root,reference)=>{const value=files.get(reference.path);if(!value||hash(value)!==reference.sha256)throw new Error('STALE_EVIDENCE_HASH');return value;};
  const observed=id=>log.events.find(row=>row.id===id).observed;
  const sync=()=>{record.eventLogRef=add('events.json',log);record.domRef=add('control.json',hostDom);record.sourceProvenanceRef=add('provenance.json',provenance);observed('offline').offlineDomRef=add('offline-dom.json',offlineDom);record.eventLogRef=add('events.json',log);};
  return{record,log,hostDom,offlineDom,provenance,add,files,observed,sync,options:{freeze:{loop,codeDigest,frozenAt:controlStamp},registrySha256,planRef,readRef,root:'.'}};
}

// Artifact parsing and cross-record agreement are necessary, not authentication
// of browser execution. Independent inspection of the actual trace remains due.
import {inflateSync,crc32} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import JSZip from 'jszip';
import {JSDOM} from 'jsdom';

const ITEM='g12-item-a',OTHER='g12-item-b',CHANNEL='trace-dashboard-evidence-v1';
const SENTINEL='GSPEC_G12_ORIGINAL_ONLY_SENTINEL',QUOTE='Synthetic review quote';
const NEGATIVES=['wrongWindow','wrongOrigin','wrongChannel','wrongType','wrongToken','unknownItem','staleFrame','staleToken'];
const ensure=(value,code)=>{if(!value)throw new Error(code);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const same=(actual,expected,code='G12_BROWSER_MEASUREMENT_MISMATCH')=>ensure(isDeepStrictEqual(actual,expected),code);
const member=(rows,value)=>Array.isArray(rows)&&rows.some(row=>isDeepStrictEqual(row,value));
const parseJson=(bytes,code)=>{try{return JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{throw new Error(code);}};
const nonblank=value=>typeof value==='string'&&value.trim().length>0;
const listeners=rows=>{ensure(Array.isArray(rows)&&rows.every(row=>object(row)&&nonblank(row.id)&&typeof row.capture==='boolean'),'G12_BROWSER_LISTENERS');return rows.map(row=>`${row.id}:${row.capture}`).sort();};

/** Validate a complete non-interlaced browser PNG, not only its magic bytes. */
export function inspectPng(input,{width,height,deviceScaleFactor}={}){
  const bytes=Buffer.from(input);
  ensure(bytes.length>=57&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'G12_BROWSER_PNG_INVALID');
  let offset=8,header=null,ended=false,palette=false,idatEnded=false;const chunks=[];
  while(offset<bytes.length){
    ensure(offset+12<=bytes.length&&!ended,'G12_BROWSER_PNG_INVALID');
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),start=offset+8,end=start+length;
    ensure(/^[A-Za-z]{4}$/.test(type)&&end+4<=bytes.length,'G12_BROWSER_PNG_INVALID');
    ensure(crc32(bytes.subarray(offset+4,end))===bytes.readUInt32BE(end),'G12_BROWSER_PNG_CRC');
    ensure(!/^[A-Z]/.test(type)||['IHDR','PLTE','IDAT','IEND'].includes(type),'G12_BROWSER_PNG_FORMAT');
    const data=bytes.subarray(start,end);
    if(!header){ensure(type==='IHDR'&&length===13,'G12_BROWSER_PNG_INVALID');header={width:data.readUInt32BE(0),height:data.readUInt32BE(4),depth:data[8],color:data[9],compression:data[10],filter:data[11],interlace:data[12]};}
    else if(type==='IHDR')throw new Error('G12_BROWSER_PNG_INVALID');
    if(type==='PLTE'){ensure(!chunks.length&&length>0&&length%3===0&&length<=768,'G12_BROWSER_PNG_INVALID');palette=true;}
    if(type==='IDAT'){ensure(!idatEnded,'G12_BROWSER_PNG_INVALID');chunks.push(data);}else if(chunks.length)idatEnded=true;
    if(type==='IEND'){ensure(length===0&&chunks.length>0,'G12_BROWSER_PNG_INVALID');ended=true;}
    offset=end+4;
  }
  ensure(ended&&offset===bytes.length&&header.width>0&&header.height>0&&header.width*header.height<=64000000,'G12_BROWSER_PNG_INVALID');
  const depths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
  ensure(depths[header.color]?.includes(header.depth)&&header.compression===0&&header.filter===0&&header.interlace===0&&(header.color!==3||palette),'G12_BROWSER_PNG_FORMAT');
  const channels={0:1,2:3,3:1,4:2,6:4}[header.color],rowBytes=Math.ceil(header.width*channels*header.depth/8),expected=(rowBytes+1)*header.height;
  ensure(expected<=256*1024*1024,'G12_BROWSER_PNG_LIMIT');
  let decoded;try{decoded=inflateSync(Buffer.concat(chunks),{maxOutputLength:expected});}catch{throw new Error('G12_BROWSER_PNG_INFLATE');}
  ensure(decoded.length===expected,'G12_BROWSER_PNG_SCANLINES');
  for(let row=0;row<header.height;row++)ensure(decoded[row*(rowBytes+1)]<=4,'G12_BROWSER_PNG_SCANLINES');
  if(width!==undefined){ensure(Number.isFinite(width)&&Number.isFinite(height)&&Number.isFinite(deviceScaleFactor)&&width>0&&height>0&&deviceScaleFactor>0,'G12_BROWSER_VIEWPORT');same([header.width,header.height],[Math.round(width*deviceScaleFactor),Math.round(height*deviceScaleFactor)],'G12_BROWSER_PNG_VIEWPORT');}
  return{width:header.width,height:header.height,colorType:header.color,bitDepth:header.depth,scanlineBytes:decoded.length};
}

/** Parse actual ZIP central/local structures, CRCs, and Playwright trace JSON. */
export async function inspectTrace(input){
  ensure(Buffer.byteLength(input)>22,'G12_BROWSER_TRACE_INVALID');
  let zip;try{zip=await JSZip.loadAsync(input,{checkCRC32:true});}catch{throw new Error('G12_BROWSER_TRACE_INVALID');}
  const files=Object.values(zip.files).filter(file=>!file.dir),traces=files.filter(file=>file.name.endsWith('.trace'));
  ensure(traces.length>0,'G12_BROWSER_TRACE_CONTENT');
  const events=[];
  for(const file of traces){const value=await file.async('string');ensure(value.length>0&&value.length<=32*1024*1024,'G12_BROWSER_TRACE_CONTENT');for(const line of value.split(/\r?\n/).filter(Boolean))events.push(parseJson(Buffer.from(line),'G12_BROWSER_TRACE_JSON'));}
  ensure(events.every(object),'G12_BROWSER_TRACE_JSON');
  const before=events.filter(event=>event.type==='before'&&nonblank(event.callId)),after=events.filter(event=>event.type==='after'&&nonblank(event.callId));
  const paired=before.filter(event=>after.some(end=>end.callId===event.callId));
  ensure(events.some(event=>event.type==='context-options')&&events.some(event=>event.type==='frame-snapshot'&&object(event.snapshot))&&paired.length>0,'G12_BROWSER_TRACE_CONTENT');
  return{entries:files.length,traceFiles:traces.map(file=>file.name),eventCount:events.length,pairedCalls:paired.length};
}

function htmlDom(html,host=false){
  ensure(nonblank(html)&&/<html(?:\s|>)/i.test(html)&&/<body(?:\s|>)/i.test(html),'G12_BROWSER_DOM_CONTENT');
  const dom=new JSDOM(html); // No runScripts/resources options: no script/network execution.
  const document=dom.window.document;
  ensure(document.body.childElementCount>0,'G12_BROWSER_DOM_CONTENT');
  if(host)ensure(document.querySelector('#root')?.childElementCount>0,'G12_BROWSER_HOST_DOM');
  return dom;
}

/** Cross-check raw event tuples before deriving any assertion-facing value. */
function positive(observed,kind){
  ensure(object(observed)&&object(observed.before)&&object(observed.after)&&Object.hasOwn(observed,'sourceEvent')&&Object.hasOwn(observed,'message')&&(observed.sourceEvent===null||object(observed.sourceEvent))&&(observed.message===null||object(observed.message))&&Array.isArray(observed.newEvents)&&Array.isArray(observed.newMessages),'G12_BROWSER_POSITIVE_RAW');
  const {before,after,sourceEvent,message}=observed,frame=before.listenerState?.frame;
  ensure(object(frame)&&nonblank(frame.token)&&nonblank(frame.windowId)&&object(after.focus),'G12_BROWSER_POSITIVE_RAW');
  ensure((sourceEvent===null||member(observed.newEvents,sourceEvent))&&(message===null||member(observed.newMessages,message)),'G12_BROWSER_POSITIVE_MEMBERSHIP');
  const type=kind==='click'?'click':'keydown',key=kind==='enter'?'Enter':kind==='space'?' ':null;
  const eventMatches=sourceEvent?.type===type&&(key===null||sourceEvent?.key===key)&&sourceEvent?.itemId===ITEM;
  const messageMatches=message?.isTrusted===true&&message?.origin==='null'&&message?.fromCurrentFrame===true&&message?.sourceWindow===frame.windowId&&message?.currentFrameWindow===frame.windowId&&isDeepStrictEqual(message?.data,{channel:CHANNEL,type:'select-item',token:frame.token,itemId:ITEM});
  const measured={isTrusted:sourceEvent===null?null:eventMatches?sourceEvent.isTrusted===true:false,accepted:Boolean(eventMatches&&sourceEvent.isTrusted===true&&messageMatches&&before.selectedItemId!==ITEM&&after.selectedItemId===ITEM&&after.view==='원본과 판정'&&after.focus.className?.split(' ').includes('dbe-inspector')),selectedItemId:after.selectedItemId??null};
  same({isTrusted:observed.isTrusted,accepted:observed.accepted,selectedItemId:observed.selectedItemId},measured);
  if(observed.frame)same(observed.frame,frame);
  return{measured,frame,message};
}

function negativeIsolated(observed,variant,replacement,knownIds){
  const {before,injection}=observed,frame=before.listenerState?.frame;
  ensure(object(frame)&&object(injection)&&object(injection.data),'G12_BROWSER_NEGATIVE_RAW');
  same(frame,replacement.current);
  const wanted={channel:CHANNEL,type:'select-item',token:frame.token,itemId:ITEM};
  let origin='null',sourceWindow=frame.windowId,changed=false;
  if(variant==='wrongWindow'){sourceWindow=injection.sourceWindow;changed=nonblank(sourceWindow)&&sourceWindow!==frame.windowId&&sourceWindow!==replacement.old.windowId;}
  if(variant==='wrongOrigin'){origin=injection.origin;changed=nonblank(origin)&&origin!=='null';}
  if(variant==='wrongChannel'){wanted.channel=injection.data.channel;changed=nonblank(wanted.channel)&&wanted.channel!==CHANNEL;}
  if(variant==='wrongType'){wanted.type=injection.data.type;changed=nonblank(wanted.type)&&wanted.type!=='select-item';}
  if(variant==='wrongToken'){wanted.token=injection.data.token;changed=nonblank(wanted.token)&&wanted.token!==frame.token&&wanted.token!==replacement.old.token;}
  if(variant==='unknownItem'){wanted.itemId=injection.data.itemId;changed=nonblank(wanted.itemId)&&!knownIds.includes(wanted.itemId);}
  if(variant==='staleFrame'){sourceWindow=replacement.old.windowId;changed=sourceWindow!==frame.windowId;}
  if(variant==='staleToken'){wanted.token=replacement.old.token;changed=wanted.token!==frame.token;}
  return changed&&observed.changedCondition===variant&&injection.syntheticNegative===true&&injection.isTrusted===false&&injection.sourceWindow===sourceWindow&&injection.currentFrameWindow===frame.windowId&&injection.origin===origin&&isDeepStrictEqual(injection.data,wanted);
}

export async function deriveBrowserMeasurements({record,primaryBytes,eventLog,hostDom,readRef,root}){
  ensure(record.runError==null&&eventLog.runError==null,'G12_BROWSER_EXECUTION_ERROR');
  const artifactRefs=[],read=async reference=>{ensure(reference,'G12_BROWSER_MEASUREMENT_REF');const bytes=await readRef(root,reference);artifactRefs.push(reference);return bytes;};
  const byId=new Map(eventLog.events.map(event=>[event.id,event.observed]));
  const seed=byId.get('seed'),replacement=byId.get('replacement');
  ensure(object(seed)&&object(replacement?.old)&&object(replacement?.current),'G12_BROWSER_SEED_REPLACEMENT');
  const fixture=parseJson(await read(seed.fixtureRef),'G12_BROWSER_FIXTURE_JSON');
  const original=Buffer.from(await read(seed.sourceFileRef)).toString('utf8');
  const knownIds=fixture.run?.items?.map(item=>item.id);
  ensure(fixture.synthetic===true&&Array.isArray(knownIds)&&knownIds.includes(ITEM)&&knownIds.includes(OTHER)&&original===fixture.sourceText&&original.includes(SENTINEL)&&original.includes(QUOTE),'G12_BROWSER_FIXTURE_CONTENT');
  await read(seed.responseRef);await read(seed.htmlRef);
  const collectionPlan=parseJson(await read(record.collectorPlanRef),'G12_BROWSER_COLLECTOR_PLAN');
  ensure(collectionPlan.codeDigest===record.codeDigest&&collectionPlan.registrySha256===record.registrySha256&&collectionPlan.loop===record.loop&&Date.parse(collectionPlan.preparedAt)<=Date.parse(record.startedAt),'G12_BROWSER_COLLECTOR_PLAN');
  same(collectionPlan.fixtureRef,seed.fixtureRef);same(collectionPlan.sourceFileRef,seed.sourceFileRef);same(collectionPlan.responseRef,seed.responseRef);same(collectionPlan.renderedHtmlRef,seed.htmlRef);
  same(collectionPlan.g12Binding?.ref,record.planRef,'G12_BROWSER_COLLECTOR_PLAN');
  ensure(replacement.old.token!==replacement.current.token&&replacement.old.windowId!==replacement.current.windowId&&[replacement.old.token,replacement.current.token,replacement.old.windowId,replacement.current.windowId].every(nonblank),'G12_BROWSER_REPLACEMENT_RAW');

  const actual={bridge:{positive:{},rejected:{},unmount:{},iframe:{}},download:{}};
  for(const kind of ['click','enter','space']){const result=positive(byId.get(kind),kind);actual.bridge.positive[kind]=result.measured;if(kind==='click')actual.bridge.iframe={sandbox:result.frame.sandbox,referrerPolicy:result.frame.referrerPolicy,messageOrigin:result.message?.origin??null};}
  same(replacement.old,byId.get('space').frame);
  for(const variant of NEGATIVES){
    const observed=byId.get(variant);ensure(object(observed)&&object(observed.before)&&object(observed.after),'G12_BROWSER_NEGATIVE_RAW');
    const counterpart=positive(observed.validCounterpart,'click').measured;
    const unchanged=Boolean(negativeIsolated(observed,variant,replacement,knownIds)&&observed.before.selectedItemId===OTHER&&observed.after.selectedItemId===OTHER&&observed.before.view===observed.after.view&&counterpart.isTrusted&&counterpart.accepted);
    same(observed.unchanged,unchanged);actual.bridge.rejected[variant]={unchanged};
  }
  const unmount=byId.get('unmount');ensure(object(unmount?.closedBefore)&&object(unmount?.closedAfter)&&object(unmount?.beforeUnmount?.observation)&&object(unmount?.beforeUnmount?.retained),'G12_BROWSER_UNMOUNT_RAW');
  const baseline=listeners(unmount.initialListeners),beforeUnmount=listeners(unmount.beforeUnmount.observation.activeListeners),afterUnmount=listeners(unmount.closedAfter.listenerState?.activeListeners);
  const removed=beforeUnmount.filter(id=>!baseline.includes(id)),removals=unmount.closedAfter.listenerState?.listenerCalls?.filter(row=>row.operation==='remove').map(row=>`${row.id}:${row.capture}`)??[];
  same(unmount.activeAfter,afterUnmount);
  const injection=unmount.injected,retained=unmount.beforeUnmount.retained;
  const unmountUnchanged=Boolean(!unmount.closedBefore.modal&&!unmount.closedAfter.modal&&unmount.closedBefore.selectedItemId===unmount.closedAfter.selectedItemId&&isDeepStrictEqual(baseline,afterUnmount)&&removed.length>0&&removed.every(id=>removals.includes(id))&&injection?.syntheticNegative===true&&injection?.isTrusted===false&&injection?.sourceWindow===retained.windowId&&injection?.currentFrameWindow===null&&injection?.origin==='null'&&isDeepStrictEqual(injection?.data,{channel:CHANNEL,type:'select-item',token:retained.token,itemId:ITEM}));
  same(unmount.unchanged,unmountUnchanged);actual.bridge.unmount={unchanged:unmountUnchanged};

  const download=byId.get('download'),offline=byId.get('offline');
  ensure(object(download)&&object(download.inspection)&&object(offline)&&Array.isArray(download.previewTokens)&&download.previewTokens.length>0&&download.previewTokens.every(nonblank)&&Array.isArray(download.urlLifecycle)&&Array.isArray(offline.attemptedRequests),'G12_BROWSER_DOWNLOAD_RAW');
  same(download.previewTokens,eventLog.previewTokens);
  const rawTokens=[...['click','enter','space'].map(kind=>byId.get(kind).before.listenerState.frame.token),replacement.old.token,replacement.current.token,retained.token,hostDom.state?.frame?.token];
  ensure(rawTokens.every(nonblank)&&new Set(download.previewTokens).size===download.previewTokens.length,'G12_BROWSER_PREVIEW_TOKENS');
  const measuredTokens=[...new Set(rawTokens)].sort();
  same([...download.previewTokens].sort(),measuredTokens,'G12_BROWSER_PREVIEW_TOKENS');
  same(download.downloadRef,record.downloadRef);same(offline.downloadHash,record.downloadRef.sha256);same(download.bytes,Buffer.byteLength(primaryBytes.downloadRef));
  const html=Buffer.from(primaryBytes.downloadRef).toString('utf8');
  const creates=download.urlLifecycle.filter(row=>row.operation==='create'),created=creates.at(-1);
  ensure(object(created)&&typeof created.mime==='string'&&nonblank(created.url)&&created.size===download.bytes,'G12_BROWSER_DOWNLOAD_LIFECYCLE');
  const urlRevoked=download.urlLifecycle.some(row=>row.operation==='revoke'&&row.url===created.url&&row.time>=created.time);
  same(download.mime,created.mime);
  const offlineDom=parseJson(await read(offline.offlineDomRef),'G12_BROWSER_OFFLINE_DOM');
  ensure(object(offlineDom)&&Array.isArray(offlineDom.sourceControls),'G12_BROWSER_OFFLINE_DOM');
  same(offline.controls,offlineDom.sourceControls);same(offline.sourceControlCount,offlineDom.sourceControls.length);
  const standalone=htmlDom(offlineDom.html),downloadDom=htmlDom(html),host=htmlDom(hostDom.html,true);
  let sourceViewerCount,scriptCount,offlineFilterWorks,offlineDetailOpened;
  try{
    const d=standalone.window.document,controls=[...d.querySelectorAll('[data-review-source]')];
    same(controls.map(element=>element.getAttribute('data-review-source')),offline.controls.map(control=>control.itemId));
    ensure(offline.controls.every(control=>object(control)&&typeof control.display==='string'&&typeof control.visibility==='string'&&object(control.rect)),'G12_BROWSER_OFFLINE_CONTROLS');
    sourceViewerCount=d.querySelectorAll('.document-preview,.dashboard-source-view,.dashboard-evidence,iframe,[data-source-document-id]').length;
    same(offlineDom.sourceViewerCount,sourceViewerCount);same(offlineDom.scripts,d.scripts.length);
    // Browsers may hide nonce content attributes in serialized live DOM. The
    // executable text and every other script attribute must still be identical.
    const scripts=document=>[...document.scripts].map(script=>({attributes:[...script.attributes].filter(attribute=>attribute.name!=='nonce').map(attribute=>[attribute.name,attribute.value]).sort(([a],[b])=>a.localeCompare(b)),text:script.textContent}));
    same(scripts(d),scripts(downloadDom.window.document),'G12_BROWSER_OFFLINE_SCRIPT_IDENTITY');
    ensure(object(hostDom.state)&&Array.isArray(hostDom.state.events)&&Array.isArray(hostDom.state.messages)&&Array.isArray(hostDom.state.activeListeners),'G12_BROWSER_HOST_DOM');
    scriptCount=downloadDom.window.document.scripts.length;
    const detailText=d.querySelector('[data-dashboard="details"]')?.textContent??null;
    same(offlineDom.detailText??null,detailText);
    offlineDetailOpened=nonblank(detailText);same(offline.detailOpened,offlineDetailOpened);
    const rootElement=d.querySelector('#dashboard-root');
    ensure(rootElement,'G12_BROWSER_OFFLINE_DOM');
    same(offlineDom.rootAttributes,Object.fromEntries([...rootElement.attributes].map(attribute=>[attribute.name,attribute.value])));
    offlineFilterWorks=String(offline.filteredCount)===String(fixture.run.items.filter(item=>item.status==='fail').length)&&rootElement.getAttribute('data-visible-findings')===String(knownIds.length);
    for(const request of offline.attemptedRequests)ensure(object(request)&&nonblank(request.url)&&nonblank(request.method),'G12_BROWSER_OFFLINE_REQUESTS');
  }finally{standalone.window.close();downloadDom.window.close();host.window.close();}
  Object.assign(actual.download,{nonempty:Buffer.byteLength(primaryBytes.downloadRef)>0,mime:created.mime,scriptCount,containsBridgeToken:measuredTokens.some(token=>html.includes(token)),containsBridgeScript:html.includes(CHANNEL),containsSourceDocumentSentinel:html.includes(SENTINEL),containsDocumentURL:/\/api\/documents\//.test(html),containsSourceViewer:sourceViewerCount>0,sourceButtonsHidden:offline.controls.length>0&&offline.controls.every(control=>control.display==='none'||control.visibility==='hidden'),externalRequests:offline.attemptedRequests.length,containsExpectedQuote:html.includes(QUOTE),urlRevoked,offlineFilterWorks,offlineDetailOpened});
  for(const key of ['nonempty','mime','scriptCount','containsBridgeToken','containsBridgeScript','containsSourceDocumentSentinel','containsDocumentURL','containsExpectedQuote','urlRevoked'])same(download.inspection[key],actual.download[key]);
  for(const key of ['containsSourceViewer','sourceButtonsHidden','externalRequests','offlineFilterWorks','offlineDetailOpened'])same(download.inspection[key],null);
  same(record.actual,actual);
  ensure(object(record.browser?.viewport)&&Number.isFinite(record.browser.deviceScaleFactor),'G12_BROWSER_VIEWPORT');
  const png=inspectPng(primaryBytes.pngRef,{...record.browser.viewport,deviceScaleFactor:record.browser.deviceScaleFactor});
  const offlinePng=inspectPng(await read(offline.pngRef),{...record.browser.viewport,deviceScaleFactor:record.browser.deviceScaleFactor});
  const trace=await inspectTrace(primaryBytes.browserTraceRef),offlineTrace=await inspectTrace(await read(offline.traceRef));
  return{actual,artifactRefs,diagnostics:{png,offlinePng,trace,offlineTrace,qualification:'Parsed artifacts and matching event/summary measurements still require independent trace inspection.'}};
}

#!/usr/bin/env node
// Root-owned actual browser execution. --prepare/import never starts a browser.
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {blockServiceWorkersSafely} from './browser-safe-service-workers.mjs';
import {snapshotReplaySources,assertReplaySourceParity} from './visual-replay-server.mjs';
import {prepareCaptureFonts} from './capture-visual-replay.mjs';
import {snapshotRun,sourceItems,renderDashboard,normalizeDashboardDesign} from '../../server/dashboard.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGIN='http://127.0.0.1:5210';
const PLAYWRIGHT='C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const ENTRY='/scripts/acceptance/browser-bridge-fixture.html';
const PROFILE='CURRENT_REPRODUCTION',ITEM='g12-item-a',OTHER='g12-item-b';
const SENTINEL='GSPEC_G12_ORIGINAL_ONLY_SENTINEL',QUOTE='Synthetic review quote';
const NEGATIVES=['wrongWindow','wrongOrigin','wrongChannel','wrongType','wrongToken','unknownItem','staleFrame','staleToken'];
const now=()=>new Date().toISOString(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const relative=file=>path.relative(ROOT,file).replaceAll('\\','/');
const ref=file=>({path:relative(file),sha256:sha(readFileSync(file))});
const json=value=>JSON.stringify(value,null,2)+'\n';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const failure=error=>({name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||'').slice(0,16000)});
const save=(file,value)=>{writeFileSync(file,json(value),{flag:'wx'});return ref(file);};
const safe=name=>{assert.ok(typeof name==='string'&&!name.split(/[\\/]/).some(part=>part==='..'||/^\.env(?:\.|$)/.test(part)));const file=path.resolve(ROOT,name);assert.ok(file.startsWith(ROOT+path.sep));return file;};

// Inert parsing counts elements, including when a bundle contains "<script>" text.
export function countScriptElements(html){
  const dom=new JSDOM(html);
  try{return dom.window.document.scripts.length;}finally{dom.window.close();}
}

export function makeBridgeFixture(){
  const sourceText=`${SENTINEL}\n${QUOTE}\nOther synthetic source quote\n`;
  const document={id:'g12-source-a',name:'Synthetic source.txt',kind:'txt',mime:'text/plain',role:'target',size:Buffer.byteLength(sourceText),url:'/api/documents/g12-source-a/content',status:'completed',preview:{type:'text',text:sourceText}};
  const items=[{id:ITEM,documentId:document.id,label:'Synthetic bridge item A',value:'31',unit:'MPa',criterionId:'g12-criterion',criterion:'At least 30 MPa',status:'pass',presence:'present',explanation:'31 MPa meets the synthetic threshold.',evidence:[{documentId:document.id,quote:QUOTE}]},{id:OTHER,documentId:document.id,label:'Synthetic bridge item B',value:'29',unit:'MPa',criterionId:'g12-criterion',criterion:'At least 30 MPa',status:'fail',presence:'present',explanation:'29 MPa is below the synthetic threshold.',evidence:[{documentId:document.id,quote:'Other synthetic source quote'}]}];
  const run={id:'g12-bridge-run',status:'completed',stage:'complete',mode:'criteria_first',criterionVersion:1,criteria:[],criteriaDocuments:[],documents:[document],items,analyses:[],events:[],summary:{total:2,pass:1,fail:1,review:0,pending:0}};
  return {schemaVersion:'1.0',synthetic:true,fixtureId:'g12-bridge-v1',sourceText,documents:[document],run};
}

export async function prepareBridge({loop='LOOP-005',g12Plan}={}){
  assert.equal(process.version,'v24.13.1');assert.match(loop,/^LOOP-\d{3,}$/);
  const source=await snapshotReplaySources(),registryRef=ref(path.join(ROOT,'scripts/acceptance/case-registry.json'));
  const out=path.join(ROOT,'artifacts/rebuild',loop.toLowerCase(),`browser-bridge-${now().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);mkdirSync(out,{recursive:true});
  const fixture=makeBridgeFixture(),fixtureRef=save(path.join(out,'fixture.json'),fixture);
  const sourceFile=path.join(out,'synthetic-source.txt');writeFileSync(sourceFile,fixture.sourceText,{flag:'wx'});
  const snapshot=snapshotRun(fixture.run,now()),snapshotRef=save(path.join(out,'snapshot.json'),snapshot);
  const design=normalizeDashboardDesign({title:'Synthetic bridge verification',subtitle:'Two declared synthetic items',theme:'light',motion:'none'});
  const html=renderDashboard(snapshot,design),htmlFile=path.join(out,'renderer-output.html');writeFileSync(htmlFile,html,{flag:'wx'});
  assert.equal(countScriptElements(html),2);assert.ok(!html.includes(SENTINEL));assert.ok(html.includes(QUOTE));
  const response={id:'g12-dashboard-template',status:'ready',message:'Declared synthetic provider boundary',attempt:1,criterionVersion:1,logs:[],sourceItems:sourceItems(snapshot),presentation:'generated',design,html};
  const responseRef=save(path.join(out,'dashboard-response-template.json'),response);
  let binding=null;
  if(g12Plan){const planPath=safe(g12Plan),value=JSON.parse(readFileSync(planPath,'utf8'));assert.equal(value.gateId,'G12');assert.equal(value.loop,loop);assert.equal(value.codeDigest,source.implementationDigest);assert.equal(value.registrySha256,registryRef.sha256);assert.ok(value.cases.some(item=>item.caseId==='G12:CORE-14-C05'));binding={ref:ref(planPath),value};}
  const baselines=['architecture/specs/05-dashboard-exports.md','architecture/specs/04-ui-motion.md','architecture/DECISIONS.md'].map(name=>ref(path.join(ROOT,name)));
  const plan={schemaVersion:'1.0',acceptanceProfile:PROFILE,caseId:'G12:CORE-14-C05',loop,preparedAt:now(),codeDigest:source.implementationDigest,registrySha256:registryRef.sha256,registryRef,sourceRef:save(path.join(out,'source-prepared.json'),source),fixtureRef,snapshotRef,responseRef,sourceFileRef:ref(sourceFile),renderedHtmlRef:ref(htmlFile),baselines,output:relative(out),origin:ORIGIN,entry:ENTRY,g12Binding:binding,developmentOnly:!binding,providerBoundary:'Predeclared synthetic POST/GET dashboard responses. Actual DashboardModal, dashboardBridge, parent listener, SourceEvidence, download function and fixed renderer.',actions:['Mount actual DashboardModal through isolated Vite fixture entry','Generate fresh preview for native click, Enter and Space; observe trusted source events and opaque-origin messages','Each independent negative starts at item B; invalid message tries item A; valid trusted counterpart then must select A','Replace preview to obtain distinct actual token and frame; isolate old frame/current token and current frame/old token','Unmount modal and observe actual production message-listener removal','Download with actual host button; read actual bytes; inspect objectURL lifecycle','Open captured bytes on an isolated local offline route; operate filters/details and count every attempted external request'],expected:{positiveItem:ITEM,negativeBaselineItem:OTHER,sandbox:'allow-scripts',referrerPolicy:'no-referrer',messageOrigin:'null',scriptCount:2,mime:'text/html;charset=utf-8',sourceSentinel:SENTINEL,expectedQuote:QUOTE},browserExecuted:false};
  return save(path.join(out,'bridge-plan.json'),plan);
}

// Observes calls/events without replacing production callbacks or state. Forged
// MessageEvents are used only by explicit negative tests, never positive evidence.
function instrumentation(){
  const events=[],messages=[],urls=[],listenerCalls=[],activeListeners=new Map(),retired=new Map(),windowIds=new WeakMap();let nextWindow=1,nextListener=1;
  const originalAdd=EventTarget.prototype.addEventListener,originalRemove=EventTarget.prototype.removeEventListener;
  const windowId=source=>{if(!source)return null;if(!windowIds.has(source))windowIds.set(source,`window-${nextWindow++}`);return windowIds.get(source);};
  const listenerIds=new WeakMap(),listenerId=fn=>{if(!listenerIds.has(fn))listenerIds.set(fn,`listener-${nextListener++}`);return listenerIds.get(fn);};
  originalAdd.call(window,'message',event=>{const frame=document.querySelector('.dashboard-preview-frame');messages.push({at:new Date().toISOString(),time:performance.now(),isTrusted:event.isTrusted,origin:event.origin,data:event.data,sourceWindow:windowId(event.source),currentFrameWindow:windowId(frame?.contentWindow),fromCurrentFrame:event.source===frame?.contentWindow});},true);
  for(const kind of ['click','keydown'])originalAdd.call(window,kind,event=>{const target=event.target?.closest?.('[data-review-source]');if(target)events.push({at:new Date().toISOString(),time:performance.now(),type:event.type,key:event.key??null,isTrusted:event.isTrusted,itemId:target.dataset.reviewSource,targetTag:target.tagName});},true);
  EventTarget.prototype.addEventListener=function(type,listener,options){if(this===window&&type==='message'&&listener){const id=listenerId(listener),capture=typeof options==='boolean'?options:Boolean(options?.capture);activeListeners.set(`${id}:${capture}`,{id,capture});listenerCalls.push({operation:'add',id,capture,time:performance.now()});}return originalAdd.call(this,type,listener,options);};
  EventTarget.prototype.removeEventListener=function(type,listener,options){if(this===window&&type==='message'&&listener){const id=listenerId(listener),capture=typeof options==='boolean'?options:Boolean(options?.capture);activeListeners.delete(`${id}:${capture}`);listenerCalls.push({operation:'remove',id,capture,time:performance.now()});}return originalRemove.call(this,type,listener,options);};
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=create(blob);urls.push({operation:'create',url,mime:blob.type,size:blob.size,time:performance.now()});return url;};
  URL.revokeObjectURL=url=>{urls.push({operation:'revoke',url,time:performance.now()});return revoke(url);};
  const frameInfo=()=>{const frame=document.querySelector('.dashboard-preview-frame');if(!frame)return null;const match=/const token=("(?:\\.|[^"\\])*"),known=/.exec(frame.srcdoc);return {token:match?JSON.parse(match[1]):null,windowId:windowId(frame.contentWindow),sandbox:frame.getAttribute('sandbox'),referrerPolicy:frame.referrerPolicy,srcdocLength:frame.srcdoc.length};};
  Object.defineProperty(window,'__bridgeObservation',{value:{snapshot:()=>({events:events.slice(),messages:messages.slice(),urls:urls.slice(),listenerCalls:listenerCalls.slice(),activeListeners:[...activeListeners.values()],frame:frameInfo()}),retain:label=>{const frame=document.querySelector('.dashboard-preview-frame');if(!frame)throw new Error('No actual frame to retain.');retired.set(label,frame.contentWindow);return frameInfo();},forge:({variant,token,oldToken,retiredLabel,itemId})=>{const frame=document.querySelector('.dashboard-preview-frame');let source=frame?.contentWindow||retired.get(retiredLabel),origin='null',data={channel:'trace-dashboard-evidence-v1',type:'select-item',token,itemId};if(variant==='wrongWindow')source=window;if(variant==='wrongOrigin')origin=location.origin;if(variant==='wrongChannel')data.channel='invalid-channel';if(variant==='wrongType')data.type='invalid-type';if(variant==='wrongToken')data.token=token+'-invalid';if(variant==='unknownItem')data.itemId='g12-unknown-item';if(variant==='staleFrame')source=retired.get(retiredLabel);if(variant==='staleToken')data.token=oldToken;const before={sourceWindow:windowId(source),currentFrameWindow:windowId(frame?.contentWindow),origin,data};window.dispatchEvent(new MessageEvent('message',{source,origin,data}));return {...before,syntheticNegative:true,isTrusted:false};}},configurable:false});
}

function hostState(){
  const evidence=document.querySelector('.dashboard-evidence'),focus=document.activeElement;
  return {modal:!!document.querySelector('dialog.dashboard-modal[open]'),view:document.querySelector('.dashboard-view-switch button[aria-pressed="true"]')?.textContent.trim()??null,selectedItemId:evidence?.getAttribute('data-selected-item-id')??null,pressedItemId:document.querySelector('.dbe-item-mark[aria-pressed="true"]')?.getAttribute('data-item-id')??null,focus:{tag:focus?.tagName,className:focus?.getAttribute('class'),text:focus?.textContent?.slice(0,120)},sourceText:document.querySelector('.dbe-source-preview')?.textContent??null,serviceWorkerPolicy:window.__gspecServiceWorkerPolicy,listenerState:window.__bridgeObservation.snapshot()};
}

export async function executeBridge(planName){
  assert.equal(process.version,'v24.13.1');const planFile=safe(planName),plan=JSON.parse(readFileSync(planFile,'utf8')),out=safe(plan.output);assert.equal(path.dirname(planFile),out);assert.equal(plan.acceptanceProfile,PROFILE);assert.equal(plan.origin,ORIGIN);assert.equal(plan.entry,ENTRY);
  const refs=[plan.sourceRef,plan.fixtureRef,plan.snapshotRef,plan.responseRef,plan.sourceFileRef,plan.renderedHtmlRef,plan.registryRef,...plan.baselines,...(plan.g12Binding?[plan.g12Binding.ref]:[])];for(const item of refs)assert.equal(ref(safe(item.path)).sha256,item.sha256,`Changed input ${item.path}`);
  const sourceBefore=await snapshotReplaySources(),prepared=JSON.parse(readFileSync(safe(plan.sourceRef.path),'utf8'));assertReplaySourceParity(prepared,sourceBefore);assert.equal(plan.codeDigest,sourceBefore.implementationDigest);
  save(path.join(out,'execution.lock.json'),{startedAt:now(),planRef:ref(planFile),processId:process.pid});
  const fixture=JSON.parse(readFileSync(safe(plan.fixtureRef.path),'utf8')),responseTemplate=JSON.parse(readFileSync(safe(plan.responseRef.path),'utf8'));
  const startedAt=now(),events=[],network=[],consoleErrors=[],tokens=[],positive={},rejected={},artifacts={};let browser,context,page,offlineContext,startup,serverAfter,sourceAfter,browserInfo,runError,generation=0;
  const actual={bridge:{positive,rejected,unmount:{unchanged:null},iframe:{sandbox:null,referrerPolicy:null,messageOrigin:null}},download:{nonempty:null,mime:null,scriptCount:null,containsBridgeToken:null,containsBridgeScript:null,containsSourceDocumentSentinel:null,containsDocumentURL:null,containsSourceViewer:null,sourceButtonsHidden:null,externalRequests:null,containsExpectedQuote:null,urlRevoked:null,offlineFilterWorks:null,offlineDetailOpened:null}};
  const event=(id,action,observed)=>{assert.ok(!events.some(row=>row.id===id));events.push({id,at:now(),action,observed});};
  const readServer=async endpoint=>{const response=await fetch(ORIGIN+endpoint,{signal:AbortSignal.timeout(10000),redirect:'error'});assert.ok(response.ok);return response.json();};
  const click=async name=>page.getByRole('button',{name,exact:true}).click();
  const frame=()=>page.frameLocator('.dashboard-preview-frame');
  const goCharts=async()=>{if(await page.getByRole('button',{name:'대시보드',exact:true}).getAttribute('aria-pressed')!=='true')await click('대시보드');await page.locator('.dashboard-preview-frame').waitFor();};
  const sourceControl=async()=>{await goCharts();const source=frame().locator(`[data-review-source="${ITEM}"]`);if(!await source.count()||!await source.isVisible())await frame().locator(`[data-review-id="${ITEM}"]`).click();await source.waitFor();return source;};
  const frameObservation=async()=>{const handle=await page.locator('.dashboard-preview-frame').elementHandle(),inner=await handle.contentFrame();return inner.evaluate(()=>window.__bridgeObservation.snapshot());};
  const generate=async()=>{
    if(!await page.locator('dialog.dashboard-modal').count()){await click('Open fixture dashboard');await page.locator('dialog.dashboard-modal').waitFor();}
    if(await page.getByRole('button',{name:'구성 수정',exact:true}).count())await click('구성 수정');
    const generateButton=page.getByRole('button',{name:/^(대시보드 만들기|다시 구성)$/});await generateButton.click();
    await page.locator('.dashboard-preview-frame').waitFor();
    await page.waitForFunction(previous=>{const current=window.__bridgeObservation.snapshot().frame;return current?.token&&current.token!==previous;},tokens.at(-1)||null);
    await frame().locator('#dashboard-root[data-chart-ready="true"]').waitFor();
    const info=await page.evaluate(()=>window.__bridgeObservation.snapshot().frame);assert.ok(info?.token);assert.ok(!tokens.includes(info.token),'Each successful preview needs a new actual token.');tokens.push(info.token);return info;
  };
  const selectBaseline=async()=>{await click('원본과 판정');await page.locator(`[data-item-id="${OTHER}"]`).click();await page.waitForFunction(id=>document.querySelector('.dashboard-evidence')?.getAttribute('data-selected-item-id')===id,OTHER);return page.evaluate(hostState);};
  const observeWait=async(target,label,predicate,arg,timeout=3000)=>{
    const start=Date.now();
    try{await target.waitForFunction(predicate,arg,{timeout});return {label,observed:true,milliseconds:Date.now()-start};}
    catch(error){if(error.name!=='TimeoutError')throw error;return {label,observed:false,milliseconds:Date.now()-start,error:failure(error)};}
  };
  const trustedSelect=async(kind)=>{
    const control=await sourceControl(),before=await page.evaluate(hostState),beforeFrame=await frameObservation(),beforeHost=await page.evaluate(()=>window.__bridgeObservation.snapshot());
    if(kind==='click')await control.click();else{await control.focus();await page.keyboard.press(kind==='enter'?'Enter':'Space');}
    const waits=[await observeWait(page,'selected item',id=>document.querySelector('.dashboard-evidence')?.getAttribute('data-selected-item-id')===id,ITEM),await observeWait(page,'source inspector focus',()=>document.activeElement?.classList.contains('dbe-inspector'))];
    const after=await page.evaluate(hostState),afterFrame=await frameObservation();
    const newEvents=afterFrame.events.slice(beforeFrame.events.length),newMessages=after.listenerState.messages.slice(beforeHost.messages.length);
    const expectedKind=kind==='click'?'click':'keydown',expectedKey=kind==='enter'?'Enter':kind==='space'?' ':null;
    const sourceEvent=newEvents.find(row=>row.type===expectedKind&&(expectedKey===null||row.key===expectedKey)&&row.itemId===ITEM)??null;
    const message=newMessages.find(row=>row.data?.channel==='trace-dashboard-evidence-v1'&&row.data?.itemId===ITEM&&row.fromCurrentFrame)??null;
    const current=before.listenerState.frame,data=message?.data;
    const messageMatches=message?.isTrusted===true&&message?.origin==='null'&&message?.fromCurrentFrame===true&&message?.sourceWindow===current?.windowId&&message?.currentFrameWindow===current?.windowId&&data?.channel==='trace-dashboard-evidence-v1'&&data?.type==='select-item'&&data?.token===current?.token&&data?.itemId===ITEM&&Object.keys(data).length===4;
    return {isTrusted:sourceEvent?.isTrusted??null,accepted:Boolean(sourceEvent?.isTrusted===true&&messageMatches&&before.selectedItemId!==ITEM&&after.selectedItemId===ITEM&&after.view==='원본과 판정'&&after.focus.className?.split(' ').includes('dbe-inspector')),selectedItemId:after.selectedItemId,before,after,sourceEvent,newEvents,message,newMessages,waits,sourceSentinelObserved:Boolean(after.sourceText?.includes(SENTINEL))};
  };
  try{
    startup=await readServer('/__visual/provenance');assertReplaySourceParity(sourceBefore,startup.snapshot);assert.equal(startup.snapshot.implementationDigest,plan.codeDigest);save(path.join(out,'server-startup-raw.json'),startup);
    const state=await readServer('/__visual/state');assert.deepEqual(state.subscribers,{run:0,activity:0},'Other replay clients must close before this fixture executes.');
    const {chromium}=await import(pathToFileURL(PLAYWRIGHT).href),executable=[chromium.executablePath(),'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);assert.ok(executable);
    browser=await chromium.launch({executablePath:executable,headless:true,args:['--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']});
    context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1,locale:'ko-KR',timezoneId:'Asia/Seoul',reducedMotion:'no-preference',acceptDownloads:true});await context.addInitScript(blockServiceWorkersSafely);await context.addInitScript(instrumentation);await context.tracing.start({screenshots:true,snapshots:true,sources:false,title:`${plan.loop} actual dashboard bridge`});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());network.push({at:now(),url:url.href,method:request.method()});
      if(url.origin!==ORIGIN&&!['data:','blob:'].includes(url.protocol))return route.abort('blockedbyclient');
      if(url.pathname==='/__bridge/seed')return route.fulfill({contentType:'application/json',body:json(fixture)});
      if(url.pathname==='/api/dashboards'&&request.method()==='POST'){generation++;const body=request.postDataJSON();assert.equal(body.runId,fixture.run.id);return route.fulfill({contentType:'application/json',body:json({id:`g12-dashboard-${generation}`,status:'queued'})});}
      if(/^\/api\/dashboards\/g12-dashboard-\d+$/.test(url.pathname)){if(request.method()==='DELETE')return route.fulfill({contentType:'application/json',body:'{}'});return route.fulfill({contentType:'application/json',body:json({...responseTemplate,id:url.pathname.split('/').at(-1)})});}
      if(url.pathname==='/api/documents/g12-source-a/content')return route.fulfill({contentType:'text/plain',body:fixture.sourceText});
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:501,contentType:'application/json',body:json({error:'Outside predeclared bridge fixture.'})});
      return route.continue();
    });
    page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>consoleErrors.push(failure(error)));await page.goto(ORIGIN+ENTRY,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Open fixture dashboard',exact:true}).waitFor();
    const fonts=await page.evaluate(prepareCaptureFonts);save(path.join(out,'fonts.json'),fonts);assert.ok(fonts.ready);
    browserInfo={name:browser.browserType().name(),version:browser.version(),userAgent:await page.evaluate(()=>navigator.userAgent),viewport:page.viewportSize(),deviceScaleFactor:await page.evaluate(()=>window.devicePixelRatio),executable,node:process.version};const initialListeners=await page.evaluate(()=>window.__bridgeObservation.snapshot().activeListeners);
    event('seed','Load declared fixture and actual component entry',{fixtureRef:plan.fixtureRef,sourceFileRef:plan.sourceFileRef,responseRef:plan.responseRef,htmlRef:plan.renderedHtmlRef,initialListeners});
    let currentInfo;
    for(const kind of ['click','enter','space']){currentInfo=await generate();const observed=await trustedSelect(kind);positive[kind]={isTrusted:observed.isTrusted,accepted:observed.accepted,selectedItemId:observed.selectedItemId};event(kind,`Native trusted ${kind} on actual iframe source button after fresh preview`,{generation,frame:currentInfo,...observed});if(kind==='click'){actual.bridge.iframe={sandbox:currentInfo.sandbox,referrerPolicy:currentInfo.referrerPolicy,messageOrigin:observed.message?.origin??null};}}
    const oldInfo=await page.evaluate(()=>window.__bridgeObservation.retain('before-replacement'));currentInfo=await generate();assert.notEqual(currentInfo.token,oldInfo.token);assert.notEqual(currentInfo.windowId,oldInfo.windowId);
    event('replacement','Generate new actual preview; retain detached prior frame and prior token',{old:oldInfo,current:currentInfo});
    for(const variant of NEGATIVES){
      const before=await selectBaseline();assert.equal(before.selectedItemId,OTHER);const injection=await page.evaluate(options=>window.__bridgeObservation.forge(options),{variant,token:currentInfo.token,oldToken:oldInfo.token,retiredLabel:'before-replacement',itemId:ITEM});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const after=await page.evaluate(hostState);const counter=await trustedSelect('click');const unchanged=before.selectedItemId===OTHER&&after.selectedItemId===OTHER&&before.view===after.view&&counter.isTrusted===true&&counter.accepted===true;rejected[variant]={unchanged};event(variant,'Independent forged negative followed by valid native counterpart',{changedCondition:variant,before,injection,after,validCounterpart:counter,unchanged});
    }
    await goCharts();const downloadPromise=page.waitForEvent('download');await click('시각화 HTML');const download=await downloadPromise,file=path.join(out,'actual-download.html');await download.saveAs(file);const bytes=readFileSync(file),html=bytes.toString('utf8');artifacts.downloadRef=ref(file);
    const revokeWait=await observeWait(page,'download objectURL revoked',()=>{const events=window.__bridgeObservation.snapshot().urls,last=events.filter(row=>row.operation==='create').at(-1);return last&&events.some(row=>row.operation==='revoke'&&row.url===last.url);},undefined,4000);
    const urlLog=await page.evaluate(()=>window.__bridgeObservation.snapshot().urls),blob=urlLog.filter(row=>row.operation==='create').at(-1);
    Object.assign(actual.download,{nonempty:bytes.length>0,mime:blob?.mime??null,scriptCount:countScriptElements(html),containsBridgeToken:tokens.some(token=>html.includes(token)),containsBridgeScript:html.includes('trace-dashboard-evidence-v1'),containsSourceDocumentSentinel:html.includes(SENTINEL),containsDocumentURL:/\/api\/documents\//.test(html),containsExpectedQuote:html.includes(QUOTE),urlRevoked:Boolean(blob&&urlLog.some(row=>row.operation==='revoke'&&row.url===blob.url&&row.time>=blob.time))});
    event('download','Actual host download button and captured browser download bytes',{downloadRef:artifacts.downloadRef,suggestedFilename:download.suggestedFilename(),bytes:bytes.length,mime:blob?.mime,urlLifecycle:urlLog,previewTokens:tokens.slice(),revokeWait,inspection:structuredClone(actual.download)});
    const beforeUnmount=await page.evaluate(()=>({host:document.querySelector('#root')?.textContent,observation:window.__bridgeObservation.snapshot(),retained:window.__bridgeObservation.retain('before-unmount')}));await click('대시보드 닫기');await page.locator('dialog.dashboard-modal').waitFor({state:'detached'});const closedBefore=await page.evaluate(hostState);const injected=await page.evaluate(options=>window.__bridgeObservation.forge(options),{variant:'unmount',token:currentInfo.token,retiredLabel:'before-unmount',itemId:ITEM});await pause(100);const closedAfter=await page.evaluate(hostState);const activeBefore=initialListeners.map(row=>`${row.id}:${row.capture}`).sort(),activeAfter=closedAfter.listenerState.activeListeners.map(row=>`${row.id}:${row.capture}`).sort();const mountedListeners=beforeUnmount.observation.activeListeners.map(row=>`${row.id}:${row.capture}`),removedListeners=mountedListeners.filter(id=>!activeBefore.includes(id)),removalCalls=closedAfter.listenerState.listenerCalls.filter(row=>row.operation==='remove').map(row=>`${row.id}:${row.capture}`);actual.bridge.unmount={unchanged:!closedBefore.modal&&!closedAfter.modal&&closedBefore.selectedItemId===closedAfter.selectedItemId&&JSON.stringify(activeBefore)===JSON.stringify(activeAfter)&&removedListeners.length>0&&removedListeners.every(id=>removalCalls.includes(id))&&injected.syntheticNegative===true&&injected.isTrusted===false&&injected.sourceWindow===beforeUnmount.retained.windowId&&injected.currentFrameWindow===null&&injected.origin==='null'&&JSON.stringify(injected.data)===JSON.stringify({channel:'trace-dashboard-evidence-v1',type:'select-item',token:beforeUnmount.retained.token,itemId:ITEM})};
    event('unmount','Unmount actual modal, inject old message, verify listener removal and unchanged host',{beforeUnmount,closedBefore,injected,closedAfter,initialListeners,activeAfter,...actual.bridge.unmount});
    // Open the exact captured bytes on loopback; this is an isolated offline
    // document context, not a re-rendered approximation of the download.
    offlineContext=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1,locale:'ko-KR',acceptDownloads:false});await offlineContext.addInitScript(blockServiceWorkersSafely);await offlineContext.tracing.start({screenshots:true,snapshots:true,sources:false,title:'Actual downloaded bytes offline'});const offlineRequests=[],offlinePath='/__bridge-offline/actual-download.html';
    await offlineContext.route('**/*',route=>{const url=route.request().url();if(url===ORIGIN+offlinePath)return route.fulfill({contentType:'text/html;charset=utf-8',body:bytes});offlineRequests.push({url,method:route.request().method()});return route.abort('blockedbyclient');});
    const offline=await offlineContext.newPage();await offline.goto(ORIGIN+offlinePath,{waitUntil:'domcontentloaded'});await offline.locator('#dashboard-root[data-chart-ready="true"]').waitFor();
    await offline.locator('[data-filter="fail"]').click();
    const filterWait=await observeWait(offline,'offline fail filter',count=>document.querySelector('#dashboard-root')?.getAttribute('data-visible-findings')===String(count),fixture.run.items.filter(item=>item.status==='fail').length);
    const filtered=await offline.locator('#dashboard-root').getAttribute('data-visible-findings');
    await offline.locator('[data-filter="all"]').click();
    const restoreWait=await observeWait(offline,'offline all filter',count=>document.querySelector('#dashboard-root')?.getAttribute('data-visible-findings')===String(count),fixture.run.items.length);
    await offline.locator(`[data-review-id="${ITEM}"]`).click();
    const detailWait=await observeWait(offline,'offline detail content',()=>Boolean(document.querySelector('[data-dashboard="details"]')?.textContent?.trim()));
    const offlineDom=await offline.evaluate(()=>({url:location.href,html:document.documentElement.outerHTML,serviceWorkerPolicy:window.__gspecServiceWorkerPolicy,scripts:document.scripts.length,canvasCount:document.querySelectorAll('canvas').length,detailText:document.querySelector('[data-dashboard="details"]')?.textContent,sourceControls:[...document.querySelectorAll('[data-review-source]')].map(element=>({itemId:element.getAttribute('data-review-source'),display:getComputedStyle(element).display,visibility:getComputedStyle(element).visibility,rect:element.getBoundingClientRect().toJSON()})),sourceViewerCount:document.querySelectorAll('.document-preview,.dashboard-source-view,.dashboard-evidence,iframe,[data-source-document-id]').length,rootAttributes:Object.fromEntries([...document.querySelector('#dashboard-root').attributes].map(attribute=>[attribute.name,attribute.value]))}));
    actual.download.containsSourceViewer=offlineDom.sourceViewerCount>0;actual.download.sourceButtonsHidden=offlineDom.sourceControls.length>0&&offlineDom.sourceControls.every(control=>control.display==='none'||control.visibility==='hidden');actual.download.externalRequests=offlineRequests.length;
    actual.download.offlineFilterWorks=String(filtered)===String(fixture.run.items.filter(item=>item.status==='fail').length)&&offlineDom.rootAttributes['data-visible-findings']===String(fixture.run.items.length);
    actual.download.offlineDetailOpened=Boolean(offlineDom.detailText?.trim());
    const offlineDomRef=save(path.join(out,'offline-dom.json'),offlineDom);await offline.screenshot({path:path.join(out,'offline.png'),type:'png'});const offlineTrace=path.join(out,'offline-trace.zip');await offlineContext.tracing.stop({path:offlineTrace});event('offline','Open actual downloaded bytes; native filter and detail actions; inspect source controls and network',{offlineDomRef,pngRef:ref(path.join(out,'offline.png')),traceRef:ref(offlineTrace),filteredCount:filtered,restoredCount:offlineDom.rootAttributes['data-visible-findings'],detailOpened:actual.download.offlineDetailOpened,waits:[filterWait,restoreWait,detailWait],sourceControlCount:offlineDom.sourceControls.length,controls:offlineDom.sourceControls,attemptedRequests:offlineRequests,downloadHash:artifacts.downloadRef.sha256});
    await offlineContext.close();offlineContext=null;
    // Final representative PNG is a real mounted source selection, using a new
    // native positive. This extra token is also checked against download bytes.
    await click('Open fixture dashboard');await page.locator('.dashboard-preview-frame').waitFor();await trustedSelect('click');artifacts.domRef=save(path.join(out,'host-dom.json'),await page.evaluate(()=>({state:window.__bridgeObservation.snapshot(),html:document.documentElement.outerHTML})));await page.screenshot({path:path.join(out,'host.png'),type:'png'});artifacts.pngRef=ref(path.join(out,'host.png'));
  }catch(error){runError=failure(error);}
  finally{
    if(page&&!page.isClosed()&&!artifacts.domRef)try{artifacts.domRef=save(path.join(out,'host-dom-error.json'),await page.evaluate(()=>({url:location.href,html:document.documentElement.outerHTML,observation:window.__bridgeObservation?.snapshot?.()})));await page.screenshot({path:path.join(out,'host-error.png'),type:'png'});artifacts.pngRef=ref(path.join(out,'host-error.png'));}catch(error){consoleErrors.push(failure(error));}
    if(offlineContext)await offlineContext.close().catch(error=>consoleErrors.push(failure(error)));
    if(context){try{const trace=path.join(out,'browser-trace.zip');await context.tracing.stop({path:trace});artifacts.browserTraceRef=ref(trace);}catch(error){consoleErrors.push(failure(error));}await context.close().catch(error=>consoleErrors.push(failure(error)));}
    if(browser)await browser.close().catch(error=>consoleErrors.push(failure(error)));
    try{sourceAfter=await snapshotReplaySources();serverAfter=await readServer('/__visual/provenance');assertReplaySourceParity(sourceBefore,sourceAfter);assertReplaySourceParity(sourceBefore,serverAfter.snapshot);assert.equal(startup.processId,serverAfter.processId);assert.equal(startup.startedAt,serverAfter.startedAt);}catch(error){runError??=failure(error);}
  }
  const identity=value=>value?JSON.stringify({processId:value.processId,startedAt:value.startedAt,node:value.node}):null;
  artifacts.eventLogRef=save(path.join(out,'event-log.json'),{schemaVersion:'1.0',kind:'g12-browser-event-log',events,network,consoleErrors,previewTokens:tokens,runError});
  artifacts.sourceProvenanceRef=save(path.join(out,'source-provenance.json'),{schemaVersion:'1.0',kind:'g12-browser-source-provenance',loop:plan.loop,registrySha256:plan.registrySha256,codeDigestBefore:sourceBefore.implementationDigest,codeDigestAfter:sourceAfter?.implementationDigest??null,serverCodeDigest:startup?.snapshot.implementationDigest??null,serverIdentityBefore:identity(startup),serverIdentityAfter:identity(serverAfter),combinedSourceBefore:sourceBefore.digest,combinedSourceAfter:sourceAfter?.digest??null,startup,serverAfter});
  const endedAt=now(),report={schemaVersion:'1.0',acceptanceProfile:PROFILE,caseId:'G12:CORE-14-C05',origin:'actual-browser',oracleAccess:false,loop:plan.loop,codeDigest:plan.codeDigest,registrySha256:plan.registrySha256,planRef:plan.g12Binding?.ref||ref(planFile),collectorPlanRef:ref(planFile),developmentOnly:plan.developmentOnly,startedAt,endedAt,browser:browserInfo,providerCalls:{gemini:0,e2b:0},...artifacts,actual,runError,consoleErrors,command:[process.execPath,...process.argv.slice(1)],executionBoundary:plan.providerBoundary};
  const reportRef=save(path.join(out,'browser-record.json'),report);return {reportRef,exitCode:runError?1:0,developmentOnly:plan.developmentOnly,events:events.map(row=>row.id),error:runError?.message??null};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{const [mode,...args]=process.argv.slice(2);if(mode==='--prepare'){let loop='LOOP-005',g12Plan;for(let i=0;i<args.length;i++){if(args[i]==='--loop')loop=args[++i];else if(args[i]==='--g12-plan')g12Plan=args[++i];else throw new Error('Unknown preparation option.');}console.log(JSON.stringify({plan:await prepareBridge({loop,g12Plan}),browserExecuted:false}));}else if(mode==='--execute'&&args.length===1){const result=await executeBridge(args[0]);console.log(JSON.stringify(result));process.exitCode=result.exitCode;}else if(mode==='--help')console.log('Pinned Node: browser-bridge-runtime.mjs --prepare --loop LOOP-005 [--g12-plan <G12-plan.json>]; root starts fresh existing replay server, then --execute <bridge-plan.json>. Without G12 binding the actual report is explicitly developmental. No browser executes on import/preparation.');else throw new Error('Expected --prepare or --execute <bridge-plan.json>.');}catch(error){console.error(JSON.stringify(failure(error)));process.exitCode=1;}
}

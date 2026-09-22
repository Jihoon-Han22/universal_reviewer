#!/usr/bin/env node
// Test-only observer. Import and --prepare never launch a browser/server/provider.
// The root explicitly executes a reviewed plan against its owned localhost app.
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync,existsSync,appendFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {snapshotReplaySources,assertReplaySourceParity,loadReplayInputs} from './visual-replay-server.mjs';
import {prepareCaptureFonts} from './capture-visual-replay.mjs';
import {browserBehaviorFacets,missingBrowserBehaviorFacets,makeBrowserBehaviorCases} from './browser-behavior-plan.mjs';
import {blockServiceWorkersSafely} from './browser-safe-service-workers.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGIN='http://127.0.0.1:5210';
const PLAYWRIGHT='C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const PROFILE='CURRENT_REPRODUCTION';
const now=()=>new Date().toISOString();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const relative=file=>path.relative(ROOT,file).split(path.sep).join('/');
const json=value=>JSON.stringify(value,null,2)+'\n';
const errorData=error=>({name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||'').slice(0,12000)});
const fileRef=file=>({path:relative(file),sha256:sha(readFileSync(file))});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function resolveWorkspace(name){const result=path.resolve(ROOT,name);assert.ok(result.startsWith(ROOT+path.sep)&&!name.split(/[\\/]/).some(segment=>segment==='..'||/^\.env(?:\.|$)/.test(segment)),'Unsafe evidence path.');return result;}
function save(file,value){writeFileSync(file,json(value),{flag:'wx'});return fileRef(file);}
function quantiles(values){const sorted=[...values].sort((a,b)=>a-b);return {n:sorted.length,median:sorted.length?sorted[Math.floor((sorted.length-1)*.5)]:null,p95:sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:null,min:sorted[0]??null,max:sorted.at(-1)??null};}

export async function prepareBrowserBehavior(loop='LOOP-005'){
  assert.equal(process.version,'v24.13.1');assert.match(loop,/^LOOP-\d{3,}$/);
  const registry=JSON.parse(readFileSync(path.join(ROOT,'scripts/acceptance/case-registry.json'),'utf8'));
  const registryRef=fileRef(path.join(ROOT,'scripts/acceptance/case-registry.json'));
  const source=await snapshotReplaySources(),input=loadReplayInputs();
  const out=path.join(ROOT,'artifacts/rebuild',loop.toLowerCase(),`browser-behavior-${now().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
  mkdirSync(out,{recursive:true});mkdirSync(path.join(out,'facets'));mkdirSync(path.join(out,'cases'));
  const sourceRef=save(path.join(out,'source-prepared.json'),source);
  const cases=makeBrowserBehaviorCases(registry,input.inputs.map(({path,sha256})=>({path,sha256})));
  const supplementalBaselines=['architecture/ui/interaction-contract.md','architecture/ui/auxiliary-contract.md','architecture/specs/07-data-algorithms-concurrency.md'].map(name=>fileRef(path.join(ROOT,name)));
  const freezePath=path.join(ROOT,'.cache/rebuild/freeze.json');
  const plan={schemaVersion:'1.0',acceptanceProfile:PROFILE,gateId:'G13',loop,preparedAt:now(),codeDigest:source.implementationDigest,registrySha256:registryRef.sha256,registryRef,sourceRef,supplementalBaselines,origin:ORIGIN,output:relative(out),cases,facets:browserBehaviorFacets,missingFacets:missingBrowserBehaviorFacets,freeze:existsSync(freezePath)?{ref:fileRef(freezePath),value:JSON.parse(readFileSync(freezePath,'utf8'))}:null,fixture:{id:input.fixture.fixtureId,synthetic:true,N:2,I:input.fixture.items.length,providerCalls:{gemini:0,e2b:0}},instrumentation:'Transparent EventSource/ResizeObserver/objectURL call-through wrappers; PerformanceObserver and requestAnimationFrame samples. No application state injection or CSS mutation.',limitations:'This is a partial execution collector. Unsupported PDF/provider/large-input/queue facets remain NOT_RUN. A native zoom shortcut that is ignored is NOT_RUN, never relabelled CSS or pinch zoom.',browserExecuted:false};
  return save(path.join(out,'plan.json'),plan);
}

// Browser instrumentation changes no business state or clock and preserves every
// original call. Counters belong to this isolated test realm only.
function instrumentBrowser(){
  const observation={started:performance.now(),events:[],longTasks:[],raf:[],urls:new Set(),sources:new Set(),observers:new Map()};
  const record=(kind,detail={})=>observation.events.push({time:performance.now(),kind,...detail});
  const OriginalEventSource=window.EventSource;
  window.EventSource=class ObservedEventSource extends OriginalEventSource {
    constructor(...args){super(...args);observation.sources.add(this);record('sse.create',{url:String(args[0])});}
    close(){record('sse.close',{url:this.url});observation.sources.delete(this);return super.close();}
  };
  const OriginalResizeObserver=window.ResizeObserver;
  window.ResizeObserver=class ObservedResizeObserver extends OriginalResizeObserver {
    constructor(...args){super(...args);observation.observers.set(this,new Set());record('resize.create');}
    observe(element,...rest){observation.observers.get(this).add(element);record('resize.observe');return super.observe(element,...rest);}
    unobserve(element){observation.observers.get(this).delete(element);record('resize.unobserve');return super.unobserve(element);}
    disconnect(){observation.observers.get(this).clear();record('resize.disconnect');return super.disconnect();}
  };
  const originalCreate=URL.createObjectURL.bind(URL),originalRevoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=(...args)=>{const url=originalCreate(...args);observation.urls.add(url);record('objectURL.create',{url});return url;};
  URL.revokeObjectURL=url=>{observation.urls.delete(url);record('objectURL.revoke',{url});return originalRevoke(url);};
  try{new PerformanceObserver(list=>{for(const entry of list.getEntries())observation.longTasks.push(entry.toJSON());}).observe({type:'longtask',buffered:true});}catch{}
  let last=null;const sample=time=>{if(last!==null)observation.raf.push({time,interval:time-last});last=time;requestAnimationFrame(sample);};requestAnimationFrame(sample);
  Object.defineProperty(window,'__gspecBrowserBehavior',{value:{snapshot:()=>({started:observation.started,now:performance.now(),events:observation.events.slice(),longTasks:observation.longTasks.slice(),raf:observation.raf.slice(),objectURLs:[...observation.urls],sse:[...observation.sources].map(source=>({url:source.url,readyState:source.readyState})),resizeObservers:[...observation.observers.values()].filter(elements=>elements.size>0).length,resizeObservedElements:[...observation.observers.values()].reduce((sum,elements)=>sum+elements.size,0)})},configurable:false});
}
function observePage(){
  const describe=element=>element?{tag:element.tagName.toLowerCase(),id:element.id,className:element.getAttribute('class'),name:element.getAttribute('aria-label')||element.textContent?.trim().slice(0,180),role:element.getAttribute('role'),tabIndex:element.tabIndex}:null;
  const rect=element=>{const box=element.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height};};
  const animations=document.getAnimations().filter(animation=>animation.playState==='running').map(animation=>({target:describe(animation.effect?.target),timing:animation.effect?.getTiming(),currentTime:animation.currentTime}));
  const selectors=['.app-header','.workflow-main','.workflow-input-card','.live-review-workspace','.sandbox-activity-workspace','.file-review-results','.frr-source','.frr-detail','.frr-focus-view','.results-visuals','.dashboard-modal','.ledger-modal'];
  return {time:performance.now(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualScale:visualViewport?.scale},width:innerWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,scrollWidth:document.documentElement.scrollWidth,app:document.documentElement.dataset.motion,stored:localStorage.getItem('trace-demo-motion'),osReduce:matchMedia('(prefers-reduced-motion: reduce)').matches,pressed:document.querySelector('.motion-toggle')?.getAttribute('aria-pressed'),running:animations.length,animations,packets:document.querySelectorAll('.theater-packet-layer > *').length,itemCount:document.querySelectorAll('.frr-item').length,focus:describe(document.activeElement),live:[...document.querySelectorAll('[role="status"],[aria-live]')].map(element=>({text:element.textContent.trim(),role:element.getAttribute('role'),live:element.getAttribute('aria-live')})),bounds:Object.fromEntries(selectors.map(selector=>{const element=document.querySelector(selector);return [selector,element?{...rect(element),display:getComputedStyle(element).display,order:getComputedStyle(element).order}:null];})),controls:[...document.querySelectorAll('button,a,input,select,textarea')].filter(element=>element.getClientRects().length>0).map(element=>({...describe(element),box:rect(element),disabled:element.disabled,pressed:element.getAttribute('aria-pressed'),selected:element.getAttribute('aria-selected'),expanded:element.getAttribute('aria-expanded')})),serviceWorkerPolicy:window.__gspecServiceWorkerPolicy,resources:{iframes:document.querySelectorAll('iframe').length,canvases:document.querySelectorAll('canvas').length,...window.__gspecBrowserBehavior.snapshot()}};
}

export async function executeBrowserBehavior(planName){
  assert.equal(process.version,'v24.13.1','Use the pinned Node executable.');
  const planPath=resolveWorkspace(planName),plan=JSON.parse(readFileSync(planPath,'utf8')),out=resolveWorkspace(plan.output);
  assert.equal(plan.acceptanceProfile,PROFILE);assert.equal(plan.gateId,'G13');assert.equal(plan.origin,ORIGIN);assert.equal(plan.cases.length,12);
  assert.equal(path.dirname(planPath),out);assert.equal(plan.registrySha256,fileRef(path.join(ROOT,'scripts/acceptance/case-registry.json')).sha256);
  const prepared=JSON.parse(readFileSync(resolveWorkspace(plan.sourceRef.path),'utf8'));
  assert.equal(fileRef(resolveWorkspace(plan.sourceRef.path)).sha256,plan.sourceRef.sha256);
  assertReplaySourceParity(prepared,await snapshotReplaySources());
  for(const ref of [...plan.cases.flatMap(item=>[...item.inputs,...item.baselineReferences]),...plan.supplementalBaselines])assert.equal(fileRef(resolveWorkspace(ref.path)).sha256,ref.sha256,`Changed input: ${ref.path}`);
  save(path.join(out,'execution.lock.json'),{startedAt:now(),processId:process.pid,planRef:fileRef(planPath)});
  const startedAt=now(),results={},traceRefs=[],errors=[],contextReports=[],blockedExternal=[],detailSamples=[],modalSamples=[];
  const log=(kind,data={})=>appendFileSync(path.join(out,'actions.jsonl'),JSON.stringify({time:now(),kind,...data})+'\n');
  const controller=async(name,method='GET')=>{const url=method==='GET'?ORIGIN+name:ORIGIN+'/__visual/control/'+name;const response=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(10000),...(method==='POST'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});const value=await response.json();log('controller',{method,path:new URL(url).pathname,status:response.status});assert.ok(response.ok,`Replay ${response.status}: ${name}`);return value;};
  const waitServer=async(predicate,label)=>{const end=Date.now()+15000;let value;do{value=await controller('/__visual/state');if(predicate(value))return value;await pause(100);}while(Date.now()<end);throw new Error(`Replay state deadline: ${label}`);};
  let browser,context,page,startup,browserInfo,sourceParity=false,contextId=0,runError;
  const click=async name=>{log('click',{name});await page.getByRole('button',{name,exact:true}).click();};
  const motion=async enabled=>{const target=enabled?'모션 OFF':'모션 ON';if(await page.getByRole('button',{name:target,exact:true}).count())await click(target);await page.waitForFunction(value=>document.documentElement.dataset.motion===(value?'full':'reduced'),enabled);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  const recordFacet=async(id,operation)=>{
    const definition=plan.facets.find(item=>item.id===id);assert.ok(definition);const record={id,startedAt:now(),state:'not_run',expected:definition.expected,observations:null,artifactRefs:[]};
    try{record.observations=await operation();if(record.observations?.notRunReason){record.reason=record.observations.notRunReason;record.state='not_run';}else{record.assertions=Object.entries(definition.expected).map(([key,expected])=>({key,expected,actual:record.observations?.[key],passed:JSON.stringify(expected)===JSON.stringify(record.observations?.[key])}));record.state=record.assertions.every(item=>item.passed)?'passed':'failed';}}
    catch(error){record.state='failed';record.error=errorData(error);log('facet-error',{id,...record.error});}
    if(page&&!page.isClosed()){
      try{record.artifactRefs.push(save(path.join(out,'facets',id+'.dom.json'),await page.evaluate(observePage)));const filename=path.join(out,'facets',id+'.png');await page.screenshot({path:filename,type:'png',animations:'allow',timeout:10000});record.artifactRefs.push(fileRef(filename));}catch(error){record.artifactError=errorData(error);record.state='failed';}
    }
    record.endedAt=now();results[id]=record;save(path.join(out,'facets',id+'.json'),record);log('facet-complete',{id,state:record.state});return record;
  };
  const openContext=async label=>{
    const state=await waitServer(state=>state.subscribers.run===0&&state.subscribers.activity===0,'previous context cleanup');assert.deepEqual(state.subscribers,{run:0,activity:0});await controller('reset','POST');
    contextId++;context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1,locale:'ko-KR',timezoneId:'Asia/Seoul',colorScheme:'light',reducedMotion:'no-preference',acceptDownloads:false});
    await context.tracing.start({screenshots:true,snapshots:true,sources:false,title:`${plan.loop} G13 ${label}`});await context.addInitScript(blockServiceWorkersSafely);await context.addInitScript(instrumentBrowser);
    const fontCss=readFileSync(path.join(ROOT,'architecture/ui/fonts/fonts.css'),'utf8').replaceAll('url(./',`url(${ORIGIN}/architecture/ui/fonts/`);
    await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith('https://fonts.googleapis.com/'))return route.fulfill({contentType:'text/css',body:fontCss});if(url.startsWith('data:')||url.startsWith('blob:'))return route.continue();try{if(new URL(url).origin===ORIGIN)return route.continue();}catch{}blockedExternal.push({url,method:route.request().method()});return route.abort('blockedbyclient');});
    page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push({context:contextId,...errorData(error)}));
    await page.goto(ORIGIN,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'검토 기준부터 시작하기',exact:true}).waitFor();
    const fonts=await page.evaluate(prepareCaptureFonts);save(path.join(out,`context-${contextId}-fonts.json`),fonts);assert.ok(fonts.ready,'Required supplied font families must load.');
    const environment=await page.evaluate(()=>({userAgent:navigator.userAgent,platform:navigator.platform,languages:navigator.languages,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory??null,dpr:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}));
    browserInfo.userAgent??=environment.userAgent;contextReports.push({id:contextId,label,environment});
  };
  const closeContext=async()=>{if(!context)return;const current=context;context=null;try{const filename=path.join(out,`context-${contextId}-trace.zip`);await current.tracing.stop({path:filename});traceRefs.push(fileRef(filename));}finally{await current.close();page=null;}await waitServer(state=>state.subscribers.run===0&&state.subscribers.activity===0,'closed context SSE subscriptions');};
  const startToLive=async({alreadyInput=false}={})=>{
    if(!alreadyInput)await click('검토 기준부터 시작하기');
    await page.locator('input[type=file]').setInputFiles(path.join(ROOT,'architecture/ui/reference/synthetic-fixture.json'));
    await page.locator('button.workflow-file-open').filter({hasText:'합성_품질기준.xlsx'}).waitFor();await click('기준 정리하기');
    await waitServer(state=>state.started&&state.subscribers.run>0,'actual run SSE');await controller('startReading','POST');await controller('confirmReady','POST');
    await page.getByRole('button',{name:'기준 확정 · 검토 파일 넣기',exact:true}).waitFor();await click('기준 확정 · 검토 파일 넣기');
    await page.getByRole('button',{name:'이 기준으로 검토하기',exact:true}).waitFor();await page.locator('input[type=file]').setInputFiles(path.join(ROOT,'architecture/ui/reference/synthetic-fixture.json'));
    await page.locator('button.workflow-file-open').filter({hasText:'합성_시험성적서_A.xlsx'}).waitFor();await click('이 기준으로 검토하기');
    await waitServer(state=>state.phase==='target-attached','actual target attachment');await controller('reviewActive','POST');await page.locator('.live-review-workspace').waitFor();await page.locator('.theater-result-card').first().waitFor();
  };
  const announcement=async()=>page.evaluate(()=>{const elements=[...document.querySelectorAll('[role="status"],[aria-live]')];const element=elements.find(element=>/검토 (진행 중|완료)\. 추출/.test(element.textContent));return {announcement:element?.textContent.trim()??null,polite:element?.getAttribute('aria-live')==='polite',all:elements.map(element=>({text:element.textContent.trim(),role:element.getAttribute('role'),live:element.getAttribute('aria-live')}))};});
  try{
    startup=await controller('/__visual/provenance');assertReplaySourceParity(prepared,startup.snapshot);save(path.join(out,'server-startup.json'),startup);
    const {chromium}=await import(pathToFileURL(PLAYWRIGHT).href);const executable=[chromium.executablePath(),'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);assert.ok(executable,'No installed browser; installation is not performed.');
    browser=await chromium.launch({executablePath:executable,headless:true,timeout:30000,args:['--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']});
    browserInfo={name:browser.browserType().name(),version:browser.version(),executable,node:process.version,headless:true,profile:'isolated temporary; no user profile'};
    await openContext('main');
    await recordFacet('landing-off',async()=>{await motion(false);const observed=await page.evaluate(observePage);await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'모션 OFF',exact:true}).waitFor();return {...observed,reloadApp:await page.locator('html').getAttribute('data-motion')};});
    await recordFacet('landing-os',async()=>{await motion(true);await page.emulateMedia({reducedMotion:'reduce'});return page.evaluate(observePage);});
    await recordFacet('mobile-landing',async()=>{await page.setViewportSize({width:390,height:844});return page.evaluate(observePage);});
    await page.setViewportSize({width:1440,height:960});await page.emulateMedia({reducedMotion:'no-preference'});
    await recordFacet('native-zoom',async()=>{const before=await page.evaluate(observePage);for(let i=0;i<5;i++)await page.keyboard.press('Control+Equal');await pause(250);const after=await page.evaluate(observePage);const verified200Percent=Math.abs(after.viewport.dpr/before.viewport.dpr-2)<.03&&Math.abs(after.width/before.width-.5)<.03;await page.screenshot({path:path.join(out,'native-zoom-attempt.png'),type:'png'});await page.keyboard.press('Control+0');return {verified200Percent,before,after,...(!verified200Percent?{notRunReason:'Installed headless browser did not expose genuine 200% native zoom via keyboard. No CSS or CDP pinch zoom substitution was made.'}:{})};});
    await recordFacet('landing-keyboard',async()=>{
      const toggle=page.getByRole('button',{name:/^모션 (ON|OFF)$/});const traversal=[];let reachable=false;
      for(let i=0;i<20;i++){await page.keyboard.press('Tab');const focus=await page.evaluate(()=>({name:document.activeElement?.textContent?.trim(),motion:document.activeElement?.classList.contains('motion-toggle')}));traversal.push(focus);if(focus.motion){reachable=true;break;}}
      await page.keyboard.press('Shift+Tab');const previous=await page.evaluate(()=>document.activeElement?.classList.contains('motion-toggle'));await page.keyboard.press('Tab');const returned=await toggle.evaluate(element=>element===document.activeElement);const before=await page.locator('html').getAttribute('data-motion');await page.keyboard.press('Space');await pause(100);const after=await page.locator('html').getAttribute('data-motion');
      const start=page.getByRole('button',{name:'검토 기준부터 시작하기',exact:true});await start.focus();await page.keyboard.press('Enter');await page.locator('.workflow-input-card').waitFor();return {tabReachable:reachable,shiftTabReverses:previous===false&&returned,spaceToggles:before!==after,enterStarts:await page.locator('.workflow-input-card').isVisible(),traversal};
    });
    // A failed keyboard assertion never authorizes jumping React state. Continue
    // only if the ordinary start control actually reached criteria input.
    assert.ok(await page.locator('.workflow-input-card').isVisible());await motion(true);await startToLive({alreadyInput:true});
    const recordingStart=await page.evaluate(()=>performance.now());await pause(30010);const recordingEnd=await page.evaluate(()=>performance.now());
    await recordFacet('live-aria',announcement);
    await recordFacet('live-off',async()=>{await motion(false);return page.evaluate(observePage);});
    await recordFacet('mobile-live',async()=>{await page.setViewportSize({width:390,height:844});return page.evaluate(observePage);});await page.setViewportSize({width:1440,height:960});
    await controller('complete','POST');await page.getByRole('heading',{name:'파일별로, 결과와 근거를 함께.',exact:true}).waitFor();await page.locator('.frr-item').first().waitFor();
    await recordFacet('results-off',()=>page.evaluate(observePage));
    await recordFacet('detail-focus',async()=>{
      const trials=[];for(let i=0;i<5;i++){const item=page.locator('.frr-item').filter({hasText:'흡수율'});await item.focus();const before=await page.evaluate(()=>performance.now());await page.keyboard.press('Enter');await page.locator('.inspector-focused-heading h3').waitFor();const after=await page.evaluate(()=>performance.now());detailSamples.push(after-before);const headingFocused=await page.locator('.inspector-focused-heading h3').evaluate(element=>element===document.activeElement);await click('항목 목록');await item.waitFor();const restored=await item.evaluate(element=>element===document.activeElement);trials.push({headingFocused,restored,milliseconds:after-before});}return {headingFocused:trials.every(trial=>trial.headingFocused),restored:trials.every(trial=>trial.restored),iterations:trials.length,trials};
    });
    await recordFacet('mobile-results',async()=>{await page.setViewportSize({width:390,height:844});await page.locator('.frr-item').filter({hasText:'흡수율'}).click();await page.locator('.frr-focus-view').waitFor();const observed=await page.evaluate(observePage);return {...observed,detailBeforeSource:observed.bounds['.frr-detail'].y<observed.bounds['.frr-source'].y};});
    await page.setViewportSize({width:1440,height:960});if(await page.getByRole('button',{name:'항목 목록',exact:true}).count())await click('항목 목록');
    await click('전체 요약');await page.locator('.rv-item-tile').first().waitFor();
    await recordFacet('summary-tooltip',async()=>{const tile=page.locator('.rv-item-tile').filter({hasText:'흡수율'});await tile.focus();const tooltip=page.locator('#rv-item-tooltip');await tooltip.waitFor();const value=await tooltip.evaluate(element=>({role:element.getAttribute('role'),width:element.getBoundingClientRect().width,rect:element.getBoundingClientRect().toJSON(),style:{maxHeight:getComputedStyle(element).maxHeight,pointerEvents:getComputedStyle(element).pointerEvents}}));const described=await tile.getAttribute('aria-describedby')==='rv-item-tooltip';await page.keyboard.press('Escape');const escapeKeepsOpen=await tooltip.count()===1;await page.getByRole('button',{name:'전체 요약',exact:true}).focus();await tooltip.waitFor({state:'detached'});return {...value,described,escapeKeepsOpen,blurCloses:await tooltip.count()===0};});
    await recordFacet('summary-os',async()=>{await motion(true);await page.emulateMedia({reducedMotion:'reduce'});await click('파일별 결과');await click('전체 요약');await page.locator('.rv-item-tile').first().waitFor();await pause(200);const observed=await page.evaluate(observePage);const summaryRunning=await page.locator('.results-visuals').evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length);return {...observed,summaryRunning,tiles:await page.locator('.rv-item-tile').count()};});
    await page.emulateMedia({reducedMotion:'no-preference'});await motion(false);await click('파일별 결과');await page.locator('.frr-item').first().waitFor();
    await recordFacet('dashboard-escape',async()=>{const trigger=page.getByRole('button',{name:'나만의 대시보드',exact:true});await trigger.focus();await page.keyboard.press('Enter');await page.locator('dialog.dashboard-modal').waitFor();const nativeModal=await page.locator('dialog.dashboard-modal').evaluate(element=>element.open&&element.matches(':modal'));await page.keyboard.press('Escape');await page.locator('dialog.dashboard-modal').waitFor({state:'detached'});return {nativeModal,closed:true,focusReturned:await trigger.evaluate(element=>element===document.activeElement)};});
    await recordFacet('ledger-escape',async()=>{await click('내보내기');await click('검토대장에 기록');await page.locator('dialog.ledger-modal').waitFor();const nativeModal=await page.locator('dialog.ledger-modal').evaluate(element=>element.open&&element.matches(':modal'));await page.keyboard.press('Escape');await page.locator('dialog.ledger-modal').waitFor({state:'detached'});return {nativeModal,closed:true};});
    await recordFacet('dashboard-resources',async()=>{
      const cycles=[];const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
      for(let i=0;i<5;i++){
        const before=await page.evaluate(observePage),heapBefore=await cdp.send('Performance.getMetrics'),time=await page.evaluate(()=>performance.now());await click('나만의 대시보드');await page.locator('dialog.dashboard-modal').waitFor();
        if(i===0){await click('대시보드 만들기');await page.getByRole('button',{name:'생성 취소',exact:true}).waitFor();await controller('dashboardReady','POST');}
        await page.locator('.dashboard-preview-frame').waitFor();await page.frameLocator('.dashboard-preview-frame').locator('canvas').first().waitFor();const visibleAt=await page.evaluate(()=>performance.now());modalSamples.push(visibleAt-time);
        const iframe=await page.locator('.dashboard-preview-frame').elementHandle(),open=await page.evaluate(observePage);await click('원본과 판정');await page.locator('.dashboard-source-view').waitFor();const sourceTabRetainsIframe=await iframe.evaluate(element=>element.isConnected)&&await page.locator('iframe').count()===1;await click('대시보드');
        const frame=page.frames().find(frame=>frame!==page.mainFrame());const frameState=frame?await frame.evaluate(()=>({canvasCount:document.querySelectorAll('canvas').length,resources:window.__gspecBrowserBehavior?.snapshot?.()??null})):null;
        await click('대시보드 닫기');await page.locator('dialog.dashboard-modal').waitFor({state:'detached'});await pause(100);const after=await page.evaluate(observePage),heapAfter=await cdp.send('Performance.getMetrics');cycles.push({before,open,after,frameState,sourceTabRetainsIframe,milliseconds:visibleAt-time,heapBefore,heapAfter});
      }
      await cdp.detach();return {cycles:cycles.length,oneIframeWhileOpen:cycles.every(cycle=>cycle.open.resources.iframes===1),iframeGoneAfterClose:cycles.every(cycle=>cycle.after.resources.iframes===cycle.before.resources.iframes&&cycle.after.resources.iframes===0),observersReturned:cycles.every(cycle=>cycle.after.resources.resizeObservers===cycle.before.resources.resizeObservers),sseReturned:cycles.every(cycle=>cycle.after.resources.sse.length===cycle.before.resources.sse.length),objectURLsReturned:cycles.every(cycle=>cycle.after.resources.objectURLs.length===cycle.before.resources.objectURLs.length),sourceTabRetainsIframe:cycles.every(cycle=>cycle.sourceTabRetainsIframe),cycleObservations:cycles,allocationQualification:'A zero-allocation objectURL observation cannot prove export create/revoke behavior.'};
    });
    await recordFacet('performance-recording',async()=>{const performance=await page.evaluate(()=>window.__gspecBrowserBehavior.snapshot());return {sampleWindowAtLeast30Seconds:recordingEnd-recordingStart>=30000,detailSamples:detailSamples.length,modalSamples:modalSamples.length,window:{start:recordingStart,end:recordingEnd,milliseconds:recordingEnd-recordingStart},detail:quantiles(detailSamples),modal:quantiles(modalSamples),raf:quantiles(performance.raf.filter(sample=>sample.time>=recordingStart&&sample.time<=recordingEnd).map(sample=>sample.interval)),longTasks:performance.longTasks.filter(task=>task.startTime>=recordingStart&&task.startTime<=recordingEnd),raw:performance,method:'Browser performance.now intervals include automation dispatch overhead; synthetic HTTP wait is separate in trace. First modal cold, later four warm. Values are observations, not pass/fail latency targets.'};});
    await closeContext();await openContext('cancel');await motion(false);await startToLive();
    await recordFacet('cancel-aria',async()=>{await click('작업 중지');await page.getByText('작업을 중지했습니다.',{exact:true}).waitFor();const state=await waitServer(state=>state.subscribers.run===0,'cancelled run SSE close');return {...await announcement(),cancelRequested:state.requests.some(request=>request.path==='/api/runs/visual-run/cancel'&&request.method==='POST'),cancelled:state.run.status==='cancelled',runSubscribers:state.subscribers.run,serverState:state};});
    await closeContext();await recordFacet('context-cleanup',async()=>{const state=await controller('/__visual/state');return {...state.subscribers,serverState:state};});
  }catch(error){runError=errorData(error);log('execution-error',runError);}
  finally{
    try{await closeContext();}catch(error){errors.push({operation:'closeContext',...errorData(error)});}
    if(browser)try{await browser.close();}catch(error){errors.push({operation:'browser.close',...errorData(error)});}
    try{const after=await snapshotReplaySources(),serverAfter=await controller('/__visual/provenance');save(path.join(out,'source-after.json'),after);save(path.join(out,'server-after.json'),serverAfter);assertReplaySourceParity(prepared,after);assert.equal(startup.processId,serverAfter.processId);assert.equal(startup.startedAt,serverAfter.startedAt);assertReplaySourceParity(prepared,serverAfter.snapshot);sourceParity=true;}catch(error){errors.push({operation:'source-postflight',...errorData(error)});}
  }
  const endedAt=now();
  const cases=plan.cases.map(item=>{
    const facets=Object.fromEntries(item.facets.map(id=>[id,results[id]||{id,state:'not_run',reason:runError?.message||'Not reached.'}]));
    for(const id of item.missingFacets)facets[id]={id,state:'not_run',reason:plan.missingFacets.find(facet=>facet.id===id).reason};
    const values=Object.values(facets),complete=values.length>0&&values.every(facet=>facet.state==='passed');
    const actual={caseId:item.caseId,facets,coverage:{complete,passed:values.filter(facet=>facet.state==='passed').length,failed:values.filter(facet=>facet.state==='failed').length,notRun:values.filter(facet=>facet.state==='not_run').length},sourceParity};
    const state=!sourceParity||values.some(facet=>facet.state==='failed')?'failed':complete?'passed':'not_run';
    return {caseId:item.caseId,state,startedAt,endedAt,actualRef:save(path.join(out,'cases',item.caseId.replace(':','-')+'.json'),actual),artifactRefs:values.flatMap(facet=>facet.artifactRefs||[]),coverage:actual.coverage};
  });
  const browserTraceRef=save(path.join(out,'browser-trace-index.json'),{traceRefs,actions:fileRef(path.join(out,'actions.jsonl')),contexts:contextReports,browser:browserInfo,blockedExternal});
  const exitCode=runError||errors.length||!sourceParity?1:0;
  const report={schemaVersion:'1.0',acceptanceProfile:PROFILE,gateId:'G13',loop:plan.loop,codeDigest:plan.codeDigest,registrySha256:plan.registrySha256,planRef:fileRef(planPath),command:[process.execPath,...process.argv.slice(1)],startedAt,endedAt,exitCode,origin:'actual-browser-current-react-synthetic-http',oracleAccess:false,browser:browserInfo,browserTraceRef,cases,sourceParity,providerCalls:{gemini:0,e2b:0},errors,runError,environment:{os:{platform:os.platform(),release:os.release(),architecture:os.arch()},cpu:os.cpus()[0]?.model,logicalProcessors:os.cpus().length,memoryBytes:os.totalmem(),node:process.version},gateStatus:cases.every(item=>item.state==='passed')&&exitCode===0?'eligible-for-independent-evaluation':'NOT_PASS',scope:'Real browser observations under explicit synthetic HTTP responses. Missing facets retained; no provider, original parser, PDF or large-input execution inferred.'};
  const reportRef=save(path.join(out,'observations.json'),report);return {reportRef,exitCode,counts:{passed:cases.filter(item=>item.state==='passed').length,failed:cases.filter(item=>item.state==='failed').length,notRun:cases.filter(item=>item.state==='not_run').length},sourceParity};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  try{
    if(args[0]==='--prepare'&&args.length<=2)console.log(JSON.stringify({plan:await prepareBrowserBehavior(args[1]||'LOOP-005'),browserExecuted:false}));
    else if(args[0]==='--execute'&&args.length===2){const result=await executeBrowserBehavior(args[1]);console.log(JSON.stringify(result));process.exitCode=result.exitCode;}
    else if(args[0]==='--help')console.log('Pinned Node v24.13.1: browser-behavior-runtime.mjs --prepare [LOOP-005], then --execute <saved plan.json>. Root starts fresh replay server after all writers hold. No other replay client may remain open. Partial twelve-case report retains every unsupported facet as NOT_RUN.');
    else throw new Error('Expected --prepare [LOOP-NNN] or --execute <plan.json>.');
  }catch(error){console.error(JSON.stringify(errorData(error)));process.exitCode=1;}
}

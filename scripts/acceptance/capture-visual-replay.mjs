#!/usr/bin/env node
// Actual browser capture driver; TEST ONLY. Nothing runs merely by importing it.
// Root owns execution. No server startup, user profile, provider, or baseline edits.
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {snapshotReplaySources,assertReplaySourceParity} from './visual-replay-server.mjs';
import {inspectPlatformFonts} from './capture-platform-fonts.mjs';
import {blockServiceWorkersSafely} from './browser-safe-service-workers.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const REFERENCE=path.join(ROOT,'architecture/ui/reference');
const ORIGIN='http://127.0.0.1:5210';
const PLAYWRIGHT='C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const CHROME='C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE='CURRENT_REPRODUCTION';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const now=()=>new Date().toISOString();
const json=value=>JSON.stringify(value,null,2)+'\n';
const relative=filename=>path.relative(ROOT,filename).split(path.sep).join('/');
const errorData=error=>({name:error?.name||'Error',message:String(error?.message||error).slice(0,10000),stack:String(error?.stack||'').slice(0,16000)});
const refOf=filename=>({path:relative(filename),bytes:readFileSync(filename).length,sha256:sha256(readFileSync(filename))});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Read-only browser observation. Matches the supplied capture drivers' tree/style
// schema, with explicit environment/focus/style-order fields added for provenance.
function serializeDom(){
  const properties=['display','visibility','position','inset','top','right','bottom','left','z-index','box-sizing','width','height','min-width','max-width','min-height','max-height','margin','padding','gap','row-gap','column-gap','grid-template-columns','grid-template-rows','grid-auto-flow','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','align-items','align-content','align-self','justify-content','justify-items','justify-self','font-family','font-size','font-weight','font-style','font-synthesis','line-height','letter-spacing','text-align','text-transform','white-space','color','background-color','background-image','background-size','background-position','border','border-top','border-right','border-bottom','border-left','border-radius','box-shadow','text-shadow','opacity','transform','transform-origin','translate','rotate','scale','filter','backdrop-filter','clip-path','overflow','overflow-x','overflow-y','object-fit','object-position','fill','stroke','stroke-width','stroke-dasharray','stroke-dashoffset','animation-name','animation-duration','animation-delay','animation-timing-function','animation-iteration-count','animation-play-state','animation-fill-mode','transition-property','transition-duration','transition-delay','transition-timing-function'];
  const elements=[document.body,...document.body.querySelectorAll('*')].filter(el=>!['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName));
  const indices=new Map(elements.map((el,i)=>[el,i]));
  const styles=style=>Object.fromEntries(properties.map(property=>[property,style.getPropertyValue(property)]).filter(([,value])=>value!==''));
  const tree=elements.map((el,index)=>{
    const rect=el.getBoundingClientRect(),css=getComputedStyle(el);
    const attributes=Object.fromEntries([...el.attributes].filter(attr=>/^(id|class|role|type|name|title|alt|href|target|open|disabled|checked|tabindex|value|viewBox|d|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|points|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|transform)$/.test(attr.name)||/^(aria-|data-)/.test(attr.name)).map(attr=>[attr.name,attr.value]));
    const pseudo={};for(const key of ['::before','::after']){const value=getComputedStyle(el,key);if(value.content!=='none'&&value.content!=='normal')pseudo[key]={content:value.content,style:styles(value)};}
    return {index,parent:indices.get(el.parentElement)??null,tag:el.tagName.toLowerCase(),attributes,text:[...el.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(''),...(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)&&el.type!=='file'?{value:el.value}:{}),box:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},scroll:{left:el.scrollLeft,top:el.scrollTop,width:el.scrollWidth,height:el.scrollHeight},style:styles(css),...(Object.keys(pseudo).length?{pseudo}:{})};
  });
  const portable=value=>JSON.parse(JSON.stringify(value,(_,entry)=>typeof entry==='number'&&!Number.isFinite(entry)?String(entry):entry));
  const animations=document.getAnimations().map(animation=>portable({target:indices.get(animation.effect?.target)??null,playState:animation.playState,currentTime:animation.currentTime,playbackRate:animation.playbackRate,timing:animation.effect?.getTiming(),computedTiming:animation.effect?.getComputedTiming(),keyframes:animation.effect?.getKeyframes()}));
  let stored=null;try{stored=localStorage.getItem('trace-demo-motion');}catch{}
  return {capturedAt:new Date().toISOString(),performanceTime:performance.now(),url:location.href,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollX,scrollY},motion:{app:document.documentElement.dataset.motion??null,appStored:stored,osReduce:matchMedia('(prefers-reduced-motion: reduce)').matches,animationFreeze:'none'},focus:{activeIndex:indices.get(document.activeElement)??null,hoverIndices:[...document.querySelectorAll(':hover')].map(el=>indices.get(el)).filter(value=>value!==undefined)},loadedStyles:[...document.styleSheets].map(sheet=>({href:sheet.href,disabled:sheet.disabled,media:sheet.media.mediaText,ownerTag:sheet.ownerNode?.tagName??null,viteId:sheet.ownerNode?.getAttribute?.('data-vite-dev-id')??null})),tree,animations};
}

function measurePage(){
  const selectors=['.app-shell','.app-header','.workflow-steps','.workflow-main','main','.workflow-heading','.workflow-input-card','.workflow-analysis-stage','.workflow-stage-body','.criteria-confirmation','.criteria-source-pane','.live-review-workspace','.frr-workspace','.frr-source','.frr-detail','.frr-file','.dashboard-modal','.dashboard-preview-frame','.dashboard-builder','.dashboard-activity','.ledger-modal','.ledger-mapping-table','h1'];
  const boxes={},missingSelectors=[];
  for(const selector of selectors){const el=document.querySelector(selector);if(!el){missingSelectors.push(selector);continue;}const b=el.getBoundingClientRect(),s=getComputedStyle(el);boxes[selector]={x:b.x,y:b.y,width:b.width,height:b.height,fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,color:s.color,background:s.backgroundColor,borderRadius:s.borderRadius,padding:s.padding,gap:s.gap};}
  return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},page:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,horizontalOverflow:document.documentElement.scrollWidth>innerWidth},motion:{app:document.documentElement.dataset.motion,osReduce:matchMedia('(prefers-reduced-motion: reduce)').matches},fonts:{status:document.fonts.status,dmSans:document.fonts.check('16px "DM Sans"'),notoSansKr:document.fonts.check('16px "Noto Sans KR"'),faces:[...document.fonts].map(f=>({family:f.family,status:f.status,weight:f.weight}))},visibleText:document.body.innerText.slice(0,24000),boxes,missingSelectors};
}

function measureFrame(){return {url:location.href,title:document.title,theme:document.querySelector('#dashboard-root')?.getAttribute('data-theme'),distribution:document.querySelector('#dashboard-root')?.getAttribute('data-distribution'),canvasCount:document.querySelectorAll('canvas').length,visibleText:document.body?.innerText.slice(0,12000),reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,fontFamily:getComputedStyle(document.body).fontFamily};}

function environment(){return {userAgent:navigator.userAgent,platform:navigator.platform,language:navigator.language,languages:[...navigator.languages],timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},visualViewport:window.visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}:null,prefersColorScheme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};}

// Load only existing supplied faces. This neither adds a font nor changes CSS,
// text, selection, animations, or application state. Duplicate declared DM Sans
// faces are recorded and loaded explicitly: fonts.ready alone can leave them
// unloaded while FontFaceSet.check still returns false.
export async function prepareCaptureFonts(){
  const familyName=face=>face.family.replace(/^['"]|['"]$/g,'');
  const faceRecord=face=>({family:face.family,status:face.status,weight:face.weight,style:face.style,unicodeRange:face.unicodeRange});
  const observe=()=>({status:document.fonts.status,dmSans:document.fonts.check('16px "DM Sans"'),notoSansKr:document.fonts.check('16px "Noto Sans KR"'),faces:[...document.fonts].filter(face=>['DM Sans','Noto Sans KR'].includes(familyName(face))).map(faceRecord)});
  const before=observe(),loads=[],errors=[];
  const dmFaces=[...document.fonts].filter(face=>familyName(face)==='DM Sans');
  if(!dmFaces.length)errors.push({operation:'declared-family',family:'DM Sans',message:'Required supplied family has no declared faces.'});
  if(![...document.fonts].some(face=>familyName(face)==='Noto Sans KR'))errors.push({operation:'declared-family',family:'Noto Sans KR',message:'Required supplied family has no declared faces.'});
  const jobs=dmFaces.map((face,index)=>({operation:'existing-face.load',family:'DM Sans',index,weight:face.weight,unicodeRange:face.unicodeRange,run:()=>face.load()}));
  jobs.push({operation:'FontFaceSet.load',family:'Noto Sans KR',text:' GSPEC 0123456789 기준 원문',run:()=>document.fonts.load('16px "Noto Sans KR"',' GSPEC 0123456789 기준 원문')});
  let timer;
  try{
    await Promise.race([
      Promise.all(jobs.map(async({run,...description})=>{try{const result=await run();loads.push({...description,status:'fulfilled',faceCount:Array.isArray(result)?result.length:1});}catch(error){const failure={...description,status:'rejected',message:String(error?.message||error)};loads.push(failure);errors.push(failure);}})).then(()=>document.fonts.ready),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Required font loading exceeded 15000 ms.')),15000);})
    ]);
  }catch(error){errors.push({operation:'readiness-deadline',message:String(error?.message||error)});}finally{clearTimeout(timer);}
  const after=observe();
  return {method:'Existing supplied DM Sans FontFace.load and Noto Sans KR FontFaceSet.load; no CSS or DOM mutation',before,after,loads,errors,ready:errors.length===0&&after.status==='loaded'&&after.dmSans&&after.notoSansKr};
}

// Read-only intrinsic-text diagnostics. Range measurements do not insert clones,
// resize the table, or affect the layout being compared with the reference.
export function measureSourceTableText(){
  const properties=['display','box-sizing','width','min-width','max-width','padding','border','border-collapse','border-spacing','table-layout','font-family','font-size','font-weight','font-style','font-stretch','font-synthesis','font-kerning','font-optical-sizing','font-feature-settings','font-variation-settings','font-variant','font-variant-numeric','font-variant-ligatures','font-size-adjust','line-height','letter-spacing','word-spacing','white-space','word-break','overflow-wrap','text-transform','text-rendering','text-size-adjust','writing-mode','direction'];
  const styles=element=>{const css=getComputedStyle(element);return Object.fromEntries(properties.map(property=>[property,css.getPropertyValue(property)]));};
  const box=rect=>({x:rect.x,y:rect.y,width:rect.width,height:rect.height});
  return [...document.querySelectorAll('table')].filter(table=>table.querySelector('[data-source-cell]')).map((table,index)=>({index,visible:table.getClientRects().length>0,table:box(table.getBoundingClientRect()),style:styles(table),cells:['A1','B1','D2'].map(address=>{
    const cell=table.querySelector(`[data-source-cell="${address}"]`);if(!cell)return {address,present:false};
    const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT),textRuns=[];let node;
    while((node=walker.nextNode())){if(!node.textContent)continue;const range=document.createRange();range.selectNodeContents(node);textRuns.push({text:node.textContent,box:box(range.getBoundingClientRect()),rects:[...range.getClientRects()].map(box),parentTag:node.parentElement.tagName.toLowerCase(),style:styles(node.parentElement)});range.detach();}
    return {address,present:true,title:cell.title,text:cell.textContent,box:box(cell.getBoundingClientRect()),style:styles(cell),textRuns};
  })}));
}

export function parseCaptureArguments(args){
  let mode=null,loop='LOOP-004',loopSet=false;
  for(let index=0;index<args.length;index++){
    const value=args[index];
    if(['--smoke','--all'].includes(value)){assert.equal(mode,null,'Choose exactly one capture mode.');mode=value.slice(2);}
    else if(value==='--loop'){assert.equal(loopSet,false,'Specify --loop once.');loop=args[++index];loopSet=true;assert.match(loop||'',/^LOOP-\d{3,}$/, 'Expected --loop LOOP-005, for example.');}
    else throw new Error(`Unknown capture option: ${value}`);
  }
  assert.ok(mode,'Choose --smoke or --all.');return {mode,loop};
}

export async function captureVisualReplay({mode='smoke',loop='LOOP-004'}={}){
  assert.ok(['smoke','all'].includes(mode));
  assert.match(loop,/^LOOP-\d{3,}$/);
  assert.equal(process.version,'v24.13.1','Execute with the pinned .cache/runtime/node-v24.13.1-win-x64/node.exe.');
  const baseline=JSON.parse(readFileSync(path.join(REFERENCE,'manifest.json'),'utf8'));
  assert.equal(baseline.captures.length,34);
  const selected=new Set(mode==='smoke'?['01-landing-desktop','02-landing-mobile','04-criteria-input-empty']:baseline.captures.map(item=>item.id));
  const outRoot=path.join(ROOT,'artifacts/rebuild',loop.toLowerCase());mkdirSync(outRoot,{recursive:true});
  const out=path.join(outRoot,`${now().replace(/[:.]/g,'-')}-${mode}-${process.pid}-${randomUUID().slice(0,8)}`);
  mkdirSync(out);for(const folder of ['dom','states','diagnostics'])mkdirSync(path.join(out,folder));
  const save=(name,value)=>{const filename=path.join(out,name);writeFileSync(filename,json(value),{flag:'wx'});return refOf(filename);};
  const log=(kind,data={})=>{const item={time:now(),kind,...data};appendFileSync(path.join(out,'events.jsonl'),JSON.stringify(item)+'\n');};
  const entries=baseline.captures.map(reference=>({id:reference.id,selected:selected.has(reference.id),captureStatus:'NOT_RUN',visualAcceptance:'NOT_RUN',reason:selected.has(reference.id)?'Not reached.':'Outside the three-state smoke subset.',reference:{id:reference.id,screenshot:reference.screenshot,dom:reference.dom,viewport:reference.viewport,motion:reference.motion}}));
  const records=new Map(entries.map(entry=>[entry.id,entry]));
  const startedAt=now(),traceRefs=[],measurements=[],contexts=[],blockedExternal=[],browserErrors=[],locatorMappings=[],cleanupErrors=[];
  const sourceNames=['synthetic-fixture.json','mock-api.mjs','capture-flow.js','capture-required-viewports.js','synthetic-dashboard.html','synthetic-dashboard-dark.html'];
  const inputRefs=[];
  let browser=null,context=null,page=null,contextName=null,launchInfo=null,runError=null,endedAt=null,firstFlowError=null;
  const sourceParity={verified:false,preflightVerified:false,postflightVerified:false};
  let startupProvenance=null,diskBefore=null;
  const controller=async(name,method='GET')=>{
    const url=ORIGIN+(method==='GET'?name:`/__visual/control/${name}`);
    assert.equal(new URL(url).origin,ORIGIN);
    const response=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(10000),...(method==='POST'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});
    const body=await response.json();log('controller',{method,path:new URL(url).pathname,status:response.status,...(method==='POST'?{phase:body.phase,started:body.started,subscribers:body.subscribers}:{})});
    if(!response.ok)throw Error(`Replay HTTP ${response.status}: ${body.error||url}`);
    return body;
  };
  const waitServer=async(predicate,label,timeout=12000)=>{
    const deadline=Date.now()+timeout;let value;
    do{value=await controller('/__visual/state');if(predicate(value))return value;await pause(100);}while(Date.now()<deadline);
    throw Error(`Replay state deadline: ${label}; phase=${value?.phase}; subscribers=${JSON.stringify(value?.subscribers)}`);
  };
  const reset=async()=>{
    const before=await controller('/__visual/state');
    assert.deepEqual(before.subscribers,{run:0,activity:0},'Refusing to reset a replay with another active SSE subscriber. Close the CUA replay tab first.');
    log('pre-reset-state',{phase:before.phase,started:before.started,subscribers:before.subscribers});
    await controller('reset','POST');
  };
  const control=async name=>{log('action',{action:'HTTP synthetic fixture control',name});return controller(name,'POST');};
  const click=async(name,options={})=>{log('action',{action:'click',role:'button',name:String(name)});await page.getByRole('button',{name,exact:typeof name==='string',...options}).click();};
  const fallback=async(original,replacement,description)=>{
    if(await original.count())return original;
    locatorMappings.push({time:now(),...description});log('locator-adaptation',description);return replacement;
  };
  const upload=async(role)=>{
    log('action',{action:'upload',role,path:'architecture/ui/reference/synthetic-fixture.json'});
    await page.locator('input[type=file]').first().setInputFiles(path.join(REFERENCE,'synthetic-fixture.json'));
    const filename=role==='criteria'?'합성_품질기준.xlsx':'합성_시험성적서_A.xlsx';
    const mapping={time:now(),reference:`file-open button named ${filename} XLSX`,previousDriver:`button accessible name containing ${filename}`,actual:`button.workflow-file-open containing ${filename}`,difference:'The filename-only driver locator also matched the delete button. The observed file-open control identifies the intended action; strict uniqueness is retained. This correction is not a UI defect.'};
    locatorMappings.push(mapping);log('locator-adaptation',mapping);
    await page.locator('button.workflow-file-open').filter({hasText:filename}).waitFor();
  };
  const startCriteria=async()=>{
    await click('기준 정리하기');
    await waitServer(state=>state.started&&state.subscribers.run>0,'run start and actual SSE subscription');
    await control('startReading');
  };
  const attach=async()=>{
    await click('이 기준으로 검토하기');
    await waitServer(state=>state.phase==='target-attached','target attached through normal UI');
    await control('reviewActive');
  };
  const waitConfirmation=()=>page.getByRole('button',{name:'기준 확정 · 검토 파일 넣기'}).waitFor({timeout:15000});
  const waitResults=()=>page.getByRole('heading',{name:'파일별로, 결과와 근거를 함께.'}).waitFor({timeout:15000});
  const detail=async()=>{
    const target=await fallback(page.getByRole('tabpanel',{name:'선택한 항목 상세'}),page.locator('.frr-focus-view[aria-label="선택한 항목 상세"]'),{reference:'tabpanel named 선택한 항목 상세',actual:'.frr-focus-view[aria-label="선택한 항목 상세"]',difference:'Current detail may lack the reference tabpanel role; preserved in DOM.'});
    await target.waitFor();
  };
  const tab=async label=>{
    const target=await fallback(page.getByRole('tab',{name:new RegExp(label)}),page.locator('.frr-detail-tabs').getByRole('button',{name:new RegExp(label)}),{reference:`tab ${label}`,actual:`.frr-detail-tabs button ${label}`,difference:'Current tab control may lack the reference tab role; preserved in DOM.'});
    await target.click();
  };
  const viewport=async(width,height)=>{log('action',{action:'set viewport',width,height});await page.setViewportSize({width,height});};
  const media=async reducedMotion=>{log('action',{action:'set OS reduced motion',reducedMotion});await page.emulateMedia({reducedMotion});};
  const frameReady=async(theme,distribution)=>{
    await page.locator('.dashboard-preview-frame').waitFor({timeout:20000});
    const frame=page.frameLocator('.dashboard-preview-frame');
    await frame.locator(`#dashboard-root[data-theme="${theme}"]${distribution?`[data-distribution="${distribution}"]`:''}`).waitFor({timeout:20000});
    await frame.locator('canvas').first().waitFor();await pause(500);
  };
  const closeContext=async()=>{
    if(!context)return;
    const closing=context,name=contextName;context=null;page=null;
    try{const tracePath=path.join(out,`${name}-trace.zip`);await closing.tracing.stop({path:tracePath});traceRefs.push(refOf(tracePath));}catch(error){cleanupErrors.push({operation:'trace.stop',context:name,...errorData(error)});}
    try{await closing.close();}catch(error){cleanupErrors.push({operation:'context.close',context:name,...errorData(error)});}
  };
  const openContext=async name=>{
    contextName=name;context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1,locale:'ko-KR',timezoneId:'Asia/Seoul',colorScheme:'light',reducedMotion:'no-preference',isMobile:false,hasTouch:false,acceptDownloads:false});
    await context.addInitScript(blockServiceWorkersSafely);
    await context.tracing.start({screenshots:true,snapshots:true,sources:false,title:`${loop} synthetic visual replay ${name}`});
    const fontCss=readFileSync(path.join(ROOT,'architecture/ui/fonts/fonts.css'),'utf8').replaceAll('url(./',`url(${ORIGIN}/architecture/ui/fonts/`);
    await context.route('**/*',async route=>{
      const url=route.request().url();
      if(url.startsWith('https://fonts.googleapis.com/')){log('local-font-intercept',{url});return route.fulfill({contentType:'text/css',body:fontCss});}
      let local=false;try{local=new URL(url).origin===ORIGIN;}catch{}
      if(local||/^(data|blob|about):/.test(url))return route.continue();
      blockedExternal.push({time:now(),url});log('blocked-nonlocal-request',{url});return route.abort('blockedbyclient');
    });
    page=await context.newPage();page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(30000);
    page.on('pageerror',error=>{const item={time:now(),context:name,...errorData(error)};browserErrors.push(item);log('pageerror',item);});
    page.on('console',message=>{if(['error','warning'].includes(message.type()))log('console',{type:message.type(),text:message.text().slice(0,4000)});});
    page.on('requestfailed',request=>log('requestfailed',{url:request.url(),failure:request.failure()}));
    page.on('response',response=>{if(response.url().startsWith(ORIGIN+'/api/'))log('api-response',{url:response.url(),status:response.status()});});
    await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'검토 기준부터 시작하기',exact:true}).waitFor({timeout:30000});
    // A fresh context defaults to ON. If product initialization differs, use its
    // real UI toggle; never modify localStorage or application globals in evaluate.
    if(await page.getByRole('button',{name:'모션 OFF',exact:true}).count())await click('모션 OFF');
    const actual=await page.evaluate(environment);
    contexts.push({name,createdAt:now(),...actual});log('browser-context',{name,...actual});
  };
  const capture=async id=>{
    const reference=baseline.captures.find(item=>item.id===id),record=records.get(id);
    const livePhase=/^(07|08|13|20)-/.test(id);let finiteAnimationsSettled=null,settlingError=null;
    const fontReadiness=await page.evaluate(prepareCaptureFonts);
    record.fontReadiness=save(`diagnostics/${id}-font-readiness.json`,fontReadiness);
    log('font-readiness',{id,ready:fontReadiness.ready,before:{dmSans:fontReadiness.before.dmSans,notoSansKr:fontReadiness.before.notoSansKr},after:{dmSans:fontReadiness.after.dmSans,notoSansKr:fontReadiness.after.notoSansKr},errors:fontReadiness.errors});
    assert.equal(fontReadiness.ready,true,`Required supplied font families are not ready for ${id}; see recorded load results.`);
    await pause(650);
    if(!livePhase){
      try{
        await page.waitForFunction(()=>document.getAnimations().every(animation=>animation.playState!=='running'||!Number.isFinite(animation.effect?.getComputedTiming().endTime)),undefined,{timeout:5000});
        await page.waitForFunction(()=>[...document.querySelectorAll('.workflow-input-card,.frr-focus-view,.ledger-shell,.dashboard-source-view')].every(element=>Number(getComputedStyle(element).opacity)>=.999),undefined,{timeout:5000});finiteAnimationsSettled=true;
      }catch(error){finiteAnimationsSettled=false;settlingError=errorData(error);}
    }
    const settling={livePhase,finiteAnimationsSettled,minimumSettleMs:650,animationFreeze:'none',...(settlingError?{error:settlingError}:{})};
    const screenshotPath=path.join(out,`${id}.png`);assert.equal(existsSync(screenshotPath),false);
    const beforeScreenshot=now();
    const bytes=await page.screenshot({path:screenshotPath,type:'png',fullPage:false,scale:'device',animations:'allow',timeout:15000});
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Expected an actual PNG screenshot.');
    const png={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
    record.screenshot={...refOf(screenshotPath),...png,mode:'viewport',scale:'device',startedAt:beforeScreenshot,capturedAt:now()};
    const dom={id,synthetic:true,origin:'actual-browser-current-react-synthetic-http',settling,screenshotTiming:'Actual viewport screenshot first; read-only DOM sampled immediately afterward; animations not frozen.',main:await page.evaluate(serializeDom),frames:[]};
    for(const frame of page.frames().slice(1))dom.frames.push(await frame.evaluate(serializeDom));
    record.dom=save(`dom/${id}.json`,dom);
    const measurement={id,synthetic:true,acceptanceProfile:PROFILE,capturedAt:now(),url:page.url(),mockOrigin:ORIGIN,settling,fontReadiness:record.fontReadiness,...await page.evaluate(measurePage),sourceTableText:await page.evaluate(measureSourceTableText),frames:[]};
    if(['14-results','15-result-detail-fail','25-dashboard-source'].includes(id))measurement.actualPlatformFonts=await inspectPlatformFonts(page);
    for(const frame of page.frames().slice(1))measurement.frames.push(await frame.evaluate(measureFrame));
    measurement.serverEventSequenceProvenance='GET /__visual/state after actual screenshot/DOM; fixture event inputs, not browser state injection.';
    const serverState=await controller('/__visual/state');
    measurement.serverEventSequence=serverState.run?.events?.map(({type,sequence,timestamp})=>({type,sequence,timestamp}))||[];
    measurement.serverPhase=serverState.phase;measurement.environment=await page.evaluate(environment);
    record.measurement=save(`${id}-measurement.json`,measurement);measurements.push(measurement);
    record.dimensionsVerified=png.width===reference.viewport.width&&png.height===reference.viewport.height&&measurement.viewport.width===reference.viewport.width&&measurement.viewport.height===reference.viewport.height&&measurement.viewport.dpr===1;
    record.motionConditionsVerified=measurement.motion.app===reference.motion.app&&measurement.motion.osReduce===reference.motion.osReduce;
    record.fontConditionsVerified=fontReadiness.ready&&measurement.fonts.dmSans&&measurement.fonts.notoSansKr;
    record.settling=settling;record.serverPhase=serverState.phase;
    assert.equal(record.dimensionsVerified,true,`PNG/viewport dimensions or DPR differ for ${id}.`);
    assert.equal(record.motionConditionsVerified,true,`Motion settings differ for ${id}.`);
    assert.equal(record.fontConditionsVerified,true,`Required font family check changed after screenshot for ${id}.`);
    record.captureStatus='CAPTURED';delete record.reason;
    // A captured state has not yet passed visual comparison or acceptance.
    record.visualAcceptance='NOT_RUN';
    log('state-captured',{id,png,finiteAnimationsSettled});console.log(JSON.stringify({id,captureStatus:record.captureStatus,png,output:relative(out)}));
  };
  const step=async(id,actions=async()=>{})=>{
    const record=records.get(id);assert.ok(record?.selected,`Unexpected state ${id}`);record.startedAt=now();log('state-start',{id});
    try{await actions();await capture(id);return true;}
    catch(error){
      record.captureStatus='ERROR';record.visualAcceptance='NOT_RUN';record.error=errorData(error);record.reason='Actual state setup/capture failed; any diagnostic is not a successful state screenshot.';
      log('state-error',{id,...record.error});console.error(JSON.stringify({id,captureStatus:'ERROR',error:record.error.message}));
      if(page&&!page.isClosed()){
        try{const filename=path.join(out,'diagnostics',`${id}-failure.png`);await page.screenshot({path:filename,type:'png',fullPage:false,scale:'device',animations:'allow',timeout:5000});record.failureScreenshot=refOf(filename);}catch{}
        try{record.failureDom=save(`diagnostics/${id}-failure-dom.json`,await page.evaluate(serializeDom));}catch{}
      }
      firstFlowError??=id;return false;
    }finally{record.endedAt=now();save(`states/${id}.json`,record);}
  };
  const flow=async()=>{
    await pause(800);
    if(!await step('01-landing-desktop'))return;
    if(!await step('02-landing-mobile',()=>viewport(390,844)))return;
    if(mode==='all'&&!await step('03-landing-mobile-motion-off',async()=>{await media('reduce');await click('모션 ON');}))return;
    if(!await step('04-criteria-input-empty',async()=>{await viewport(1440,960);await media('no-preference');if(mode==='all')await click('모션 OFF');await click('검토 기준부터 시작하기');await page.locator('.workflow-input-card').waitFor();}))return;
    if(mode==='smoke')return;
    if(!await step('05-criteria-natural-language',async()=>{
      await click('말로 기준 알려주기 원하는 조건을 직접 입력');
      const textarea=await fallback(page.locator('#criteria-input'),page.locator('#criteria-text'),{reference:'#criteria-input',actual:'#criteria-text',difference:'Locator mapping only; actual input DOM retained.'});
      await textarea.fill('압축강도는 28일 기준 25 MPa 이상이어야 합니다. 흡수율은 상온에서 5% 이하, 외관에는 균열이 없어야 합니다.');
    }))return;
    if(!await step('06-criteria-input-file',async()=>{await click('기준 파일 넣기 기준서·규정·표준 문서');await upload('criteria');}))return;
    if(!await step('07-criteria-reading',async()=>{await startCriteria();await page.locator('.workflow-analysis-stage').waitFor();await pause(1100);}))return;
    if(!await step('08-criteria-context',async()=>{await control('context');await pause(700);}))return;
    if(!await step('09-criteria-confirmation',async()=>{await control('confirmReady');await waitConfirmation();await pause(400);}))return;
    if(!await step('10-criteria-hitl-editor',()=>click('흡수율 수정 열기')))return;
    if(!await step('11-target-input-empty',async()=>{await click('흡수율 수정 닫기');await click('기준 확정 · 검토 파일 넣기');await page.getByRole('button',{name:'이 기준으로 검토하기',exact:true}).waitFor();}))return;
    if(!await step('12-target-input-file',()=>upload('target')))return;
    if(!await step('13-review-active',async()=>{await attach();await page.locator('.live-review-workspace').waitFor();await pause(1200);}))return;
    if(!await step('14-results',async()=>{await control('complete');await waitResults();await page.locator('.frr-file').first().waitFor();await pause(700);}))return;
    if(!await step('15-result-detail-fail',async()=>{await page.locator('.frr-item').filter({hasText:'흡수율'}).click();await detail();}))return;
    if(!await step('16-result-detail-review',async()=>{await click('항목 목록');await page.locator('.frr-item').filter({hasText:'외관'}).click();}))return;
    if(!await step('17-result-applied-criteria',()=>tab('적용 기준')))return;
    if(!await step('18-result-criterion-source',async()=>{
      await page.locator('.frr-criterion').filter({hasText:'흡수율'}).getByRole('button').click();
      const original=page.getByText('연결된 기준 원문',{exact:true});
      if(await original.count())await original.waitFor();else{locatorMappings.push({reference:'연결된 기준 원문',actual:'검토 대상으로 button',difference:'Current source heading copy differs; actual screenshot/DOM retains it.'});await page.getByRole('button',{name:'검토 대상으로',exact:true}).waitFor();}
    }))return;
    if(!await step('19-dashboard-controls',async()=>{await click('나만의 대시보드');await page.locator('#dashboard-instruction').waitFor();}))return;
    if(!await step('20-dashboard-generating',async()=>{await click('대시보드 만들기');await page.getByRole('button',{name:'생성 취소',exact:true}).waitFor();}))return;
    if(!await step('21-dashboard-light',async()=>{await control('dashboardReady');await frameReady('light');}))return;
    if(!await step('22-dashboard-customize',async()=>{await click('구성 수정');await click('다크 · 차트 중심');}))return;
    if(!await step('23-dashboard-dark',async()=>{
      const regenerate=await fallback(page.getByRole('button',{name:'다시 구성',exact:true}),page.getByRole('button',{name:'다시 구성하기',exact:true}),{reference:'다시 구성',actual:'다시 구성하기',difference:'Visible label difference retained.'});
      await regenerate.click();await page.getByRole('button',{name:'생성 취소',exact:true}).waitFor();await control('dashboardReady');await frameReady('dark','bar');
    }))return;
    if(!await step('24-dashboard-activity',async()=>{
      const toggle=await fallback(page.locator('.dashboard-activity-toggle'),page.locator('.dashboard-activity').getByRole('button',{name:'작업 과정 보기'}),{reference:'.dashboard-activity-toggle',actual:'.dashboard-activity button 작업 과정 보기',difference:'Disclosure selector mapping only; actual DOM retained.'});
      await toggle.click();await page.locator('.dashboard-terminal').waitFor();
    }))return;
    if(!await step('25-dashboard-source',async()=>{await click('원본과 판정');await page.locator('.dashboard-source-view').waitFor();await pause(400);}))return;
    if(!await step('26-ledger-empty',async()=>{await click('대시보드 닫기');await click('내보내기');await click('검토대장에 기록');await page.locator('.ledger-modal').waitFor();}))return;
    if(!await step('27-ledger-mapping',async()=>{
      await page.getByLabel('XLSX 검토대장 선택').setInputFiles({name:'합성_검토대장.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('Synthetic upload token: local mock supplies parsed response; not a real workbook.')});
      await page.getByRole('button',{name:'기입 위치 확인하기',exact:true}).click();await page.locator('.ledger-mapping-table').waitFor();await page.locator('#ledger-note').fill('합성 캡처용 메모: 원본 사진 확인 예정.');
    }))return;
    await step('28-results-mobile-motion-off',async()=>{
      await click('검토대장 창 닫기');await click('검토 대상으로');await tab('검토 항목');await viewport(390,844);await media('reduce');await click('모션 ON');
      // Real keyboard scrolling; no page.evaluate mutation.
      await page.keyboard.press('Control+Home');
      await page.waitForFunction(()=>scrollX===0&&scrollY===0,undefined,{timeout:3000});
    });
  };
  const requiredFlow=async()=>{
    if(!await step('29-landing-1600',()=>viewport(1600,960)))return;
    if(!await step('30-landing-1280',()=>viewport(1280,800)))return;
    if(!await step('31-criteria-confirmation-1600',async()=>{await click('검토 기준부터 시작하기');await upload('criteria');await startCriteria();await control('confirmReady');await waitConfirmation();await viewport(1600,960);}))return;
    if(!await step('32-criteria-confirmation-1280',()=>viewport(1280,800)))return;
    if(!await step('33-result-detail-fail-1600',async()=>{await click('기준 확정 · 검토 파일 넣기');await page.getByRole('button',{name:'이 기준으로 검토하기',exact:true}).waitFor();await upload('target');await attach();await control('complete');await waitResults();await page.locator('.frr-item').filter({hasText:'흡수율'}).click();await detail();await viewport(1600,960);}))return;
    await step('34-result-detail-fail-1280',()=>viewport(1280,800));
  };
  try{
    for(const name of sourceNames){const filename=path.join(REFERENCE,name),item=baseline.inputs.find(item=>item.path===name);assert.ok(item);const actual=refOf(filename);assert.equal(actual.sha256,item.sha256,`Reference changed: ${name}`);inputRefs.push(actual);}
    const sourceRefs=['scripts/acceptance/capture-visual-replay.mjs','scripts/acceptance/visual-replay-server.mjs','scripts/acceptance/visual-replay-data.mjs','src/main.tsx','src/App.tsx','architecture/ui/reference/manifest.json','architecture/ui/fonts/manifest.json'].map(name=>refOf(path.join(ROOT,name)));
    const freezePath=path.join(ROOT,'.cache/rebuild/freeze.json');
    const freeze=existsSync(freezePath)?{ref:refOf(freezePath),value:JSON.parse(readFileSync(freezePath,'utf8'))}:null;
    save('capture-plan.json',{schemaVersion:'1.0',acceptanceProfile:PROFILE,loop,preparedAt:now(),mode,origin:ORIGIN,output:relative(out),sourceRefs,inputRefs,freeze,baselineEnvironment:baseline.environment,cases:entries,authorization:'Parent-directed isolated localhost-only Playwright execution; no user browser profile.',scope:'Actual browser capture only; visual parity still requires independent comparison. Smoke omits state 03 and its OFF/ON toggles.'});
    console.log(JSON.stringify({output:relative(out),mode,selectedStates:[...selected]}));
    // Check before resetting shared fixture state or launching the browser. An old
    // replay process without this endpoint fails closed, even if it serves the UI.
    startupProvenance=await controller('/__visual/provenance');
    sourceParity.serverStartup=save('server-startup-source.json',startupProvenance);
    diskBefore=await snapshotReplaySources();sourceParity.diskBefore=save('disk-source-before.json',diskBefore);
    assertReplaySourceParity(startupProvenance.snapshot,diskBefore);
    sourceParity.preflightVerified=true;sourceParity.startupDigest=startupProvenance.snapshot.digest;
    sourceParity.freezeMatchesImplementation=freeze?freeze.value.codeDigest===diskBefore.implementationDigest:null;
    log('source-preflight',{verified:true,digest:diskBefore.digest,implementationDigest:diskBefore.implementationDigest,fileCount:diskBefore.files.length,serverProcessId:startupProvenance.processId});
    await reset();
    const {chromium}=await import(pathToFileURL(PLAYWRIGHT).href);
    const bundled=chromium.executablePath();
    const executable=existsSync(bundled)?bundled:existsSync(CHROME)?CHROME:EDGE;
    assert.ok(existsSync(executable),'Bundled Chromium, explicit installed Chrome, and explicit installed Edge are unavailable; no installation attempted.');
    launchInfo={playwrightVersion:JSON.parse(readFileSync(path.join(path.dirname(PLAYWRIGHT),'package.json'),'utf8')).version,bundledExecutable:bundled,bundledExists:existsSync(bundled),executable,selection:executable===bundled?'bundled-chromium':executable===CHROME?'explicit-installed-chrome-fallback':'explicit-installed-edge-fallback',userProfile:'none; Playwright isolated temporary profile',headless:true,node:process.version};
    browser=await chromium.launch({executablePath:executable,headless:true,timeout:30000,args:['--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--no-first-run','--no-default-browser-check','--disable-domain-reliability','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']});
    launchInfo.browserVersion=browser.version();launchInfo.browserName=browser.browserType().name();
    launchInfo.referenceBrowser=baseline.environment.userAgent;launchInfo.environmentMatchNotAssumed=true;log('browser-launched',launchInfo);
    await openContext('states-01-28');await flow();await closeContext();
    if(mode==='all'){
      await waitServer(state=>state.subscribers.run===0&&state.subscribers.activity===0,'own context SSE cleanup');
      await reset();await openContext('states-29-34');await requiredFlow();await closeContext();
    }
  }catch(error){runError=errorData(error);log('run-error',runError);console.error(JSON.stringify({runError:runError.message}));}
  finally{
    await closeContext();
    if(browser)try{await browser.close();}catch(error){cleanupErrors.push({operation:'browser.close',...errorData(error)});}
    if(sourceParity.preflightVerified){
      try{
        const serverAfter=await controller('/__visual/provenance'),diskAfter=await snapshotReplaySources();
        sourceParity.serverAfter=save('server-after-source.json',serverAfter);sourceParity.diskAfter=save('disk-source-after.json',diskAfter);
        assert.equal(serverAfter.processId,startupProvenance.processId,'Replay server process changed during capture.');
        assert.equal(serverAfter.startedAt,startupProvenance.startedAt,'Replay server startup changed during capture.');
        assertReplaySourceParity(startupProvenance.snapshot,serverAfter.snapshot);
        assertReplaySourceParity(startupProvenance.snapshot,diskAfter);assertReplaySourceParity(diskBefore,diskAfter);
        sourceParity.postflightVerified=true;sourceParity.verified=true;log('source-postflight',{verified:true,digest:diskAfter.digest,fileCount:diskAfter.files.length});
      }catch(error){sourceParity.error=errorData(error);runError??=sourceParity.error;log('source-postflight-error',sourceParity.error);}
    }else sourceParity.error=runError||{message:'Source preflight was not completed.'};
    endedAt=now();
    for(const record of entries){
      if(record.captureStatus==='NOT_RUN'&&record.selected)record.reason=runError?`Run error: ${runError.message}`:firstFlowError?`An earlier required transition/capture failed (${firstFlowError}); state was not synthesized.`:'Selected state was not reached.';
      const filename=path.join(out,'states',`${record.id}.json`);if(!existsSync(filename))save(`states/${record.id}.json`,record);
    }
    save('measurements.json',measurements);save('environment.json',{launch:launchInfo,contexts,baseline:baseline.environment,blockedExternal,browserErrors,locatorMappings,cleanupErrors});
    try{save('server-final-state.json',await controller('/__visual/state'));}catch(error){cleanupErrors.push({operation:'final controller observation',...errorData(error)});}
    const counts={captured:entries.filter(item=>item.captureStatus==='CAPTURED').length,error:entries.filter(item=>item.captureStatus==='ERROR').length,notRun:entries.filter(item=>item.captureStatus==='NOT_RUN').length};
    const completeSelected=[...selected].every(id=>records.get(id).captureStatus==='CAPTURED');
    const manifest={schemaVersion:'1.0',acceptanceProfile:PROFILE,loop,mode,origin:'actual-browser-current-react-synthetic-http',synthetic:true,fixtureId:baseline.fixtureId,startedAt,endedAt,command:[process.execPath,...process.argv.slice(1)],referenceManifest:refOf(path.join(REFERENCE,'manifest.json')),inputRefs,output:relative(out),browser:launchInfo,contexts,traceRefs,captureCounts:counts,selectedCount:selected.size,allSelectedCaptured:completeSelected,sourceParity,visualAcceptance:'NOT_RUN',parityCompared:false,providerCalls:{gemini:0,e2b:0},providerCountsScope:'Replay configuration disables providers; captures do not prove provider execution.',locatorMappings,blockedExternal,browserErrors,cleanupErrors,runError,cases:entries};
    const manifestRef=save('capture-manifest.json',manifest);
    console.log(JSON.stringify({manifest:manifestRef.path,captureCounts:counts,allSelectedCaptured:completeSelected,sourceParityVerified:sourceParity.verified,visualAcceptance:'NOT_RUN'}));
    return {out,manifest,exitCode:runError||!completeSelected||cleanupErrors.length||!sourceParity.verified?1:0};
  }
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help')console.log('Usage (pinned Node v24.13.1): node scripts/acceptance/capture-visual-replay.mjs (--smoke | --all) [--loop LOOP-005]\nRequires existing replay server at http://127.0.0.1:5210 and no other active replay SSE subscribers.\nOutputs: artifacts/rebuild/<loop, default loop-004>/<new immutable timestamp>/; never overwrites reference assets.');
  else try{const result=await captureVisualReplay(parseCaptureArguments(args));process.exitCode=result.exitCode;}catch(error){console.error(JSON.stringify({error:errorData(error)}));process.exitCode=1;}
}

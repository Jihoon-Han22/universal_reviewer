async page => {
  const config=await page.evaluate(()=>window.__REFERENCE_CAPTURE_CONFIG||{});
  const entry=config.entryUrl||page.url();
  const output=config.outputDirectory||'architecture/ui/reference';
  const origin=entry.match(/^https?:\/\/[^/]+/)[0];
  const referencePath=config.referencePath||'/architecture/ui/reference';
  const fontPath=config.fontPath||'/architecture/ui/fonts';
  const measurements=[];
  const serializeDom=()=>{
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
    return {capturedAt:new Date().toISOString(),performanceTime:performance.now(),url:location.href,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollX,scrollY},motion:{app:document.documentElement.dataset.motion??null,appStored:location.protocol==='about:'?null:localStorage.getItem('trace-demo-motion'),osReduce:matchMedia('(prefers-reduced-motion: reduce)').matches,animationFreeze:'none'},eventSequence:window.__visual?.run()?.events.map(event=>({type:event.type,sequence:event.sequence,timestamp:event.timestamp}))||[],tree,animations};
  };
  page.setDefaultTimeout(12000);
  const fonts=await (await page.request.get(origin+fontPath+'/fonts.css')).text();
  const blockedExternal=[];
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith('https://fonts.googleapis.com/'))return route.fulfill({contentType:'text/css',body:fonts.replaceAll('url(./','url('+origin+fontPath+'/')});
    if(url.startsWith(origin+'/')||/^(data|blob|about):/.test(url))return route.continue();
    blockedExternal.push(url.split('?')[0]);return route.abort('blockedbyclient');
  });
  await page.setViewportSize({width:1440,height:960});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>localStorage.setItem('trace-demo-motion','on'));
  await page.goto(entry);
  await page.getByRole('button',{name:'검토 기준부터 시작하기',exact:true}).waitFor();
  await page.evaluate(()=>{
    window.__referenceDomSnapshots=[];
    window.__referenceEnvironment={userAgent:navigator.userAgent,platform:navigator.platform,language:navigator.language,languages:[...navigator.languages],timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,devicePixelRatio};
  });
  const shot=async(name,note='')=>{
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(650);
    const livePhase=/^(07|08|13|20)-/.test(name);
    let finiteAnimationsSettled=null;
    if(!livePhase){
      try{
        await page.waitForFunction(()=>document.getAnimations().every(animation=>animation.playState!=='running'||!Number.isFinite(animation.effect?.getComputedTiming().endTime)),{},{timeout:5000});
        await page.waitForFunction(()=>[...document.querySelectorAll('.workflow-input-card,.frr-focus-view,.ledger-shell,.dashboard-source-view')].every(element=>Number(getComputedStyle(element).opacity)>=.999),{},{timeout:5000});
        finiteAnimationsSettled=true;
      }catch{finiteAnimationsSettled=false;}
    }
    await page.screenshot({path:output+'/'+name+'.png'});
    const settling={livePhase,finiteAnimationsSettled,minimumSettleMs:650,animationFreeze:'none'};
    const dom={id:name,synthetic:true,settling,screenshotTiming:'DOM sampled immediately after viewport screenshot; live animations are not frozen.',main:await page.evaluate(serializeDom),frames:[]};
    for(const frame of page.frames().slice(1))dom.frames.push(await frame.evaluate(serializeDom));
    await page.evaluate(value=>window.__referenceDomSnapshots.push(value),dom);
    const result=await page.evaluate(()=>{
      const selectors=['.app-shell','.app-header','.workflow-steps','.workflow-main','main','.workflow-heading','.workflow-input-card','.workflow-analysis-stage','.workflow-stage-body','.criteria-confirmation','.criteria-source-pane','.live-review-workspace','.frr-workspace','.frr-source','.frr-detail','.frr-file','.dashboard-modal','.dashboard-preview-frame','.dashboard-builder','.dashboard-activity','.ledger-modal','.ledger-mapping-table','h1'];
      const boxes={};for(const selector of selectors){const el=document.querySelector(selector);if(el){const b=el.getBoundingClientRect(),s=getComputedStyle(el);boxes[selector]={x:b.x,y:b.y,width:b.width,height:b.height,fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,color:s.color,background:s.backgroundColor,borderRadius:s.borderRadius,padding:s.padding,gap:s.gap};}}
      return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},page:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,horizontalOverflow:document.documentElement.scrollWidth>innerWidth},motion:{app:document.documentElement.dataset.motion,osReduce:matchMedia('(prefers-reduced-motion: reduce)').matches},fonts:{status:document.fonts.status,dmSans:document.fonts.check('16px "DM Sans"'),notoSansKr:document.fonts.check('16px "Noto Sans KR"'),faces:[...document.fonts].map(f=>({family:f.family,status:f.status,weight:f.weight}))},boxes};
    });
    const frames=[];
    for(const frame of page.frames().slice(1)) frames.push(await frame.evaluate(()=>({url:location.href,title:document.title,theme:document.querySelector('#dashboard-root')?.getAttribute('data-theme'),distribution:document.querySelector('#dashboard-root')?.getAttribute('data-distribution'),canvasCount:document.querySelectorAll('canvas').length,visibleText:document.body?.innerText.slice(0,12000),reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,fontFamily:getComputedStyle(document.body).fontFamily})));
    measurements.push({id:name,note,capturedAt:new Date().toISOString(),url:page.url(),mockOrigin:origin,synthetic:true,settling,visibleText:(await page.locator('body').innerText()).slice(0,24000),frames,...result});await page.evaluate(value=>window.__referenceMeasurements=value,measurements);
  };

  await page.setViewportSize({width:1600,height:960});
  await shot('29-landing-1600','Settled landing at required 1600 × 960 viewport.');
  await page.setViewportSize({width:1280,height:800});
  await shot('30-landing-1280','Settled landing at required 1280 × 800 viewport.');
  await page.getByRole('button',{name:'검토 기준부터 시작하기',exact:true}).click();
  await page.locator('input[type=file]').first().setInputFiles(output+'/synthetic-fixture.json');
  await page.getByRole('button',{name:/합성_품질기준.xlsx XLSX/}).waitFor();
  await page.getByRole('button',{name:'기준 정리하기',exact:true}).click();
  await page.evaluate(()=>{window.__visual.startReading();window.__visual.confirmReady();});
  await page.getByRole('button',{name:'기준 확정 · 검토 파일 넣기'}).waitFor();
  await page.setViewportSize({width:1600,height:960});
  await shot('31-criteria-confirmation-1600','Settled synthetic criteria confirmation at required 1600 × 960 viewport.');
  await page.setViewportSize({width:1280,height:800});
  await shot('32-criteria-confirmation-1280','Settled synthetic criteria confirmation at required 1280 × 800 viewport.');
  await page.getByRole('button',{name:'기준 확정 · 검토 파일 넣기'}).click();
  await page.locator('input[type=file]').first().setInputFiles(output+'/synthetic-fixture.json');
  await page.getByRole('button',{name:/합성_시험성적서_A.xlsx XLSX/}).waitFor();
  await page.getByRole('button',{name:'이 기준으로 검토하기',exact:true}).click();
  await page.evaluate(()=>{window.__visual.reviewActive();window.__visual.complete();});
  await page.getByRole('heading',{name:'파일별로, 결과와 근거를 함께.'}).waitFor();
  await page.locator('.frr-item').filter({hasText:'흡수율'}).click();
  await page.getByRole('tabpanel',{name:'선택한 항목 상세'}).waitFor();
  await page.setViewportSize({width:1600,height:960});
  await shot('33-result-detail-fail-1600','Settled synthetic failed result detail at required 1600 × 960 viewport.');
  await page.setViewportSize({width:1280,height:800});
  await shot('34-result-detail-fail-1280','Settled synthetic failed result detail at required 1280 × 800 viewport.');
  await page.evaluate(value=>window.__referenceBlockedExternal=value,blockedExternal);
  return {captured:measurements.length,blockedExternal};
}

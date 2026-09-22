// CURRENT_REPRODUCTION expectations. These are frozen before browser execution.
// Missing scenarios stay in the twelve-case denominator; this is not an a11y redesign.
export const browserBehaviorFacets = [
  { id:'landing-keyboard', cases:['keyboard-focus-dialog-Escape'], source:'04 §8; UI-09', actions:['Tab and Shift+Tab through native controls','Activate motion toggle with Space','Activate start CTA with Enter'], expected:{tabReachable:true,shiftTabReverses:true,spaceToggles:true,enterStarts:true} },
  { id:'landing-off', cases:['app-motion-OFF'], source:'04 §8', actions:['Turn app motion OFF','Wait two animation frames','Reload with saved preference'], expected:{app:'reduced',stored:'off',pressed:'false',running:0,reloadApp:'reduced'} },
  { id:'landing-os', cases:['OS-reduced-motion'], source:'04 §8; DECISIONS D16', actions:['Set OS reduce while app ON','Observe app preference and animation sample'], expected:{app:'full',stored:'on',osReduce:true} },
  { id:'mobile-landing', cases:['mobile-overflow'], source:'04 §2 responsive table', actions:['Set viewport 390 × 844','Capture page/control bounds'], expected:{width:390,horizontalOverflow:false} },
  { id:'native-zoom', cases:['zoom-200-percent'], source:'04 §8; UI-09', actions:['Send browser zoom keyboard accelerators to 200%','Verify actual devicePixelRatio and CSS viewport change','Record bounds and screenshot','Reset native zoom'], expected:{verified200Percent:true} },
  { id:'live-off', cases:['app-motion-OFF'], source:'04 §8; I2; I5', actions:['Upload and approve reference criteria through actual UI','Start target review','Turn OFF during actual synthetic SSE activity','Observe animations and packet DOM'], expected:{app:'reduced',running:0,packets:0} },
  { id:'live-aria', cases:['ARIA-current-limitations'], source:'auxiliary A5; 04 §8', actions:['Observe live review role=status and aria-live'], expected:{announcement:'검토 진행 중. 추출 3개, 판정 3개.',polite:true} },
  { id:'mobile-live', cases:['mobile-overflow'], source:'04 §2; auxiliary A4', actions:['Set live viewport 390 × 844','Capture workroom tabs and bounds'], expected:{width:390,horizontalOverflow:false} },
  { id:'results-off', cases:['app-motion-OFF'], source:'04 §8', actions:['Complete replay through synthetic controller','Capture actual results while OFF'], expected:{app:'reduced',running:0,itemCount:3} },
  { id:'detail-focus', cases:['keyboard-focus-dialog-Escape'], source:'04 §2; I7', actions:['Focus result button and press Enter','Observe focused inspector heading','Press item-list return','Observe original item focus restored','Repeat five times and measure click-to-visible'], expected:{headingFocused:true,restored:true,iterations:5} },
  { id:'mobile-results', cases:['mobile-overflow'], source:'04 §2; I7', actions:['Set results viewport 390 × 844','Select item','Capture detail ordering and bounds'], expected:{width:390,horizontalOverflow:false,detailBeforeSource:true} },
  { id:'summary-tooltip', cases:['keyboard-focus-dialog-Escape','ARIA-current-limitations'], source:'04 §7; I8 CURRENT_REPRODUCTION', actions:['Open summary','Focus item tile','Observe tooltip role, width and describedby','Press Escape and verify baseline tooltip persists','Blur and verify close'], expected:{role:'tooltip',width:280,described:true,escapeKeepsOpen:true,blurCloses:true} },
  { id:'summary-os', cases:['OS-reduced-motion'], source:'04 §7–8', actions:['App ON and OS reduce','Open actual summary','Observe end counts and remaining component animation'], expected:{app:'full',osReduce:true,summaryRunning:0,tiles:3} },
  { id:'dashboard-escape', cases:['keyboard-focus-dialog-Escape'], source:'05 D09', actions:['Keyboard activate dashboard','Observe native dialog','Press Escape','Verify unmount and focus return'], expected:{nativeModal:true,closed:true,focusReturned:true} },
  { id:'ledger-escape', cases:['keyboard-focus-dialog-Escape'], source:'05 ledger interaction; UI-09', actions:['Open export menu and ledger','Observe native dialog','Press Escape','Verify unmount'], expected:{nativeModal:true,closed:true} },
  { id:'dashboard-resources', cases:['PDF-iframe-objectURL-cleanup','CORE-19-C01','CORE-19-C04','measured-performance-no-invented-target'], source:'04 §8; 05 D09; 07 §7.7, EF16', actions:['Generate synthetic dashboard through actual UI','Open/source/charts/close five times','Measure iframe/canvas/ResizeObserver/EventSource/objectURL before/after','Record RAF, long tasks and browser heap metrics'], expected:{cycles:5,oneIframeWhileOpen:true,iframeGoneAfterClose:true,observersReturned:true,sseReturned:true,objectURLsReturned:true,sourceTabRetainsIframe:true} },
  { id:'cancel-aria', cases:['ARIA-current-limitations','unmount-disconnect-cancel'], source:'auxiliary A5; I1; 04 §3', actions:['Start a separate real UI replay context','Enter live review and click Stop','Observe immediate cancelled status and baseline progress announcement','Observe run SSE closure'], expected:{cancelRequested:true,cancelled:true,runSubscribers:0,announcement:'검토 진행 중. 추출 3개, 판정 3개.'} },
  { id:'context-cleanup', cases:['unmount-disconnect-cancel','CORE-19-C04'], source:'04 §8; 07 §7.7', actions:['Close each owned browser context','Observe actual server SSE subscriber counts'], expected:{run:0,activity:0} },
  { id:'performance-recording', cases:['measured-performance-no-invented-target','CORE-19-C05'], source:'04 §8; 07 §7.9', actions:['Record 30 seconds of actual app ON motion','Store RAF intervals, long-task entries, environment, five detail and modal samples','Report median/p95 without an invented absolute pass threshold'], expected:{sampleWindowAtLeast30Seconds:true,detailSamples:5,modalSamples:5} },
];

// A partial collector must not silently certify broader case wording. These
// facets need additional real scenarios/fixtures before final gate submission.
export const missingBrowserBehaviorFacets = [
  {id:'pdf-render-cancel-destroy',cases:['PDF-iframe-objectURL-cleanup','CORE-19-C04'],reason:'Current localhost replay supplies spreadsheet previews only; no real PDF loadingTask.destroy/renderTask.cancel execution.'},
  {id:'objecturl-download',cases:['PDF-iframe-objectURL-cleanup'],reason:'Replay blocks download/export endpoints. Zero allocations is recorded but does not prove a real create/revoke download cycle.'},
  {id:'disconnect-reconnect-handoff',cases:['unmount-disconnect-cancel','CORE-19-C04','OS-reduced-motion','app-motion-OFF'],reason:'Existing replay has no cross-runtime handoff/disconnect controller. Queue pause/resume, OFF purge and OS-preserved JS queue need their own actual browser scenario.'},
  {id:'cache-lifetime-all-owners',cases:['CORE-19-C01'],reason:'Five modal cycles cover host UI cleanup only. ES01–ES22 backend/cache owners, FIFO eviction and capacities require separately bound actual observations.'},
  {id:'rapid-events-caps',cases:['CORE-19-C04'],reason:'Three-item fixture does not exercise 100 rapid events, arrival six, pending eight, tasks 100, events 200 and presentation sessions 30.'},
  {id:'all-size-time-token-limits',cases:['CORE-19-C05'],reason:'Browser timing measurements do not prove EL01–EL35 or all EF01–EF16 resource and partial semantics.'},
  {id:'large-performance-inputs',cases:['measured-performance-no-invented-target','CORE-19-C05'],reason:'Current synthetic reference has three items. Actual 100-item filter and 2,000-item/maximum-source ten-cycle EF16 probes need a separate fixture.'},
  {id:'aria-failed-null-matrix',cases:['ARIA-current-limitations'],reason:'Completed/live/cancelled observations do not execute failed/null × busy combinations or all role/filter name states.'},
  {id:'analysis-drawer-and-golden-keyboard',cases:['keyboard-focus-dialog-Escape'],reason:'This slice covers result, tooltip, dashboard and ledger keyboard paths. Analysis drawer trigger focus limitation and golden loading/Escape states remain to execute.'},
];

export function makeBrowserBehaviorCases(registry, inputs) {
  const definitions=registry.cases.filter(item=>item.gateId==='G13');
  if(definitions.length!==12)throw new Error('G13 denominator must remain twelve.');
  return definitions.map(definition=>{
    const facets=browserBehaviorFacets.filter(facet=>facet.cases.includes(definition.requirement)||facet.cases.some(id=>definition.id===`G13:${id}`));
    const missing=missingBrowserBehaviorFacets.filter(facet=>facet.cases.some(id=>definition.id===`G13:${id}`));
    return {caseId:definition.id,inputs,baselineReferences:definition.baselineReferences,initialState:'Fresh isolated Chromium context; localhost actual React/createApp; reference synthetic provider responses; no user profile or live provider.',actions:facets.flatMap(facet=>facet.actions),facets:facets.map(facet=>facet.id),missingFacets:missing.map(facet=>facet.id),assertions:[...facets.flatMap(facet=>Object.entries(facet.expected).map(([key,expected])=>({name:`${facet.id}: ${key}`,pointer:`/facets/${facet.id}/observations/${key}`,operator:'deepEqual',expected,source:facet.source}))),{name:'Every required facet was executed',pointer:'/coverage/complete',operator:'deepEqual',expected:true}]};
  });
}

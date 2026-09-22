// Browser-only synthetic reference harness. Never connect these responses to a live backend.
export function installVisualMock(fixture, dashboardHtml = '', darkDashboardHtml = dashboardHtml) {
  const nativeFetch = window.fetch.bind(window), sources = new Set();
  const copy = value => JSON.parse(JSON.stringify(value));
  let sequence = 0, tasks = [], jobStatus = 'generating', selectedDashboardHtml=dashboardHtml, selectedDesign=copy(fixture.design);
  const now = () => new Date().toISOString();
  const [criteriaDoc,targetDoc] = copy(fixture.documents);
  let run = {id:'visual-run',mode:'criteria_first',status:'running',stage:'analyzing',criterionVersion:1,criteriaRevision:0,criteriaDocuments:[criteriaDoc],documents:[],criteria:copy(fixture.criteria),items:[],analyses:[],analysisActivity:[],events:[]};
  class SyntheticEventSource {
    static OPEN = 1; static CLOSED = 2; static CONNECTING = 0;
    constructor(url) { this.url=String(url); this.readyState=1; this.listeners=new Map(); sources.add(this); setTimeout(()=>this.onopen?.({type:'open'}),0); }
    addEventListener(type, fn) { if(!this.listeners.has(type))this.listeners.set(type,new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type,fn) { this.listeners.get(type)?.delete(fn); }
    emit(type,payload) { const event={type,data:JSON.stringify(payload)}; this.listeners.get(type)?.forEach(fn=>fn(event)); if(type==='message')this.onmessage?.(event); }
    close() { this.readyState=2; sources.delete(this); }
  }
  window.EventSource = SyntheticEventSource;
  const response = value => new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
  window.fetch = async (input,init={}) => {
    const url = new URL(typeof input==='string'?input:input.url,location.href), path=url.pathname, method=init.method||'GET';
    if(!path.startsWith('/api/')) return nativeFetch(input,init);
    window.__visual.requests.push({path,method});
    if(path==='/api/health')return response({geminiConfigured:true,e2bConfigured:true,synthetic:true});
    if(path==='/api/activity')return response({tasks});
    if(path==='/api/documents' && method==='POST') {
      const role=init.body?.get?.('role');
      if(role==='ledger')return response({documents:[{...criteriaDoc,id:'visual-ledger',name:'합성_검토대장.xlsx',role:'ledger'}]});
      return response({documents:[role==='target'?targetDoc:criteriaDoc]});
    }
    if(path==='/api/runs' && method==='POST')return response({runId:run.id});
    if(path===`/api/runs/${run.id}/criteria/confirm`) { run.status='awaiting_documents';run.stage='awaiting_documents';run.approvedCriteria={criteria:copy(run.criteria),criterionVersion:1,approvedAt:now()};return response(run); }
    if(path===`/api/runs/${run.id}/documents`) { run.status='running';run.stage='analyzing_targets';run.documents=[{...targetDoc,status:'processing'}];return response(run); }
    if(path===`/api/runs/${run.id}`)return response(run);
    if(path==='/api/dashboards'&&method==='POST'){
      const body=JSON.parse(init.body||'{}'),dark=String(body.instruction||'').includes('다크');
      selectedDashboardHtml=dark?darkDashboardHtml:dashboardHtml;
      selectedDesign={...copy(fixture.design),...(dark?{theme:'dark',distribution:'bar'}:{})};
      jobStatus='generating';
      return response({id:'visual-dashboard'});
    }
    if(path==='/api/dashboards/visual-dashboard')return response({id:'visual-dashboard',status:jobStatus,html:jobStatus==='ready'?selectedDashboardHtml:undefined,sourceItems:copy(fixture.items),criterionVersion:1,presentation:'standard',design:selectedDesign,logs:[{id:'visual-log-1',time:now(),step:'model',title:'합성 검토 결과에 맞춘 디자인 구성',status:jobStatus==='ready'?'completed':'running',detail:'합성 디자인 설정 · API/E2B 미호출'}]});
    if(path==='/api/ledgers/analyze')return response({mapping:{status:'ready',sheet:'검토대장',key:'SYN-2026-001',headerRow:1,keyColumn:'A',resultColumn:'C',noteColumn:'D',matchingRows:[2],targetCells:['C2','D2'],existingValues:{C2:'',D2:''},sourceDigest:'synthetic-only'},proposal:{fingerprint:'synthetic-proposal',result:'부적합',note:'흡수율 6.2% > 5%. 외관은 원본 확인 필요.',counts:{total:3,pass:1,fail:1,review:1},sourceDocumentId:targetDoc.id,sourceDocumentName:targetDoc.name,incomplete:false},analysis:{status:'complete',summary:'합성 검토대장 1개 시트의 성적서 번호 열과 결과 열을 확인했습니다.',inventory:{sheetCount:1,sheets:[{name:'검토대장',state:'visible',maxRow:2,maxColumn:4}]},coverage:{complete:true,readerComplete:true,contextComplete:true,unitsTotal:1,unitsRead:1}}});
    if(path.includes('/resolve')) { const id=path.split('/').at(-2), body=JSON.parse(init.body);const item={...fixture.items.find(item=>item.id===id),status:body.status,humanNote:body.note,reviewedByHuman:true}; return response({item}); }
    if(method==='DELETE'||path.endsWith('/cancel'))return response({ok:true});
    return new Response(JSON.stringify({message:`Synthetic harness has no response for ${method} ${path}`}),{status:404,headers:{'Content-Type':'application/json'}});
  };
  const emit = (type, extra={}) => { const event={type,runId:run.id,sequence:++sequence,timestamp:now(),...extra};run.events.push(event);for(const source of sources)if(source.url.includes('/runs/'))source.emit(type,event); };
  const activity = (document=criteriaDoc,phase='read') => {
    const time=now();tasks=[{id:'visual-e2b',kind:'document-analysis',runtime:'e2b',title:`문서 탐색 · ${document.name}`,status:'running',phase,runId:run.id,contextId:run.id,documentId:document.id,documentName:document.name,startedAt:time,updatedAt:time,currentOperation:{title:phase==='read'?'전체 시트 · 셀 범위 읽기':'원본 측정값과 기준 대조',step:phase,startedAt:time},events:[{id:'visual-event-1',time,title:'원본 전체 범위 읽기',step:'read',status:'completed'},{id:'visual-event-2',time,title:'구조와 적용 맥락 확인',step:phase,status:'running'}]}];
    for(const source of sources)if(source.url.includes('/activity/'))source.emit('activity',{tasks});
  };
  const analysis = doc => ({documentId:doc.id,name:doc.name,role:doc.role,status:'complete',documentType:doc.role==='criteria'?'품질 기준서':'시험성적서',summary:'전체 시트를 읽고 시료·항목·단위·적용 조건의 관계를 확인했습니다.',structure:[{name:doc.preview.sheets[0].name,kind:'table',sheet:doc.preview.sheets[0].name,range:doc.role==='criteria'?'A1:E4':'A1:D6',description:'항목별 기준과 측정값, 조건을 구분한 표'}],coverage:{complete:true,readerComplete:true,contextComplete:true,unitsTotal:1,unitsRead:1,contextSegmentsTotal:1,contextSegmentsRead:1},quality:{status:'verified',attempts:1,maxAttempts:3,issues:[],rounds:[{attempt:1,status:'verified',issueCount:0,rereadRanges:[]}]}});
  window.__visual={requests:[],fixture,run:()=>run,
    startReading(){emit('run.started');emit('document.analysis.started',{documentId:criteriaDoc.id,name:criteriaDoc.name,role:'criteria',analysis:{status:'processing'}});activity();},
    context(){activity(criteriaDoc,'context');},
    confirmReady(){run.status='awaiting_confirmation';run.stage='criteria_confirmation';run.analyses=[analysis(criteriaDoc)];run.criteriaDocumentAssessments=[{documentId:criteriaDoc.id,name:criteriaDoc.name,status:'criteria',reason:'항목별 판정 조건이 명시된 합성 기준서입니다.',evidence:fixture.criteria[0].sourceEvidence}];tasks=tasks.map(task=>({...task,status:'completed'}));emit('criteria.confirmation_required',{criteria:run.criteria,analyses:run.analyses,criteriaDocumentAssessments:run.criteriaDocumentAssessments});for(const source of sources)if(source.url.includes('/activity/'))source.emit('activity',{tasks});},
    reviewActive(){run.analyses.push(analysis(targetDoc));run.items=copy(fixture.items);emit('documents.attached',{documents:run.documents});emit('document.analysis.completed',{documentId:targetDoc.id,analysis:analysis(targetDoc)});emit('document.started',{documentId:targetDoc.id});emit('document.extracted',{documentId:targetDoc.id,items:fixture.items.map(item=>({...item,status:'pending'})),extraction:targetDoc.extraction});for(const item of fixture.items)emit('item.decided',{documentId:targetDoc.id,item});activity(targetDoc,'review');},
    complete(){run.status='completed';run.stage='complete';run.documents=[{...targetDoc,status:'completed'}];run.items=copy(fixture.items);run.summary={total:3,pass:1,fail:1,review:1,pending:0};tasks=tasks.map(task=>({...task,status:'completed'}));emit('run.completed',{summary:run.summary});for(const source of sources)if(source.url.includes('/activity/'))source.emit('activity',{tasks});},
    dashboardReady(){jobStatus='ready';},
  };
}

// TEST ONLY: HTTP replay of architecture/ui/reference/mock-api.mjs inputs.
// This module performs no IO, starts no work, and contains no golden/v3 answers.
import { ReviewError } from '../../server/review.mjs';

const copy = value => structuredClone(value);
const assert = (condition, message) => { if (!condition) throw new ReviewError(`Synthetic replay: ${message}`, 409); };
const unavailable = () => { throw new ReviewError('Synthetic replay: operation outside the 34 reference states.', 501); };

export function createVisualReplay({fixture, dashboardHtml, darkDashboardHtml, now = () => new Date().toISOString()}) {
  const [criteriaDoc, targetDoc] = copy(fixture.documents);
  const ledgerDoc = {...copy(criteriaDoc), id:'visual-ledger', name:'합성_검토대장.xlsx', role:'ledger'};
  const documentsById = new Map(), runListeners = new Set(), activityListeners = new Set();
  let run, tasks, revision, started, phase, jobStatus, dashboardCreated, selectedDashboardHtml, selectedDesign;
  const controls = [], requests = [];
  const record = (kind, data) => controls.push({kind, timestamp:now(), ...copy(data)});
  const notifyActivity = () => { revision++; for (const callback of activityListeners) callback(); };
  const reset = () => {
    assert(runListeners.size === 0 && activityListeners.size === 0, 'close the app tab before resetting active SSE connections.');
    run = {id:'visual-run', mode:'criteria_first', status:'running', stage:'analyzing', criterionVersion:1, criteriaRevision:0, criteriaDocuments:[copy(criteriaDoc)], documents:[], criteria:copy(fixture.criteria), items:[], analyses:[], analysisActivity:[], events:[]};
    tasks=[]; revision=0; started=false; phase='idle'; jobStatus='generating'; dashboardCreated=false;
    selectedDashboardHtml=dashboardHtml; selectedDesign=copy(fixture.design); documentsById.clear();
    record('reset', {});
  };
  const get = id => { assert(started && id === run.id, 'run not started or unknown run.'); return run; };
  const snapshot = id => copy(get(id));
  const emit = (type, extra={}) => {
    // Existing product event-envelope fields; the fixture event payload is unchanged.
    // The reference's browser-only EventSource delivered named events; the current
    // real server delivers default-message SSE with type/runStatus in its JSON.
    // Preserve the reference mock's shared payload arrays in stored snapshots;
    // subscribers receive a copy at delivery time, as JSON SSE does.
    const event = {type, runId:run.id, sequence:run.events.length+1, timestamp:now(), mode:run.mode, status:run.status, stage:run.stage, criterionVersion:run.criterionVersion, ...extra, runStatus:run.status};
    run.events.push(event); for (const listener of runListeners) listener(copy(event));
  };
  const activity = (document=criteriaDoc, operationPhase='read') => {
    const time=now();
    tasks=[{id:'visual-e2b',kind:'document-analysis',runtime:'e2b',title:`문서 탐색 · ${document.name}`,status:'running',phase:operationPhase,runId:run.id,contextId:run.id,documentId:document.id,documentName:document.name,startedAt:time,updatedAt:time,currentOperation:{title:operationPhase==='read'?'전체 시트 · 셀 범위 읽기':'원본 측정값과 기준 대조',step:operationPhase,startedAt:time},events:[{id:'visual-event-1',time,title:'원본 전체 범위 읽기',step:'read',status:'completed'},{id:'visual-event-2',time,title:'구조와 적용 맥락 확인',step:operationPhase,status:'running'}]}];
    notifyActivity();
  };
  const analysis = doc => ({documentId:doc.id,name:doc.name,role:doc.role,status:'complete',documentType:doc.role==='criteria'?'품질 기준서':'시험성적서',summary:'전체 시트를 읽고 시료·항목·단위·적용 조건의 관계를 확인했습니다.',structure:[{name:doc.preview.sheets[0].name,kind:'table',sheet:doc.preview.sheets[0].name,range:doc.role==='criteria'?'A1:E4':'A1:D6',description:'항목별 기준과 측정값, 조건을 구분한 표'}],coverage:{complete:true,readerComplete:true,contextComplete:true,unitsTotal:1,unitsRead:1,contextSegmentsTotal:1,contextSegmentsRead:1},quality:{status:'verified',attempts:1,maxAttempts:3,issues:[],rounds:[{attempt:1,status:'verified',issueCount:0,rereadRanges:[]}]}});
  const documents = {
    async add({role}) {
      assert(['criteria','target','ledger'].includes(role), 'unsupported document role.');
      if (role==='target') assert(run.approvedCriteria, 'confirm criteria before target upload.');
      if (role==='ledger') assert(run.status==='completed', 'complete review before ledger upload.');
      const doc=copy(role==='target'?targetDoc:role==='ledger'?ledgerDoc:criteriaDoc);
      documentsById.set(doc.id,doc); record('upload', {role,documentId:doc.id,bytesParsed:false}); return doc;
    },
    public:copy,
    get(id) { const doc=documentsById.get(id); assert(doc, 'unknown uploaded document.'); return doc; },
    delete(id) { documentsById.delete(id); },
    rollback(added) { for (const doc of added) documentsById.delete(doc.id); },
  };
  const engine = {
    documents, analyzer:unavailable, ensureAnalyzed:unavailable,
    queueModel:unavailable,
    get, snapshot,
    subscribe(value, listener) { get(typeof value==='string'?value:value.id); runListeners.add(listener); return () => runListeners.delete(listener); },
    usedDocument(id) { return started && [...run.criteriaDocuments,...run.documents].some(doc=>doc.id===id); },
    start(body) {
      assert(!started, 'reset before starting another capture flow.');
      assert(body?.mode==='criteria_first' && body.criteriaDocumentIds?.length===1 && body.criteriaDocumentIds[0]===criteriaDoc.id && documentsById.has(criteriaDoc.id), 'use the reference criteria upload and normal Start button.');
      assert(!body.documentIds?.length, 'targets must follow explicit approval.');
      started=true; record('start', {body}); return run;
    },
    confirm(id, body) {
      get(id); assert(run.status==='awaiting_confirmation', 'criteria are not ready for approval.');
      assert(body?.expectedCriterionVersion===1 && Array.isArray(body.criteria) && body.criteria.length===fixture.criteria.length, 'unexpected criterion version/count.');
      for (const criterion of fixture.criteria) {
        const submitted=body.criteria.find(candidate=>candidate.id===criterion.id);
        assert(submitted?.label===criterion.label && submitted.rule===criterion.rule, 'reference flow opens the editor without changing criteria.');
      }
      run.status='awaiting_documents'; run.stage='awaiting_documents';
      run.approvedCriteria={criteria:copy(run.criteria),criterionVersion:1,approvedAt:now()};
      record('confirm', {body}); return snapshot(id);
    },
    attachDocuments(id, body) {
      get(id); assert(run.status==='awaiting_documents' && run.approvedCriteria, 'approve criteria through the app before attachment.');
      assert(body?.expectedCriterionVersion===1 && body.documentIds?.length===1 && body.documentIds[0]===targetDoc.id && documentsById.has(targetDoc.id), 'use the reference target upload.');
      run.status='running'; run.stage='analyzing_targets'; run.documents=[{...copy(targetDoc),status:'processing'}];
      phase='target-attached'; record('attach', {body}); return snapshot(id);
    },
    revise:unavailable, resolve:unavailable,
    cancel(id) { get(id); record('cancel', {id}); run.status='cancelled'; run.stage='cancelled'; emit('run.cancelled'); return snapshot(id); },
  };
  const activityStore = {get revision(){return revision;}, snapshot:()=>copy({tasks}), subscribe(listener){activityListeners.add(listener);return()=>activityListeners.delete(listener);}};
  const commands = {
    reset,
    startReading() { get(run.id); assert(phase==='idle','startReading requires a newly started run.'); phase='read'; emit('run.started'); emit('document.analysis.started',{documentId:criteriaDoc.id,name:criteriaDoc.name,role:'criteria',analysis:{status:'processing'}}); activity(); },
    context() { assert(phase==='read','context requires startReading.'); phase='context'; activity(criteriaDoc,'context'); },
    confirmReady() {
      assert(phase==='read'||phase==='context','confirmReady requires startReading.'); phase='confirmation';
      run.status='awaiting_confirmation';run.stage='criteria_confirmation';run.analyses=[analysis(criteriaDoc)];
      run.criteriaDocumentAssessments=[{documentId:criteriaDoc.id,name:criteriaDoc.name,status:'criteria',reason:'항목별 판정 조건이 명시된 합성 기준서입니다.',evidence:copy(fixture.criteria[0].sourceEvidence)}];
      tasks=tasks.map(task=>({...task,status:'completed'}));
      emit('criteria.confirmation_required',{criteria:run.criteria,analyses:run.analyses,criteriaDocumentAssessments:run.criteriaDocumentAssessments}); notifyActivity();
    },
    reviewActive() {
      assert(phase==='target-attached' && run.approvedCriteria,'reviewActive requires normal approval and target attachment.'); phase='review';
      run.analyses.push(analysis(targetDoc));run.items=copy(fixture.items);
      emit('documents.attached',{documents:run.documents});emit('document.analysis.completed',{documentId:targetDoc.id,analysis:analysis(targetDoc)});emit('document.started',{documentId:targetDoc.id});
      emit('document.extracted',{documentId:targetDoc.id,items:fixture.items.map(item=>({...item,status:'pending'})),extraction:targetDoc.extraction});
      for(const item of fixture.items)emit('item.decided',{documentId:targetDoc.id,item});activity(targetDoc,'review');
    },
    complete() {
      assert(phase==='review','complete requires reviewActive.'); phase='complete';
      run.status='completed';run.stage='complete';run.documents=[{...copy(targetDoc),status:'completed'}];run.items=copy(fixture.items);run.summary={total:3,pass:1,fail:1,review:1,pending:0};
      tasks=tasks.map(task=>({...task,status:'completed'}));emit('run.completed',{summary:run.summary});notifyActivity();
    },
    dashboardReady() { assert(dashboardCreated && jobStatus==='generating','start the dashboard through its Generate button first.'); jobStatus='ready'; },
  };
  const dashboard = {
    create(body) {
      assert(run.status==='completed' && body?.runId===run.id,'dashboard requires completed review.');
      const dark=String(body.instruction||'').includes('다크');selectedDashboardHtml=dark?darkDashboardHtml:dashboardHtml;
      selectedDesign={...copy(fixture.design),...(dark?{theme:'dark',distribution:'bar'}:{})};jobStatus='generating';dashboardCreated=true;
      record('dashboard.create',{body});return {id:'visual-dashboard'};
    },
    get() { assert(dashboardCreated,'dashboard has not been requested.');return {id:'visual-dashboard',status:jobStatus,...(jobStatus==='ready'?{html:selectedDashboardHtml}:{}),sourceItems:copy(fixture.items),criterionVersion:1,presentation:'standard',design:copy(selectedDesign),logs:[{id:'visual-log-1',time:now(),step:'model',title:'합성 검토 결과에 맞춘 디자인 구성',status:jobStatus==='ready'?'completed':'running',detail:'합성 디자인 설정 · API/E2B 미호출'}]}; },
  };
  const ledger = body => {
    assert(run.status==='completed' && documentsById.has(ledgerDoc.id),'upload the ledger token after completed review.');
    assert(body?.runId===run.id && body.documentId===ledgerDoc.id && body.sourceDocumentId===targetDoc.id && body.key==='SYN-2026-001','ledger request differs from reference.');
    return {mapping:{status:'ready',sheet:'검토대장',key:'SYN-2026-001',headerRow:1,keyColumn:'A',resultColumn:'C',noteColumn:'D',matchingRows:[2],targetCells:['C2','D2'],existingValues:{C2:'',D2:''},sourceDigest:'synthetic-only'},proposal:{fingerprint:'synthetic-proposal',result:'부적합',note:'흡수율 6.2% > 5%. 외관은 원본 확인 필요.',counts:{total:3,pass:1,fail:1,review:1},sourceDocumentId:targetDoc.id,sourceDocumentName:targetDoc.name,incomplete:false},analysis:{status:'complete',summary:'합성 검토대장 1개 시트의 성적서 번호 열과 결과 열을 확인했습니다.',inventory:{sheetCount:1,sheets:[{name:'검토대장',state:'visible',maxRow:2,maxColumn:4}]},coverage:{complete:true,readerComplete:true,contextComplete:true,unitsTotal:1,unitsRead:1}}};
  };
  reset();
  return {
    documents,engine,activityStore,dashboard,ledger,requests,controls,
    command(name) { assert(Object.hasOwn(commands,name),`unknown control ${name}.`);commands[name]();record('control',{name});return this.state(); },
    state() {return {synthetic:true,acceptanceProfile:'CURRENT_REPRODUCTION',origin:'actual-react-with-reference-synthetic-http',fixtureId:fixture.fixtureId,started,phase,run:started?snapshot(run.id):null,activity:activityStore.snapshot(),dashboard:dashboardCreated?{status:jobStatus,design:copy(selectedDesign)}:null,subscribers:{run:runListeners.size,activity:activityListeners.size},requests:copy(requests),controls:copy(controls),providerCalls:{gemini:0,e2b:0},browserExecuted:false};},
  };
}

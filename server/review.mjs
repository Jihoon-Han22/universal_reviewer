import { randomUUID } from 'node:crypto';
import { validateCriteria, approveCriteria, normalizeItems, reviewRowCoverage, safeEvidence } from './algorithms.mjs';
import { sanitizeDocumentActivity } from '../integrations/src/activity.mjs';

export const OPEN_STATUSES = new Set(['running','awaiting_confirmation','awaiting_documents']);
const RESOLVABLE = new Set(['completed','partial','failed']);
export const SAFE_MESSAGE = '문서 처리 중 오류가 발생했습니다. 파일 형식과 내용을 확인한 뒤 다시 시도해 주세요.';
const SAFE_ERRORS = new Set(['ReviewError','IntegrationError','DocumentError','ExtractionError','SandboxDocumentError','CriteriaError','CriteriaRevisionError','CriteriaDiscoveryError','DocumentQualityError','VisualTranscriptionError','FieldExtractionError','AlgorithmError']);
export class ReviewError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'ReviewError'; this.status = status; }
}
export function safeMessage(error) { return SAFE_ERRORS.has(error?.name) ? error.message : SAFE_MESSAGE; }
const clone = value => structuredClone(value);
const now = () => new Date().toISOString();
export function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
export function summaryOf(run) {
  const items = run.items ?? [], documents = run.documents ?? [];
  return { total: items.length, pass: items.filter(i => i.status === 'pass').length, fail: items.filter(i => i.status === 'fail').length, review: items.filter(i => i.status === 'review').length, documents: documents.length, completedDocuments: documents.filter(d => d.status === 'completed').length, failedDocuments: documents.filter(d => d.status === 'failed').length, incompleteDocuments: documents.filter(d => d.status === 'partial').length, unreviewedRows: documents.reduce((n, d) => n + (d.missingRows?.length ?? 0), 0), humanReviewed: items.filter(i => i.reviewedByHuman).length };
}
function idsValid(ids, max, min = 0) { return Array.isArray(ids) && ids.length >= min && ids.length <= max && ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 100) && new Set(ids).size === ids.length; }
function groupsOf(criteria, documents) {
  const groups = new Map();
  for (const criterion of criteria) {
    const id = criterion.sourceDocumentId ?? 'unassigned';
    if (!groups.has(id)) groups.set(id, { id, label: documents.find(d => d.id === id)?.name ?? (id === 'natural-language' ? '직접 입력한 기준' : '출처 확인 필요'), ...(id !== 'natural-language' && id !== 'unassigned' ? { documentId: id } : {}), criteriaIds: [] });
    groups.get(id).criteriaIds.push(criterion.id);
  }
  return [...groups.values()];
}
async function workers(values, work, signal) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, values.length) }, async () => { while (next < values.length && !signal?.aborted) { const i = next++; await work(values[i], i); } }));
}
function waitForAnalysis(promise, signal) {
  if (!signal) return promise;
  const aborted = () => signal.reason ?? new DOMException('Aborted','AbortError');
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise((resolve,reject) => {
    const cleanup = () => signal.removeEventListener('abort',onAbort);
    const onAbort = () => { cleanup(); reject(aborted()); };
    signal.addEventListener('abort',onAbort,{once:true});
    promise.then(value => { cleanup(); resolve(value); },error => { cleanup(); reject(error); });
  });
}
function sourceCriteria(criteria, documents, text) {
  const known = new Set(documents.map(d => d.id));
  return criteria.map(item => {
    const c = clone(item);
    const evidenceIds = new Set([...(Array.isArray(c.sourceEvidence) ? c.sourceEvidence : c.sourceEvidence ? [c.sourceEvidence] : []), ...(c.evidenceCells ?? [])].map(e => e.documentId).filter(id => known.has(id)));
    if (evidenceIds.size > 1) { c.sourceDocumentId = 'unassigned'; c.needsConfirmation = true; }
    else if (!c.sourceDocumentId) c.sourceDocumentId = evidenceIds.size === 1 ? [...evidenceIds][0] : documents.length === 1 && !text.trim() ? documents[0].id : documents.length === 0 && text.trim() ? 'natural-language' : 'unassigned';
    if (!known.has(c.sourceDocumentId) && !['natural-language','unassigned'].includes(c.sourceDocumentId)) { c.sourceDocumentId = 'unassigned'; c.needsConfirmation = true; }
    if (known.has(c.sourceDocumentId)) c.sourceName = documents.find(d => d.id === c.sourceDocumentId).name;
    return c;
  });
}
// Only provenance retained by the current criterion normalizer participates.
// General quote/location validation remains the existing permissive contract.
function referencesExcludedSource(criterion, excluded) {
  return excluded.has(criterion.sourceDocumentId) || [
    ...safeEvidence(criterion.sourceEvidence ?? criterion.evidenceCells),
    ...safeEvidence(criterion.hierarchyEvidence, 24),
  ].some(evidence => excluded.has(evidence.documentId));
}
export class ReviewEngine {
  constructor({ documents, analyzer, config = {}, geminiConfigured, gemini, deferJobs = false } = {}) {
    this.documents = documents; this.analyzer = analyzer; this.config = config; this.geminiConfigured = geminiConfigured ?? Boolean(config.geminiApiKey || gemini); this.runs = new Map();
    this.deferJobs = deferJobs;
    this.modelActive = 0; this.modelWaiting = [];
  }
  scheduleJob(run, kind, details = {}) {
    run.pendingJob = { id:randomUUID(), kind, state:'queued', ...clone(details) };
    if (!this.deferJobs) this.executePendingJob(run);
  }
  executePendingJob(value, { beforeExecute } = {}) {
    const run = this.get(value), pending = run.pendingJob;
    if (run.executingJobId === pending?.id && run.job) return run.job;
    if (!pending || run.status !== 'running' || run.controller.signal.aborted) return Promise.resolve();
    // An executing descriptor restored in another request cannot be replayed:
    // its provider call may already have completed before the connection ended.
    if (pending.state !== 'queued') {
      this.failRun(run,new ReviewError('작업 연결이 중단되었습니다. 저장된 진행 내용을 확인한 뒤 검토를 다시 시작해 주세요.'));
      delete run.pendingJob;
      return Promise.resolve();
    }
    pending.state = 'executing'; run.executingJobId = pending.id;
    const execute = () => {
      run.controller.signal.throwIfAborted();
      if (pending.kind === 'prepare') return this.prepare(run);
      if (pending.kind === 'review') return this.reviewTargets(run);
      if (pending.kind === 'targets') return this.analyzeInputs(run,pending.documentIds).then(() => this.reviewTargets(run));
      if (pending.kind === 'revise') return this.revisePending(run,pending);
      throw new ReviewError('저장된 검토 작업을 확인할 수 없습니다. 검토를 다시 시작해 주세요.');
    };
    run.job = Promise.resolve().then(() => beforeExecute ? Promise.resolve(beforeExecute(run)).then(execute) : execute())
      .catch(error => this.failRun(run,error)).finally(() => {
        if (run.pendingJob?.id === pending.id) delete run.pendingJob;
        if (run.executingJobId === pending.id) delete run.executingJobId;
      });
    return run.job;
  }
  queueModel(work, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason ?? new DOMException('Aborted','AbortError')); return; }
      const entry = { work, signal, resolve, reject };
      entry.abort = () => { const i = this.modelWaiting.indexOf(entry); if (i >= 0) { this.modelWaiting.splice(i,1); reject(signal.reason ?? new DOMException('Aborted','AbortError')); } };
      signal?.addEventListener('abort', entry.abort, { once: true }); this.modelWaiting.push(entry); this.drainModels();
    });
  }
  drainModels() {
    while (this.modelActive < 2 && this.modelWaiting.length) {
      const entry = this.modelWaiting.shift(); entry.signal?.removeEventListener('abort', entry.abort); this.modelActive++;
      Promise.resolve().then(() => { entry.signal?.throwIfAborted(); return entry.work(); }).then(entry.resolve, entry.reject).finally(() => { this.modelActive--; this.drainModels(); });
    }
  }
  get(id) { if (id && typeof id === 'object') return id; const run = this.runs.get(id); if (!run) throw new ReviewError('검토 기록이 없습니다. 서버를 재시작했다면 다시 실행해 주세요.',404); return run; }
  summary(run) { return summaryOf(this.get(run)); }
  snapshot(value) {
    const r = this.get(value);
    const fields = ['id','mode','status','stage','createdAt','criterionVersion','criteriaRevision','criteria','items','documents','criteriaDocuments','excludedCriteriaDocuments','criteriaDocumentAssessments','criteriaGroups','criteriaFeedback','approvedCriteria','events','analyses','analysisActivity','criteriaDiscovery','criteriaSources','audit','error','revisionError'];
    return clone({ ...Object.fromEntries(fields.filter(k => r[k] !== undefined).map(k => [k,r[k]])), summary: summaryOf(r) });
  }
  emit(run, type, payload = {}) {
    if (run.status === 'cancelled' && type !== 'run.cancelled') return;
    const event = clone({ type, runId: run.id, sequence: run.events.length + 1, timestamp: now(), mode: run.mode, status: run.status, stage: run.stage, criterionVersion: run.criterionVersion, ...(type.startsWith('criteria.') ? { excludedCriteriaDocuments: run.excludedCriteriaDocuments, criteriaDocumentAssessments: run.criteriaDocumentAssessments } : {}), ...payload, runStatus: run.status });
    run.events.push(event);
    for (const listener of run.listeners) { try { listener(event); } catch {} }
    return event;
  }
  subscribe(value, listener) { const run = this.get(value); run.listeners.add(listener); return () => run.listeners.delete(listener); }
  usedDocument(id) { return [...this.runs.values()].some(r => [...r.documentIds, ...r.criteriaDocumentIds, ...r.analysisDocumentIds].includes(id)); }
  assertVersion(run, value) {
    if (run.mode === 'criteria_first' && !Number.isInteger(value)) throw new ReviewError('현재 기준 버전을 함께 보내 주세요.');
    if (value !== undefined && !Number.isInteger(value)) throw new ReviewError('현재 기준 버전을 함께 보내 주세요.');
    if (value !== undefined && value !== run.criterionVersion) throw new ReviewError('기준이 변경되었습니다. 최신 기준을 확인한 뒤 다시 시도해 주세요.',409);
  }
  documentsFor(ids, role) { return ids.map(id => { const doc = this.documents.get(id); if (role && doc.role !== role) throw new ReviewError('문서 역할과 입력 목록을 확인해 주세요.'); return doc; }); }
  start(request) {
    // Destructuring undefined intentionally preserves the original empty-body 500 path.
    const { mode = 'legacy', documentIds = [], criteriaDocumentIds = [], analysisDocumentIds = [], criteriaText = '' } = request;
    if (!['legacy','criteria_first'].includes(mode) || !idsValid(documentIds,10,mode === 'legacy' ? 1 : 0) || !idsValid(criteriaDocumentIds,10) || !idsValid(analysisDocumentIds,30) || (mode === 'criteria_first' && documentIds.length) || typeof criteriaText !== 'string' || criteriaText.length > 12000 || (!criteriaDocumentIds.length && !criteriaText.trim())) throw new ReviewError('문서와 기준 입력을 확인해 주세요. 문서는 각각 최대 10개입니다.');
    const targets = this.documentsFor(documentIds,'target'), sources = this.documentsFor(criteriaDocumentIds,'criteria'); this.documentsFor(analysisDocumentIds);
    if (mode === 'criteria_first' && analysisDocumentIds.some(id => !criteriaDocumentIds.includes(id))) throw new ReviewError('기준 분석에는 선택한 기준 문서만 포함할 수 있습니다.',409);
    if ([...this.runs.values()].filter(r => OPEN_STATUSES.has(r.status)).length >= 3) throw new ReviewError('동시 검토 한도에 도달했습니다. 진행 중인 검토가 끝난 뒤 다시 시도해 주세요.',429);
    if (!this.geminiConfigured) throw new ReviewError('Gemini API 키를 설정한 뒤 다시 시도해 주세요.',503);
    const run = { id: randomUUID(), mode, status:'running', stage:'analyzing', createdAt:now(), criterionVersion:1, criteriaRevision:0, documentIds:[...documentIds], criteriaDocumentIds:[...criteriaDocumentIds], analysisDocumentIds:[...new Set([...criteriaDocumentIds,...documentIds,...analysisDocumentIds])], criteriaText, criteria:[], items:[], documents:targets.map(d => ({...this.documents.public(d),status:'queued'})), criteriaDocuments:sources.map(d => this.documents.public(d)), excludedCriteriaDocuments:[], criteriaDocumentAssessments:[], criteriaGroups:[], criteriaFeedback:[], approvedCriteria:null, events:[], analyses:[], analysisActivity:[], criteriaDiscovery:[], criteriaSources:[], audit:[], controller:new AbortController(), listeners:new Set(), analyzedDocuments:new Map(), revisionToken:0 };
    this.runs.set(run.id,run);
    for (const [id, old] of this.runs) if (this.runs.size > 40 && !OPEN_STATUSES.has(old.status)) this.runs.delete(id);
    this.emit(run,'run.started',{documents:run.documents});
    this.scheduleJob(run,'prepare');
    return run;
  }
  options(run, document, type = 'document.analysis.progress') {
    return { signal:run.controller.signal, runId:run.id, contextId:run.id, report:activity => {
      if (run.status === 'cancelled') return;
      const secrets = [this.config.geminiApiKey,this.config.e2bApiKey].filter(Boolean);
      const record = { id:activity.id ?? randomUUID(), time:activity.time ?? now(), step:sanitizeDocumentActivity(activity.step ?? activity.phase ?? 'work',{secrets,maxLength:50}), title:sanitizeDocumentActivity(activity.title ?? '',{secrets}), status:activity.status ?? 'info', ...Object.fromEntries(['attempt','maxAttempts','roundStatus','issueCount'].filter(key => activity[key] !== undefined).map(key => [key,activity[key]])), ...(activity.detail !== undefined ? {detail:sanitizeDocumentActivity(activity.detail,{secrets})} : {}), ...(activity.output !== undefined ? {output:sanitizeDocumentActivity(activity.output,{secrets})} : {}), ...(document || activity.documentId ? {documentId:document?.id ?? activity.documentId} : {}) };
      const existing = run.analysisActivity.findIndex(a => a.id === record.id);
      if (existing >= 0) run.analysisActivity[existing] = {...run.analysisActivity[existing],...record}; else run.analysisActivity.push(record);
      this.emit(run,type,{ ...(document ? {documentId:document.id} : activity.documentId ? {documentId:activity.documentId} : {}), activity:record });
    } };
  }
  async analyzeOne(document, options) {
    const { sandboxAnalysisResult, analysisPromise, previousAnalysis, ...input } = document;
    const result = await this.analyzer.analyze(input,options);
    options.signal?.throwIfAborted();
    const { analysisPromise: ignored, sandboxAnalysisResult: cache, previousAnalysis: previous, ...clean } = result;
    document.sandboxAnalysisResult = clean;
    return clean;
  }
  async ensureAnalyzed(value, options = {}) {
    const document = typeof value === 'string' ? this.documents.get(value) : value;
    if (document.sandboxAnalysisResult) return document.sandboxAnalysisResult.analysis;
    if (document.analysisPromise) return waitForAnalysis(document.analysisPromise,options.signal);
    const promise = this.analyzeOne(document,options).then(analyzed => analyzed.analysis); document.analysisPromise = promise;
    try { return await promise; } finally { if (document.analysisPromise === promise) delete document.analysisPromise; }
  }
  async analyzeInputs(run, ids) {
    let criteriaFailure;
    await workers([...new Set(ids)].map(id => this.documents.get(id)), async document => {
      const state = run.documents.find(d => d.id === document.id);
      this.emit(run,'document.analysis.started',{documentId:document.id,name:document.name,role:document.role});
      try {
        const analyzed = document.sandboxAnalysisResult ?? await this.analyzeOne(document,this.options(run,document));
        if (run.controller.signal.aborted) return;
        run.analyzedDocuments.set(document.id,analyzed);
        const analysis = {...analyzed.analysis,documentId:document.id,name:document.name,role:document.role};
        const i = run.analyses.findIndex(a => a.documentId === document.id); if (i >= 0) run.analyses[i] = analysis; else run.analyses.push(analysis);
        if (state) state.analysis = clone(analysis);
        this.emit(run,'document.analysis.completed',{documentId:document.id,analysis});
      } catch (error) {
        if (run.controller.signal.aborted) return;
        const message = safeMessage(error), analysis = {documentId:document.id,name:document.name,role:document.role,status:'failed',summary:message,warnings:[message],needsConfirmation:true,coverage:{complete:false,readerComplete:false,contextComplete:false}};
        run.analyses.push(analysis); if (state) { state.status = 'failed'; state.error = message; state.analysis = clone(analysis); }
        if (document.role === 'criteria') criteriaFailure = error;
        this.emit(run,'document.analysis.failed',{documentId:document.id,analysis,message});
      }
    },run.controller.signal);
    run.controller.signal.throwIfAborted(); if (criteriaFailure) throw criteriaFailure;
  }
  async prepare(run) {
    await this.analyzeInputs(run,run.analysisDocumentIds);
    run.controller.signal.throwIfAborted(); run.stage = 'criteria'; this.emit(run,'criteria.started');
    const sources = run.criteriaDocumentIds.map(id => run.analyzedDocuments.get(id)).filter(Boolean);
    const result = await this.analyzer.discoverCriteria(sources,run.criteriaText,this.options(run,null,'criteria.discovery.progress'));
    run.controller.signal.throwIfAborted();
    run.criteriaDocumentAssessments = clone(result.criteriaDocumentAssessments ?? result.criteriaAssessments ?? []);
    run.excludedCriteriaDocuments = run.criteriaDocumentAssessments.filter(a => a.status === 'not_criteria').map(a => ({documentId:a.documentId,name:a.name ?? this.documents.get(a.documentId).name,reason:a.reason}));
    for (const assessment of run.criteriaDocumentAssessments) this.emit(run,'criteria.document.assessed',{documentId:assessment.documentId,assessment});
    run.criteriaDiscovery = Array.isArray(result.criteriaDiscovery) ? clone(result.criteriaDiscovery) : Object.entries(result.criteriaDiscovery ?? {}).map(([documentId,coverage]) => ({documentId,coverage}));
    const excluded = new Set(run.excludedCriteriaDocuments.map(d => d.documentId));
    const candidates = validateCriteria((result.criteria ?? []).filter(c => !excluded.has(c.sourceDocumentId)),{allowEmpty:true}).filter(c => !referencesExcludedSource(c,excluded));
    run.criteria = sourceCriteria(candidates,sources.filter(d => !excluded.has(d.id)),run.criteriaText);
    run.criteriaGroups = groupsOf(run.criteria,run.criteriaDocuments);
    run.criteriaSources = clone(result.criteriaSources ?? sources.filter(d => !excluded.has(d.id)).map(d => ({documentId:d.id,name:d.name})));
    this.emit(run,'criteria.ready',{criteria:run.criteria,criteriaGroups:run.criteriaGroups,criteriaDocuments:run.criteriaDocuments});
    run.status = 'awaiting_confirmation'; run.stage = 'criteria_confirmation';
    this.confirmationEvent(run);
  }
  confirmationEvent(run) { this.emit(run,'criteria.confirmation_required',{criteria:run.criteria,criteriaGroups:run.criteriaGroups,criteriaSources:run.criteriaSources,criteriaDiscovery:run.criteriaDiscovery,analyses:run.analyses}); }
  validateSources(run, criteria) { const excluded = new Set(run.excludedCriteriaDocuments.map(d => d.documentId)); if (criteria.some(c => referencesExcludedSource(c,excluded))) throw new ReviewError('검토 기준에서 제외된 문서는 기준 출처로 사용할 수 없습니다.'); }
  confirm(value, request = {}) {
    const run = this.get(value);
    if (run.status !== 'awaiting_confirmation') throw new ReviewError('기준 확인을 기다리는 검토에서만 승인할 수 있습니다.',409);
    this.assertVersion(run,request.expectedCriterionVersion);
    this.validateSources(run,run.criteria);
    const proposedCriteria = clone(run.criteria);
    const criteria = approveCriteria(run.criteria,request.criteria ?? run.criteria,{allowedSourceDocumentIds:run.criteriaDocumentIds.filter(id => !run.excludedCriteriaDocuments.some(d => d.documentId === id))});
    if (!criteria.length) throw new ReviewError('적용할 기준을 하나 이상 선택해 주세요.');
    this.validateSources(run,criteria);
    if (request.criteria !== undefined) run.criterionVersion++;
    run.criteria = criteria; run.criteriaGroups = groupsOf(criteria,run.criteriaDocuments);
    run.approvedCriteria = deepFreeze({criteria:clone(criteria),criterionVersion:run.criterionVersion,approvedAt:now()});
    run.audit.push({action:'criteria.confirmed',timestamp:now(),proposedCriteria,criteria:clone(criteria)});
    this.emit(run,'criteria.confirmed',{criteria:run.criteria,criteriaGroups:run.criteriaGroups,approvedCriteria:run.approvedCriteria});
    if (run.mode === 'criteria_first') { run.status = 'awaiting_documents'; run.stage = 'awaiting_documents'; this.emit(run,'run.awaiting_documents',{criteria:run.criteria,criteriaGroups:run.criteriaGroups,approvedCriteria:run.approvedCriteria}); }
    else { run.status = 'running'; run.resume?.(); this.scheduleJob(run,'review'); }
    return this.snapshot(run);
  }
  revise(value, request = {}) {
    const run = this.get(value);
    if (run.mode !== 'criteria_first' || run.status !== 'awaiting_confirmation') throw new ReviewError('기준 확인 단계에서만 수정 요청을 보낼 수 있습니다.',409);
    this.assertVersion(run,request.expectedCriterionVersion);
    if (typeof request.feedback !== 'string' || !request.feedback.trim() || request.feedback.length > 12000 || (request.scope !== undefined && (typeof request.scope !== 'string' || request.scope.length > 1000))) throw new ReviewError('기준 수정 요청을 확인해 주세요.');
    if (request.documentId !== undefined && !['natural-language','unassigned',...run.criteriaDocumentIds.filter(id => !run.excludedCriteriaDocuments.some(d => d.documentId === id))].includes(request.documentId)) throw new ReviewError('수정할 기준 출처를 확인해 주세요.');
    if (run.criteriaFeedback.length >= 20) throw new ReviewError('기준 수정 요청은 최대 20회까지 가능합니다.');
    const draft = request.criteria === undefined ? clone(run.criteria) : approveCriteria(run.criteria,request.criteria,{draft:true,allowedSourceDocumentIds:run.criteriaDocumentIds.filter(id => !run.excludedCriteriaDocuments.some(d => d.documentId === id))}); this.validateSources(run,draft);
    const entry = {id:randomUUID(),feedback:request.feedback.trim(),...(request.documentId !== undefined ? {documentId:request.documentId} : {}),...(request.scope !== undefined ? {scope:request.scope} : {}),status:'running',createdAt:now(),fromVersion:run.criterionVersion};
    run.criteriaFeedback.push(entry); delete run.revisionError; run.status = 'running'; run.stage = 'criteria_revising';
    const token = ++run.revisionToken;
    this.emit(run,'criteria.revision.started',{criteriaRevision:run.criteriaRevision,criteriaFeedback:run.criteriaFeedback});
    this.scheduleJob(run,'revise',{ draft, entryId:entry.id, token, ...(request.documentId !== undefined ? { documentId:request.documentId } : {}), ...(request.scope !== undefined ? { scope:request.scope } : {}) });
    return this.snapshot(run);
  }
  async revisePending(run, { draft, entryId, token, documentId, scope }) {
    const entry = run.criteriaFeedback.find(feedback => feedback.id === entryId);
    if (!entry) throw new ReviewError('저장된 기준 수정 요청을 확인할 수 없습니다.');
      try {
        const result = await this.analyzer.reviseCriteria(draft,entry.feedback,{...this.options(run,null,'criteria.discovery.progress'),documents:run.criteriaDocumentIds.map(id => run.analyzedDocuments.get(id)).filter(Boolean),criteriaText:run.criteriaText,documentId,scope});
        if (run.controller.signal.aborted || token !== run.revisionToken) return;
        const criteria = validateCriteria(result.criteria,{allowEmpty:true}); this.validateSources(run,criteria);
        run.criteria = criteria; run.criterionVersion++; run.criteriaRevision++; run.criteriaGroups = groupsOf(criteria,run.criteriaDocuments);
        Object.assign(entry,{status:'completed',completedAt:now(),toVersion:run.criterionVersion,...(result.summary ? {summary:result.summary} : {}),...(result.warnings ? {warnings:result.warnings} : {})});
        run.audit.push({action:'criteria.revised',timestamp:now(),feedback:entry.feedback,...(entry.documentId ? {documentId:entry.documentId} : {}),...(entry.scope ? {scope:entry.scope} : {}),fromVersion:entry.fromVersion,toVersion:run.criterionVersion,priorDraft:clone(draft),criteria:clone(criteria)});
        run.status = 'awaiting_confirmation'; run.stage = 'criteria_confirmation';
        this.emit(run,'criteria.revision.completed',{criteria:run.criteria,criteriaGroups:run.criteriaGroups,criteriaRevision:run.criteriaRevision,criteriaFeedback:run.criteriaFeedback}); this.confirmationEvent(run);
      } catch (error) {
        if (run.controller.signal.aborted || token !== run.revisionToken) return;
        const message = safeMessage(error); Object.assign(entry,{status:'failed',completedAt:now(),message}); run.revisionError = message; run.status = 'awaiting_confirmation'; run.stage = 'criteria_confirmation';
        this.emit(run,'criteria.revision.failed',{message,revisionError:message,criteria:run.criteria,criteriaGroups:run.criteriaGroups,criteriaFeedback:run.criteriaFeedback}); this.confirmationEvent(run);
      }
  }
  attachDocuments(value, request = {}) {
    const run = this.get(value);
    if (run.mode !== 'criteria_first' || run.status !== 'awaiting_documents' || !run.approvedCriteria) throw new ReviewError('기준을 먼저 승인한 뒤 검토 대상을 추가해 주세요.',409);
    this.assertVersion(run,request.expectedCriterionVersion);
    const {documentIds,analysisDocumentIds=[]} = request;
    if (!idsValid(documentIds,10,1) || !idsValid(analysisDocumentIds,20)) throw new ReviewError('검토 문서는 1개 이상, 최대 10개까지 선택해 주세요.');
    const targets = this.documentsFor(documentIds,'target');
    const extras = this.documentsFor(analysisDocumentIds);
    if (extras.some(d => !documentIds.includes(d.id) && d.role !== 'ledger')) throw new ReviewError('추가 분석에는 선택한 검토 문서나 대장만 포함할 수 있습니다.');
    run.criteria = clone(run.approvedCriteria.criteria); run.criterionVersion = run.approvedCriteria.criterionVersion;
    run.documentIds = [...documentIds]; run.documents = targets.map(d => ({...this.documents.public(d),status:'queued'}));
    const ids = [...new Set([...documentIds,...analysisDocumentIds])]; run.analysisDocumentIds = [...new Set([...run.analysisDocumentIds,...ids])];
    run.status = 'running'; run.stage = 'analyzing_targets'; this.emit(run,'documents.attached',{documents:run.documents,approvedCriteria:run.approvedCriteria});
    this.scheduleJob(run,'targets',{documentIds:ids});
    return this.snapshot(run);
  }
  async reviewTargets(run) {
    run.controller.signal.throwIfAborted();
    const targets = run.documentIds.map(id => run.analyzedDocuments.get(id)).filter(Boolean);
    await workers(targets,async document => {
      const state = run.documents.find(d => d.id === document.id);
      if (!state || state.status === 'failed') return;
      state.status = 'processing'; run.stage = 'extracting'; this.emit(run,'document.started',{documentId:document.id});
      try {
        let fieldsEmitted = false, reviewStarted = false;
        const onExtraction = extraction => { if (run.controller.signal.aborted) return; fieldsEmitted = true; document.extraction = clone(extraction); state.extraction = clone(extraction); this.emit(run,'document.extracted',{documentId:document.id,phase:'fields',fields:extraction.fields,referenceNumber:extraction.referenceNumber,extraction,items:[]}); };
        const onReview = () => { if (run.controller.signal.aborted || reviewStarted) return; reviewStarted = true; run.stage = 'reviewing'; this.emit(run,'document.reviewing',{documentId:document.id}); };
        const result = await this.analyzer.extractTarget(document,run.criteria,{...this.options(run,document),onExtraction,onReview});
        run.controller.signal.throwIfAborted(); if (result.extraction && !fieldsEmitted) onExtraction(result.extraction); if (!reviewStarted) onReview();
        const data = result.data ?? result;
        const items = normalizeItems(data.items,document,run.criteria,{reviewCoverage:data.reviewCoverage,excludedRows:data.excludedRows});
        const rowCoverage = reviewRowCoverage(document,items,data.excludedRows ?? []);
        const missingRows = rowCoverage.missingRows ?? [];
        state.missingRows = clone(missingRows);
        const pending = items.map(item => ({...item,status:'pending'})); run.items.push(...pending);
        this.emit(run,'document.extracted',{documentId:document.id,phase:'review',items:pending,...(state.extraction ? {extraction:state.extraction,fields:state.extraction.fields,referenceNumber:state.extraction.referenceNumber} : {})});
        for (const item of items) { if (run.controller.signal.aborted) return; const index = run.items.findIndex(i => i.id === item.id); run.items[index] = item; this.emit(run,'item.decided',{item}); }
        const outputLimited = items.length >= 250 || data.reviewCoverage?.complete === false;
        if (outputLimited) { state.reviewCoverage = {complete:false,itemLimit:250,remainingWork:data.reviewCoverage?.remainingWork ?? []}; state.error = '검토 항목 한도(250개)에 도달했거나 검토하지 못한 항목이 있습니다.'; this.emit(run,'document.incomplete',{documentId:document.id,message:state.error,reviewCoverage:state.reviewCoverage}); }
        if (document.analysis?.coverage?.complete === false) state.error = document.analysis.coverage.readerComplete === true ? '원문 읽기 완료 · 해석 확인 필요. 문서 이해에서 남은 확인 사항을 살펴보세요.' : '문서의 일부 범위를 읽지 못했습니다. 문서 이해에서 미확인 범위를 살펴보세요.';
        if (missingRows.length) { state.error = `검토되지 않은 원문 행 ${missingRows.length}개가 있습니다: ${missingRows.map(row => typeof row === 'object' ? `${row.sheet ? `${row.sheet}!` : ''}${row.row}` : row).join(', ')}`; this.emit(run,'document.incomplete',{documentId:document.id,message:state.error,missingRows}); }
        state.status = missingRows.length || document.analysis?.coverage?.complete === false || outputLimited ? 'partial' : 'completed';
        this.emit(run,'document.completed',{documentId:document.id,itemCount:items.length,status:state.status});
      } catch (error) { if (run.controller.signal.aborted) return; state.status = 'failed'; state.error = safeMessage(error); this.emit(run,'document.failed',{documentId:document.id,message:state.error}); }
    },run.controller.signal);
    run.controller.signal.throwIfAborted();
    const failures = run.documents.filter(d => d.status === 'failed').length;
    const incompleteCriteria = run.criteriaDiscovery.some(report => report.coverage?.inventoryComplete === false || report.coverage?.allSheetsInventoried === false || report.coverage?.unresolvedRanges?.length || report.coverage?.remainingRanges?.length || report.coverage?.imagesNotRead > 0 || report.coverage?.criteriaLimitReached || report.coverage?.droppedCriteria > 0 || report.coverage?.classificationLimitReached || report.coverage?.droppedHierarchyLevels > 0);
    run.status = failures === run.documents.length ? 'failed' : failures || run.documents.some(d => d.status === 'partial') || run.analyses.some(a => a.status !== 'complete') || incompleteCriteria ? 'partial' : 'completed'; run.stage = 'complete';
    if (run.status === 'failed') { run.error = '검토할 문서를 처리하지 못했습니다. 파일과 분석 오류를 확인해 주세요.'; this.emit(run,'run.failed',{message:run.error,summary:summaryOf(run)}); }
    else this.emit(run,'run.completed',{summary:summaryOf(run),status:run.status});
  }
  failRun(run,error) { if (run.status === 'cancelled' || run.controller.signal.aborted) return; run.status = 'failed'; run.stage = 'failed'; run.error = safeMessage(error); this.emit(run,'run.failed',{message:run.error}); }
  cancel(value) { const run = this.get(value); if (!OPEN_STATUSES.has(run.status)) return this.snapshot(run); run.status = 'cancelled'; run.stage = 'cancelled'; run.controller.abort(); run.resume?.(); run.revisionToken++; for (const f of run.criteriaFeedback) if (f.status === 'running') { f.status = 'cancelled'; f.completedAt = now(); } for (const d of run.documents) if (['queued','processing'].includes(d.status)) d.status = 'cancelled'; this.emit(run,'run.cancelled'); return this.snapshot(run); }
  resolve(value,itemId,request = {}) { const run = this.get(value); if (!RESOLVABLE.has(run.status)) throw new ReviewError('완료된 검토 결과에서만 판정을 수정할 수 있습니다.',409); const item = run.items.find(i => i.id === itemId); if (!item) throw new ReviewError('검토 항목을 찾을 수 없습니다.',404); if (!['pass','fail','review'].includes(request.status)) throw new ReviewError('판정 값을 확인해 주세요.'); if (typeof request.note !== 'string' || !request.note.trim() || request.note.length > 2000) throw new ReviewError('변경 사유를 입력해 주세요.'); const before = item.status; item.machineStatus ??= before; item.status = request.status; item.humanNote = request.note.trim(); item.reviewedByHuman = true; run.audit.push({action:'item.resolved',timestamp:now(),itemId,before,after:item.status,note:item.humanNote}); const summary = summaryOf(run); this.emit(run,'item.resolved',{item,summary}); return clone({item,summary}); }
}

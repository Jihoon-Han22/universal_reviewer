// Billable deployment smoke test. Run intentionally; it uses the deployed API's
// existing provider budget guard and never changes budgets, secrets, or models.
// Supply exactly one stdin JSON line: {"base":"https://site.example","token":"..."}.
// Credentials stay in memory. Do not put them in arguments, environment or files.
import { createInterface } from 'node:readline';
import JSZip from 'jszip';

const MAX_DURATION_MS = 10 * 60 * 1000;
const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled']);
const CRITERIA = '검토 기준은 하나입니다: 압축강도는 30 MPa 이상이어야 합니다. 압축강도만 검토하세요.';
const TARGET = '합성 배포 검증용 시험성적서\n시험번호: SITES-SMOKE-001\n시험 항목: 압축강도\n시험 결과: 31 MPa\n';
const write = value => process.stdout.write(`${JSON.stringify(value)}\n`);
class SmokeError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const check = (condition, code = 'CHECK_FAILED') => { if (!condition) throw new SmokeError(code); };

async function readCredentials() {
  const input = createInterface({ input: process.stdin, terminal: false });
  try {
    const config = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new SmokeError('INPUT_TIMEOUT')), 30000);
      const finish = callback => value => { clearTimeout(timer); callback(value); };
      input.once('line', finish(line => {
        try { check(line.length < 12000, 'INPUT_INVALID'); resolve(JSON.parse(line)); }
        catch { reject(new SmokeError('INPUT_INVALID')); }
      }));
      input.once('close', finish(() => reject(new SmokeError('INPUT_MISSING'))));
      input.once('error', finish(() => reject(new SmokeError('INPUT_INVALID'))));
    });
    check(config && typeof config.base === 'string' && typeof config.token === 'string', 'INPUT_INVALID');
    const url = new URL(config.base);
    check(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'INPUT_INVALID');
    check(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'INPUT_INVALID');
    check(config.token.length > 0 && config.token.length <= 8192 && !/[\r\n]/.test(config.token), 'INPUT_INVALID');
    return { base: url.origin, token: config.token };
  } catch { throw new SmokeError('INPUT_INVALID'); }
  finally { input.close(); process.stdin.pause(); }
}

async function main() {
  const { base, token } = await readCredentials();
  const started = Date.now(), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new SmokeError('TIMEOUT')), MAX_DURATION_MS);
  const interrupt = () => controller.abort(new SmokeError('INTERRUPTED'));
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  const cookies = new Map(), documents = [];
  const cleanup = { cancelledRuns: 0, deletedDashboards: 0, deletedOrphans: 0, retainedEvidence: 0, failures: 0 };
  const counts = { criteria: 0, documents: 0, items: 0, pass: 0, fail: 0, review: 0, streamEvents: 0, jsonBytes: 0, xlsxBytes: 0, dashboardBytes: 0 };
  let stage = 'health', runId, dashboardId, terminalRun = false, lastSequence = 0, failure, dashboardStatus = 'not_started';
  const progress = phase => { stage = phase; write({ phase, elapsedSeconds: Math.floor((Date.now() - started) / 1000) }); };
  const pathId = id => { check(typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id), 'RESPONSE_INVALID'); return encodeURIComponent(id); };

  async function request(path, { method = 'GET', body, signal = controller.signal, expected = 200, json = false } = {}) {
    check(path.startsWith('/api/') && !path.startsWith('//'), 'PATH_INVALID');
    signal.throwIfAborted();
    const headers = new Headers({ 'OAI-Sites-Authorization': `Bearer ${token}`, Origin: base });
    if (cookies.size) headers.set('Cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    if (json) headers.set('Content-Type', 'application/json');
    // No automatic redirects or POST retries: either could obscure a paid call.
    const response = await fetch(base + path, { method, headers, body: json ? JSON.stringify(body) : body, signal, redirect: 'manual' });
    for (const value of response.headers.getSetCookie()) {
      const first = value.split(';', 1)[0], equals = first.indexOf('=');
      if (equals > 0) cookies.set(first.slice(0, equals), first.slice(equals + 1));
    }
    if (!(Array.isArray(expected) ? expected : [expected]).includes(response.status)) {
      await response.body?.cancel();
      throw new SmokeError('HTTP_STATUS', response.status);
    }
    return response;
  }

  async function bytes(response, limit = 12 * 1024 * 1024) {
    check(response.body, 'RESPONSE_EMPTY');
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength; check(length <= limit, 'RESPONSE_TOO_LARGE'); chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks, length);
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
  }
  const getJson = async (path, options) => JSON.parse((await bytes(await request(path, options))).toString('utf8'));
  const post = (path, body, expected = 200) => getJson(path, { method: 'POST', body, json: true, expected });

  async function events(path) {
    const response = await request(path);
    check(response.headers.get('content-type')?.startsWith('text/event-stream'), 'SSE_CONTENT_TYPE');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = '', eventCount = 0, streamError = false, lastReport = Date.now();
    const frame = block => {
      let event = 'message'; const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (!data.length) return;
      if (event === 'error') { streamError = true; return; }
      const value = JSON.parse(data.join('\n'));
      if (Number.isSafeInteger(value.sequence) && value.sequence > lastSequence) lastSequence = value.sequence;
      eventCount++; counts.streamEvents++;
    };
    try {
      // Consume to EOF, even after the completion event. Closing early cancels
      // the owning Worker job before its final D1 checkpoint/lease release.
      for (;;) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
        check(pending.length <= 2 * 1024 * 1024, 'SSE_FRAME_TOO_LARGE');
        let boundary;
        while ((boundary = pending.indexOf('\n\n')) !== -1) { frame(pending.slice(0, boundary)); pending = pending.slice(boundary + 2); }
        if (Date.now() - lastReport >= 30000) { write({ phase: stage, events: eventCount, elapsedSeconds: Math.floor((Date.now() - started) / 1000) }); lastReport = Date.now(); }
        if (done) { if (pending.trim()) frame(pending); break; }
      }
      check(!streamError, 'SSE_JOB_ERROR');
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
  }

  async function runUntil(expected) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await events(`/api/runs/${pathId(runId)}/events?after=${lastSequence}`);
      const run = await getJson(`/api/runs/${pathId(runId)}`);
      terminalRun = TERMINAL.has(run.status);
      if (expected.includes(run.status)) return run;
      check(run.status === 'running', 'RUN_STATE_UNEXPECTED');
      // Reconnect only to the same persisted job; never create/revise/retry a run.
    }
    throw new SmokeError('RUN_DID_NOT_SETTLE');
  }

  try {
    progress('health');
    const health = await getJson('/api/health');
    check(health.runtime === 'sites' && health.geminiConfigured && health.e2bConfigured, 'PROVIDERS_UNAVAILABLE');
    progress('criteria_prepare');
    ({ runId } = await post('/api/runs', { mode: 'criteria_first', documentIds: [], criteriaDocumentIds: [], criteriaText: CRITERIA }, 202));
    let run = await runUntil(['awaiting_confirmation']);
    check(run.criteria?.length === 1, 'CRITERIA_COUNT_UNEXPECTED');
    const criterion = run.criteria[0], comparison = criterion.comparison;
    check(/압축|강도/.test(criterion.label) && comparison?.operator === 'gte' && comparison.value === 30 && String(comparison.unit).toLowerCase() === 'mpa', 'CRITERION_UNEXPECTED');
    counts.criteria = run.criteria.length;
    progress('criteria_confirm');
    run = await post(`/api/runs/${pathId(runId)}/criteria/confirm`, { criteria: run.criteria.map(item => ({ ...item, needsConfirmation: false, comparatorConfirmed: true })), expectedCriterionVersion: run.criterionVersion });
    check(run.status === 'awaiting_documents', 'CONFIRMATION_FAILED');
    progress('target_upload');
    const form = new FormData(); form.set('role', 'target'); form.append('files', new Blob([TARGET], { type: 'text/plain' }), 'sites-live-smoke.txt');
    const upload = await getJson('/api/documents', { method: 'POST', body: form, expected: 201 });
    check(upload.documents?.length === 1, 'UPLOAD_FAILED');
    documents.push(upload.documents[0]); counts.documents = documents.length;
    check(await (await request(documents[0].url)).text() === TARGET, 'ORIGINAL_MISMATCH');
    progress('target_review');
    await post(`/api/runs/${pathId(runId)}/documents`, { documentIds: documents.map(document => document.id), expectedCriterionVersion: run.criterionVersion }, 202);
    run = await runUntil(['completed', 'partial']);
    check(run.items?.length === 1 && run.items[0].status === 'pass', 'VERDICT_UNEXPECTED');
    check(run.analyses?.some(analysis => analysis.documentId === documents[0].id && analysis.coverage?.readerComplete === true), 'TRUSTED_READER_INCOMPLETE');
    counts.items = run.items.length;
    for (const status of ['pass', 'fail', 'review']) counts[status] = run.items.filter(item => item.status === status).length;
    progress('exports');
    const jsonBytes = await bytes(await request(`/api/runs/${pathId(runId)}/export?format=json`));
    const exported = JSON.parse(jsonBytes.toString('utf8'));
    check(exported.id === runId && exported.items?.length === counts.items && exported.items[0].status === 'pass', 'JSON_EXPORT_INVALID');
    counts.jsonBytes = jsonBytes.length;
    const xlsxBytes = await bytes(await request(`/api/runs/${pathId(runId)}/export?format=xlsx`), 8 * 1024 * 1024);
    const workbook = await JSZip.loadAsync(xlsxBytes);
    check(workbook.file('[Content_Types].xml') && workbook.file('xl/workbook.xml') && workbook.file('xl/worksheets/sheet1.xml'), 'XLSX_EXPORT_INVALID');
    check(/검토 결과/.test(await workbook.file('xl/workbook.xml').async('string')), 'XLSX_SHEET_INVALID');
    counts.xlsxBytes = xlsxBytes.length;
    if (Date.now() - started < MAX_DURATION_MS - 180000) {
      progress('dashboard');
      let job = await post('/api/dashboards', { runId, instruction: '압축강도 한 항목의 판정과 근거를 간단한 기본 화면으로 보여 주세요.' }, 202);
      dashboardId = job.id;
      check(job.eventsUrl === `/api/dashboards/${pathId(dashboardId)}/events`, 'DASHBOARD_EVENTS_INVALID');
      for (let attempt = 0; attempt < 3 && !['ready', 'failed'].includes(job.status); attempt++) {
        await events(job.eventsUrl || `/api/dashboards/${pathId(dashboardId)}/events`);
        job = await getJson(`/api/dashboards/${pathId(dashboardId)}`);
      }
      check(job.status === 'ready' && typeof job.html === 'string' && job.html.length > 1000, 'DASHBOARD_FAILED');
      check(job.html.includes('Content-Security-Policy') && job.html.includes('data-dashboard="kpis"') && job.sourceItems?.length === counts.items, 'DASHBOARD_HTML_INVALID');
      counts.dashboardBytes = Buffer.byteLength(job.html);
      dashboardStatus = job.presentation === 'generated' ? 'generated' : 'standard';
      // The fallback is usable but does not prove the live dashboard provider path.
      check(dashboardStatus === 'generated', 'DASHBOARD_FELL_BACK');
    } else dashboardStatus = 'skipped_time_limit';
    progress('verified');
  } catch (error) {
    failure = { phase: stage, code: controller.signal.aborted ? 'TIMEOUT_OR_INTERRUPTED' : error instanceof SmokeError ? error.code : 'UNEXPECTED_FAILURE', ...(error instanceof SmokeError && Number.isInteger(error.status) ? { status: error.status } : {}) };
  } finally {
    clearTimeout(timer); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    const cleanupSignal = AbortSignal.timeout(20000);
    // Active streams have closed before cancellation. Only this smoke's IDs are
    // touched; run-linked documents are protected by the API as audit evidence.
    if (runId && !terminalRun) {
      try { await (await request(`/api/runs/${pathId(runId)}/cancel`, { method: 'POST', body: {}, json: true, signal: cleanupSignal })).body?.cancel(); cleanup.cancelledRuns++; }
      catch { cleanup.failures++; }
    }
    if (dashboardId) {
      try { await request(`/api/dashboards/${pathId(dashboardId)}`, { method: 'DELETE', signal: cleanupSignal, expected: [204, 404] }); cleanup.deletedDashboards++; }
      catch { cleanup.failures++; }
    }
    for (const document of documents) {
      try {
        const response = await request(`/api/documents/${pathId(document.id)}`, { method: 'DELETE', signal: cleanupSignal, expected: [200, 404, 409] });
        if (response.status === 409) cleanup.retainedEvidence++; else cleanup.deletedOrphans++;
        await response.body?.cancel();
      } catch { cleanup.failures++; }
    }
  }
  write({ ok: !failure && cleanup.failures === 0, ...(failure ? { failure } : {}), counts, dashboard: dashboardStatus, cleanup, elapsedSeconds: Math.floor((Date.now() - started) / 1000) });
  if (failure || cleanup.failures) process.exitCode = 1;
}

main().catch(() => { write({ ok: false, failure: { phase: 'input', code: 'INPUT_INVALID' } }); process.exitCode = 1; });

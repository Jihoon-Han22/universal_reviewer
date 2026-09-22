import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { stripVTControlCharacters } from 'node:util';
import { throwIfAborted } from './errors.mjs';

const terminal = new Set(['completed', 'failed', 'cancelled']);
const statuses = new Set(['queued', 'running', ...terminal, 'info']);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const context = new AsyncLocalStorage();
const integer = (value, lo, hi) => Number.isInteger(value) && value >= lo && value <= hi;

export function sanitizeActivity(value, options = {}) {
  const { secrets = [], maxLength = 300 } = typeof options === 'number' ? { maxLength: options } : options;
  let text = stripVTControlCharacters(String(value ?? '')).replace(/[\x00-\x1f\x7f]/g, ' ');
  for (const secret of secrets) if (typeof secret === 'string' && secret.length >= 4) text = text.split(secret).join('[비공개]');
  text = text.replace(/\b(?:AIza[A-Za-z0-9_-]+|e2b_[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._~+\/-]+=*)/gi, '[비공개]')
    .replace(/\b(?:api[_-]?key|key|token|secret|password|authorization)\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[비공개]')
    .replace(/(?:https?|wss?|ftp):\/\/[^\s<>"']+/gi, '[주소]')
    .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s<>"']+|(?<![\w:])(?:\.{1,2}\/|\/)[^\s<>"']+/g, '[경로]');
  if (/(?:^|\s)(?:python(?:3)?\s|pip\s|npm\s|node\s|curl\s|wget\s|sudo\s|bash\s|sh\s|powershell\s)|(?:process\.env|os\.environ|\b(?:import|from|def|class)\s+\w+|\b(?:print|eval|exec|require)\s*\(|\b(?:const|let|var)\s+\w+\s*=|=>|```|\$\()/i.test(text)) text = '작업 진행 정보를 확인하고 있습니다.';
  return text.trim().slice(0, maxLength);
}

export function sanitizeDocumentActivity(value, { secrets = [], maxLength = 1500 } = {}) {
  let text = stripVTControlCharacters(String(value ?? '').slice(0, 20000));
  text = text.split(/\r?\n/).map(line => /(?:api[_-]?key|authorization|password|secret|token|process\.env|environ)\s*[=:]/i.test(line) ? '[비공개]' : line).join('\n');
  return sanitizeActivity(text, { secrets, maxLength });
}

export function createActivityStore({ maxTasks = 20, eventLimit = 30, logLimit = 12, secrets = [], now = () => new Date().toISOString() } = {}) {
  secrets = [...secrets];
  const tasks = new Map();
  const listeners = new Set();
  let revision = 0;
  const clean = (value, maxLength) => sanitizeActivity(value, { secrets, maxLength });
  const conflicts = (a, b) => ['documentId', 'contextId'].some(key => a?.[key] && b?.[key] && a[key] !== b[key]);
  const snapshot = () => ({ tasks: [...tasks.values()].reverse().map(task => structuredClone(task)) });
  const publish = () => { revision++; for (const listener of listeners) { try { listener(snapshot(), revision); } catch { /* observation is isolated */ } } };
  const prune = () => {
    for (const [id, task] of tasks) { if (tasks.size <= maxTasks) break; if (terminal.has(task.status)) tasks.delete(id); }
  };
  function append(task, input) {
    const time = now();
    const event = { id: randomUUID(), time, title: clean(input.title || task.title, 160), step: clean(input.step || input.phase || task.phase || 'work', 50), status: statuses.has(input.status) ? input.status : 'info' };
    if (input.detail !== undefined) event.detail = clean(input.detail, 300);
    if (input.log) event.log = true;
    if (['stdout', 'stderr', 'status'].includes(input.channel)) event.channel = input.channel;
    for (const key of ['attempt', 'maxAttempts']) if (integer(input[key], 1, 10)) event[key] = input[key];
    if (integer(input.issueCount, 0, 10000)) event.issueCount = input.issueCount;
    if (['verified', 'retry', 'needs_review'].includes(input.roundStatus)) event.roundStatus = input.roundStatus;
    const handoff = input.handoff;
    if (!input.log && validId(handoff?.fromTaskId) && handoff.toTaskId === task.id && handoff.fromTaskId !== task.id && !conflicts(tasks.get(handoff.fromTaskId), task)) event.handoff = { fromTaskId: handoff.fromTaskId, toTaskId: task.id };
    task.events.push(event);
    for (const [log, limit, key] of [[false, eventLimit, 'omittedEvents'], [true, logLimit, 'omittedLogs']]) {
      while (task.events.filter(item => Boolean(item.log) === log).length > limit) {
        task.events.splice(task.events.findIndex(item => Boolean(item.log) === log), 1);
        task.history[key]++;
      }
    }
    task.updatedAt = time;
    if (!input.log) {
      task.phase = event.step;
      if (event.detail !== undefined) task.detail = event.detail;
      if (event.status === 'running') task.currentOperation = { title: event.title, step: event.step, startedAt: time, ...(event.detail === undefined ? {} : { detail: event.detail }) };
      if (event.status === 'completed' && task.currentOperation?.step === event.step) delete task.currentOperation;
    }
    return event;
  }
  function create(input = {}) {
    const time = now();
    const task = { id: randomUUID(), kind: ['document', 'criteria', 'dashboard', 'sandbox'].includes(input.kind) ? input.kind : 'sandbox', runtime: input.runtime === 'gemini' ? 'gemini' : 'e2b', title: clean(input.title || '서비스 작업', 100), status: 'queued', phase: 'queued', startedAt: time, updatedAt: time, events: [], history: { eventLimit, logLimit, omittedEvents: 0, omittedLogs: 0 } };
    for (const key of ['documentId', 'runId', 'contextId']) if (validId(input[key])) task[key] = input[key];
    if (input.documentName !== undefined) task.documentName = clean(input.documentName, 240);
    for (const key of ['attempt', 'maxAttempts']) if (integer(input[key], 1, 10)) task[key] = input[key];
    const parent = tasks.get(input.parentTaskId);
    if (validId(input.parentTaskId) && !conflicts(parent, task)) task.parentTaskId = input.parentTaskId;
    tasks.set(task.id, task);
    if (task.parentTaskId && parent?.status === 'running') parent.waitingForTaskId = task.id;
    append(task, { step: 'queued', title: task.title, status: 'queued' });
    prune(); publish();
    return task.id;
  }
  function report(id, event = {}) {
    const task = tasks.get(id);
    if (!task || terminal.has(task.status)) return;
    append(task, event); publish();
  }
  function transition(id, event = {}) {
    const task = tasks.get(id);
    if (!task || terminal.has(task.status)) return;
    if (statuses.has(event.status) && event.status !== 'info') task.status = event.status;
    append(task, event);
    if (terminal.has(task.status)) {
      delete task.currentOperation;
      delete task.waitingForTaskId;
      const parent = tasks.get(task.parentTaskId);
      if (parent?.waitingForTaskId === id) delete parent.waitingForTaskId;
    }
    prune(); publish();
  }
  return { create, report, transition, snapshot, getSnapshot: snapshot, registerSecrets(values) { for (const value of values) if (typeof value === 'string' && value.length >= 4 && !secrets.includes(value)) secrets.push(value); }, get revision() { return revision; }, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}

export const activityStore = createActivityStore();
export const currentActivity = () => context.getStore();
export const runInActivity = (value, work) => context.run(value, work);

export async function observeActivity(input, work, { signal, store, deferStart = false } = {}) {
  const parent = context.getStore();
  store ??= parent?.store ?? activityStore;
  const activityInput = { ...parent?.input, ...input, parentTaskId: input.parentTaskId ?? parent?.taskId };
  const taskId = store.create(activityInput);
  const report = event => store.report(taskId, event);
  report.taskId = taskId;
  try {
    throwIfAborted(signal);
    if (!deferStart) store.transition(taskId, { step: input.step || 'work', title: input.title, status: 'running' });
    const result = await context.run({ taskId, input: activityInput, store, report }, () => work(report));
    throwIfAborted(signal);
    store.transition(taskId, { step: 'complete', title: '작업 완료', status: 'completed' });
    return result;
  } catch (error) {
    store.transition(taskId, { step: signal?.aborted ? 'cancelled' : 'failed', title: signal?.aborted ? '작업 취소' : '작업 실패', status: signal?.aborted ? 'cancelled' : 'failed' });
    throw error;
  }
}

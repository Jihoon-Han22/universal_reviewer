import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { loadConfig, publicConfig, IntegrationError, safeError, errorSummary, createGemini, withSandbox, runSandboxCommand, activityStore, TaskPool } from '../src/index.mjs';
import { runSmoke } from '../scripts/smoke.mjs';

const config = Object.freeze({ geminiApiKey: 'fake-gemini-key', e2bApiKey: 'fake-e2b-key', modelExtract: 'gemini-extract', modelExplore: 'models/gemini-explore', e2bTemplate: 'base' });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const fakeClient = generateContent => ({ models: { generateContent } });
const fakeSandbox = kill => ({ kill: kill ?? (async () => true), commands: { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) }, files: {} });

test('configuration precedence, model grammar, file failure and public projection', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gspec-config-'));
  try {
    const path = join(directory, 'settings.fixture');
    writeFileSync(path, 'GEMINI_API_KEY="fixture key"\nMODEL_EXTRACT="models/gemini-file"\nE2B_TEMPLATE=testing\nPORT=1234\n');
    const value = loadConfig({ env: { GEMINI_API_KEY: '', MODEL_EXPLORE: ' gemini-other ' }, envPath: path });
    assert.equal(value.geminiApiKey, '');
    assert.equal(value.modelExtract, 'models/gemini-file');
    assert.equal(value.modelExplore, 'gemini-other');
    assert.equal(Object.isFrozen(value), true);
    assert.deepEqual(publicConfig(value), { geminiConfigured: false, e2bConfigured: false, modelExtract: 'models/gemini-file', modelExplore: 'gemini-other' });
    assert.equal(loadConfig({ env: {}, envPath: join(directory, 'missing') }).modelExtract, 'gemini-3.5-flash-lite');
    assert.throws(() => loadConfig({ env: { MODEL_EXTRACT: 'bad/model/path' }, envPath: path }), { code: 'CONFIG_INVALID' });
    assert.throws(() => loadConfig({ env: {}, envPath: directory }), { code: 'CONFIG_READ' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('safe errors preserve precedence and exclude raw SDK fields', () => {
  for (const [input, code] of [[{ status: 401 }, 'AUTH'], [{ statusCode: '403' }, 'AUTH'], [{ response: { status: 429 } }, 'QUOTA'], [{ status: 404, name: 'AbortError' }, 'MODEL_UNAVAILABLE'], [{ name: 'AbortError' }, 'TIMEOUT'], [{ status: 504 }, 'TIMEOUT'], [{ status: 500, message: 'secret', request: { key: 'private' } }, 'REQUEST_FAILED']]) {
    const error = safeError(input, 'gemini');
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.equal(JSON.stringify(errorSummary(error)).includes('private'), false);
    assert.equal(JSON.stringify(errorSummary(error)).includes('secret'), false);
  }
  const failure = new IntegrationError('invalid', 'BOGUS', 999);
  assert.equal(failure.service, 'config');
  assert.equal(failure.code, 'REQUEST_FAILED');
  assert.equal(failure.status, undefined);
  assert.equal(safeError(failure, 'e2b'), failure);
});

test('Gemini exact role, content, schema, usage and whitespace request/response boundary', async () => {
  const requests = [], usage = { promptTokenCount: 2, thoughtsTokenCount: 3, totalTokenCount: 5 };
  const client = fakeClient(async request => { requests.push(request); return { text: ' {"value":2} ', modelVersion: 'version', usageMetadata: usage }; });
  const gemini = createGemini({ config: { ...config, geminiApiKey: '' }, client });
  const signal = new AbortController().signal, schema = { type: 'object' };
  const result = await gemini.generateJson({ prompt: 'ignored', contents: [{ text: 'chosen' }], role: 'explore', schema, signal, systemInstruction: 'safe system', maxOutputTokens: 32768, validate: data => data.value === 2 });
  assert.deepEqual(result.data, { value: 2 }); assert.equal(result.usage, usage);
  assert.deepEqual(requests[0], { model: 'models/gemini-explore', contents: [{ text: 'chosen' }], config: { maxOutputTokens: 32768, systemInstruction: 'safe system', abortSignal: signal, responseMimeType: 'application/json', responseJsonSchema: schema } });
  assert.equal((await gemini.generateText({ prompt: 'next' })).text, ' {"value":2} ');
  assert.deepEqual(requests[1].config, { maxOutputTokens: 2048 });
  for (const options of [{}, { prompt: 'p', role: 'wrong' }, { prompt: 'p', maxOutputTokens: 0 }, { prompt: 'p', maxOutputTokens: 32769 }, { prompt: 'p', maxOutputTokens: 1.5 }]) await assert.rejects(gemini.generateText(options), { code: 'CONFIG_INVALID' });
  await assert.rejects(gemini.generateJson({ prompt: 'p' }), { code: 'CONFIG_INVALID' });
  await assert.rejects(gemini.generateJson({ prompt: 'p', schema, validate: () => { throw new Error('private'); } }), { code: 'INVALID_RESPONSE' });
  await assert.rejects(createGemini({ config, client: fakeClient(async () => ({ text: '   ' })) }).generateText({ prompt: 'p' }), { code: 'INVALID_RESPONSE' });
  await assert.rejects(createGemini({ config, client: fakeClient(async () => ({ text: 'not-json' })) }).generateJson({ prompt: 'p', schema }), { code: 'INVALID_RESPONSE' });
});

test('Gemini live is disabled and injected budget hooks precede all provider work', async () => {
  assert.throws(() => createGemini({ config: { ...config, geminiApiKey: '' } }), { code: 'CONFIG_MISSING' });
  await assert.rejects(createGemini({ config }).generateText({ prompt: 'p' }), { code: 'CONFIG_INVALID' });
  const calls = [];
  const budgetGuard = { async reserve(request) { calls.push(['reserve', request.model]); return 7; }, async settle(ticket, usage) { calls.push(['settle', ticket, usage]); }, async release(ticket) { calls.push(['release', ticket]); } };
  const gemini = createGemini({ config, budgetGuard, client: fakeClient(async () => { calls.push(['provider']); return { text: 'ok', usageMetadata: { totalTokenCount: 4 } }; }) });
  await gemini.generateText({ prompt: 'p' });
  assert.deepEqual(calls, [['reserve', 'gemini-extract'], ['provider'], ['settle', 7, { totalTokenCount: 4 }]]);
  calls.length = 0;
  await assert.rejects(createGemini({ config, budgetGuard, client: fakeClient(async () => { throw { status: 429 }; }) }).generateText({ prompt: 'p' }), { code: 'QUOTA' });
  assert.deepEqual(calls, [['reserve', 'gemini-extract'], ['release', 7]]);
  let touched = false;
  await assert.rejects(createGemini({ config, budgetGuard: { ...budgetGuard, reserve: async () => { throw { status: 429 }; } }, client: fakeClient(async () => { touched = true; }) }).generateText({ prompt: 'p' }), { code: 'QUOTA' });
  assert.equal(touched, false);
});

test('TaskPool FIFO, pending cap, queued abort and active cancellation hold resources', async () => {
  const pool = new TaskPool(1, { maxPending: 2 }), first = deferred(), order = [];
  const controller = new AbortController();
  const active = pool.submit(async () => { order.push('first'); await first.promise; }, controller.signal);
  await tick(); controller.abort();
  const queuedAbort = new AbortController();
  const second = pool.submit(() => order.push('second'), queuedAbort.signal);
  const third = pool.submit(() => order.push('third'));
  await assert.rejects(pool.submit(() => {}), { code: 'POOL_FULL', status: 429 });
  queuedAbort.abort(); await assert.rejects(second, { name: 'AbortError' });
  assert.equal(pool.active, 1); assert.equal(pool.pending, 1); assert.deepEqual(order, ['first']);
  first.resolve(); await active; await third; await tick();
  assert.deepEqual(order, ['first', 'third']); assert.equal(pool.active, 0);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(pool.submit(() => assert.fail('Must not run'), aborted.signal), { name: 'AbortError' });
});

test('Queued TaskPool work retains the submitting async context', async () => {
  const scope = new AsyncLocalStorage(), pool = new TaskPool(1), hold = deferred();
  const first = scope.run('first', () => pool.submit(() => hold.promise));
  const second = scope.run('second', () => pool.submit(async () => { await Promise.resolve(); return scope.getStore(); }));
  hold.resolve(); await first;
  assert.equal(await second, 'second');
});

test('Queued Gemini provider starts its own activity rather than the predecessor task', async () => {
  const holds = [deferred(), deferred(), deferred()], started = [];
  const gemini = createGemini({ config, client: fakeClient(async ({ contents }) => { started.push(contents); await holds[Number(contents)].promise; return { text: 'ok' }; }) });
  const a = gemini.generateText({ prompt: '0' }), b = gemini.generateText({ prompt: '1' }), c = gemini.generateText({ prompt: '2' });
  await tick();
  const thirdId = activityStore.snapshot().tasks[0].id;
  holds[0].resolve(); await a; await tick();
  const third = activityStore.snapshot().tasks.find(task => task.id === thirdId);
  const statusWhileRunning = third.status;
  const hasRunningEvent = third.events.some(event => event.status === 'running');
  holds[1].resolve(); holds[2].resolve(); await Promise.all([b, c]);
  assert.deepEqual(started, ['0', '1', '2']);
  assert.equal(statusWhileRunning, 'running'); assert.equal(hasRunningEvent, true);
});

test('Gemini stream cancellation after final text prevents done and completed', async () => {
  const controller = new AbortController();
  const client = { models: { async generateContentStream() { return (async function* () { yield { text: 'last text' }; })(); } } };
  const stream = createGemini({ config, client }).streamText({ prompt: 'p', signal: controller.signal });
  assert.equal((await stream.next()).value.type, 'text.delta');
  const taskId = activityStore.snapshot().tasks[0].id;
  controller.abort();
  const next = await stream.next().then(value => value, error => error);
  const task = activityStore.snapshot().tasks.find(item => item.id === taskId);
  await stream.return();
  assert.equal(next.code, 'TIMEOUT');
  assert.equal(task.status, 'cancelled'); assert.equal(task.events.some(event => event.status === 'completed'), false);
});

test('Gemini stream cancellation between text and usage blocks the remainder of that chunk', async () => {
  const controller = new AbortController(); let closed = false;
  const client = { models: { async generateContentStream() { return (async function* () { try { yield { text: 'first', usageMetadata: { totalTokenCount: 1 } }; } finally { closed = true; } })(); } } };
  const stream = createGemini({ config, client }).streamText({ prompt: 'p', signal: controller.signal });
  assert.equal((await stream.next()).value.type, 'text.delta');
  controller.abort(); await assert.rejects(stream.next(), { code: 'TIMEOUT' });
  assert.equal(closed, true);
});

test('Invalid JSON response marks the enclosing automatic Gemini task failed', async () => {
  const gemini = createGemini({ config, client: fakeClient(async () => ({ text: 'not-json' })) });
  await assert.rejects(gemini.generateJson({ prompt: 'p', schema: { type: 'object' } }), { code: 'INVALID_RESPONSE' });
  assert.equal(activityStore.snapshot().tasks[0].status, 'failed');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(gemini.generateJson({ prompt: 'p', schema: {}, signal: controller.signal }), { code: 'TIMEOUT' });
});

test('All Gemini instances share two slots and early stream return releases its slot', async () => {
  const holds = [deferred(), deferred()], started = [];
  const make = id => createGemini({ config, client: fakeClient(async () => { started.push(id); await holds[id]?.promise; return { text: 'ok' }; }) });
  const a = make(0).generateText({ prompt: 'a' }), b = make(1).generateText({ prompt: 'b' }), c = make(2).generateText({ prompt: 'c' });
  await tick(); assert.deepEqual(started, [0, 1]);
  assert.deepEqual(activityStore.snapshot().tasks.slice(0, 3).map(task => task.status), ['queued', 'running', 'running']);
  holds[0].resolve(); await a; await c; holds[1].resolve(); await b;
  const streamClient = { models: { async generateContentStream() { return (async function* () { yield { text: ' ' }; yield { usageMetadata: { totalTokenCount: 8 } }; yield { text: 'last' }; })(); } } };
  const stream = createGemini({ config, client: streamClient }).streamText({ prompt: 'p' });
  assert.deepEqual(await stream.next(), { done: false, value: { type: 'text.delta', text: ' ' } });
  await stream.return();
  const all = [];
  for await (const item of createGemini({ config, client: streamClient }).streamText({ prompt: 'p' })) all.push(item);
  assert.deepEqual(all, [{ type: 'text.delta', text: ' ' }, { type: 'usage', usage: { totalTokenCount: 8 } }, { type: 'text.delta', text: 'last' }, { type: 'done' }]);
  const empty = { models: { async generateContentStream() { return (async function* () { yield { usageMetadata: { totalTokenCount: 1 } }; })(); } } };
  await assert.rejects(async () => { for await (const item of createGemini({ config, client: empty }).streamText({ prompt: 'p' })) void item; }, { code: 'INVALID_RESPONSE' });
});

test('Gemini queue overflow becomes QUOTA and abort removes all pending requests without calling SDK', async () => {
  const hold = deferred(); let calls = 0;
  const gemini = createGemini({ config, client: fakeClient(async () => { calls++; await hold.promise; return { text: 'ok' }; }) });
  const active = [gemini.generateText({ prompt: 'one' }), gemini.generateText({ prompt: 'two' })];
  await tick();
  const controller = new AbortController();
  const pending = Array.from({ length: 100 }, () => gemini.generateText({ prompt: 'queued', signal: controller.signal }).catch(error => error));
  await assert.rejects(gemini.generateText({ prompt: 'overflow' }), { code: 'QUOTA', status: 429 });
  controller.abort();
  assert.equal((await Promise.all(pending)).every(error => error.code === 'TIMEOUT'), true);
  assert.equal(calls, 2);
  hold.resolve(); await Promise.all(active);
});

test('Early stream return conservatively releases budget reservation after closing SDK iterator', async () => {
  const calls = [];
  const client = { models: { async generateContentStream() { return (async function* () { try { yield { text: 'first' }; yield { text: 'second' }; } finally { calls.push('iterator closed'); } })(); } } };
  const budgetGuard = { reserve: async () => 5, settle: async () => calls.push('settled'), release: async ticket => calls.push(`released ${ticket}`) };
  const stream = createGemini({ config, client, budgetGuard }).streamText({ prompt: 'p' });
  await stream.next(); await stream.return();
  assert.deepEqual(calls, ['iterator closed', 'released 5']);
});

test('Sandbox validates before create, forwards options, returns only after kill', async () => {
  const calls = [], cleaned = deferred(); let reporter;
  const sandbox = fakeSandbox(async options => { calls.push(['kill', options]); await cleaned.promise; return true; });
  const factory = { async create(template, options) { calls.push(['create', template, options]); return sandbox; } };
  let done = false;
  const result = withSandbox((handle, report) => { assert.equal(handle, sandbox); reporter = report; return 'result'; }, { config, sandboxFactory: factory, timeoutMs: 300000 }).then(value => { done = true; return value; });
  await tick(); assert.equal(done, false); assert.match(reporter.taskId, /^[\w-]+$/); assert.equal(reporter({ step: 'read', status: 'info' }), undefined);
  assert.deepEqual(calls, [['create', 'base', { apiKey: 'fake-e2b-key', timeoutMs: 300000, requestTimeoutMs: 30000 }], ['kill', { requestTimeoutMs: 15000 }]]);
  cleaned.resolve(); assert.equal(await result, 'result');
  await assert.rejects(withSandbox(() => {}, { config, timeoutMs: 9999, sandboxFactory: factory }), { code: 'CONFIG_INVALID' });
  await assert.rejects(withSandbox(() => {}, { config: { ...config, e2bApiKey: '' }, sandboxFactory: factory }), { code: 'CONFIG_MISSING' });
});

test('Abort during late sandbox create kills exactly once and never invokes work', async () => {
  const controller = new AbortController(), created = deferred(); let kills = 0, work = false;
  const result = withSandbox(() => { work = true; }, { config, signal: controller.signal, sandboxFactory: { create: () => created.promise } });
  await tick(); controller.abort(); created.resolve(fakeSandbox(async () => { kills++; return true; }));
  await assert.rejects(result, { code: 'TIMEOUT' }); assert.equal(kills, 1); assert.equal(work, false);
});

test('Sandbox abort and cleanup failure retains slot until work settles, failure wins', async () => {
  const controller = new AbortController(), worked = deferred(), cleanup = deferred(); let kills = 0, taskId;
  const pending = withSandbox(async (_sandbox, report) => { taskId = report.taskId; await worked.promise; }, { config, signal: controller.signal, sandboxFactory: { create: async () => fakeSandbox(async () => { kills++; await cleanup.promise; throw new Error('private SDK error'); }) } });
  await tick(); controller.abort(); cleanup.resolve(); await tick();
  assert.equal(activityStore.snapshot().tasks.find(task => task.id === taskId).status, 'running');
  worked.resolve(); await assert.rejects(pending, { code: 'CLEANUP_FAILED' });
  assert.equal(kills, 1);
  const activity = activityStore.snapshot().tasks.find(task => task.id === taskId);
  assert.equal(activity.status, 'failed'); assert.equal(activity.phase, 'cleanup'); assert.equal(activity.events.at(-1).title, '실행 환경 종료를 확인하지 못했습니다');
});

test('Falsy sandbox work rejections remain failures after cleanup and never publish completed', async () => {
  for (const rejected of [undefined, null, false, 0, '']) {
    let killed = false, taskId;
    await assert.rejects(withSandbox((_sandbox, report) => { taskId = report.taskId; throw rejected; }, { config, sandboxFactory: { create: async () => fakeSandbox(async () => { killed = true; return true; }) } }), { code: 'REQUEST_FAILED' });
    assert.equal(killed, true);
    const task = activityStore.snapshot().tasks.find(item => item.id === taskId);
    assert.equal(task.status, 'failed'); assert.equal(task.events.some(event => event.status === 'completed'), false);
  }
  await assert.rejects(withSandbox(() => { throw undefined; }, { config, sandboxFactory: { create: async () => fakeSandbox(async () => { throw new Error('cleanup failed'); }) } }), { code: 'CLEANUP_FAILED' });
});

test('E2B global slots include cleanup and cancellation during cleanup cannot publish success', async () => {
  const cleanup = deferred(), controller = new AbortController(); let creates = 0;
  const factory = { async create() { creates++; return fakeSandbox(async () => { await cleanup.promise; return true; }); } };
  const first = withSandbox(() => 'one', { config, sandboxFactory: factory, signal: controller.signal }).catch(error => error);
  const second = withSandbox(() => 'two', { config, sandboxFactory: factory });
  const third = withSandbox(() => 'three', { config, sandboxFactory: factory });
  await tick(); assert.equal(creates, 2); controller.abort();
  cleanup.resolve(); assert.equal((await first).code, 'TIMEOUT'); assert.equal(await second, 'two'); assert.equal(await third, 'three'); assert.equal(creates, 3);
});

test('Command helper uses exact timeout boundary and returns raw response', async () => {
  const result = { exitCode: 2, stdout: 'private source', stderr: 'private diagnostic' };
  const sandbox = { commands: { async run(command, options) { assert.equal(command, 'fixed trusted command'); assert.deepEqual(options, { timeoutMs: 120000, requestTimeoutMs: 125000 }); return result; } } };
  assert.equal(await runSandboxCommand(sandbox, 'fixed trusted command', { timeoutMs: 120000 }), result);
  await assert.rejects(runSandboxCommand(sandbox, 'x', { timeoutMs: 120001 }), { code: 'CONFIG_INVALID' });
});

test('Smoke runner accepts only injected or guarded provider access and awaits cleanup', async () => {
  let killed = false;
  const sandbox = fakeSandbox(async () => { killed = true; return true; });
  sandbox.commands.run = async (command, options) => { assert.equal(command, 'python -c "print(\'sandbox-ready\')"'); assert.equal(options.timeoutMs, 15000); return { exitCode: 0, stdout: 'sandbox-ready\n', stderr: '' }; };
  const result = await runSmoke({ config, client: fakeClient(async () => ({ text: 'OK', modelVersion: 'fixture-version' })), sandboxFactory: { create: async () => sandbox } });
  assert.equal(killed, true); assert.equal(result.gemini.completed, true); assert.equal(result.sandbox.completed, true);
  assert.equal(JSON.stringify(result).includes(config.geminiApiKey), false);
});

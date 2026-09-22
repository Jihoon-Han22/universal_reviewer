import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityStore, observeActivity, sanitizeActivity, sanitizeDocumentActivity, commandProgressLine, runObservedCommand } from '../src/index.mjs';

test('Activity strips explicit secrets, key patterns, addresses, paths, assignments, controls and commands', () => {
  const text = sanitizeActivity('visible\u0001 fixture-secret https://example.invalid/a /home/user/source.py C:\\private\\data.py token=privatevalue AIza0123456789 e2b_12345 Bearer abcdef', { secrets: ['fixture-secret'] });
  for (const secret of ['fixture-secret', 'example.invalid', '/home/user', 'C:\\private', 'privatevalue', 'AIza', 'e2b_', 'abcdef']) assert.equal(text.includes(secret), false, secret);
  assert.ok(text.includes('[주소]')); assert.ok(text.includes('[경로]')); assert.ok(text.includes('[비공개]'));
  assert.equal(sanitizeActivity('python /home/user/reader.py'), '작업 진행 정보를 확인하고 있습니다.');
  assert.equal(sanitizeActivity('print("raw code")'), '작업 진행 정보를 확인하고 있습니다.');
  assert.equal(sanitizeActivity('/workspace/source.txt ./relative/file.txt'), '[경로] [경로]');
  assert.equal(sanitizeActivity('a'.repeat(500)).length, 300);
  assert.equal(sanitizeDocumentActivity('a'.repeat(20000) + 'TAIL').length, 1500);
  assert.equal(sanitizeDocumentActivity('normal\nprocess.env=secrets\nafter').includes('secrets'), false);
});

test('Activity retention separates logs and status events, preserves unfinished tasks and isolates observers', () => {
  const store = createActivityStore({ maxTasks: 2, eventLimit: 3, logLimit: 2 });
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications++; throw new Error('observer failure'); });
  const first = store.create({ runtime: 'gemini', title: 'first' });
  for (let index = 0; index < 6; index++) store.report(first, { title: `event${index}`, step: 'quality', status: 'info' });
  for (let index = 0; index < 5; index++) store.report(first, { title: `log${index}`, step: 'work', status: 'info', log: true, channel: 'stdout' });
  const task = store.snapshot().tasks[0];
  assert.equal(task.events.filter(event => !event.log).length, 3);
  assert.equal(task.events.filter(event => event.log).length, 2);
  assert.deepEqual(task.history, { eventLimit: 3, logLimit: 2, omittedEvents: 4, omittedLogs: 3 });
  const second = store.create({ title: 'second' }), third = store.create({ title: 'third' });
  assert.deepEqual(store.snapshot().tasks.map(item => item.id), [third, second, first]);
  store.transition(first, { status: 'completed', step: 'complete' });
  assert.deepEqual(store.snapshot().tasks.map(item => item.id), [third, second]);
  const revision = store.revision;
  store.report(first, { title: 'late' }); assert.equal(store.revision, revision);
  unsubscribe(); const count = notifications; store.report(second, { title: 'new' }); assert.equal(notifications, count);
  const snapshot = store.snapshot(); snapshot.tasks[0].title = 'mutated'; assert.notEqual(store.snapshot().tasks[0].title, 'mutated');
});

test('Parent, wait and handoff identity rules prevent cross-document/context linkage', () => {
  const store = createActivityStore();
  const parent = store.create({ documentId: 'docA', contextId: 'contextA' });
  store.transition(parent, { status: 'running', step: 'read' });
  const bad = store.create({ parentTaskId: parent, documentId: 'docB', contextId: 'contextA' });
  assert.equal(store.snapshot().tasks.find(task => task.id === bad).parentTaskId, undefined);
  const child = store.create({ parentTaskId: parent, documentId: 'docA', contextId: 'contextA', attempt: 11, maxAttempts: 3 });
  assert.equal(store.snapshot().tasks.find(task => task.id === parent).waitingForTaskId, child);
  store.report(child, { title: 'valid', handoff: { fromTaskId: parent, toTaskId: child }, issueCount: 10001 });
  let last = store.snapshot().tasks.find(task => task.id === child).events.at(-1);
  assert.deepEqual(last.handoff, { fromTaskId: parent, toTaskId: child }); assert.equal(last.issueCount, undefined);
  store.report(child, { title: 'invalid', handoff: { fromTaskId: bad, toTaskId: child } });
  assert.equal(store.snapshot().tasks.find(task => task.id === child).events.at(-1).handoff, undefined);
  store.report(child, { title: 'log is not handoff', log: true, handoff: { fromTaskId: parent, toTaskId: child } });
  assert.equal(store.snapshot().tasks.find(task => task.id === child).events.at(-1).handoff, undefined);
  store.transition(child, { status: 'completed', step: 'complete' });
  assert.equal(store.snapshot().tasks.find(task => task.id === parent).waitingForTaskId, undefined);
  const revision = store.revision; store.transition(child, { status: 'failed' }); assert.equal(store.revision, revision);
});

test('Observer reports real work failure and abort without exposing raw error messages', async () => {
  const store = createActivityStore();
  assert.equal(await observeActivity({ runtime: 'gemini', title: 'request' }, async report => { assert.ok(report.taskId); return 7; }, { store }), 7);
  assert.equal(store.snapshot().tasks[0].status, 'completed');
  const controller = new AbortController();
  await assert.rejects(observeActivity({ runtime: 'gemini', title: 'request' }, async () => { controller.abort(); }, { store, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(store.snapshot().tasks[0].status, 'cancelled');
  await assert.rejects(observeActivity({ runtime: 'gemini', title: 'request' }, async () => { throw new Error('raw-private-error'); }, { store }));
  assert.equal(JSON.stringify(store.snapshot()).includes('raw-private-error'), false);
});

test('Third nested activity retains document, run, context and immediate parent linkage', async () => {
  const store = createActivityStore();
  await observeActivity({ runtime: 'e2b', documentId: 'docA', contextId: 'ctxA', runId: 'runA', title: 'outer' }, async () => {
    await observeActivity({ runtime: 'e2b', title: 'middle' }, async () => {
      await observeActivity({ runtime: 'gemini', title: 'inner' }, async () => {}, { store });
    }, { store });
  }, { store });
  const [inner, middle, outer] = store.snapshot().tasks;
  assert.equal(inner.parentTaskId, middle.id); assert.equal(middle.parentTaskId, outer.id);
  for (const task of [inner, middle, outer]) {
    assert.equal(task.documentId, 'docA'); assert.equal(task.contextId, 'ctxA'); assert.equal(task.runId, 'runA');
  }
});

test('Nested activity inherits an explicitly selected observer store', async () => {
  const store = createActivityStore();
  await observeActivity({ runtime: 'e2b', contextId: 'scope', title: 'outer' }, async () => {
    await observeActivity({ runtime: 'gemini', title: 'inner' }, async () => {});
  }, { store });
  const [inner, outer] = store.snapshot().tasks;
  assert.equal(inner.title, 'inner'); assert.equal(inner.contextId, 'scope'); assert.equal(inner.parentTaskId, outer.id);
});

test('Command line admission only exposes bounded reader/build/check/package metadata', () => {
  assert.equal(commandProgressLine('arbitrary source content', { outputKind: 'reader' }), null);
  assert.equal(commandProgressLine('arbitrary source content', { channel: 'stderr' }).title, '실행 진단 수신');
  assert.equal(commandProgressLine('TRACE_PROGRESS:{"stage":"sheet","current":2,"total":4}', { outputKind: 'reader' }).detail, '2 / 4');
  assert.equal(commandProgressLine('TRACE_PROGRESS:{"stage":"sheet","current":2,"total":1}', { outputKind: 'reader' }).detail, '2');
  for (const data of [{ stage: 'secret', current: 1 }, { stage: 'file', current: -1 }, { stage: 'file', current: 1.1 }, { stage: 'file', current: 1000000001 }]) assert.equal(commandProgressLine(`TRACE_PROGRESS:${JSON.stringify(data)}`, { outputKind: 'reader' }), null);
  assert.equal(commandProgressLine('{"cellsRead":5,"unitsRead":1,"source":"private"}', { outputKind: 'reader' }).detail, '셀 5개 · 읽은 단위 1개');
  assert.equal(commandProgressLine('TRACE_BUILD:{"target":"browser","status":"completed"}', { outputKind: 'build' }).title, '화면 빌드');
  assert.equal(commandProgressLine('{"rendered":true,"characters":120}', { outputKind: 'check' }).title, '화면 구조 검사 통과');
  assert.equal(commandProgressLine('Collecting openpyxl==3.1.5', { outputKind: 'packages' }).detail, 'openpyxl 설치 준비');
  assert.equal(commandProgressLine('Successfully installed a-1.2 bad/package b-2.3', { outputKind: 'packages' }).detail, 'a-1.2, b-2.3');
  assert.equal(commandProgressLine('added 1000000 packages', { outputKind: 'packages' }), null);
});

test('Command streams fragmented lines, avoids aggregate replay, and isolates channels', async () => {
  const events = [], progress = 'TRACE_PROGRESS:{"stage":"sheet","current":1,"total":2}';
  const result = { exitCode: 0, stdout: progress + '\n', stderr: progress + '\n' };
  const sandbox = { commands: { async run(_command, options) {
    assert.equal(options.timeoutMs, 180000); assert.equal(options.requestTimeoutMs, 185000);
    assert.equal('abortSignal' in options, false);
    options.onStdout(progress.slice(0, 25)); options.onStdout(progress.slice(25) + '\r\n');
    options.onStdout(progress + '\n');
    options.onStderr(progress + '\n');
    return result;
  } } };
  assert.equal(await runObservedCommand(sandbox, 'fixed trusted command', { outputKind: 'reader', timeoutMs: 180000, onActivity: event => events.push(event) }), result);
  const logs = events.filter(event => event.log);
  assert.equal(logs.length, 2); assert.deepEqual(logs.map(log => log.channel), ['stdout', 'stderr']);
  assert.deepEqual(events.filter(event => !event.log).map(event => event.status), ['running', 'completed']);
});

test('Command aggregate fallback and final three-message cap retain latest metadata', async () => {
  const lines = Array.from({ length: 12 }, (_, current) => `TRACE_PROGRESS:${JSON.stringify({ stage: 'cells', current })}`);
  const events = [];
  await runObservedCommand({ commands: { async run(_command, options) { options.onStdout(''); return { exitCode: 0, stdout: lines.join('\n'), stderr: '' }; } } }, 'fixed', { outputKind: 'reader', onActivity: event => events.push(event) });
  assert.deepEqual(events.filter(event => event.log).map(event => event.detail), ['9', '10', '11']);
  const raw = [];
  await runObservedCommand({ commands: { async run() { return { exitCode: 1, stdout: 'full-source-private', stderr: 'full-secret-private' }; } } }, 'fixed', { onActivity: event => raw.push(event) });
  assert.equal(JSON.stringify(raw).includes('private'), false);
  assert.equal(raw.at(-1).status, 'failed');
});

test('Command completion closes callbacks, observers cannot break command, abort emits no pending logs', async () => {
  let callbacks;
  const events = [];
  await runObservedCommand({ commands: { async run(_command, options) { callbacks = options; return { exitCode: 0 }; } } }, 'fixed', { outputKind: 'reader', onActivity: event => { events.push(event); throw new Error('observer'); } });
  const count = events.length; callbacks.onStdout('TRACE_PROGRESS:{"stage":"file","current":1}\n'); assert.equal(events.length, count);
  const controller = new AbortController(), aborted = [];
  await assert.rejects(runObservedCommand({ commands: { async run(_command, options) { options.onStdout('TRACE_PROGRESS:{"stage":"file","current":1}\n'); controller.abort(); return { exitCode: 0 }; } } }, 'fixed', { outputKind: 'reader', signal: controller.signal, onActivity: event => aborted.push(event) }), { name: 'AbortError' });
  assert.equal(aborted.filter(event => event.log).length, 0); assert.equal(aborted.at(-1).status, 'cancelled');
});

test('Command framing retains tail windows and clamps emitted logs despite sustained output', async () => {
  const events = [];
  const lines = Array.from({ length: 60 }, (_, current) => `TRACE_PROGRESS:${JSON.stringify({ stage: 'page', current })}\n`).join('');
  await runObservedCommand({ commands: { async run(_command, options) {
    options.onStdout('untrusted '.repeat(3000) + '\n' + lines);
    await new Promise(resolve => setTimeout(resolve, 12));
    options.onStdout(lines);
    return { exitCode: 0, stdout: 'arbitrary aggregate must not replay', stderr: '' };
  } } }, 'fixed', { outputKind: 'reader', throttleMs: 1, heartbeatMs: 10000, maxLogs: 2, onActivity: event => events.push(event) });
  assert.equal(events.filter(event => event.log).length, 2);
  assert.equal(events.filter(event => event.log).every(event => Number(event.detail) >= 20), true);
  assert.equal(JSON.stringify(events).includes('untrusted'), false);
});

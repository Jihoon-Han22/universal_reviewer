import { sanitizeDocumentActivity } from './activity.mjs';
import { IntegrationError, throwIfAborted } from './errors.mjs';
import { stripVTControlCharacters } from 'node:util';

const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 1e9;
const stageNames = { file: '파일', sheet: '시트', page: '페이지', range: '범위', blocks: '구조', cells: '셀' };
function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }

/** Converts only trusted, bounded metadata to observer messages; never raw output. */
export function commandProgressLine(value, { outputKind = 'none', channel = 'stdout' } = {}) {
  const line = stripVTControlCharacters(String(value ?? '')).trim();
  if (!line || line.length > 8000) return null;
  let result;
  if (outputKind === 'reader') {
    if (line.startsWith('TRACE_PROGRESS:')) {
      const data = parseJson(line.slice('TRACE_PROGRESS:'.length));
      if (data && Object.hasOwn(stageNames, data.stage) && count(data.current)) result = { title: `${stageNames[data.stage]} 읽기`, detail: count(data.total) && data.total >= data.current ? `${data.current} / ${data.total}` : `${data.current}` };
    } else {
      const data = parseJson(line);
      if (data && count(data.cellsRead)) {
        const parts = [`셀 ${data.cellsRead}개`];
        for (const [key, label] of [['unitsRead', '읽은 단위'], ['unitsTotal', '전체 단위'], ['returned', '반환 범위'], ['requested', '요청 범위']]) if (count(data[key])) parts.push(`${label} ${data[key]}개`);
        result = { title: '원문 읽기 결과', detail: parts.join(' · ') };
      }
    }
  }
  if (outputKind === 'build' && line.startsWith('TRACE_BUILD:')) {
    const data = parseJson(line.slice('TRACE_BUILD:'.length));
    if (data && ['browser', 'validation'].includes(data.target) && ['started', 'completed'].includes(data.status)) result = { title: data.target === 'browser' ? '화면 빌드' : '검증 빌드', detail: data.status === 'started' ? '빌드를 시작했습니다.' : '빌드를 완료했습니다.' };
  }
  if (outputKind === 'check') {
    const data = parseJson(line);
    if (data?.rendered === true && count(data.characters)) result = { title: '화면 구조 검사 통과', detail: `표시 문자 ${data.characters}개를 확인했습니다.` };
  }
  if (outputKind === 'packages') {
    const packageLine = /^(Collecting|Downloading|Using cached|Requirement already satisfied):?\s+([A-Za-z][A-Za-z0-9_.-]{0,80})(?=$|[\s=(\[])/.exec(line);
    if (packageLine) result = { title: '분석 도구 준비', detail: `${packageLine[2]} ${packageLine[1] === 'Requirement already satisfied' ? '설치 확인' : '설치 준비'}` };
    if (/^Successfully installed\s+/.test(line)) {
      const packages = line.slice('Successfully installed'.length).trim().split(/\s+/).filter(token => /^[A-Za-z][A-Za-z0-9_.+-]{0,100}$/.test(token)).slice(0, 10);
      if (packages.length) result = { title: '분석 도구 설치 완료', detail: packages.join(', ') };
    }
    const npm = /^(?:added|changed)\s+(\d{1,6})\s+packages?\b/.exec(line);
    if (npm) result = { title: '분석 도구 설치 완료', detail: `패키지 ${Number(npm[1])}개` };
    if (/^up to date(?:,|\s|$)/i.test(line)) result = { title: '분석 도구 준비 완료', detail: '설치 상태를 확인했습니다.' };
  }
  if (!result && channel === 'stderr') return { title: '실행 진단 수신', detail: '' };
  return result ?? null;
}

export async function runObservedCommand(sandbox, command, {
  step = 'work', title = '실행 환경 작업', detail, outputKind = 'none', onActivity,
  secrets = [], signal, timeoutMs = 15000, requestTimeoutMs = timeoutMs + 5000,
  throttleMs = 600, heartbeatMs = 8000, maxLogs = 24,
} = {}) {
  if (typeof command !== 'string' || !command.trim() || !Number.isInteger(timeoutMs) || timeoutMs < 1 || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) throw new IntegrationError('e2b', 'CONFIG_INVALID');
  const clean = text => sanitizeDocumentActivity(text, { secrets });
  const safeStep = clean(step).slice(0, 50), safeTitle = clean(title).slice(0, 160);
  const channels = { stdout: { buffer: '', received: false }, stderr: { buffer: '', received: false } };
  const pending = new Map(), seen = new Set();
  let logs = 0, closed = false;
  const emit = event => { try { onActivity?.(event); } catch { /* observers cannot fail a command */ } };
  const enqueue = (channel, progress, heartbeat = false) => {
    if (closed || !progress || logs >= maxLogs) return;
    const event = { step: safeStep, title: clean(progress.title), detail: clean(progress.detail), status: 'info', log: true, channel };
    const key = `${channel}|${event.title}|${event.detail}`;
    if (!heartbeat && seen.has(key)) return;
    if (!heartbeat) { seen.add(key); while (seen.size > 100) seen.delete(seen.values().next().value); }
    pending.set(key, event);
    while (pending.size > 8) pending.delete(pending.keys().next().value);
  };
  const flush = (limit = 1, newest = false) => {
    const selected = [...pending.entries()];
    for (const [key, event] of newest ? selected.slice(-limit) : selected.slice(0, limit)) {
      if (logs >= maxLogs || signal?.aborted) break;
      pending.delete(key); logs++; emit(event);
    }
  };
  const feed = (channel, chunk, final = false, streaming = false) => {
    if (closed) return;
    const state = channels[channel];
    const text = String(chunk ?? '');
    if (streaming && text) state.received = true;
    const combined = (state.buffer + text).slice(-16000);
    const lines = combined.split(/[\r\n]+/);
    state.buffer = final ? '' : lines.pop().slice(-8000);
    if (final && lines.at(-1) === '') lines.pop();
    for (const line of lines.slice(-40)) enqueue(channel, commandProgressLine(line, { outputKind, channel }));
  };
  const throttle = setInterval(() => flush(), Math.max(1, throttleMs));
  const heartbeat = setInterval(() => enqueue('status', { title: '다음 응답 대기', detail: '실행 중인 작업의 다음 응답을 기다리고 있습니다.' }, true), Math.max(1, heartbeatMs));
  throttle.unref?.(); heartbeat.unref?.();
  try {
    throwIfAborted(signal);
    emit({ step: safeStep, title: safeTitle, ...(detail === undefined ? {} : { detail: clean(detail) }), status: 'running' });
    const result = await sandbox.commands.run(command, { timeoutMs, requestTimeoutMs, onStdout: text => feed('stdout', text, false, true), onStderr: text => feed('stderr', text, false, true) });
    for (const channel of ['stdout', 'stderr']) feed(channel, channels[channel].received ? '' : result?.[channel], true);
    throwIfAborted(signal);
    flush(3, true);
    emit({ step: safeStep, title: safeTitle, status: Number.isInteger(result?.exitCode) && result.exitCode !== 0 ? 'failed' : 'completed' });
    return result;
  } catch (error) {
    if (!signal?.aborted) flush(3, true);
    emit({ step: safeStep, title: safeTitle, status: signal?.aborted ? 'cancelled' : 'failed' });
    throw error;
  } finally {
    clearInterval(throttle); clearInterval(heartbeat);
    closed = true; pending.clear();
  }
}

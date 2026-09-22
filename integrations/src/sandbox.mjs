import { loadConfig, requireKey } from './config.mjs';
import { IntegrationError, safeError, throwIfAborted } from './errors.mjs';
import { sandboxPool } from './task-pool.mjs';
import { activityStore, currentActivity, runInActivity } from './activity.mjs';

export async function withSandbox(work, { config = loadConfig(), timeoutMs = 60000, sandboxFactory, signal, activity = {}, live = false } = {}) {
  if (typeof work !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 10000 || timeoutMs > 300000) throw new IntegrationError('e2b', 'CONFIG_INVALID');
  const apiKey = requireKey(config, 'e2b');
  const parent = currentActivity();
  const store = parent?.store ?? activityStore;
  store.registerSecrets?.([config.geminiApiKey, config.e2bApiKey]);
  const taskId = store.create({ ...parent?.input, ...activity, runtime: 'e2b', title: activity.title || '실행 환경 준비', parentTaskId: activity.parentTaskId ?? parent?.taskId });
  const report = event => { store.report(taskId, event); };
  report.taskId = taskId;
  let failureStage = 'queue';
  try {
    return await sandboxPool.submit(async () => {
      let sandbox, cleanupPromise, workError, result, workFailed = false;
      const killOnce = () => {
        if (!sandbox) return Promise.resolve();
        if (!cleanupPromise) {
          store.report(taskId, { step: 'cleanup', title: '실행 환경 종료', status: 'running' });
          cleanupPromise = Promise.resolve().then(() => sandbox.kill({ requestTimeoutMs: 15000 })).catch(() => { throw new IntegrationError('e2b', 'CLEANUP_FAILED'); });
        }
        return cleanupPromise;
      };
      const abort = () => { void killOnce().catch(() => {}); };
      try {
        throwIfAborted(signal);
        if (!sandboxFactory) {
          failureStage = 'sdk_import';
          if (!live) throw new IntegrationError('e2b', 'CONFIG_INVALID');
          // The package's default main is CommonJS but requires ESM-only chalk.
          // Use its native ESM build when require(ESM) is disabled by the host.
          sandboxFactory = (await import('e2b/dist/index.mjs')).Sandbox;
        }
        store.transition(taskId, { step: 'provisioning', title: '실행 환경 준비', status: 'running' });
        failureStage = 'provisioning';
        sandbox = await sandboxFactory.create(config.e2bTemplate, { apiKey, timeoutMs, requestTimeoutMs: 30000 });
        signal?.addEventListener('abort', abort, { once: true });
        throwIfAborted(signal);
        store.report(taskId, { step: 'work', title: '실행 환경 작업', status: 'running' });
        failureStage = 'work';
        result = await runInActivity({ taskId, store, report, input: { ...parent?.input, ...activity, runtime: 'e2b' } }, () => work(sandbox, report));
        throwIfAborted(signal);
      } catch (error) { workFailed = true; workError = error; }
      finally {
        signal?.removeEventListener('abort', abort);
        try { await killOnce(); }
        catch (error) {
          store.transition(taskId, { step: 'cleanup', title: '실행 환경 종료를 확인하지 못했습니다', status: 'failed' });
          throw error;
        }
      }
      if (workFailed) throw workError;
      throwIfAborted(signal);
      store.transition(taskId, { step: 'complete', title: '작업 완료', status: 'completed' });
      return result;
    }, signal);
  } catch (error) {
    // Log only machine identifiers, never provider messages, keys or documents.
    const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(value) ? value : null;
    console.error('Sandbox failure', {stage: failureStage, name: identifier(error?.name), code: identifier(error?.code), causeCode: identifier(error?.cause?.code), status: Number.isInteger(error?.status) ? error.status : null});
    const safe = safeError(error, 'e2b');
    store.transition(taskId, { step: safe.code === 'CLEANUP_FAILED' ? 'cleanup' : signal?.aborted ? 'cancelled' : 'failed', title: safe.code === 'CLEANUP_FAILED' ? '실행 환경 종료를 확인하지 못했습니다' : signal?.aborted ? '작업 취소' : '작업 실패', status: safe.code === 'CLEANUP_FAILED' ? 'failed' : signal?.aborted ? 'cancelled' : 'failed' });
    throw safe;
  }
}

export async function runSandboxCommand(sandbox, command, { timeoutMs = 15000 } = {}) {
  if (typeof command !== 'string' || !command.trim() || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new IntegrationError('e2b', 'CONFIG_INVALID');
  try { return await sandbox.commands.run(command, { timeoutMs, requestTimeoutMs: timeoutMs + 5000 }); }
  catch (error) { throw safeError(error, 'e2b'); }
}

import { loadConfig, requireKey } from './config.mjs';
import { IntegrationError, safeError, throwIfAborted } from './errors.mjs';
import { geminiPool } from './task-pool.mjs';
import { activityStore, currentActivity, observeActivity } from './activity.mjs';

function logFailure(error) {
  const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(value) ? value : null;
  console.error('Gemini failure', {name: identifier(error?.name), code: identifier(error?.code), causeCode: identifier(error?.cause?.code), status: Number.isInteger(error?.status) ? error.status : null});
}

function requestFor(options, config) {
  const { contents, prompt, role = 'extract', schema, systemInstruction, maxOutputTokens = 2048, signal } = options ?? {};
  if (!['extract', 'explore'].includes(role) || (!contents && !prompt) || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 32768) throw new IntegrationError('gemini', 'CONFIG_INVALID');
  return { model: role === 'explore' ? config.modelExplore : config.modelExtract, contents: contents ?? prompt,
    config: { maxOutputTokens, ...(systemInstruction ? { systemInstruction } : {}), ...(signal ? { abortSignal: signal } : {}), ...(schema ? { responseMimeType: 'application/json', responseJsonSchema: schema } : {}) } };
}

/** Live access is an explicit root-controlled extension; fake clients use the same port. */
export function createGemini({ config = loadConfig(), client, live = false, budgetGuard } = {}) {
  activityStore.registerSecrets([config.geminiApiKey, config.e2bApiKey]);
  const injected = Boolean(client);
  const apiKey = injected ? undefined : requireKey(config, 'gemini');
  let clientPromise;
  const getClient = async () => {
    if (client) return client;
    if (!live || !budgetGuard || !['reserve', 'settle', 'release'].every(key => typeof budgetGuard[key] === 'function')) throw new IntegrationError('gemini', 'CONFIG_INVALID');
    clientPromise ??= import('@google/genai').then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey, httpOptions: { timeout: 30000 } }));
    return clientPromise;
  };
  const reserve = request => budgetGuard ? budgetGuard.reserve(request) : undefined;
  async function finishBudget(ticket, usage, success) {
    if (!budgetGuard || ticket === undefined) return;
    if (success) await budgetGuard.settle(ticket, usage);
    else await budgetGuard.release(ticket); // Root retains possibly billed failed requests.
  }
  async function requestText(options) {
    const request = requestFor(options, config);
    return geminiPool.submit(async () => {
      const ai = await getClient();
      throwIfAborted(options?.signal);
      const ticket = await reserve(request);
      const activity = currentActivity();
      activity?.store.transition(activity.taskId, { step: 'work', title: activity.input.title || '문서 해석 요청', status: 'running' });
      let response;
      try { throwIfAborted(options?.signal); response = await ai.models.generateContent(request); }
      catch (error) { await finishBudget(ticket, undefined, false); throw error; }
      await finishBudget(ticket, response?.usageMetadata, true);
      throwIfAborted(options?.signal);
      if (typeof response?.text !== 'string' || !response.text.trim()) throw new IntegrationError('gemini', 'INVALID_RESPONSE');
      return { text: response.text, model: response.modelVersion, usage: response.usageMetadata };
    }, options?.signal);
  }
  const observed = (work, options) => currentActivity()?.input?.runtime === 'gemini' ? work()
    : observeActivity({ runtime: 'gemini', title: '문서 해석 요청' }, work, { signal: options?.signal, deferStart: true });
  const generateText = async (options = {}) => {
      try { return await observed(() => requestText(options), options); }
      catch (error) { logFailure(error); throw safeError(error, 'gemini'); }
  };
  return {
    generateText,
    async generateJson(options = {}) {
      if (!options.schema) throw new IntegrationError('gemini', 'CONFIG_INVALID');
      return observed(async () => {
        const response = await generateText(options);
        try {
          const data = JSON.parse(response.text);
          if (options.validate && !options.validate(data)) throw new Error('Invalid response');
          return { data, model: response.model, usage: response.usage };
        } catch { throw new IntegrationError('gemini', 'INVALID_RESPONSE'); }
      }, options).catch(error => { throw safeError(error, 'gemini'); });
    },
    async *streamText(options = {}) {
      let release, ticket, usage, complete = false, hasText = false, taskId;
      const parent = currentActivity();
      const store = parent?.store ?? activityStore;
      try {
        const request = requestFor(options, config);
        taskId = store.create({ ...parent?.input, runtime: 'gemini', title: '문서 해석 요청', parentTaskId: parent?.taskId });
        release = await geminiPool.acquire(options.signal);
        const ai = await getClient();
        throwIfAborted(options.signal);
        ticket = await reserve(request);
        throwIfAborted(options.signal);
        store.transition(taskId, { step: 'work', title: '문서 해석 요청', status: 'running' });
        const stream = await ai.models.generateContentStream(request);
        for await (const chunk of stream) {
          throwIfAborted(options.signal);
          if (chunk.text) { hasText = true; yield { type: 'text.delta', text: chunk.text }; }
          throwIfAborted(options.signal);
          if (chunk.usageMetadata) { usage = chunk.usageMetadata; yield { type: 'usage', usage }; }
          throwIfAborted(options.signal);
        }
        throwIfAborted(options.signal);
        if (!hasText) throw new IntegrationError('gemini', 'INVALID_RESPONSE');
        complete = true;
        yield { type: 'done' };
      } catch (error) {
        logFailure(error);
        if (taskId) store.transition(taskId, { step: 'failed', title: options.signal?.aborted ? '작업 취소' : '작업 실패', status: options.signal?.aborted ? 'cancelled' : 'failed' });
        throw safeError(error, 'gemini');
      } finally {
        try {
          await finishBudget(ticket, usage, complete);
          if (taskId) store.transition(taskId, { step: 'complete', title: complete ? '작업 완료' : '작업 취소', status: complete ? 'completed' : 'cancelled' });
        } catch (error) {
          if (taskId) store.transition(taskId, { step: 'failed', title: '작업 실패', status: 'failed' });
          throw safeError(error, 'gemini');
        }
        finally { await release?.(); }
      }
    },
  };
}

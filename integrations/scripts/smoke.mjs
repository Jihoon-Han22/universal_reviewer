import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, publicConfig, errorSummary, createGemini, withSandbox, runSandboxCommand, IntegrationError } from '../src/index.mjs';

/** Root's authorized runner injects the persistent guard; no env switch bypasses it. */
export async function runSmoke({ config = loadConfig(), live = false, budgetGuard, client, sandboxFactory } = {}) {
  const gemini = createGemini({ config, live, budgetGuard, client });
  const response = await gemini.generateText({ prompt: 'Reply with OK only.', maxOutputTokens: 32 });
  const sandbox = await withSandbox(async handle => {
    const result = await runSandboxCommand(handle, "python -c \"print('sandbox-ready')\"");
    if (result.exitCode !== 0 || !result.stdout.includes('sandbox-ready')) throw new IntegrationError('e2b', 'INVALID_RESPONSE');
    return { completed: true };
  }, { config, live, sandboxFactory, activity: { kind: 'sandbox', title: '서비스 연결 확인' } });
  return { config: publicConfig(config), gemini: { completed: true, model: response.model, usage: response.usage }, sandbox };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = loadConfig();
    console.log(JSON.stringify(publicConfig(config), null, 2));
    if (!process.argv.includes('--config-only')) {
      console.error('Live smoke is disabled until the root runner supplies an authorized cumulative budget guard and explicitly enables provider access.');
      process.exitCode = 1;
    }
  } catch (error) { console.error(JSON.stringify(errorSummary(error))); process.exitCode = 1; }
}

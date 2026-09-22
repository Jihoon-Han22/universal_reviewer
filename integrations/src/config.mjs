import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { IntegrationError } from './errors.mjs';

export function loadConfig({ env = process.env, envPath = fileURLToPath(new URL('../../.env', import.meta.url)) } = {}) {
  let fileEnv = {};
  try { fileEnv = parseEnv(readFileSync(envPath, 'utf8')); }
  catch (error) { if (error?.code !== 'ENOENT') throw new IntegrationError('config', 'CONFIG_READ'); }
  const value = name => String(env[name] ?? fileEnv[name] ?? '').trim();
  const config = {
    geminiApiKey: value('GEMINI_API_KEY'), e2bApiKey: value('E2B_API_KEY'),
    modelExtract: value('MODEL_EXTRACT') || 'gemini-3.5-flash-lite',
    modelExplore: value('MODEL_EXPLORE') || 'gemini-3.5-flash-lite',
    e2bTemplate: value('E2B_TEMPLATE') || 'base',
  };
  if (![config.modelExtract, config.modelExplore].every(model => /^(?:models\/)?[a-zA-Z0-9._-]+$/.test(model))) {
    throw new IntegrationError('config', 'CONFIG_INVALID');
  }
  return Object.freeze(config);
}

export function publicConfig(config) {
  return { geminiConfigured: Boolean(config.geminiApiKey), e2bConfigured: Boolean(config.e2bApiKey), modelExtract: config.modelExtract, modelExplore: config.modelExplore };
}

export function requireKey(config, service) {
  const key = config[service === 'gemini' ? 'geminiApiKey' : 'e2bApiKey'];
  if (!key) throw new IntegrationError(service, 'CONFIG_MISSING');
  return key;
}

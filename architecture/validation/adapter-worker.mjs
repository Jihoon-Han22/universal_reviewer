// One adapter invocation in a fresh Node process; this is isolation, not a security sandbox.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [adapterPath, requestPath, inputDirectory, runId, timeoutText, operation = 'contract'] = process.argv.slice(2);
const abort = new AbortController();
const timeout = setTimeout(() => abort.abort(), Number(timeoutText));
process.on('SIGTERM', () => abort.abort());
try {
  const adapter = await import(pathToFileURL(path.resolve(adapterPath)));
  const method = operation === 'gate' ? 'runGate' : 'runContract';
  if (typeof adapter[method] !== 'function') throw Object.assign(new Error(), { code: 'ADAPTER_EXPORT' });
  const request = JSON.parse(await readFile(requestPath, 'utf8'));
  if (abort.signal.aborted) throw Object.assign(new Error(), { code: 'ADAPTER_ABORTED' });
  const output = await adapter[method](operation === 'gate' ? request.gateId : request, { inputDirectory: path.resolve(inputDirectory), projectRoot: path.resolve(inputDirectory), runId, signal: abort.signal, ...(operation === 'gate' ? { acceptanceProfile: request.acceptanceProfile } : {}) });
  if (abort.signal.aborted) throw Object.assign(new Error(), { code: 'ADAPTER_ABORTED' });
  process.stdout.write('\nGSPEC_CONTRACT_RESULT:' + JSON.stringify(output) + '\n');
} catch (error) {
  // Never serialize provider exception messages, causes, URLs, credentials or headers.
  process.stderr.write(JSON.stringify({ code: /^[A-Z_]{1,60}$/.test(error?.code ?? '') ? error.code : abort.signal.aborted ? 'ADAPTER_ABORTED' : 'ADAPTER_FAILED' }) + '\n');
  process.exitCode = 1;
} finally { clearTimeout(timeout); }

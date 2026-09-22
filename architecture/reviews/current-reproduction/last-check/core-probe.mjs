import { writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import express from 'express';
import { createApp } from '../../server/app.mjs';
import { profileSource, validateDocumentContext, analyzeDocumentInSandbox } from '../../server/sandbox-documents.mjs';

// All service dependencies are explicit doubles. Never call loadConfig or a provider.
const config = { geminiApiKey: '', e2bApiKey: '', modelExtract: 'offline', modelExplore: 'offline', e2bTemplate: 'offline' };
const results = { mode: 'OFFLINE_ORIGINAL_CODE', providerCalls: 0, envFilesRead: 0 };
const app = createApp({ config, dashboardRouter: express.Router(), gemini: { generateJson: async () => { throw Error('unexpected model call'); } } });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
try {
  results.httpBodyShapes = [];
  for (const input of [
    { name: 'missing body and Content-Type', options: {} },
    { name: 'text/plain JSON object', options: { headers: { 'content-type': 'text/plain' }, body: '{}' } },
    { name: 'application/json empty body', options: { headers: { 'content-type': 'application/json' }, body: '' } },
    { name: 'application/json {}', options: { headers: { 'content-type': 'application/json' }, body: '{}' } },
    { name: 'application/json []', options: { headers: { 'content-type': 'application/json' }, body: '[]' } },
    { name: 'application/json null', options: { headers: { 'content-type': 'application/json' }, body: 'null' } },
  ]) {
    const response = await fetch(`${base}/api/runs`, { method: 'POST', ...input.options });
    results.httpBodyShapes.push({ input: input.name, status: response.status, body: await response.json() });
  }
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

results.sourceSerializationBoundaries = [];
for (const limit of [150_000, 1_200_000]) {
  const p = { kind: 'txt', inventory: { sourceTextChars: 1, physicalLines: 1 }, coverage: { complete: true }, text: '' };
  p.text = 'x';
  const fixed = profileSource(p).length - 1;
  p.text = 'x'.repeat(limit - fixed);
  const original = profileSource(p);
  const alternate = original.replace(`INVENTORY: ${JSON.stringify(p.inventory)}`, `INVENTORY: ${JSON.stringify(p.inventory, null, 2)}`);
  results.sourceSerializationBoundaries.push({ limit, originalLength: original.length, originalChunks: Math.ceil(Math.min(original.length, 1_200_000) / 150_000), originalTruncated: original.length > 1_200_000, alternateInventoryOnlyPrettyLength: alternate.length, alternateChunks: Math.ceil(Math.min(alternate.length, 1_200_000) / 150_000), alternateTruncated: alternate.length > 1_200_000 });
}

const invalidContext = { summary: 's', documentType: 'd', structure: [{ name: 'n', description: 'd', headers: [null, 5, { a: 1 }], uncertain: false, kind: 'invented', orientation: 'invented', range: 'not-a-source-range', page: 'not-a-page' }], warnings: [null, 5, { a: 1 }], questions: [] };
results.contextShapeCoercion = validateDocumentContext(invalidContext, { kind: 'txt', inventory: {} });

const doc = { id: 'probe-doc', name: 'probe.pdf', kind: 'pdf', role: 'target', mime: 'application/pdf', buffer: Buffer.from('%PDF-offline-probe') };
const fakeProfile = { kind: 'pdf', sha256: createHash('sha256').update(doc.buffer).digest('hex'), inventory: {}, coverage: {}, warnings: [] };
const fakeSandbox = { files: { write: async () => {}, read: async () => JSON.stringify(fakeProfile) }, commands: { run: async () => ({ exitCode: 0, stdout: '' }) } };
const analyzed = await analyzeDocumentInSandbox(doc, { config, sandboxRunner: async work => work(fakeSandbox), gemini: { generateJson: async () => { throw Error('unexpected model call'); } } });
results.missingProfileRequiredFields = { profile: fakeProfile, returnedAnalysis: analyzed.analysis, requiredDTORejection: false };
await writeFile(new URL('./core-probe-results.json', import.meta.url), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

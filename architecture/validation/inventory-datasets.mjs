// Read-only inventory. Deliberately never reads .env, uploads or cache files.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? '.'), output = path.resolve(process.argv[3] ?? '.cache/architecture-verification/dataset-inventory.json');
async function hash(file) { const h = createHash('sha256'); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest('hex'); }
async function walk(folder, prefix = '') {
  const entries = [];
  for (const item of await readdir(folder, { withFileTypes: true })) {
    if (item.name === '__pycache__') continue;
    const relative = [prefix, item.name].filter(Boolean).join('/'), full = path.join(folder, item.name);
    if (item.isDirectory()) entries.push(...await walk(full, relative));
    else if (item.isFile()) entries.push({ path: relative, bytes: (await stat(full)).size, sha256: await hash(full) });
    else throw new Error('symlinks or special files not allowed in dataset inventory');
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
const datasets = [];
for (const name of ['golden', 'ralph-golden-v3']) {
  const files = await walk(path.join(root, name));
  datasets.push({ name, files, fileCount: files.length, bytes: files.reduce((s, f) => s + f.bytes, 0) });
}
const truth = JSON.parse(await readFile(path.join(root, 'ralph-golden-v3/golden/canonical_answer.json'), 'utf8'));
const counts = { fields: truth.fields.length, reports: new Set(truth.fields.map(f => f.case_id)).size, writerCells: truth.writer_cells.length, verdicts: Object.fromEntries(['pass', 'fail', 'review'].map(v => [v, truth.fields.filter(f => f.verdict === v).length])) };
const report = { schemaVersion: '1.0', kind: 'dataset-inventory', executedAt: new Date().toISOString(), inputRoot: '.', readOnly: true, modelExecuted: false, independentlyHeldOut: false, datasets, v3: counts };
await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, datasets: datasets.map(({ name, fileCount, bytes }) => ({ name, fileCount, bytes })), v3: counts, modelExecuted: false }));

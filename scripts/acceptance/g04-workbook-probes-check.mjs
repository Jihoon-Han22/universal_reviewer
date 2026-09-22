/** Development execution of workbook probes; does not emit gate observations. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createWorkbookProbeCatalog } from './g04-workbook-probes.mjs';

if (process.version !== 'v24.13.1') throw new Error('PINNED_NODE_24_13_1_REQUIRED');
const root = process.cwd();
const output = process.argv[2];
if (!output || !output.startsWith('.cache/rebuild/')) throw new Error('OUTPUT_REQUIRED');
const directory = path.resolve(root, output);
await mkdir(directory, { recursive: false });
const selected = process.argv.slice(3);
const probes = await createWorkbookProbeCatalog(root), summary = [];
for (const probe of probes.values()) {
  if (selected.length ? !selected.includes(probe.id) : probe.id === 'workbook.pythonLimits') continue;
  await writeFile(path.join(directory, probe.id + '.plan.json'), JSON.stringify({ id: probe.id, inputs: probe.inputs, assertions: probe.assertions }, null, 2));
  try {
    const actual = await probe.run();
    await writeFile(path.join(directory, probe.id + '.actual.json'), JSON.stringify(actual, null, 2));
    const checks = probe.assertions.map(check => {
      const received = check.pointer.split('/').slice(1).reduce((node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], actual);
      return { ...check, received, pass: isDeepStrictEqual(received, check.expected) };
    });
    await writeFile(path.join(directory, probe.id + '.checks.json'), JSON.stringify(checks, null, 2));
    summary.push({ id: probe.id, pass: checks.every(check => check.pass), checks: checks.length, failed: checks.filter(check => !check.pass).map(check => check.name) });
  } catch (error) {
    const failure = { id: probe.id, pass: false, error: { message: error.message, stack: error.stack, execution: error.execution, artifactDirectory: error.artifactDirectory } };
    await writeFile(path.join(directory, probe.id + '.error.json'), JSON.stringify(failure, null, 2));
    summary.push(failure);
  }
}
await writeFile(path.join(directory, 'summary.json'), JSON.stringify({ developmentOnly: true, runtime: process.version, summary }, null, 2));
console.log(JSON.stringify(summary));
if (summary.some(row => !row.pass)) process.exitCode = 1;

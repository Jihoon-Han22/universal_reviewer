// Offline scaffold portability regression. This does not build or validate GSPEC.
// The only .env this tool reads is the fake sentinel it creates in its own cache.
import { readFile, writeFile, mkdir, readdir, cp, mkdtemp, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(packageRoot, '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = name => name.replaceAll('\\', '/');
const inside = (root, name) => {
  const part = relative(root, name);
  return part !== '' && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
};
if (process.argv.length !== 2) throw new Error('Usage: node architecture/tools/test-bootstrap.mjs');

const cacheParent = resolve(projectRoot, '.cache');
await mkdir(cacheParent, { recursive: true });
const workRoot = await mkdtemp(resolve(cacheParent, 'architecture-bootstrap-'));
assert(inside(cacheParent, workRoot));
const isolatedPackage = resolve(workRoot, 'portable-package/architecture');
await mkdir(resolve(isolatedPackage, 'tools'), { recursive: true });
await cp(resolve(packageRoot, 'tools/bootstrap.mjs'), resolve(isolatedPackage, 'tools/bootstrap.mjs'));
await cp(resolve(packageRoot, 'environment'), resolve(isolatedPackage, 'environment'), { recursive: true });
await cp(resolve(packageRoot, 'ui/fonts'), resolve(isolatedPackage, 'ui/fonts'), { recursive: true });

async function tree(directory, { timestamps = false } = {}) {
  const entries = [];
  async function visit(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = resolve(current, entry.name), path = portable(relative(directory, full));
      if (entry.isDirectory()) { entries.push({ path, kind: 'directory' }); await visit(full); }
      else if (entry.isFile()) {
        const bytes = await readFile(full);
        entries.push({ path, kind: 'file', bytes: bytes.length, sha256: sha256(bytes), ...(timestamps ? { mtimeMs: (await stat(full)).mtimeMs } : {}) });
      } else throw new Error('Special file is not allowed in this test: ' + path);
    }
  }
  await visit(directory);
  return entries;
}

const expectedMapping = [
  ['environment/root/package.json', 'package.json'],
  ['environment/root/package-lock.json', 'package-lock.json'],
  ['environment/integrations/package.json', 'integrations/package.json'],
  ['environment/integrations/package-lock.json', 'integrations/package-lock.json'],
  ['environment/templates/tsconfig.json', 'tsconfig.json'],
  ['environment/templates/vite.config.ts', 'vite.config.ts'],
  ['environment/templates/index.html', 'index.html'],
  ['environment/templates/scripts/dev.mjs', 'scripts/dev.mjs'],
  ['environment/templates/scripts/copy-pdfjs-assets.mjs', 'scripts/copy-pdfjs-assets.mjs'],
  ['environment/templates/scripts/build-dashboard-chart-runtime.mjs', 'scripts/build-dashboard-chart-runtime.mjs'],
  ['environment/assets/gspec.svg', 'public/gspec.svg'],
];
for (const name of (await readdir(resolve(isolatedPackage, 'ui/fonts'))).sort()) expectedMapping.push(['ui/fonts/' + name, 'public/fonts/' + name]);
const expectedDirectories = ['src/components', 'server/assets', 'integrations/src', 'integrations/scripts', 'integrations/test'];
const sentinels = new Map([
  ['.env', Buffer.from('GEMINI_API_KEY=FAKE_SENTINEL_DO_NOT_USE\nE2B_API_KEY=FAKE_SENTINEL_DO_NOT_USE\n')],
  ['golden/KEEP-sentinel.bin', Buffer.from([0, 255, 19, 70, 128, 10])],
  ['ralph-golden-v3/golden/native/KEEP-sentinel.txt', Buffer.from('Synthetic dataset sentinel. Do not replace.\n')],
]);
async function makeRoot(name) {
  const target = resolve(workRoot, name);
  assert(inside(workRoot, target));
  for (const [path, bytes] of sentinels) {
    await mkdir(dirname(resolve(target, path)), { recursive: true });
    await writeFile(resolve(target, path), bytes, { flag: 'wx' });
  }
  return target;
}
async function sentinelHashes(target) {
  return Promise.all([...sentinels].map(async ([path, expected]) => {
    const actual = await readFile(resolve(target, path));
    assert(actual.equals(expected), 'Changed fake environment or dataset: ' + path);
    return { path, bytes: actual.length, sha256: sha256(actual) };
  }));
}
function run(target, useDefaultRoot = false) {
  // No shell, npm, provider SDK, network, or parent NODE_OPTIONS are involved.
  const child = spawnSync(process.execPath, [resolve(isolatedPackage, 'tools/bootstrap.mjs'), ...(useDefaultRoot ? [] : [target])], {
    cwd: target,
    env: { SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT ?? '', TEMP: workRoot, TMP: workRoot },
    encoding: 'utf8', timeout: 20_000, maxBuffer: 1_000_000,
  });
  return { status: child.status, stdout: child.stdout ?? '', stderr: child.stderr ?? '', error: child.error?.code };
}

const tests = [];
async function check(id, description, fn) {
  try { const detail = await fn(); tests.push({ id, description, status: 'pass', ...detail }); }
  catch (error) { tests.push({ id, description, status: 'fail', error: String(error.message).slice(0, 1500) }); }
}
const successRoot = await makeRoot('clean-project');
const sentinelsBefore = await sentinelHashes(successRoot);
let firstOutput;
await check('BOOT-01', 'Copied package creates the complete scaffold without original application source.', async () => {
  const result = run(successRoot, true);
  assert.equal(result.status, 0, result.stderr || result.error);
  firstOutput = JSON.parse(result.stdout.trim());
  assert.equal(firstOutput.status, 'scaffold-only');
  assert.equal(firstOutput.created, expectedMapping.length);
  for (const [source, target] of expectedMapping) assert((await readFile(resolve(successRoot, target))).equals(await readFile(resolve(isolatedPackage, source))), 'Wrong output bytes: ' + target);
  for (const path of expectedDirectories) assert((await stat(resolve(successRoot, path))).isDirectory(), 'Missing directory: ' + path);
  const createdFiles = (await tree(successRoot)).filter(entry => entry.kind === 'file');
  assert.equal(createdFiles.length, expectedMapping.length + sentinels.size, 'Unexpected output files');
  return { filesCreated: expectedMapping.length, fontFiles: expectedMapping.filter(([name]) => name.startsWith('ui/fonts/')).length, applicationSourceSupplied: false };
});
await check('BOOT-02', 'Fake .env and both supplied dataset directories preserve exact bytes.', async () => {
  const after = await sentinelHashes(successRoot);
  assert.deepEqual(after, sentinelsBefore);
  return { sentinels: after };
});
await check('BOOT-03', 'Second execution is idempotent and does not rewrite existing files.', async () => {
  const before = await tree(successRoot, { timestamps: true });
  const result = run(successRoot);
  assert.equal(result.status, 0, result.stderr || result.error);
  assert.equal(JSON.parse(result.stdout.trim()).created, 0);
  assert.deepEqual(await tree(successRoot, { timestamps: true }), before);
  return { filesCreated: 0, contentAndModificationTimesUnchanged: true };
});
await check('BOOT-04', 'A different existing late target fails preflight without creating earlier files or directories.', async () => {
  const target = await makeRoot('conflicting-project');
  await mkdir(resolve(target, 'public/fonts'), { recursive: true });
  await writeFile(resolve(target, 'public/fonts/fonts.css'), '/* Existing user file: preserve exactly. */\n', { flag: 'wx' });
  const before = await tree(target, { timestamps: true });
  const result = run(target);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to overwrite different existing file: public\/fonts\/fonts\.css/);
  assert.deepEqual(await tree(target, { timestamps: true }), before);
  await sentinelHashes(target);
  return { collision: 'public/fonts/fonts.css', partialWrites: 0, scope: 'Existing-conflict preflight; not a crash/race transaction guarantee.' };
});

const copiedFiles = (await tree(isolatedPackage)).filter(entry => entry.kind === 'file');
const report = {
  schemaVersion: 1, testedAt: new Date().toISOString(), node: process.version,
  scope: 'Offline scaffold portability only. GSPEC implementation, provider integration, visual equivalence and product acceptance are not tested.',
  scaffoldExecuted: true, implementationExecuted: false, completeProductAcceptance: false,
  status: tests.every(test => test.status === 'pass') ? 'pass' : 'fail',
  checks: tests.length, passed: tests.filter(test => test.status === 'pass').length,
  command: 'node architecture/tools/test-bootstrap.mjs',
  isolatedWorkspace: portable(relative(projectRoot, workRoot)),
  dependencies: ['tools/bootstrap.mjs', 'environment/', 'ui/fonts/'],
  copiedInputFiles: copiedFiles.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
  testToolSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  tests,
  limits: ['No npm install or application build.', 'No real .env or original dataset contents read.', 'No provider or network calls.', 'Preflight conflicts only; filesystem interruption/concurrent writer behavior is not evaluated.'],
};
const output = resolve(packageRoot, 'evidence/bootstrap-portability.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, scope: 'scaffold-only', checks: report.checks, passed: report.passed, evidence: portable(relative(projectRoot, output)), isolatedWorkspace: report.isolatedWorkspace, implementationExecuted: false, completeProductAcceptance: false }));
if (report.status !== 'pass') process.exitCode = 1;

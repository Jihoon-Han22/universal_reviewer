// Synthetic package checks only; these never execute the product or change the real manifest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, unlink, access, rename, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { REQUIRED_FILES, verifyPackage } from '../tools/verify-package.mjs';

const cache = path.resolve('.cache/architecture-verification');
const source = await readFile(new URL('../tools/verify-package.mjs', import.meta.url));
await mkdir(cache, { recursive: true });
import { makePackage, seedCompleteness, updateReferenceFontHash } from './test-package-fixture.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJson = (file, value) => writeFile(file, JSON.stringify(value));
const csv = rows => rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
const traceHeader = ['module_id', 'module_name', 'layer', 'internal_steps', 'question_id', 'category', 'question', 'spec_files', 'dependencies', 'libraries', 'required_evidence', 'future_product_gates'];
const check = (root, args = []) => verifyPackage({ packageRoot: root, args });
const manifestPath = root => path.join(root, 'package-manifest.json');
async function expectFailure(root, fragment, args = []) {
  const result = await check(root, args);
  assert.equal(result.status, 'fail');
  assert.ok(result.errors.some(error => error.includes(fragment)), result.errors.join('\n'));
  assert.equal(result.implementationExecuted, false);
  assert.equal(result.completeProductAcceptance, false);
  return result;
}

test('valid synthetic package passes with explicit non-product scope and matching manifest', async () => {
  const root = await makePackage(), result = await check(root, ['--report']);
  assert.equal(result.status, 'pass', result.errors.join('\n'));
  assert.equal(result.moduleCount, 2);
  assert.equal(result.questionCount, 2);
  assert.equal(result.referenceCaptures, 1);
  assert.equal(result.implementationExecuted, false);
  assert.equal(result.completeProductAcceptance, false);
  assert.equal((await check(root)).status, 'pass', 'mutable report output must not invalidate the package');
});

test('unknown and duplicate CLI arguments fail without writing manifest or report', async () => {
  const root = await makePackage(), before = await readFile(manifestPath(root));
  const command = spawnSync(process.execPath, [path.join(root, 'tools/verify-package.mjs'), '--refresh-manifest', '--report', '--unexpected'], { encoding: 'utf8', windowsHide: true });
  assert.equal(command.status, 1, command.stderr);
  assert.match(JSON.parse(command.stdout).errors.join('\n'), /Unknown argument/);
  assert.deepEqual(await readFile(manifestPath(root)), before);
  await assert.rejects(access(path.join(root, 'evidence/package-validation.json')), { code: 'ENOENT' });
  await expectFailure(root, 'Duplicate arguments', ['--refresh-manifest', '--refresh-manifest']);
});

test('missing executable or contract stays failed even when removed from manifest', async () => {
  const root = await makePackage();
  const requiredValidation = REQUIRED_FILES.filter(name => name.startsWith('validation/'));
  for (const name of requiredValidation) {
    const filename = path.join(root, name), bytes = await readFile(filename), before = await readFile(manifestPath(root));
    await unlink(filename);
    const manifest = JSON.parse(before); manifest.files = manifest.files.filter(entry => entry.path !== name);
    await writeFile(manifestPath(root), JSON.stringify(manifest));
    await expectFailure(root, 'Missing required: ' + name);
    const alteredManifest = await readFile(manifestPath(root));
    await expectFailure(root, 'Missing required: ' + name, ['--refresh-manifest']);
    assert.deepEqual(await readFile(manifestPath(root)), alteredManifest, 'invalid package must never be blessed');
    await writeFile(filename, bytes); await writeFile(manifestPath(root), before);
  }
});

test('stale content, false byte sizes, duplicate entries and added files fail closed', async () => {
  const root = await makePackage(), manifestBytes = await readFile(manifestPath(root));
  const filename = path.join(root, 'README.md'), original = await readFile(filename);
  await writeFile(filename, Buffer.from(original).fill(120));
  await expectFailure(root, 'Package hash or size mismatch: README.md');
  await writeFile(filename, original);
  const wrongSize = JSON.parse(manifestBytes); wrongSize.files[0].bytes++;
  await writeFile(manifestPath(root), JSON.stringify(wrongSize));
  await expectFailure(root, 'Package hash or size mismatch');
  const duplicated = JSON.parse(manifestBytes); duplicated.files.push(duplicated.files[0]);
  await writeFile(manifestPath(root), JSON.stringify(duplicated));
  await expectFailure(root, 'Duplicate package manifest path');
  await writeFile(manifestPath(root), manifestBytes);
  await writeFile(path.join(root, 'unexpected.txt'), 'unmanifested');
  await expectFailure(root, 'Unmanifested files: unexpected.txt');
});

test('malformed JSON, version drift and font drift prevent refresh', async () => {
  const root = await makePackage(), before = await readFile(manifestPath(root));
  const versions = path.join(root, 'environment/versions.json'), original = await readFile(versions);
  await writeFile(versions, '{');
  await expectFailure(root, 'Invalid JSON', ['--refresh-manifest']);
  assert.deepEqual(await readFile(manifestPath(root)), before);
  await writeFile(versions, JSON.stringify({ packages: [] }));
  await expectFailure(root, 'Version mismatch', ['--refresh-manifest']);
  await writeFile(versions, original);
  await writeFile(path.join(root, 'ui/fonts/test.woff2'), 'changed-font');
  await expectFailure(root, 'Font hash or size mismatch', ['--refresh-manifest']);
  assert.deepEqual(await readFile(manifestPath(root)), before);
});

test('broken and escaped local links prevent refresh', async () => {
  const root = await makePackage(), before = await readFile(manifestPath(root));
  await writeFile(path.join(root, 'README.md'), '[missing](missing.md)\n[outside](../outside.md)\n');
  await expectFailure(root, 'Broken link', ['--refresh-manifest']);
  await expectFailure(root, 'Nonportable local link', ['--refresh-manifest']);
  assert.deepEqual(await readFile(manifestPath(root)), before);
});

test('malformed package and dependency objects fail without refreshing', async () => {
  const root = await makePackage(), before = await readFile(manifestPath(root));
  const file = path.join(root, 'environment/root/package.json');
  for (const malformed of [[], { dependencies: [] }, { devDependencies: 'invalid' }]) {
    await writeFile(file, JSON.stringify(malformed));
    await expectFailure(root, 'Invalid package metadata: root', ['--refresh-manifest']);
    assert.deepEqual(await readFile(manifestPath(root)), before);
  }
});

test('absolute font paths cannot make a nonportable package pass', async () => {
  const root = await makePackage(), before = await readFile(manifestPath(root));
  const absolute = path.join(root, 'ui/fonts/test.woff2').replaceAll('\\', '/');
  await writeFile(path.join(root, 'ui/fonts/fonts.css'), '@font-face { src: url("' + absolute + '"); }');
  await expectFailure(root, 'Missing or nonportable font asset', ['--refresh-manifest']);
  await writeFile(path.join(root, 'ui/fonts/fonts.css'), '@font-face { src: url("test.woff2"); }\n');
  const fontManifestFile = path.join(root, 'ui/fonts/manifest.json'), fontManifest = JSON.parse(await readFile(fontManifestFile));
  fontManifest.entries[0].path = absolute;
  await writeFile(fontManifestFile, JSON.stringify(fontManifest));
  await expectFailure(root, 'Font hash or size mismatch', ['--refresh-manifest']);
  assert.deepEqual(await readFile(manifestPath(root)), before);
});

test('font CSS and manifest accept a portable leading dot slash', async () => {
  const root = await makePackage();
  await writeFile(path.join(root, 'ui/fonts/fonts.css'), '@font-face { src: url("./test.woff2"); }\n');
  const fontManifestFile = path.join(root, 'ui/fonts/manifest.json'), fontManifest = JSON.parse(await readFile(fontManifestFile));
  fontManifest.entries[0].path = './test.woff2';
  await writeFile(fontManifestFile, JSON.stringify(fontManifest));
  await updateReferenceFontHash(root);
  const refreshed = await check(root, ['--refresh-manifest']);
  assert.equal(refreshed.status, 'pass', refreshed.errors.join('\n'));
  assert.equal((await check(root)).status, 'pass');
  await writeFile(path.join(root, 'ui/fonts/fonts.css'), '@font-face { src: url("./../fonts/test.woff2"); }\n');
  await expectFailure(root, 'Missing or nonportable font asset', ['--refresh-manifest']);
});

test('report output refuses a directory junction instead of writing through it', async () => {
  const root = await makePackage(), outside = await mkdtemp(path.join(cache, 'package-report-target-'));
  const target = path.join(outside, 'package-validation.json');
  await writeFile(target, 'synthetic outside sentinel');
  await rename(path.join(root, 'evidence'), path.join(root, 'saved-evidence'));
  await symlink(outside, path.join(root, 'evidence'), process.platform === 'win32' ? 'junction' : 'dir');
  await expectFailure(root, 'Cannot write package report: UNSAFE_REPORT_PATH', ['--report']);
  assert.equal(await readFile(target, 'utf8'), 'synthetic outside sentinel');
});

test('completeness files cannot be omitted from the required package', async () => {
  const root = await makePackage();
  const names = ['decomposition/README.md', 'decomposition/core-modules.json', 'decomposition/ui-modules.json', 'decomposition/core-tree.md', 'decomposition/ui-tree.md', 'specs/07-data-algorithms-concurrency.md', 'contracts/efficiency-inventory.json', 'ui/VISUAL-CONTRACT.md', 'ui/style-catalog.json', 'ui/component-style-map.json', 'ui/motion-catalog.json', 'tools/export-visual-contract.mjs', 'tools/build-traceability.mjs', 'tools/test-bootstrap.mjs', 'reviews/main-session/README.md', 'reviews/main-session/score.mjs', 'reviews/main-session/score.test.mjs'];
  for (const name of names) {
    assert.ok(REQUIRED_FILES.includes(name), 'required completeness file: ' + name);
    const filename = path.join(root, name), bytes = await readFile(filename), before = await readFile(manifestPath(root));
    await unlink(filename);
    await expectFailure(root, 'Missing required: ' + name, ['--refresh-manifest']);
    assert.deepEqual(await readFile(manifestPath(root)), before);
    await writeFile(filename, bytes);
  }
});

test('registry emptiness, duplicate IDs, broken dependencies and missing specs fail closed', async () => {
  const root = await makePackage(), before = await readFile(manifestPath(root));
  const coreFile = path.join(root, 'decomposition/core-modules.json'), uiFile = path.join(root, 'decomposition/ui-modules.json');
  const original = JSON.parse(await readFile(coreFile)), uiOriginal = JSON.parse(await readFile(uiFile));
  const mutations = [
    [registry => registry.modules = [], 'Invalid or empty module registry'],
    [registry => registry.modules[0] = null, 'Invalid module shape'],
    [registry => registry.modules.push(structuredClone(registry.modules[0])), 'Duplicate module ID'],
    [registry => registry.modules[0].acceptanceQuestions[0].id = ' ', 'Invalid acceptance question'],
    [registry => registry.modules[0].acceptanceQuestions = [], 'Invalid module shape'],
    [registry => registry.modules[0].dependencies = ['UNKNOWN'], 'Unknown module dependency'],
    [registry => registry.modules[0].dependencies = 'CORE-TEST', 'Invalid module shape'],
    [registry => registry.modules[0].specFiles = ['missing.md'], 'Missing or nonportable module spec'],
    [registry => registry.modules[0].specFiles = ['../outside.md'], 'Missing or nonportable module spec'],
  ];
  for (const [mutate, error] of mutations) {
    const registry = structuredClone(original); mutate(registry);
    await writeJson(coreFile, registry); await expectFailure(root, error, ['--refresh-manifest']);
    assert.deepEqual(await readFile(manifestPath(root)), before);
  }
  await writeJson(coreFile, original);
  const duplicatedQuestion = structuredClone(uiOriginal);
  duplicatedQuestion.modules[0].acceptanceQuestions[0].id = original.modules[0].acceptanceQuestions[0].id;
  await writeJson(uiFile, duplicatedQuestion);
  await expectFailure(root, 'Duplicate question ID', ['--refresh-manifest']);
});

test('traceability rejects missing, duplicate, reordered, stale and invalid-gate rows', async () => {
  const root = await makePackage(), before = await readFile(manifestPath(root)), file = path.join(root, 'traceability.csv');
  const original = await readFile(file, 'utf8'), header = original.slice(0, original.indexOf('\n') + 1);
  const lastRow = original.slice(original.lastIndexOf('\n', original.length - 2) + 1), firstRow = original.slice(header.length, -lastRow.length);
  const mutations = [
    [original.slice(0, -lastRow.length), 'Traceability question count mismatch'],
    [original + lastRow, 'Duplicate traceability question'],
    [header + lastRow + firstRow, 'Traceability registry mismatch'],
    [original.replace('remain exact?', 'silently change?'), 'Traceability registry mismatch'],
    [original.replace('"module_id"', '"wrong_header"'), 'Invalid traceability header'],
    [original.replace('"G00 G14"', '"G15 G14"'), 'Invalid traceability gates'],
    [original.replace('"G00 G14"', '"G00 G00 G14"'), 'Invalid traceability gates'],
    [original.replace('"G00 G14"', '"G00"'), 'Invalid traceability gates'],
    [original + '"unterminated', 'Malformed traceability CSV'],
  ];
  for (const [text, error] of mutations) {
    await writeFile(file, text); await expectFailure(root, error, ['--refresh-manifest']);
    assert.deepEqual(await readFile(manifestPath(root)), before);
  }
});

test('visual reference files, hashes, IDs and package boundaries are enforced', async () => {
  const root = await makePackage(), before = await readFile(manifestPath(root)), file = path.join(root, 'ui/reference/manifest.json');
  const original = JSON.parse(await readFile(file));
  const mutations = [
    [manifest => manifest.captures = [], 'Invalid or empty visual reference manifest'],
    [manifest => manifest.inputs = [], 'Invalid or empty visual reference manifest'],
    [manifest => manifest.captures.push(structuredClone(manifest.captures[0])), 'Invalid or duplicate visual capture ID'],
    [manifest => manifest.captures[0].screenshot.path = 'missing.png', 'Reference artifact hash, size or path mismatch'],
    [manifest => manifest.captures[0].dom.sha256 = '0'.repeat(64), 'Reference artifact hash, size or path mismatch'],
    [manifest => manifest.inputs[0].bytes++, 'Reference artifact hash, size or path mismatch'],
    [manifest => manifest.sourceSnapshot.path = '../../../outside.json', 'Reference artifact hash, size or path mismatch'],
    [manifest => delete manifest.fontManifest, 'Reference artifact hash, size or path mismatch'],
    [manifest => manifest.captures[0].measurement.id = 'stale-capture', 'Visual capture measurement mismatch'],
  ];
  for (const [mutate, error] of mutations) {
    const manifest = structuredClone(original); mutate(manifest);
    await writeJson(file, manifest); await expectFailure(root, error, ['--refresh-manifest']);
    assert.deepEqual(await readFile(manifestPath(root)), before);
  }
  await writeJson(file, original);
  await writeFile(path.join(root, 'ui/reference/capture-01.png'), 'changed screenshot');
  await expectFailure(root, 'Reference artifact hash, size or path mismatch: screenshot:', ['--refresh-manifest']);
});

test('empty visual catalogs and a stale component-map style hash cannot be refreshed', async () => {
  const root = await makePackage(), before = await readFile(manifestPath(root));
  for (const [name, data, error] of [
    ['style-catalog.json', { sources: [] }, 'Invalid or empty visual style catalog'],
    ['component-style-map.json', { components: [] }, 'Invalid, empty or stale component style map'],
    ['motion-catalog.json', { keyframes: [], rules: [] }, 'Invalid or empty motion catalog'],
  ]) {
    const file = path.join(root, 'ui', name), original = await readFile(file);
    await writeJson(file, data); await expectFailure(root, error, ['--refresh-manifest']);
    assert.deepEqual(await readFile(manifestPath(root)), before); await writeFile(file, original);
  }
  const styles = path.join(root, 'ui/style-catalog.json');
  await writeFile(styles, (await readFile(styles, 'utf8')) + '\n');
  await expectFailure(root, 'Invalid, empty or stale component style map', ['--refresh-manifest']);
});

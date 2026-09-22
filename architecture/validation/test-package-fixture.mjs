// Tiny synthetic package fixture: no application, provider, or original evidence.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { REQUIRED_FILES, verifyPackage } from '../tools/verify-package.mjs';
const source = await readFile(new URL('../tools/verify-package.mjs', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJson = (file, value) => writeFile(file, JSON.stringify(value));
const csv = rows => rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
const traceHeader = ['module_id', 'module_name', 'layer', 'internal_steps', 'question_id', 'category', 'question', 'spec_files', 'dependencies', 'libraries', 'required_evidence', 'future_product_gates'];
export async function seedCompleteness(root) {
  const core = { id: 'CORE-TEST', name: 'Core test', layer: 'core', stepIds: ['STEP-01'], specFiles: ['README.md'], dependencies: [], libraries: [{ name: 'Node.js', role: 'offline test' }], acceptanceQuestions: [{ id: 'CORE-TEST-Q1', category: 'behavior', question: 'Does "quoted", multiline\ncontent remain exact?', requiredEvidence: 'Synthetic evidence only' }] };
  const ui = { ...structuredClone(core), id: 'UI-TEST', name: 'UI test', layer: 'ui', dependencies: [core.id], acceptanceQuestions: [{ ...core.acceptanceQuestions[0], id: 'UI-TEST-Q1', question: 'Does the second module retain its row?' }] };
  await writeJson(path.join(root, 'decomposition/core-modules.json'), { schemaVersion: 1, modules: [core] });
  await writeJson(path.join(root, 'decomposition/ui-modules.json'), { schemaVersion: 1, modules: [ui] });
  await writeFile(path.join(root, 'traceability.csv'), csv([traceHeader, ...[core, ui].flatMap(module => module.acceptanceQuestions.map(question => [module.id, module.name, module.layer, module.stepIds.join(' '), question.id, question.category, question.question, module.specFiles.join(' | '), module.dependencies.join(' '), module.libraries.map(library => library.name + ': ' + library.role).join(' | '), question.requiredEvidence, 'G00 G14']))]));
  const styles = JSON.stringify({ schemaVersion: 1, sources: [{ id: 'css:synthetic' }] });
  await writeFile(path.join(root, 'ui/style-catalog.json'), styles);
  await writeJson(path.join(root, 'ui/component-style-map.json'), { components: [{ sourceId: 'module:synthetic' }], styleCatalogSha256: digest(styles) });
  await writeJson(path.join(root, 'ui/motion-catalog.json'), { keyframes: [{ name: 'synthetic' }], rules: [{ selector: ':root' }] });
  await mkdir(path.join(root, 'baseline'), { recursive: true });
  await mkdir(path.join(root, 'ui/reference/dom'), { recursive: true });
  await writeJson(path.join(root, 'baseline/source-snapshot.json'), { synthetic: true });
  await writeJson(path.join(root, 'ui/reference/synthetic-fixture.json'), { synthetic: true });
  await writeJson(path.join(root, 'ui/reference/measurements.json'), { captures: [{ id: 'capture-01' }] });
  await writeJson(path.join(root, 'ui/reference/dom/capture-01.json'), { synthetic: true });
  await writeFile(path.join(root, 'ui/reference/capture-01.png'), 'synthetic hash fixture, not rendered product evidence');
  const artifact = async name => { const bytes = await readFile(path.resolve(root, 'ui/reference', name)); return { path: name, bytes: bytes.length, sha256: digest(bytes) }; };
  await writeJson(path.join(root, 'ui/reference/manifest.json'), { schemaVersion: 1, inputs: [await artifact('synthetic-fixture.json')], measurements: await artifact('measurements.json'), sourceSnapshot: await artifact('../../baseline/source-snapshot.json'), fontManifest: await artifact('../fonts/manifest.json'), captures: [{ id: 'capture-01', screenshot: { ...await artifact('capture-01.png'), width: 2, height: 1, mode: 'viewport' }, dom: await artifact('dom/capture-01.json'), measurement: { path: 'measurements.json', id: 'capture-01' }, viewport: { width: 2, height: 1, dpr: 1 }, motion: 'off', settling: 'synthetic' }] });
}
export async function updateReferenceFontHash(root) {
  const manifestFile = path.join(root, 'ui/reference/manifest.json'), manifest = JSON.parse(await readFile(manifestFile));
  const bytes = await readFile(path.join(root, 'ui/fonts/manifest.json'));
  manifest.fontManifest.bytes = bytes.length; manifest.fontManifest.sha256 = digest(bytes);
  await writeJson(manifestFile, manifest);
}
export async function makePackage({ cache = path.resolve('.cache/architecture-verification'), root: requestedRoot } = {}) {
  await mkdir(cache, { recursive: true });
  const root = requestedRoot ?? await mkdtemp(path.join(cache, 'package-selftest-'));
  await mkdir(root, { recursive: true });
  for (const name of REQUIRED_FILES) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), name.endsWith('.json') ? '{}\n' : 'synthetic evaluator control\n');
  }
  await writeFile(path.join(root, 'tools/verify-package.mjs'), source);
  await writeFile(path.join(root, 'GOAL.md'), '/goal Synthetic evaluator control.\n');
  await writeFile(path.join(root, 'environment/versions.json'), JSON.stringify({ packages: ['root', 'integrations'].map(workspace => ({ workspace, name: 'test-package', declared: '1.0.0', locked: '1.0.0' })) }));
  for (const workspace of ['root', 'integrations']) {
    await writeFile(path.join(root, 'environment', workspace, 'package.json'), JSON.stringify({ dependencies: { 'test-package': '1.0.0' } }));
    await writeFile(path.join(root, 'environment', workspace, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/test-package': { version: '1.0.0' } } }));
  }
  const font = Buffer.from('synthetic-font-for-integrity-check');
  await writeFile(path.join(root, 'ui/fonts/test.woff2'), font);
  await writeFile(path.join(root, 'ui/fonts/fonts.css'), '@font-face { src: url("test.woff2"); }\n');
  await writeFile(path.join(root, 'ui/fonts/manifest.json'), JSON.stringify({ entries: [{ path: 'test.woff2', bytes: font.length, sha256: createHash('sha256').update(font).digest('hex') }] }));
  await seedCompleteness(root);
  const created = await verifyPackage({ packageRoot: root, args: ['--refresh-manifest'] });
  assert.equal(created.status, 'pass', created.errors.join('\n'));
  return root;
}

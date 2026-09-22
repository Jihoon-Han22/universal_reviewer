// Package integrity only. A successful check never establishes product acceptance.
import { readdir, readFile, writeFile, access, lstat } from 'node:fs/promises';
import { dirname, resolve, relative, extname, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, file) => { const rel = relative(root, file); return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const portablePath = (root, name) => typeof name === 'string' && !!name && !name.includes('\\') && !isAbsolute(name) && !/^[A-Za-z]:/.test(name) && inside(root, resolve(root, name)) && relative(root, resolve(root, name)).replaceAll('\\', '/') === name;
const portableFontPath = (root, name) => typeof name === 'string' && portablePath(root, name.replace(/^(?:\.\/)+/, ''));
const nonblank = value => typeof value === 'string' && !!value.trim();
const strings = value => Array.isArray(value) && value.every(nonblank);
const TRACE_HEADERS = ['module_id', 'module_name', 'layer', 'internal_steps', 'question_id', 'category', 'question', 'spec_files', 'dependencies', 'libraries', 'required_evidence', 'future_product_gates'];
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new Error('misplaced quote');
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (char !== ',') { rows.push(row); row = []; if (char === '\r' && text[i + 1] === '\n') i++; }
    } else {
      if (closed) throw new Error('characters after closing quote');
      cell += char;
    }
  }
  if (quoted) throw new Error('unterminated quote');
  if (row.length || cell || closed) { row.push(cell); rows.push(row); }
  return rows;
}
export const REQUIRED_FILES = [
  'README.md', 'DECISIONS.md', 'REPRODUCTION.md', 'PLAN.md', 'GOAL.md',
  'environment/README.md', 'environment/versions.json',
  'environment/root/package.json', 'environment/root/package-lock.json',
  'environment/integrations/package.json', 'environment/integrations/package-lock.json',
  'specs/01-state-api.md', 'specs/02-backend-pipeline.md', 'specs/03-algorithms.md',
  'specs/04-ui-motion.md', 'specs/05-dashboard-exports.md', 'specs/05a-ledger-export.md', 'specs/06-verification.md',
  'specs/07-data-algorithms-concurrency.md', 'contracts/efficiency-inventory.json',
  'decomposition/README.md', 'decomposition/core-modules.json', 'decomposition/ui-modules.json',
  'decomposition/core-tree.md', 'decomposition/ui-tree.md',
  'contracts/types.ts', 'validation/README.md',
  'validation/selftest.mjs', 'validation/fixture-generator.mjs', 'validation/harness.mjs',
  'validation/adapter-worker.mjs', 'validation/adapter-result.schema.json', 'validation/evidence.schema.json',
  'validation/evaluate-v3.mjs', 'validation/inventory-datasets.mjs', 'validation/dataset-inventory.json',
  'validation/dashboard-dom-validator.cjs', 'validation/acceptance.mjs', 'validation/acceptance-selftest.mjs', 'validation/run-gate.mjs',
  'validation/package-validator-selftest.mjs', 'tools/verify-package.mjs', 'tools/bootstrap.mjs',
  'validation/test-package-fixture.mjs', 'decomposition/source-trace.json',
  'specs/08-rebuild-coverage-geometry.md', 'contracts/rebuild-extensions.ts',
  'contracts/sample-recipes.json', 'ui/auxiliary-contract.md',
  'tools/export-visual-contract.mjs', 'tools/build-traceability.mjs', 'tools/test-bootstrap.mjs',
  'ui/tokens.json', 'ui/library-effects.csv', 'ui/reference/README.md', 'ui/reference/manifest.json',
  'ui/VISUAL-CONTRACT.md', 'ui/style-catalog.json', 'ui/component-style-map.json', 'ui/motion-catalog.json',
  'ui/fonts/fonts.css', 'ui/fonts/manifest.json', 'ui/fonts/dmsans-OFL.txt', 'ui/fonts/notosanskr-OFL.txt',
  'traceability.csv', 'reviews/README.md', 'evidence/README.md',
  'reviews/main-session/README.md', 'reviews/main-session/score.mjs', 'reviews/main-session/score.test.mjs',
  'reviews/current-reproduction/PROTOCOL.md', 'reviews/current-reproduction/audit.mjs',
  'reviews/independent-audit/score.mjs',
];

export async function verifyPackage({ packageRoot = DEFAULT_ROOT, args = [] } = {}) {
  const root = resolve(packageRoot), errors = [], warnings = [], files = [], contents = new Map(), json = new Map();
  let checkedLinks = 0, jsonFiles = 0, moduleCount = 0, questionCount = 0, referenceCaptures = 0, objective;
  const report = () => ({ schemaVersion: 1, checkedAt: new Date().toISOString(), scope: 'package integrity only, not product equivalence',
    implementationExecuted: false, completeProductAcceptance: false, files: files.length, jsonFiles, checkedLinks,
    requiredFiles: REQUIRED_FILES.length, moduleCount, questionCount, referenceCaptures, goalCharacters: objective?.length || 0, errors, warnings, status: errors.length ? 'fail' : 'pass' });
  for (const arg of args) if (!['--refresh-manifest', '--report'].includes(arg)) errors.push('Unknown argument: ' + arg);
  if (new Set(args).size !== args.length) errors.push('Duplicate arguments are not allowed');
  // Invalid CLI arguments cannot trigger either output write.
  if (errors.length) return report();
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['node_modules', '.git'].includes(entry.name)) continue;
      const file = resolve(directory, entry.name), rel = relative(root, file).replaceAll('\\', '/');
      if (/(^|\/)\.env(?:$|\.)/.test(rel)) { errors.push('Forbidden environment file: ' + rel); continue; }
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) files.push(file);
      else errors.push('Symlink or special file is not allowed: ' + rel);
    }
  }
  try { await walk(root); } catch (error) { errors.push('Cannot enumerate package: ' + error.code); }
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\', '/');
    try { contents.set(rel, await readFile(file)); } catch (error) { errors.push('Cannot read file ' + rel + ': ' + error.code); }
  }
  for (const name of REQUIRED_FILES) if (!contents.has(name)) errors.push('Missing required: ' + name);
  for (const [rel, bytes] of contents) {
    if (extname(rel) === '.json') {
      try { json.set(rel, JSON.parse(bytes.toString('utf8'))); jsonFiles++; }
      catch { errors.push('Invalid JSON: ' + rel); }
    }
    if (extname(rel) !== '.md') continue;
    const text = bytes.toString('utf8').replace(/\x60\x60\x60[\s\S]*?\x60\x60\x60/g, '');
    for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      let link = match[1].trim().replace(/^<|>$/g, '');
      if (/^(https?:|mailto:|#|codex:)/.test(link)) continue;
      link = link.split('#')[0]; if (!link) continue; checkedLinks++;
      try { link = decodeURIComponent(link); } catch { errors.push('Invalid encoded link ' + rel + ': ' + link); continue; }
      const destination = resolve(dirname(resolve(root, rel)), link);
      if (isAbsolute(link) || /^[A-Za-z]:/.test(link) || !inside(root, destination)) { errors.push('Nonportable local link ' + rel + ': ' + link); continue; }
      try { await access(destination); } catch { errors.push('Broken link ' + rel + ': ' + link); }
    }
  }
  const modules = [], moduleIds = new Set(), questionIds = new Set(), expectedRows = [];
  for (const layer of ['core', 'ui']) {
    const filename = 'decomposition/' + layer + '-modules.json', registry = json.get(filename);
    if (!record(registry) || registry.schemaVersion !== 1 || !Array.isArray(registry.modules) || !registry.modules.length) { errors.push('Invalid or empty module registry: ' + filename); continue; }
    for (const module of registry.modules) {
      moduleCount++;
      if (!record(module) || !nonblank(module.id) || !nonblank(module.name) || module.layer !== layer || !strings(module.stepIds) || !module.stepIds.length || !strings(module.specFiles) || !module.specFiles.length || !strings(module.dependencies) || !Array.isArray(module.libraries) || !module.libraries.every(library => record(library) && nonblank(library.name) && nonblank(library.role)) || !Array.isArray(module.acceptanceQuestions) || !module.acceptanceQuestions.length) {
        errors.push('Invalid module shape: ' + filename + ':' + (module?.id ?? 'unknown')); continue;
      }
      if (moduleIds.has(module.id)) errors.push('Duplicate module ID: ' + module.id);
      moduleIds.add(module.id); modules.push(module);
      for (const spec of module.specFiles) if (!portablePath(root, spec) || !contents.has(spec)) errors.push('Missing or nonportable module spec: ' + module.id + ':' + spec);
      for (const question of module.acceptanceQuestions) {
        if (!record(question) || !['id', 'category', 'question', 'requiredEvidence'].every(key => nonblank(question[key]))) { errors.push('Invalid acceptance question: ' + module.id); continue; }
        if (questionIds.has(question.id)) errors.push('Duplicate question ID: ' + question.id);
        questionIds.add(question.id);
        expectedRows.push([module.id, module.name, module.layer, module.stepIds.join(' '), question.id, question.category, question.question, module.specFiles.join(' | '), module.dependencies.join(' '), module.libraries.map(library => library.name + ': ' + library.role).join(' | '), question.requiredEvidence]);
      }
    }
  }
  questionCount = expectedRows.length;
  for (const module of modules) for (const dependency of module.dependencies) if (!moduleIds.has(dependency)) errors.push('Unknown module dependency: ' + module.id + ':' + dependency);
  try {
    const [header, ...rows] = parseCsv(contents.get('traceability.csv')?.toString('utf8') ?? '');
    if (JSON.stringify(header) !== JSON.stringify(TRACE_HEADERS)) errors.push('Invalid traceability header');
    if (rows.length !== expectedRows.length) errors.push('Traceability question count mismatch');
    const seen = new Set();
    for (const [index, row] of rows.entries()) {
      if (seen.has(row[4])) errors.push('Duplicate traceability question: ' + row[4]);
      seen.add(row[4]);
      if (row.length !== TRACE_HEADERS.length || JSON.stringify(row.slice(0, 11)) !== JSON.stringify(expectedRows[index])) errors.push('Traceability registry mismatch at row ' + (index + 2));
      const gates = row[11]?.split(' ') ?? [];
      if (!gates.length || gates.some(gate => !/^G(?:0[0-9]|1[0-4])$/.test(gate)) || new Set(gates).size !== gates.length || !gates.includes('G14')) errors.push('Invalid traceability gates at row ' + (index + 2));
    }
  } catch { errors.push('Malformed traceability CSV'); }
  const styleCatalog = json.get('ui/style-catalog.json'), componentMap = json.get('ui/component-style-map.json'), motionCatalog = json.get('ui/motion-catalog.json');
  if (!Array.isArray(styleCatalog?.sources) || !styleCatalog.sources.length || styleCatalog.sources.some(source => !nonblank(source?.id)) || new Set(styleCatalog.sources.map(source => source?.id)).size !== styleCatalog.sources.length) errors.push('Invalid or empty visual style catalog');
  if (!Array.isArray(componentMap?.components) || !componentMap.components.length || componentMap.styleCatalogSha256 !== sha256(contents.get('ui/style-catalog.json') ?? '')) errors.push('Invalid, empty or stale component style map');
  if (!Array.isArray(motionCatalog?.keyframes) || !motionCatalog.keyframes.length || !Array.isArray(motionCatalog.rules) || !motionCatalog.rules.length) errors.push('Invalid or empty motion catalog');
  const referenceRoot = resolve(root, 'ui/reference'), reference = json.get('ui/reference/manifest.json');
  function referencePath(name) {
    if (!nonblank(name) || name.includes('\\') || isAbsolute(name) || /^[A-Za-z]:/.test(name)) return null;
    const destination = resolve(referenceRoot, name);
    return inside(root, destination) ? relative(root, destination).replaceAll('\\', '/') : null;
  }
  function verifyReference(entry, label) {
    const name = referencePath(entry?.path), bytes = name ? contents.get(name) : undefined;
    if (!bytes || !Number.isSafeInteger(entry?.bytes) || entry.bytes < 0 || bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) errors.push('Reference artifact hash, size or path mismatch: ' + label);
    return name;
  }
  if (!record(reference) || !Array.isArray(reference.inputs) || !reference.inputs.length || !Array.isArray(reference.captures) || !reference.captures.length) errors.push('Invalid or empty visual reference manifest');
  else {
    for (const [index, input] of reference.inputs.entries()) verifyReference(input, 'input:' + index);
    for (const key of ['measurements', 'sourceSnapshot', 'fontManifest']) verifyReference(reference[key], key);
    const captures = new Set(), measurementPath = referencePath(reference.measurements?.path);
    referenceCaptures = reference.captures.length;
    for (const capture of reference.captures) {
      if (!nonblank(capture?.id) || captures.has(capture.id)) errors.push('Invalid or duplicate visual capture ID: ' + capture?.id);
      captures.add(capture?.id);
      verifyReference(capture?.screenshot, 'screenshot:' + capture?.id);
      verifyReference(capture?.dom, 'dom:' + capture?.id);
      if (!measurementPath || referencePath(capture?.measurement?.path) !== measurementPath || capture?.measurement?.id !== capture?.id) errors.push('Visual capture measurement mismatch: ' + capture?.id);
    }
  }
  const versions = json.get('environment/versions.json');
  const versionEntries = Array.isArray(versions?.packages) ? versions.packages : [];
  if (!Array.isArray(versions?.packages)) errors.push('Invalid version inventory: packages must be an array');
  for (const workspace of ['root', 'integrations']) {
    const pkg = json.get('environment/' + workspace + '/package.json'), lock = json.get('environment/' + workspace + '/package-lock.json');
    if (!record(pkg) || !record(lock?.packages) || ['dependencies', 'devDependencies'].some(key => pkg[key] !== undefined && !record(pkg[key]))) { errors.push('Invalid package metadata: ' + workspace); continue; }
    for (const [name, declared] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const matches = versionEntries.filter(entry => entry?.workspace === workspace && entry?.name === name);
      if (typeof declared !== 'string' || !declared || matches.length !== 1 || matches[0].declared !== declared || matches[0].locked !== lock.packages['node_modules/' + name]?.version) errors.push('Version mismatch ' + workspace + ': ' + name);
    }
  }
  const fontCss = contents.get('ui/fonts/fonts.css')?.toString('utf8') ?? '';
  for (const match of fontCss.matchAll(/url\(([^)]+)\)/g)) {
    const name = match[1].trim().replace(/^['"]|['"]$/g, ''), destination = resolve(root, 'ui/fonts', name);
    if (!portableFontPath(resolve(root, 'ui/fonts'), name) || !contents.has(relative(root, destination).replaceAll('\\', '/'))) errors.push('Missing or nonportable font asset: ' + name);
  }
  const fontManifest = json.get('ui/fonts/manifest.json');
  if (!Array.isArray(fontManifest?.entries) || !fontManifest.entries.length) errors.push('Invalid font manifest: entries must be nonempty');
  else for (const entry of fontManifest.entries) {
    const destination = typeof entry?.path === 'string' ? resolve(root, 'ui/fonts', entry.path) : root;
    const bytes = portableFontPath(resolve(root, 'ui/fonts'), entry?.path) ? contents.get(relative(root, destination).replaceAll('\\', '/')) : undefined;
    if (!bytes || sha256(bytes) !== entry.sha256 || bytes.length !== entry.bytes) errors.push('Font hash or size mismatch: ' + entry?.path);
  }
  objective = contents.get('GOAL.md')?.toString('utf8').match(/^\/goal .+$/m)?.[0];
  if (!objective || objective.length > 4000) errors.push('Goal missing or >4000 chars');
  // Evidence is mutable execution output, never used as its own integrity oracle.
  const manifestFiles = [...contents].filter(([name]) => name !== 'package-manifest.json' && !name.startsWith('evidence/'))
    .map(([name, bytes]) => ({ path: name, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path));
  if (!args.includes('--refresh-manifest')) {
    const manifest = json.get('package-manifest.json'), current = new Map(manifestFiles.map(entry => [entry.path, entry])), seen = new Set();
    if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) errors.push('Package manifest unavailable or invalid');
    else for (const entry of manifest.files) {
      const name = entry?.path;
      if (!portablePath(root, name)) { errors.push('Invalid package manifest path'); continue; }
      if (seen.has(name)) errors.push('Duplicate package manifest path: ' + name);
      seen.add(name);
      const actual = current.get(name);
      if (!actual || actual.sha256 !== entry.sha256 || actual.bytes !== entry.bytes) errors.push('Package hash or size mismatch: ' + name);
      current.delete(name);
    }
    if (manifest?.schemaVersion === 1 && Array.isArray(manifest.files) && manifest.files.length && current.size) errors.push('Unmanifested files: ' + [...current.keys()].join(', '));
  }
  // Refresh is authoring-only and must not bless an otherwise invalid package.
  if (args.includes('--refresh-manifest') && !errors.length) {
    try { await writeFile(resolve(root, 'package-manifest.json'), JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), files: manifestFiles }, null, 2) + '\n'); }
    catch (error) { errors.push('Cannot write package manifest: ' + error.code); }
  }
  if (args.includes('--report')) {
    try {
      const parent = await lstat(resolve(root, 'evidence'));
      if (!parent.isDirectory() || parent.isSymbolicLink()) throw Object.assign(new Error(), { code: 'UNSAFE_REPORT_PATH' });
      const outputPath = resolve(root, 'evidence/package-validation.json');
      let existing;
      try { existing = await lstat(outputPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw Object.assign(new Error(), { code: 'UNSAFE_REPORT_PATH' });
      await writeFile(outputPath, JSON.stringify(report(), null, 2) + '\n');
    }
    catch (error) { errors.push('Cannot write package report: ' + error.code); }
  }
  return report();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyPackage({ args: process.argv.slice(2) });
  console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'pass' ? 0 : 1;
}

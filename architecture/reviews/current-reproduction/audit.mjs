// Immutable design opinions; never awards product acceptance.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { scorePopulation } from '../independent-audit/score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arch = resolve(here, '../..'), project = resolve(arch, '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const write = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const normativeReviews = new Set([
  'reviews/current-reproduction/PROTOCOL.md', 'reviews/current-reproduction/audit.mjs',
  'reviews/current-reproduction/population-changes.json', 'reviews/independent-audit/population.json',
  'reviews/independent-audit/score.mjs', 'reviews/independent-audit/score.test.mjs',
]);
async function inventory(root, filter = () => true) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '__pycache__'].includes(entry.name)) continue;
      if (/^\.env(?:\.|$)/i.test(entry.name)) throw new Error('Secret path forbidden');
      const path = resolve(dir, entry.name), name = relative(root, path).replaceAll('\\', '/');
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        if (filter(name)) { const bytes = await readFile(path); files.push({ path: name, bytes: bytes.length, sha256: sha(bytes) }); }
      } else throw new Error('Special file forbidden: ' + name);
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
async function design() {
  return inventory(arch, name => name !== 'package-manifest.json' && !name.startsWith('evidence/') && (!name.startsWith('reviews/') || normativeReviews.has(name)));
}
async function source() {
  const files = [];
  for (const dir of ['src', 'server', 'integrations/src', 'integrations/test', 'integrations/scripts', 'scripts']) {
    for (const row of await inventory(resolve(project, dir), name => /\.(mjs|mts|js|jsx|ts|tsx|css|py|json)$/.test(name))) files.push({ ...row, path: dir + '/' + row.path });
  }
  for (const path of ['package.json', 'package-lock.json', 'integrations/package.json', 'integrations/package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'public/gspec.svg']) {
    const bytes = await readFile(resolve(project, path)); files.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
const registry = (await Promise.all(['core', 'ui'].map(kind => read(resolve(arch, `decomposition/${kind}-modules.json`))))).flatMap(r => r.modules);
const questions = registry.flatMap(m => m.acceptanceQuestions.map(q => ({ ...q, moduleId: m.id, moduleName: m.name, stepIds: m.stepIds })));
const original = (await read(resolve(here, '../independent-audit/population.json'))).questions;
const originalIds = new Map(original.map(q => [q.id, q]));
if (original.length !== 235 || originalIds.size !== 235) throw new Error('Original 235-question inventory corrupted');
for (const old of original) if (!questions.some(q => q.id === old.id && q.moduleId === old.moduleId)) throw new Error('Original question removed or reassigned: ' + old.id);
const changes = await read(resolve(here, 'population-changes.json'));
const modified = questions.filter(q => originalIds.has(q.id) && q.question !== originalIds.get(q.id).question);
const added = questions.filter(q => !originalIds.has(q.id));
if (changes.original !== 235 || changes.current !== questions.length || changes.removed?.length !== 0 || changes.modified?.length !== modified.length || changes.added?.length !== added.length) throw new Error('Population change accounting mismatch');
for (const q of modified) {
  const matches = changes.modified.filter(c => c.id === q.id);
  if (matches.length !== 1 || matches[0].before !== originalIds.get(q.id).question || matches[0].after !== q.question || !matches[0].reason?.trim()) throw new Error('Unexplained question change: ' + q.id);
}
for (const q of added) {
  const matches = changes.added.filter(c => c.id === q.id);
  if (matches.length !== 1 || matches[0].moduleId !== q.moduleId || matches[0].question !== q.question) throw new Error('Unrecorded added question: ' + q.id);
}
function assignedReviewer(role, moduleId) {
  if (role === 'clarity') return moduleId.startsWith('UI-') ? '/root/clarity_ui' : ['CORE-20', 'CORE-21'].includes(moduleId) ? '/root/clarity_verification' : '/root/clarity_core';
  if (role === 'accuracy') return ['CORE-20', 'CORE-21'].includes(moduleId) ? '/root/review_verification' : moduleId.startsWith('UI-') || ['CORE-14', 'CORE-16', 'CORE-17', 'CORE-18'].includes(moduleId) ? '/root/accuracy_ui_exports' : '/root/accuracy_core';
  throw new Error('Unknown review role');
}
const snapshotPath = resolve(here, 'current-inputs.json');
const mode = process.argv[2];
if (mode === 'freeze') {
  if (process.argv.length !== 3) throw new Error('freeze takes no arguments');
  const actual = await source(), baseline = (await read(resolve(arch, 'baseline/source-snapshot.json'))).files;
  if (JSON.stringify(actual) !== JSON.stringify(baseline)) throw new Error('Current source differs from baseline; review before changing target');
  const snapshot = { schemaVersion: 1, frozenAt: new Date().toISOString(), acceptanceProfile: 'CURRENT_REPRODUCTION', designFiles: await design(), sourceFiles: actual, questions };
  await write(snapshotPath, snapshot);
  const digest = sha(await readFile(snapshotPath));
  await write(resolve(here, 'population.json'), { schemaVersion: 1, evaluationSnapshot: 'architecture/reviews/current-reproduction/current-inputs.json', evaluatedInputsSha256: digest, originalQuestions: 235, questions });
  console.log(JSON.stringify({ status: 'frozen', sha256: digest, designFiles: snapshot.designFiles.length, sourceFiles: actual.length, questions: questions.length }));
} else if (mode === 'score' || mode === 'check') {
  const snapshot = await read(snapshotPath), digest = sha(await readFile(snapshotPath));
  if (JSON.stringify(snapshot.designFiles) !== JSON.stringify(await design())) throw new Error('Design changed since freeze');
  if (JSON.stringify(snapshot.questions) !== JSON.stringify(questions)) throw new Error('Questions changed since freeze');
  const population = await read(resolve(here, 'population.json'));
  if (population.evaluatedInputsSha256 !== digest || JSON.stringify(population.questions) !== JSON.stringify(questions)) throw new Error('Population/snapshot mismatch');
  const verifySource = process.argv.includes('--source');
  if (verifySource && JSON.stringify(snapshot.sourceFiles) !== JSON.stringify(await source())) throw new Error('Source changed since freeze');
  let refs;
  if (mode === 'score') {
    const paths = process.argv.slice(3);
    if (!paths.length || paths.some(p => p.startsWith('--'))) throw new Error('score requires review JSON paths');
    refs = [];
    for (const path of paths) {
      const full = resolve(path), name = relative(arch, full).replaceAll('\\', '/');
      if (!full.startsWith(here + sep) || name.includes('..')) throw new Error('Review must be inside current audit');
      refs.push({ path: name, sha256: sha(await readFile(full)) });
    }
  } else {
    if (process.argv.slice(3).some(x => x !== '--source') || process.argv.slice(3).length > 1) throw new Error('check accepts only --source');
    const seal = await read(resolve(here, 'evaluation-seal.json'));
    if (seal.evaluatedInputsSha256 !== digest || !Array.isArray(seal.reports) || !seal.reports.length) throw new Error('Invalid/stale seal');
    refs = seal.reports;
  }
  const reports = [];
  for (const ref of refs) {
    const path = resolve(arch, ref.path);
    if (!path.startsWith(here + sep) || ref.path.split(/[\\/]/).includes('..')) throw new Error('Unsafe review path');
    const bytes = await readFile(path);
    if (sha(bytes) !== ref.sha256) throw new Error('Review hash mismatch: ' + ref.path);
    const report = JSON.parse(bytes);
    if (!Array.isArray(report.questionResults) || !report.questionResults.length) throw new Error('Empty review');
    for (const opinion of report.questionResults) {
      if (report.reviewerId !== assignedReviewer(report.role, opinion.moduleId)) throw new Error('Unassigned or non-independent reviewer: ' + opinion.id);
    }
    reports.push(report);
  }
  const result = scorePopulation(questions, reports, { expectedSnapshotSha256: digest });
  if (mode === 'score') {
    await write(resolve(here, 'scores-final.json'), { ...result, scoredAt: new Date().toISOString(), evaluatedInputsSha256: digest });
    await write(resolve(here, 'evaluation-seal.json'), { schemaVersion: 1, evaluatedInputsSha256: digest, reports: refs });
  } else {
    const saved = await read(resolve(here, 'scores-final.json'));
    for (const key of Object.keys(result)) if (JSON.stringify(result[key]) !== JSON.stringify(saved[key])) throw new Error('Score recomputation mismatch: ' + key);
    if (saved.evaluatedInputsSha256 !== digest) throw new Error('Stale score snapshot');
  }
  console.log(JSON.stringify({ status: result.accepted ? 'pass' : 'fail', ...result.total, openIssueCount: result.openIssueCount, sourceFreshness: verifySource ? 'verified' : 'NOT_RUN', completeProductAcceptance: false }, null, 2));
  if (!result.accepted) process.exitCode = 1;
} else throw new Error('Usage: audit.mjs freeze | score REVIEW.json ... | check [--source]');

import { readFile, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
const base = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const project = resolve(base, '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const outside = path => path === '..' || path.startsWith('../') || path.startsWith('..\\') || isAbsolute(path);
function evidenceKey(path) {
  if (!nonempty(path) || path !== path.trim() || /[\u0000-\u001f]/.test(path)) throw new Error('Invalid evidence path: ' + path);
  const source = path.startsWith('source:');
  const name = source ? path.slice(7) : path;
  const parts = name.replaceAll('\\', '/').split('/');
  if (!name || isAbsolute(name) || win32.isAbsolute(name) || name.includes(':') || parts.includes('..') || parts.some(p => /^\.env(?:\.|$)/i.test(p))) throw new Error('Invalid evidence path: ' + path);
  const normalized = parts.filter(p => p && p !== '.').join('/');
  if (!normalized) throw new Error('Invalid evidence path: ' + path);
  return (source ? 'source:' : '') + normalized;
}
async function located(path) {
  const key = evidenceKey(path);
  const source = key.startsWith('source:');
  const root = source ? project : base;
  const resolved = resolve(root, source ? key.slice(7) : key);
  if (outside(relative(root, resolved))) throw new Error('Invalid evidence path: ' + path);
  const [actualRoot, actualFile] = await Promise.all([realpath(root), realpath(resolved)]);
  const rel = relative(actualRoot, actualFile);
  if (!rel || outside(rel) || rel.replaceAll('\\', '/').split('/').some(p => /^\.env(?:\.|$)/i.test(p))) throw new Error('Invalid evidence path: ' + path);
  return actualFile;
}
const registries = ['decomposition/ui-modules.json', 'decomposition/core-modules.json'];
const [command, ...paths] = process.argv.slice(2);
if (!['seal', 'score'].includes(command) || !paths.length) throw new Error('Usage: node score.mjs seal|score REVIEW.json [REVIEW.json...]');
const modules = [];
const questionIds = new Set();
for (const path of registries) {
  const inventory = await read(await located(path));
  if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.modules) || !inventory.modules.length) throw new Error('Empty/invalid module inventory: ' + path);
  for (const module of inventory.modules) {
    if (!module || !nonempty(module.id) || !nonempty(module.name) || !Array.isArray(module.specFiles) || !module.specFiles.length || !Array.isArray(module.acceptanceQuestions) || !module.acceptanceQuestions.length) throw new Error('Empty/invalid module inventory: ' + module?.id);
    const files = new Set();
    for (const path of module.specFiles) {
      const key = evidenceKey(path);
      if (key.startsWith('source:') || files.has(key)) throw new Error('Invalid/duplicate module specification: ' + path);
      files.add(key);
    }
    for (const question of module.acceptanceQuestions) {
      if (!question || !nonempty(question.id) || questionIds.has(question.id)) throw new Error('Empty/duplicate inventory question: ' + question?.id);
      questionIds.add(question.id);
    }
    modules.push(module);
  }
}
const byId = new Map(modules.map(m => [m.id, m]));
if (byId.size !== modules.length || !modules.length) throw new Error('Empty/duplicate module inventory');
const reports = [];
for (const path of paths) {
  const report = await read(resolve(path));
  if (!report || report.schemaVersion !== 1 || !['clarity', 'accuracy'].includes(report.role) || !nonempty(report.reviewerId) || !Number.isSafeInteger(report.round) || report.round < 1 || !Array.isArray(report.modules) || !report.modules.length || !Array.isArray(report.issues)) throw new Error('Invalid review schema: ' + path);
  const inputPaths = new Set(registries);
  const reportModules = new Set();
  for (const assessment of report.modules) {
    const module = byId.get(assessment?.moduleId);
    if (!module || reportModules.has(module.id)) throw new Error('Unknown/duplicate module: ' + assessment?.moduleId);
    reportModules.add(module.id);
    for (const p of module.specFiles) inputPaths.add(evidenceKey(p));
    const questions = new Set(module.acceptanceQuestions.map(q => q.id));
    if (!Array.isArray(assessment.checks) || assessment.checks.length !== questions.size) throw new Error('Incomplete question coverage: ' + module.id);
    for (const check of assessment.checks) {
      if (!check || !questions.delete(check.id) || !['pass', 'fail', 'unverified'].includes(check.status) || typeof check.reason !== 'string' || check.reason.trim().length < 8 || !Array.isArray(check.evidence) || !check.evidence.length) throw new Error('Invalid check: ' + check?.id);
      for (const evidence of check.evidence) {
        if (!evidence || !nonempty(evidence.section)) throw new Error('Missing evidence location');
        const key = evidenceKey(evidence.path);
        if (report.role === 'clarity' && key.startsWith('source:')) throw new Error('Clarity must stand on the package itself');
        inputPaths.add(key);
      }
      if (report.role === 'accuracy' && check.status === 'pass' && !check.evidence.some(e => e.path.startsWith('source:'))) throw new Error('Accuracy pass lacks source proof: ' + check.id);
    }
  }
  const issueIds = new Set();
  for (const issue of report.issues) {
    if (!issue || !nonempty(issue.id) || issueIds.has(issue.id) || !reportModules.has(issue.moduleId) || !['critical', 'high', 'medium', 'low'].includes(issue.severity) || !['open', 'resolved'].includes(issue.status) || !nonempty(issue.problem)) throw new Error('Invalid/duplicate/out-of-scope issue: ' + issue?.id);
    issueIds.add(issue.id);
  }
  reports.push({path, report, inputPaths});
}
const assessmentsSeen = new Set();
const issuesSeen = new Set();
for (const { report } of reports) {
  for (const module of report.modules) {
    const key = JSON.stringify([report.role, module.moduleId, report.round]);
    if (assessmentsSeen.has(key)) throw new Error('Conflicting same-round assessment: ' + key);
    assessmentsSeen.add(key);
  }
  for (const issue of report.issues) {
    const key = JSON.stringify([report.role, report.round, issue.id]);
    if (issuesSeen.has(key)) throw new Error('Duplicate issue across same-round reports: ' + key);
    issuesSeen.add(key);
  }
}
for (const {path, report, inputPaths} of reports) {
  if (command === 'seal') {
    // Preserve explicitly declared additional inputs instead of dropping evidence
    // history. A blind review cannot erase a source input by re-sealing itself.
    if (report.inputs !== undefined) {
      if (!Array.isArray(report.inputs)) throw new Error('Invalid review inputs: ' + path);
      const declared = new Set();
      for (const input of report.inputs) {
        const key = evidenceKey(input?.path);
        if (declared.has(key) || typeof input.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(input.sha256)) throw new Error('Invalid/duplicate review input: ' + key);
        if (report.role === 'clarity' && key.startsWith('source:')) throw new Error('Clarity must stand on the package itself');
        declared.add(key);
        inputPaths.add(key);
      }
    }
    report.inputs = await Promise.all([...inputPaths].sort().map(async path => ({path, sha256: sha(await readFile(await located(path)))})));
  } else {
    if (!Array.isArray(report.inputs) || !report.inputs.length) throw new Error('Missing review input hashes: ' + path);
    const inputs = new Map();
    for (const input of report.inputs) {
      const key = evidenceKey(input?.path);
      if (inputs.has(key) || typeof input.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(input.sha256)) throw new Error('Invalid/duplicate review input: ' + key);
      if (report.role === 'clarity' && key.startsWith('source:')) throw new Error('Clarity must stand on the package itself');
      if (input.sha256.toLowerCase() !== sha(await readFile(await located(key)))) throw new Error('Missing/stale review input: ' + key);
      inputs.set(key, input.sha256);
    }
    for (const p of inputPaths) if (!inputs.has(p)) throw new Error('Missing/stale review input: ' + p);
  }
}
if (command === 'seal') {
  // Validate the entire batch before changing any report.
  for (const {path, report} of reports) {
    await writeFile(resolve(path), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({sealed:path,role:report.role,modules:report.modules.length,inputs:report.inputs.length}));
  }
}
if (command === 'score') {
  const rows = modules.map(module => {
    const row = {moduleId:module.id,name:module.name,requiredChecks:module.acceptanceQuestions.length};
    for (const role of ['clarity','accuracy']) {
      const assessments = reports.map(r => r.report).filter(r => r.role === role && r.modules.some(m => m.moduleId === module.id)).sort((a,b) => b.round-a.round);
      const latest = assessments[0];
      const checks = latest?.modules.find(m => m.moduleId === module.id).checks ?? [];
      const passed = checks.filter(c => c.status === 'pass').length;
      row[role] = latest ? Math.floor(passed*100/row.requiredChecks) : null;
      row[role+'UnresolvedChecks'] = row.requiredChecks-passed;
      row[role+'Round'] = latest?.round ?? null;
      row[role+'OpenIssues'] = latest?.issues.filter(i => i.moduleId === module.id && i.status === 'open').length ?? 0;
    }
    row.accepted = row.clarity === 100 && row.accuracy === 100 && row.clarityOpenIssues === 0 && row.accuracyOpenIssues === 0;
    return row;
  });
  const result = {scope:'declared-module-questions-only',universalCorrectnessClaim:false,modules:rows,passed:rows.every(r=>r.accepted)};
  console.log(JSON.stringify(result,null,2));
  if (!result.passed) process.exitCode=1;
}

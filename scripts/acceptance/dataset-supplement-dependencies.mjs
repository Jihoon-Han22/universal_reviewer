import { lstat, readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ref, readRef, sha256 } from './shared.mjs';

const run = promisify(execFile);
const parsers = ['exceljs', 'jszip', 'mammoth', 'csv-parse/sync', 'saxes'];
const relative = (root, file) => path.relative(root, file).replaceAll('\\', '/');
const ordered = value => JSON.stringify(value);

// Walk only packages resolved from the five DocumentStore imports and their
// declared production dependencies. Nested node_modules are resolved separately.
export async function nodeParserIdentity(root, includeParsers) {
  const manifests = await Promise.all(['package.json', 'package-lock.json'].map(name => ref(root, name)));
  if (!includeParsers) return { manifests, imports: [], packages: [], fileCount: 0 };
  const requireDocument = createRequire(path.join(root, 'server/documents.mjs'));
  const imports = parsers.map(specifier => ({ specifier, resolved: relative(root, requireDocument.resolve(specifier)) }));
  const packages = new Map();
  async function locate(name, parent) {
    const resolver = createRequire(parent);
    for (const directory of resolver.resolve.paths(name + '/package.json') ?? []) {
      const file = path.join(directory, name, 'package.json');
      const relativeFile = path.relative(root, file);
      if (relativeFile.startsWith('..') || path.isAbsolute(relativeFile)) {
        try { await lstat(file); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        throw new Error(`PARSER_PACKAGE_OUTSIDE_WORKSPACE: ${name}`);
      }
      try { const entry = await ref(root, relative(root, file)); return { entry, json: JSON.parse(await readRef(root, entry)) }; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    throw Object.assign(new Error(`PARSER_PACKAGE_MISSING: ${name}`), { code: 'MODULE_NOT_FOUND' });
  }
  async function visit(name, parent) {
    const found = await locate(name, parent), absolute = path.join(root, found.entry.path), directory = path.dirname(absolute);
    if (packages.has(found.entry.path)) return found.entry.path;
    const record = { name: found.json.name, version: found.json.version, manifest: found.entry, files: [], dependencies: [] };
    packages.set(found.entry.path, record);
    async function walk(current) {
      for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
        if (['node_modules', '.git', '__pycache__'].includes(entry.name) || /^\.env(?:\.|$)/.test(entry.name)) continue;
        const file = path.join(current, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (entry.isFile()) record.files.push({ path: relative(root, file), sha256: sha256(await readFile(file)) });
        else throw new Error(`UNSUPPORTED_PARSER_PACKAGE_ENTRY: ${relative(root, file)}`);
      }
    }
    await walk(directory);
    for (const dependency of [...new Set([...Object.keys(found.json.dependencies ?? {}), ...Object.keys(found.json.optionalDependencies ?? {})])].sort()) {
      const optional = Object.hasOwn(found.json.optionalDependencies ?? {}, dependency);
      try { record.dependencies.push({ name: dependency, optional, manifestPath: await visit(dependency, absolute) }); }
      catch (error) { if (!optional || error.code !== 'MODULE_NOT_FOUND') throw error; record.dependencies.push({ name: dependency, optional: true, missing: true }); }
    }
    return found.entry.path;
  }
  for (const item of imports) {
    const name = item.specifier.startsWith('@') ? item.specifier.split('/').slice(0, 2).join('/') : item.specifier.split('/')[0];
    await visit(name, path.join(root, 'server/documents.mjs'));
  }
  const entries = [...packages.values()].sort((a, b) => a.manifest.path.localeCompare(b.manifest.path, 'en'));
  return { manifests, imports, packages: entries, fileCount: entries.reduce((total, entry) => total + entry.files.length, 0) };
}

export async function dependencyIdentity(root, kind) {
  const reader = kind === 'pre-execution-original-dataset-reader-supplement';
  const node = await nodeParserIdentity(root, reader);
  const { stdout } = await run(path.join(root, '.cache/rebuild/python/Scripts/python.exe'), ['-B', path.join(root, 'scripts/acceptance/dataset-supplement.py'), '--dependencies', reader ? 'readers' : 'workbook'], { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const python = JSON.parse(stdout);
  return { schemaVersion: '1.0', node, python, sha256: sha256(ordered({ node, python })) };
}

export async function verifyDependencyIdentity(root, kind, expected) {
  if (!expected?.sha256) throw new Error('FROZEN_DEPENDENCY_IDENTITY_REQUIRED');
  const current = await dependencyIdentity(root, kind);
  return { matched: ordered(current) === ordered(expected), beforeSha256: expected.sha256, afterSha256: current.sha256 };
}

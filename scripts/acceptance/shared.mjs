import { readFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const PROFILE = 'CURRENT_REPRODUCTION';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const HASH = /^[a-f0-9]{64}$/;
export const relative = (root, file) => path.relative(root, file).replaceAll('\\', '/');
export async function safeFile(root, name) {
  if (typeof name !== 'string' || !name || path.isAbsolute(name) || name.split(/[\\/]/).some(p => !p || p === '..' || p === '.' || /^\.env(?:\.|$)/.test(p))) throw new Error('UNSAFE_EVIDENCE_PATH');
  const absolute = path.resolve(root, name), rel = path.relative(path.resolve(root), absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('UNSAFE_EVIDENCE_PATH');
  let current = path.resolve(root);
  for (const [index, part] of rel.split(path.sep).entries()) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (index === rel.split(path.sep).length - 1 ? !stat.isFile() : !stat.isDirectory())) throw new Error('UNSAFE_EVIDENCE_PATH');
  }
  return absolute;
}
export async function ref(root, name) { return { path: name.replaceAll('\\', '/'), sha256: sha256(await readFile(await safeFile(root, name))) }; }
export async function readRef(root, entry) {
  if (!HASH.test(entry?.sha256 ?? '')) throw new Error('INVALID_EVIDENCE_HASH');
  const bytes = await readFile(await safeFile(root, entry.path));
  if (sha256(bytes) !== entry.sha256) throw new Error('STALE_EVIDENCE_HASH');
  return bytes;
}
export async function writeJson(root, name, value) {
  const absolute = path.resolve(root, name);
  if (!absolute.startsWith(path.resolve(root) + path.sep) || name.split(/[\\/]/).includes('..')) throw new Error('UNSAFE_OUTPUT_PATH');
  let current=path.resolve(root);
  for(const segment of path.relative(path.resolve(root),path.dirname(absolute)).split(path.sep).filter(Boolean)) {
    current=path.join(current,segment);
    try { await mkdir(current); } catch(error) { if(error.code!=='EEXIST')throw error; }
    const info=await lstat(current);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('UNSAFE_OUTPUT_PATH');
  }
  try { const info=await lstat(absolute);if(!info.isFile()||info.isSymbolicLink())throw new Error('UNSAFE_OUTPUT_PATH'); } catch(error) {if(error.code!=='ENOENT')throw error;}
  await writeFile(absolute, JSON.stringify(value, null, 2) + '\n');
  return ref(root, name);
}
export function jsonPointer(object, pointer) {
  if (pointer === '') return object;
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) throw new Error('INVALID_JSON_POINTER');
  return pointer.slice(1).split('/').reduce((value, key) => {
    key = key.replaceAll('~1', '/').replaceAll('~0', '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('MISSING_ACTUAL_VALUE');
    return value[key];
  }, object);
}
export function compare(actual, expected, operator = 'deepEqual') {
  if (operator === 'deepEqual') return isDeepStrictEqual(actual, expected);
  if (operator === 'finiteWithin') return typeof actual === 'number' && Number.isFinite(actual) && Array.isArray(expected) && expected.length === 2 && expected.every(Number.isFinite) && actual >= expected[0] && actual <= expected[1];
  if (operator === 'setEqual') return Array.isArray(actual) && Array.isArray(expected) && actual.length === new Set(actual).size && expected.length === new Set(expected).size && isDeepStrictEqual([...actual].sort(), [...expected].sort());
  throw new Error('UNSUPPORTED_ASSERTION_OPERATOR');
}
export function parseCsv(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(value); value = ''; }
    else if (c === '\n' && !quoted) { row.push(value.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; value = ''; }
    else value += c;
  }
  if (quoted) throw new Error('UNTERMINATED_CSV');
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const header = rows.shift();
  return rows.map(values => Object.fromEntries(header.map((key, i) => [key, values[i]])));
}

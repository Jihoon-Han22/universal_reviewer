// Focused implementation unit checks, not G05/G06 acceptance or live-provider evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { executeBuiltin } from './builtins.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const registry=JSON.parse(await readFile(new URL('./case-registry.json',import.meta.url),'utf8'));
const outputDirectory=`.cache/rebuild/verification-unit/${randomUUID()}`;
const selected=registry.cases.filter(c=>c.driver==='rule'||c.driver==='algorithm');
assert.equal(selected.length,32,'All 20 public rules and 12 CURRENT_REPRODUCTION baseline cases remain selected.');
for(const definition of selected)test(definition.id,async()=>{
  const result=await executeBuiltin(root,definition,{outputDirectory});
  assert.equal(result.state,'passed',JSON.stringify({errors:result.errors,assertions:result.assertions,message:result.message}));
});

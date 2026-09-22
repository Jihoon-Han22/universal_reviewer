import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('provider SDKs load without CommonJS require(ESM) support', () => {
  const result = spawnSync(process.execPath, ['--no-experimental-require-module', '--input-type=module', '-e', "const {Sandbox}=await import('e2b/dist/index.mjs'); const {GoogleGenAI}=await import('@google/genai'); if(typeof Sandbox.create!=='function'||typeof GoogleGenAI!=='function')process.exit(1)"], {encoding:'utf8', timeout:30000});
  assert.equal(result.status, 0, result.stderr);
});

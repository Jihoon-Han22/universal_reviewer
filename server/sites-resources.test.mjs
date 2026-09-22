import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createResourceLoader, readResourceText, readGoldenResource, ResourceUnavailableError } from './sites/resources.mjs';
import { loadGolden } from './golden-catalog.mjs';
import { loadSample } from './samples.mjs';

test('Sites resources use the explicit bundle and never read local files', () => {
  const source = 'print("문서 읽기")\n';
  const registry = Object.assign(Object.create({ 'golden/certs/P01.pdf': 'private' }), { 'server/reader.py': source });
  const resources = createResourceLoader(registry, () => assert.fail('Worker attempted a filesystem read'));
  assert.equal(resources.text('server/reader.py'), source);
  assert.throws(() => resources.bytes('golden/certs/P01.pdf'), { code: 'RESOURCE_UNAVAILABLE', status: 503 });
  assert.throws(() => resources.text('server/missing.py'), { code: 'RESOURCE_UNAVAILABLE' });
});

test('resource lookup rejects traversal before calling a supplied reader', () => {
  const resources = createResourceLoader(null, () => assert.fail('Unexpected file access'));
  for (const name of ['../private.txt', 'server/../../private.txt', '/private.txt', 'server\\private.txt', 'server/%2e%2e/private.txt']) {
    assert.throws(() => resources.text(name), TypeError);
  }
});

test('Node resource fallback retains the original dashboard and Python source bytes', () => {
  for (const name of ['assets/dashboard-design.schema.json', 'assets/dashboard.css', 'sandbox-document-reader.py', 'document-requery.py', 'criteria-workbook-profile.py']) {
    assert.equal(readResourceText(`server/${name}`), readFileSync(new URL(name, import.meta.url), 'utf8'));
  }
});

test('local fixture root and reader injection remain supported', async () => {
  const expected = Buffer.from('fixture');
  const actual = await readGoldenResource('certs/P01.pdf', {root: path.resolve('fixture-root'), read: async location => {
    assert.equal(location, path.resolve('fixture-root', 'certs', 'P01.pdf'));
    return expected;
  }});
  assert.equal(actual, expected);
});

test('excluded golden resources produce a public 503 and roll back the upload batch', async () => {
  for (const load of [documents => loadGolden(documents, { criterionId: 'C01', certificateIds: ['P01'] }, {read: () => { throw new ResourceUnavailableError(); }}), documents => loadSample(documents, 'materials', {read: () => { throw new ResourceUnavailableError(); }})]) {
    let rolledBack = false;
    await assert.rejects(load({rollback(added) { assert.deepEqual(added, []); rolledBack = true; }}), {name: 'DocumentError', status: 503});
    assert.equal(rolledBack, true);
  }
});

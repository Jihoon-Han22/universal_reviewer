import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SitesStorage, StorageConflictError } from './storage.mjs';

// Execute actual SQL against SQLite; the adapter supplies only D1's async shape.
function makeDatabase(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const db = {
    sqlite,
    largestBinding: 0,
    afterRun: null,
    withSession() { return db; },
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          for (const value of values) {
            const size = typeof value === 'string' ? Buffer.byteLength(value) : value?.byteLength ?? 0;
            db.largestBinding = Math.max(db.largestBinding, size);
          }
          return { ...statement, values };
        },
        async first(column) {
          await Promise.resolve();
          const row = sqlite.prepare(sql).get(...this.values) ?? null;
          return column && row ? row[column] : row;
        },
        async all() {
          await Promise.resolve();
          return { success: true, results: sqlite.prepare(sql).all(...this.values) };
        },
        async run() {
          await Promise.resolve();
          const result = sqlite.prepare(sql).run(...this.values);
          await db.afterRun?.(sql, result);
          return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
        },
      };
      return statement;
    },
    async exec(sql) { sqlite.exec(sql); return { count: 1, duration: 0 }; },
    async batch(statements) {
      await Promise.resolve();
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(statement => {
          const result = sqlite.prepare(statement.sql).run(...statement.values);
          return { success: true, meta: { changes: Number(result.changes) } };
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}

function makeBucket() {
  const objects = new Map();
  return {
    objects,
    failNextPut: false,
    afterPut: null,
    async put(key, value, options = {}) {
      if (this.failNextPut) { this.failNextPut = false; throw new Error('Simulated R2 upload failure'); }
      const bytes = Buffer.from(await new Response(value).arrayBuffer());
      objects.set(key, { bytes, options });
      await this.afterPut?.(key);
      return { key, size: bytes.length, etag: 'test-etag' };
    },
    async get(key) {
      const entry = objects.get(key);
      if (!entry) return null;
      return {
        key, size: entry.bytes.length, httpMetadata: entry.options.httpMetadata ?? {},
        body: new Response(entry.bytes).body,
        async arrayBuffer() { return Uint8Array.from(entry.bytes).buffer; },
        async text() { return entry.bytes.toString('utf8'); },
        async json() { return JSON.parse(entry.bytes.toString('utf8')); },
      };
    },
    async head(key) {
      const entry = objects.get(key);
      return entry ? { key, size: entry.bytes.length, httpMetadata: entry.options.httpMetadata ?? {} } : null;
    },
    async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key); },
  };
}

async function fixture(t) {
  const db = makeDatabase(t), bucket = makeBucket();
  let clock = Date.parse('2026-09-22T00:00:00.000Z');
  const options = { db, bucket, sessionId: 'session-alpha', now: () => clock };
  const storage = new SitesStorage(options);
  await storage.init();
  return { db, bucket, storage, options, advance(ms) { clock += ms; } };
}

function document(id, contents = 'Original document') {
  const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  return {
    id, name: `${id}.txt`, mime: 'text/plain', size: buffer.length,
    createdAt: '2026-09-22T00:00:00.000Z', buffer,
    source: buffer.toString('utf8'), preview: { type: 'text', text: 'Document preview' },
  };
}

function state(id, extras = {}) {
  return { id, status: 'queued', createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:00:00.000Z', ...extras };
}

const conflict = error => error instanceof StorageConflictError && error.status === 409;

test('document bytes and large source snapshots live in R2 and round-trip intact', async t => {
  const { storage, db, bucket } = await fixture(t);
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 31, 0x61);
  const input = document('large', bytes);
  input.modelParts = [
    { artifact: Buffer.from([0, 127, 128, 255]) },
    { artifact: new Uint8Array([255, 128, 127, 0]) },
  ];
  const saved = await storage.putDocument(input);
  assert.equal(saved.revision, 1);
  const loaded = await storage.getDocument('large');
  assert.equal(loaded.revision, 1);
  assert.equal(loaded.document.source, input.source);
  assert.deepEqual(Buffer.from(loaded.document.buffer), bytes);
  assert.deepEqual(loaded.document.preview, input.preview);
  assert.ok(Buffer.isBuffer(loaded.document.modelParts[0].artifact));
  assert.ok(Buffer.isBuffer(loaded.document.modelParts[1].artifact));
  assert.deepEqual(loaded.document.modelParts[0].artifact, Buffer.from([0, 127, 128, 255]));
  assert.deepEqual(loaded.document.modelParts[1].artifact, Buffer.from([255, 128, 127, 0]));
  assert.ok(db.largestBinding < 128 * 1024, 'D1 should receive metadata and pointers, not a large document');
  assert.ok([...bucket.objects.values()].some(entry => entry.bytes.length >= bytes.length));
  const content = await storage.getDocumentContent('large');
  assert.equal(content.name, input.name);
  assert.equal(content.mime, input.mime);
  assert.equal(content.size, bytes.length);
  assert.deepEqual(Buffer.from(await new Response(content.body).arrayBuffer()), bytes);
  const listed = await storage.listDocuments();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, 'large');
  assert.equal(listed[0].revision, 1);
  for (const privateField of ['buffer', 'source', 'preview']) assert.equal(privateField in listed[0], false);
});

test('a 20 MB document stores one original with small lossless analyzed snapshots', async t => {
  const { storage, bucket } = await fixture(t);
  const original = Buffer.alloc(20 * 1024 * 1024, 0x61);
  original.write('%PDF-');
  const inlineOriginal = original.toString('base64');
  const pageImage = Buffer.from('generated page image');
  const parts = [{ inlineData: { mimeType: 'application/pdf', data: inlineOriginal } }, {
    inlineData: { mimeType: 'image/png', data: pageImage.toString('base64') },
  }];
  const input = {
    id: 'large-pdf', name: 'large.pdf', kind: 'pdf', mime: 'application/pdf', role: 'target',
    size: original.length, buffer: original, source: 'Extracted PDF text', preview: { type: 'pdf' },
    modelParts: parts,
    sandboxAnalysisResult: { buffer: original, modelParts: parts, attachments: [pageImage] },
    sameBytesView: new Uint8Array(original.buffer, original.byteOffset, original.byteLength),
  };
  await storage.putDocument(input);
  const snapshots = [...bucket.objects.entries()].filter(([key]) => key.endsWith('.json'));
  assert.equal(snapshots.length, 1);
  assert.ok(snapshots[0][1].bytes.length < 20 * 1024, 'Original byte references must keep the analyzed JSON snapshot small');
  assert.equal([...bucket.objects.keys()].filter(key => key.endsWith('.bin')).length, 1);
  const { document: restored } = await storage.getDocument(input.id);
  assert.deepEqual(restored.buffer, original);
  assert.equal(restored.sandboxAnalysisResult.buffer, restored.buffer, 'Nested original references should share one Buffer');
  assert.equal(restored.sameBytesView, restored.buffer);
  assert.equal(restored.modelParts[0].inlineData.data, inlineOriginal);
  assert.equal(restored.sandboxAnalysisResult.modelParts[0].inlineData.data, restored.modelParts[0].inlineData.data);
  assert.equal(restored.modelParts[1].inlineData.data, pageImage.toString('base64'));
  assert.deepEqual(restored.sandboxAnalysisResult.attachments[0], pageImage);
  assert.equal(restored.source, input.source);
  assert.deepEqual(restored.preview, input.preview);
});

test('original-byte dedup preserves literal marker objects, field names, and unrelated text', async t => {
  const { storage } = await fixture(t);
  const original = Buffer.from('Original bytes');
  const input = {
    ...document('markers', original),
    source: original.toString('base64'),
    literalOriginalMarker: { __reviewOriginal: 1, documentId: 'markers', representation: 'bytes' },
    literalOriginalEscape: { __reviewOriginal: 0, value: { __reviewOriginal: 1, documentId: 'other', representation: 'base64' } },
    literalBinaryMarker: { __sitesStoredBinary: 1, base64: original.toString('base64') },
    literalBinaryEscape: { __sitesStoredBinary: 0, value: { __sitesStoredBinary: 1, base64: 'Zm9v' } },
    inlineData: { data: 'An unrelated text value', name: 'data' },
    differentBytes: Buffer.from('Different bytes'),
  };
  await storage.putDocument(input);
  const { document: restored } = await storage.getDocument(input.id);
  assert.deepEqual(restored, input);
});

test('document snapshots from before reference encoding still preserve literal user data', async t => {
  const { storage, bucket } = await fixture(t);
  const input = document('legacy', 'Previously uploaded bytes');
  await storage.putDocument(input);
  const row = await storage.row('document', input.id);
  const { buffer, ...legacy } = input;
  legacy.sourceMetadata = { __reviewOriginal: 1, documentId: 'different-document', representation: 'bytes' };
  // Version-zero snapshots were stored as the document object itself.
  await bucket.put(row.snapshot_key, JSON.stringify(legacy));
  const { document: restored } = await storage.getDocument(input.id);
  assert.deepEqual(restored, { ...legacy, buffer });
});

test('sessions cannot read, list, cancel, lease, or delete another session records', async t => {
  const { storage, options } = await fixture(t);
  const other = new SitesStorage({ ...options, sessionId: 'session-beta' });
  await other.init();
  await storage.putDocument(document('shared-id', 'Alpha bytes'));
  await storage.createState('run', 'shared-id', state('shared-id'));
  assert.equal(await other.getDocument('shared-id'), null);
  assert.equal(await other.getDocumentContent('shared-id'), null);
  assert.equal(await other.getState('run', 'shared-id'), null);
  assert.deepEqual(await other.listDocuments(), []);
  assert.deepEqual(await other.listStates('run'), []);
  assert.equal(await other.requestCancel('run', 'shared-id'), false);
  assert.equal(await other.acquireLease('run', 'shared-id'), null);
  assert.equal(await other.deleteDocument('shared-id', { expectedRevision: 1 }), false);
  await other.putDocument(document('shared-id', 'Beta bytes'));
  assert.equal((await storage.getDocument('shared-id')).document.source, 'Alpha bytes');
  assert.equal((await other.getDocument('shared-id')).document.source, 'Beta bytes');
});

test('ordered document references reject missing records instead of returning partial input', async t => {
  const { storage } = await fixture(t);
  await storage.putDocument(document('one'));
  await storage.putDocument(document('two'));
  const loaded = await storage.getDocuments(['two', 'one', 'two']);
  assert.deepEqual(loaded.map(item => item.document.id), ['two', 'one', 'two']);
  await assert.rejects(storage.getDocuments(['one', 'missing']));
  assert.deepEqual(await storage.getDocuments([]), []);
});

test('stale document updates and deletes cannot overwrite a newer revision', async t => {
  const { storage } = await fixture(t);
  await storage.putDocument(document('one', 'version one'));
  await assert.rejects(storage.putDocument(document('one', 'duplicate create')), conflict);
  assert.equal((await storage.putDocument(document('one', 'version two'), { expectedRevision: 1 })).revision, 2);
  await assert.rejects(storage.putDocument(document('one', 'stale'), { expectedRevision: 1 }), conflict);
  await assert.rejects(storage.deleteDocument('one', { expectedRevision: 1 }), conflict);
  assert.equal((await storage.getDocument('one')).document.source, 'version two');
  assert.equal(await storage.deleteDocument('one', { expectedRevision: 2 }), true);
  assert.equal(await storage.getDocument('one'), null);
});

test('an R2 upload failure preserves the previously committed document pointer', async t => {
  const { storage, bucket } = await fixture(t);
  await storage.putDocument(document('one', 'committed bytes'));
  bucket.failNextPut = true;
  await assert.rejects(storage.putDocument(document('one', 'failed update'), { expectedRevision: 1 }), /Simulated R2 upload failure/);
  const loaded = await storage.getDocument('one');
  assert.equal(loaded.revision, 1);
  assert.equal(loaded.document.source, 'committed bytes');
  assert.equal(Buffer.from(loaded.document.buffer).toString(), 'committed bytes');
});

test('state kinds remain independent and list only metadata, with optimistic revision checks', async t => {
  const { storage } = await fixture(t);
  for (const kind of ['run', 'dashboard', 'activity']) {
    await storage.createState(kind, 'same-id', state('same-id', { kind, snapshots: [{ body: 'private state contents' }] }));
  }
  await assert.rejects(storage.createState('run', 'same-id', state('same-id')), conflict);
  const current = await storage.getState('run', 'same-id');
  assert.equal(current.revision, 1);
  assert.equal(current.state.kind, 'run');
  assert.equal((await storage.putState('run', 'same-id', { ...current.state, status: 'completed' }, { expectedRevision: 1 })).revision, 2);
  await assert.rejects(storage.putState('run', 'same-id', current.state, { expectedRevision: 1 }), conflict);
  assert.equal((await storage.getState('dashboard', 'same-id')).state.status, 'queued');
  const listed = await storage.listStates('run');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, 'same-id');
  assert.equal(listed[0].status, 'completed');
  assert.equal(listed[0].revision, 2);
  assert.equal('snapshots' in listed[0], false);
  assert.equal('state' in listed[0], false);
});

test('wrapped run snapshots expose run metadata without exposing their snapshot envelope', async t => {
  const { storage } = await fixture(t);
  const run = state('wrapped', { status: 'running' });
  await storage.createState('run', 'wrapped', { version: 1, run, internalEvidence: ['private'] });
  const listed = await storage.listStates('run');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, 'wrapped');
  assert.equal(listed[0].status, 'running');
  assert.equal(listed[0].createdAt, run.createdAt);
  assert.equal('run' in listed[0], false);
  assert.equal('internalEvidence' in listed[0], false);
});

test('active leases reject unfenced writes and competing owners', async t => {
  const { storage } = await fixture(t);
  await storage.createState('run', 'one', state('one'));
  const lease = await storage.acquireLease('run', 'one', { owner: 'worker-one' });
  assert.equal(lease.owner, 'worker-one');
  assert.ok(Number.isFinite(lease.fence));
  assert.equal(await storage.acquireLease('run', 'one', { owner: 'worker-two' }), null);
  const current = await storage.getState('run', 'one');
  await assert.rejects(storage.putState('run', 'one', state('one'), { expectedRevision: current.revision }), conflict);
  await assert.rejects(storage.deleteState('run', 'one', { expectedRevision: current.revision }), conflict);
  const updated = await storage.putState('run', 'one', state('one', { status: 'running' }), { expectedRevision: current.revision, lease });
  assert.equal(updated.revision, current.revision + 1);
  assert.equal(await storage.releaseLease('run', 'one', { ...lease, owner: 'wrong-worker' }), false);
  assert.equal(await storage.releaseLease('run', 'one', lease), true);
});

test('an expired lease takeover fences the old owner despite a fresh revision', async t => {
  const { storage, advance } = await fixture(t);
  await storage.createState('run', 'one', state('one'));
  const oldLease = await storage.acquireLease('run', 'one', { owner: 'old-owner', ttlMs: 1000 });
  advance(1001);
  const newLease = await storage.acquireLease('run', 'one', { owner: 'new-owner', ttlMs: 1000 });
  assert.equal(newLease.owner, 'new-owner');
  assert.ok(newLease.fence > oldLease.fence);
  const current = await storage.getState('run', 'one');
  await assert.rejects(storage.putState('run', 'one', state('one', { status: 'completed' }), { expectedRevision: current.revision, lease: oldLease }), conflict);
  assert.equal(await storage.renewLease('run', 'one', oldLease), null);
  assert.equal(await storage.releaseLease('run', 'one', oldLease), false);
  advance(500);
  const renewed = await storage.renewLease('run', 'one', newLease, { ttlMs: 5000 });
  assert.equal(renewed.fence, newLease.fence);
  assert.ok(renewed.expiresAt > newLease.expiresAt);
  await storage.putState('run', 'one', state('one', { status: 'completed' }), { expectedRevision: current.revision, lease: renewed });
  assert.equal((await storage.getState('run', 'one')).state.status, 'completed');
});

test('cancellation survives saving the worker snapshot captured before cancellation', async t => {
  const { storage } = await fixture(t);
  await storage.createState('run', 'one', state('one'));
  const lease = await storage.acquireLease('run', 'one', { owner: 'worker' });
  const staleSnapshot = await storage.getState('run', 'one');
  assert.equal(await storage.isCancelRequested('run', 'one'), false);
  assert.equal(await storage.requestCancel('run', 'one'), true);
  const afterCancel = await storage.getState('run', 'one');
  await storage.putState('run', 'one', { ...staleSnapshot.state, status: 'running' }, { expectedRevision: afterCancel.revision, lease });
  assert.equal(await storage.isCancelRequested('run', 'one'), true);
  assert.equal((await storage.getState('run', 'one')).cancelRequested, true);
  assert.equal((await storage.listStates('run'))[0].cancelRequested, true);
});

test('an R2 failure cannot replace the committed state snapshot', async t => {
  const { storage, bucket } = await fixture(t);
  await storage.createState('run', 'one', state('one', { evidence: 'committed evidence' }));
  bucket.failNextPut = true;
  await assert.rejects(storage.putState('run', 'one', state('one', { evidence: 'uncommitted evidence' }), { expectedRevision: 1 }), /Simulated R2 upload failure/);
  const loaded = await storage.getState('run', 'one');
  assert.equal(loaded.revision, 1);
  assert.equal(loaded.state.evidence, 'committed evidence');
});

test('a lease expiring while R2 uploads cannot publish a worker snapshot', async t => {
  const { storage, bucket, advance } = await fixture(t);
  await storage.createState('run', 'one', state('one', { evidence: 'committed evidence' }));
  const lease = await storage.acquireLease('run', 'one', { owner: 'slow-worker', ttlMs: 1000 });
  const before = await storage.getState('run', 'one');
  bucket.afterPut = () => advance(1001);
  await assert.rejects(storage.putState('run', 'one', state('one', { evidence: 'expired worker evidence' }), { expectedRevision: before.revision, lease }), conflict);
  const after = await storage.getState('run', 'one');
  assert.equal(after.revision, before.revision);
  assert.equal(after.state.evidence, 'committed evidence');
});

test('an ambiguous D1 response after commit preserves the newly committed R2 snapshot', async t => {
  const { storage, db } = await fixture(t);
  await storage.createState('run', 'one', state('one', { evidence: 'initial evidence' }));
  db.afterRun = (sql, result) => {
    if (/UPDATE\s+review_objects/i.test(sql) && result.changes > 0) {
      db.afterRun = null;
      throw new Error('D1 response lost after commit');
    }
  };
  await assert.rejects(storage.putState('run', 'one', state('one', { evidence: 'committed despite lost response' }), { expectedRevision: 1 }), /D1 response lost after commit/);
  const loaded = await storage.getState('run', 'one');
  assert.equal(loaded.revision, 2);
  assert.equal(loaded.state.evidence, 'committed despite lost response');
});

test('concurrent state writers publish one revision and remove only the losing upload', async t => {
  const { storage, bucket } = await fixture(t);
  await storage.createState('run', 'one', state('one', { evidence: 'initial evidence' }));
  let uploads = 0, release;
  const bothUploaded = new Promise(resolve => { release = resolve; });
  bucket.afterPut = async () => {
    if (++uploads === 2) release();
    await bothUploaded;
  };
  const results = await Promise.allSettled([
    storage.putState('run', 'one', state('one', { evidence: 'writer A evidence' }), { expectedRevision: 1 }),
    storage.putState('run', 'one', state('one', { evidence: 'writer B evidence' }), { expectedRevision: 1 }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.ok(conflict(results.find(result => result.status === 'rejected').reason));
  const loaded = await storage.getState('run', 'one');
  assert.equal(loaded.revision, 2);
  const winningEvidence = results[0].status === 'fulfilled' ? 'writer A evidence' : 'writer B evidence';
  const losingEvidence = results[0].status === 'fulfilled' ? 'writer B evidence' : 'writer A evidence';
  assert.equal(loaded.state.evidence, winningEvidence);
  assert.ok([...bucket.objects.values()].some(entry => entry.bytes.toString().includes(winningEvidence)));
  assert.ok([...bucket.objects.values()].every(entry => !entry.bytes.toString().includes(losingEvidence)));
});

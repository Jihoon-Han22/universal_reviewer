import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { externalizeOriginals, restoreOriginals } from './engine-state.mjs';

// D1 contains small indexes and fencing tokens only. Document bytes and complete
// snapshots live in R2, so a review cannot exceed D1's per-row size limit.
export const SITES_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS review_objects (
    session_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    snapshot_key TEXT NOT NULL,
    content_key TEXT,
    metadata TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    lease_owner TEXT,
    lease_fence INTEGER NOT NULL DEFAULT 0,
    lease_expires_at INTEGER,
    cancel_requested INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, kind, id)
  )`,
  `CREATE INDEX IF NOT EXISTS review_objects_session_kind
    ON review_objects (session_id, kind, created_at)`,
];

export const LEASE_TTL_MS = 90_000;
const STATE_KINDS = new Set(['run', 'dashboard', 'activity']);
const MAX_DOCUMENT_BYTES = 250 * 1024 * 1024;
const MAX_METADATA_BYTES = 32 * 1024;

export class StorageConflictError extends Error {
  constructor(message = '저장된 작업이 변경되었습니다. 최신 상태에서 다시 시도해 주세요.') {
    super(message); this.name = 'StorageConflictError'; this.status = 409;
  }
}

export class StorageError extends Error {
  constructor(message, status = 503) { super(message); this.name = 'StorageError'; this.status = status; }
}

function identifier(value, label = 'id') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)) {
    throw new TypeError(`Invalid storage ${label}`);
  }
  return value;
}

function stateKind(kind) {
  if (!STATE_KINDS.has(kind)) throw new TypeError('Invalid storage state kind');
  return kind;
}

function revisionNumber(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('expectedRevision must be a non-negative integer');
  return revision;
}

function leaseDuration(ttlMs) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > LEASE_TTL_MS) {
    throw new TypeError(`Lease duration must be between 1 and ${LEASE_TTL_MS} milliseconds`);
  }
  return ttlMs;
}

function json(value) {
  const literals = new WeakSet();
  return JSON.stringify(value, function (key, entry) {
    // Inspect the original property because Buffer.toJSON runs first. Base64
    // avoids expanding binary artifacts into enormous JSON integer arrays.
    const original = this[key];
    if (ArrayBuffer.isView(original)) return { __sitesStoredBinary: 1, base64: Buffer.from(original.buffer, original.byteOffset, original.byteLength).toString('base64') };
    if (original instanceof ArrayBuffer) return { __sitesStoredBinary: 1, base64: Buffer.from(original).toString('base64') };
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && Object.hasOwn(entry, '__sitesStoredBinary') && !literals.has(entry)) {
      const literal = { ...entry };
      literals.add(literal);
      return { __sitesStoredBinary: 0, value: literal };
    }
    return entry;
  });
}

function parseJson(value) {
  const properties = entry => Object.fromEntries(Object.entries(entry).map(([key, child]) => [key, decode(child)]));
  const decode = entry => {
    if (!entry || typeof entry !== 'object') return entry;
    if (Array.isArray(entry)) return entry.map(decode);
    if (Object.keys(entry).length === 2 && entry.__sitesStoredBinary === 0 && entry.value && typeof entry.value === 'object' && !Array.isArray(entry.value)) return properties(entry.value);
    if (Object.keys(entry).length === 2 && entry.__sitesStoredBinary === 1 && typeof entry.base64 === 'string') return Buffer.from(entry.base64, 'base64');
    return properties(entry);
  };
  return decode(JSON.parse(value));
}

function compactMetadata(value, kind, id) {
  const fields = kind === 'document'
    ? ['name', 'kind', 'mime', 'size', 'role', 'url']
    : ['status', 'createdAt', 'updatedAt', 'runId', 'title', 'name'];
  const output = { id };
  const source = kind === 'run' && value?.run && typeof value.run === 'object' ? value.run : value;
  for (const key of fields) {
    const entry = source?.[key];
    if (typeof entry === 'string') output[key] = entry.slice(0, 2048);
    else if (typeof entry === 'number' && Number.isFinite(entry)) output[key] = entry;
  }
  const encoded = JSON.stringify(output);
  if (Buffer.byteLength(encoded) > MAX_METADATA_BYTES) throw new StorageError('저장할 문서 정보가 너무 큽니다.', 413);
  return encoded;
}

function leaseFrom(row) {
  return row.lease_owner ? {
    owner: row.lease_owner,
    fence: Number(row.lease_fence),
    expiresAt: Number(row.lease_expires_at),
  } : null;
}

function changes(result) { return Number(result?.meta?.changes ?? result?.changes ?? 0); }

/** Session-scoped durable repository. sessionId must come from a verified cookie. */
export class SitesStorage {
  constructor({ db, bucket, sessionId, now = Date.now, uuid = randomUUID } = {}) {
    if (!db?.prepare || !bucket?.put || !bucket?.get) throw new TypeError('D1 and R2 bindings are required');
    this.db = db.withSession ? db.withSession('first-primary') : db;
    this.bucket = bucket;
    this.sessionId = identifier(sessionId, 'session id');
    this.now = now;
    this.uuid = uuid;
  }

  async init() {
    await this.db.batch(SITES_SCHEMA.map(sql => this.db.prepare(sql)));
    return this;
  }

  statement(sql, ...values) { return this.db.prepare(sql).bind(...values); }

  async row(kind, id) {
    identifier(id);
    return this.statement('SELECT * FROM review_objects WHERE session_id = ? AND kind = ? AND id = ?', this.sessionId, kind, id).first();
  }

  key(kind, id, revision, suffix) {
    return `sessions/${encodeURIComponent(this.sessionId)}/${kind}/${encodeURIComponent(id)}/${revision}-${this.uuid()}.${suffix}`;
  }

  async readSnapshot(row) {
    const object = await this.bucket.get(row.snapshot_key);
    if (!object) throw new StorageError('저장된 작업을 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.');
    return parseJson(await object.text());
  }

  async discard(keys) {
    // Cleanup failures must never turn a committed write into an apparent
    // failure. Unreferenced immutable objects can be collected separately.
    for (const key of keys.filter(Boolean)) {
      try { await this.bucket.delete(key); } catch { /* best-effort orphan cleanup */ }
    }
  }

  fenceWhere(lease, timestamp) {
    if (!lease) return { sql: '(lease_owner IS NULL OR lease_expires_at <= ?)', values: [timestamp] };
    identifier(lease.owner, 'lease owner');
    if (!Number.isSafeInteger(lease.fence) || lease.fence < 1) throw new TypeError('Invalid lease fencing token');
    return {
      sql: '(lease_owner = ? AND lease_fence = ? AND lease_expires_at > ?)',
      values: [lease.owner, lease.fence, timestamp],
    };
  }

  async write(kind, id, value, { expectedRevision, lease, buffer, metadataValue = value } = {}) {
    identifier(id);
    revisionNumber(expectedRevision);
    if (expectedRevision === 0 && lease) throw new TypeError('A new object cannot already hold a lease');
    const nextRevision = expectedRevision + 1;
    const timestamp = this.now();
    const snapshotKey = this.key(kind, id, nextRevision, 'json');
    const contentKey = buffer ? this.key(kind, id, nextRevision, 'bin') : null;
    const metadata = compactMetadata(metadataValue, kind, id);
    const encoded = json(value);
    if (encoded === undefined) throw new TypeError('A snapshot must be JSON serializable');
    // Validate the token before uploading potentially large blobs.
    this.fenceWhere(lease, timestamp);
    const uploaded = [];
    let committed = false;
    try {
      if (contentKey) {
        await this.bucket.put(contentKey, buffer, { httpMetadata: { contentType: metadataValue.mime || 'application/octet-stream' } });
        uploaded.push(contentKey);
      }
      await this.bucket.put(snapshotKey, encoded, { httpMetadata: { contentType: 'application/json' } });
      uploaded.push(snapshotKey);
      let result;
      if (expectedRevision === 0) {
        result = await this.statement(`INSERT INTO review_objects
          (session_id, kind, id, revision, snapshot_key, content_key, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (session_id, kind, id) DO NOTHING`,
        this.sessionId, kind, id, nextRevision, snapshotKey, contentKey, metadata, timestamp, timestamp).run();
      } else {
        // Check the lease at commit time, after R2 uploads. A lease may expire
        // during a slow upload, so the timestamp cannot be the one above.
        const commitFence = this.fenceWhere(lease, this.now());
        result = await this.statement(`UPDATE review_objects SET revision = ?, snapshot_key = ?, content_key = ?, metadata = ?, updated_at = ?
          WHERE session_id = ? AND kind = ? AND id = ? AND revision = ? AND ${commitFence.sql}`,
        nextRevision, snapshotKey, contentKey, metadata, this.now(), this.sessionId, kind, id, expectedRevision, ...commitFence.values).run();
      }
      if (changes(result) !== 1) throw new StorageConflictError();
      committed = true;
      // Previous versions are intentionally retained: an in-flight reader may
      // already have their pointer. They are safe candidates for later GC.
      return { revision: nextRevision };
    } catch (error) {
      if (!committed && error instanceof StorageConflictError) await this.discard(uploaded);
      // A D1 transport failure may occur after its transaction commits. Keep
      // blobs for ambiguous failures so a committed pointer never dangles.
      throw error;
    }
  }

  async putDocument(document, { expectedRevision = 0 } = {}) {
    if (!document || typeof document !== 'object') throw new TypeError('Document is required');
    const { buffer: input, ...snapshot } = document;
    if (!(input instanceof Uint8Array) && !(input instanceof ArrayBuffer)) throw new TypeError('Document buffer is required');
    // Keep the existing immutable byte storage: copying a 20 MB input here
    // would consume memory without adding any isolation to the R2 write.
    const buffer = Buffer.isBuffer(input) ? input : input instanceof ArrayBuffer
      ? Buffer.from(input) : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    if (buffer.byteLength > MAX_DOCUMENT_BYTES) throw new StorageError('문서 저장 용량은 총 250MB까지입니다.', 413);
    snapshot.size = buffer.byteLength;
    const id = identifier(document.id);
    // Analyzer results contain the same original buffer and model inlineData
    // again. R2 already stores those bytes separately, so snapshots use lossless
    // references while preserving generated page images and other attachments.
    const storedSnapshot = { __sitesDocumentSnapshot: 1, document: externalizeOriginals(snapshot, { documentId: id, buffer }) };
    return this.write('document', id, storedSnapshot, { expectedRevision, buffer, metadataValue: snapshot });
  }

  async getDocument(id) {
    const row = await this.row('document', id);
    if (!row) return null;
    const snapshot = await this.readSnapshot(row);
    const content = row.content_key ? await this.bucket.get(row.content_key) : null;
    if (!content) throw new StorageError('저장된 원본 문서를 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.');
    const buffer = Buffer.from(await content.arrayBuffer());
    // The envelope distinguishes new references from literal marker-shaped
    // data in documents saved before original-byte deduplication was enabled.
    const referenced = snapshot?.__sitesDocumentSnapshot === 1 && Object.keys(snapshot).length === 2;
    if (referenced && (!snapshot.document || snapshot.document.id !== id)) throw new StorageError('저장된 문서 정보를 읽을 수 없습니다.');
    const document = referenced ? restoreOriginals(snapshot.document, { documentId: id, buffer }) : snapshot;
    document.buffer = buffer;
    return { document, revision: Number(row.revision) };
  }

  async getDocuments(ids) {
    if (!Array.isArray(ids)) throw new TypeError('Document ids must be an array');
    // Hydrate sequentially to avoid simultaneously buffering many 20 MB R2
    // response bodies inside the worker's memory limit.
    const documents = [];
    for (const id of ids) {
      const found = await this.getDocument(id);
      if (!found) throw new StorageError('문서를 찾을 수 없습니다. 파일을 다시 업로드해 주세요.', 404);
      documents.push(found);
    }
    return documents;
  }

  async getDocumentContent(id) {
    const row = await this.row('document', id);
    if (!row) return null;
    const object = row.content_key ? await this.bucket.get(row.content_key) : null;
    if (!object) throw new StorageError('저장된 원본 문서를 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.');
    const metadata = JSON.parse(row.metadata);
    return { body: object.body, mime: metadata.mime, name: metadata.name, size: metadata.size };
  }

  async list(kind) {
    const result = await this.statement(`SELECT id, metadata, revision, created_at, updated_at, cancel_requested,
      lease_owner, lease_fence, lease_expires_at FROM review_objects
      WHERE session_id = ? AND kind = ? ORDER BY created_at, id`, this.sessionId, kind).all();
    return (result.results ?? []).map(row => {
      const metadata = JSON.parse(row.metadata);
      return {
        ...metadata,
        id: row.id,
        revision: Number(row.revision),
        createdAt: metadata.createdAt ?? new Date(Number(row.created_at)).toISOString(),
        updatedAt: metadata.updatedAt ?? new Date(Number(row.updated_at)).toISOString(),
        ...(kind !== 'document' ? { cancelRequested: Boolean(row.cancel_requested), lease: leaseFrom(row) } : {}),
      };
    });
  }

  listDocuments() { return this.list('document'); }
  listStates(kind) { return this.list(stateKind(kind)); }

  async remove(kind, id, { expectedRevision, lease } = {}) {
    revisionNumber(expectedRevision);
    const row = await this.row(kind, id);
    if (!row) return false;
    const fence = this.fenceWhere(lease, this.now());
    const result = await this.statement(`DELETE FROM review_objects
      WHERE session_id = ? AND kind = ? AND id = ? AND revision = ? AND ${fence.sql}`,
    this.sessionId, kind, id, expectedRevision, ...fence.values).run();
    if (changes(result) !== 1) throw new StorageConflictError();
    await this.discard([row.snapshot_key, row.content_key]);
    return true;
  }

  deleteDocument(id, options) { return this.remove('document', id, options); }
  deleteState(kind, id, options) { return this.remove(stateKind(kind), id, options); }
  createState(kind, id, state) { return this.putState(kind, id, state, { expectedRevision: 0 }); }

  putState(kind, id, state, options) {
    return this.write(stateKind(kind), id, state, options);
  }

  async getState(kind, id) {
    const row = await this.row(stateKind(kind), id);
    if (!row) return null;
    return {
      state: await this.readSnapshot(row),
      revision: Number(row.revision),
      cancelRequested: Boolean(row.cancel_requested),
      lease: leaseFrom(row),
    };
  }

  async acquireLease(kind, id, { owner = this.uuid(), ttlMs = LEASE_TTL_MS } = {}) {
    stateKind(kind); identifier(id); identifier(owner, 'lease owner'); leaseDuration(ttlMs);
    const timestamp = this.now();
    const row = await this.statement(`UPDATE review_objects
      SET lease_owner = ?, lease_fence = lease_fence + 1, lease_expires_at = ?
      WHERE session_id = ? AND kind = ? AND id = ? AND (lease_owner IS NULL OR lease_expires_at <= ?)
      RETURNING lease_owner, lease_fence, lease_expires_at`,
    owner, timestamp + ttlMs, this.sessionId, kind, id, timestamp).first();
    return row ? leaseFrom(row) : null;
  }

  async renewLease(kind, id, lease, { ttlMs = LEASE_TTL_MS } = {}) {
    stateKind(kind); identifier(id); leaseDuration(ttlMs);
    if (!lease) throw new TypeError('A lease is required');
    const timestamp = this.now();
    const fence = this.fenceWhere(lease, timestamp);
    const row = await this.statement(`UPDATE review_objects SET lease_expires_at = ?
      WHERE session_id = ? AND kind = ? AND id = ? AND ${fence.sql}
      RETURNING lease_owner, lease_fence, lease_expires_at`,
    timestamp + ttlMs, this.sessionId, kind, id, ...fence.values).first();
    return row ? leaseFrom(row) : null;
  }

  async releaseLease(kind, id, lease) {
    stateKind(kind); identifier(id);
    if (!lease) throw new TypeError('A lease is required');
    const fence = this.fenceWhere(lease, this.now());
    const result = await this.statement(`UPDATE review_objects SET lease_owner = NULL, lease_expires_at = NULL
      WHERE session_id = ? AND kind = ? AND id = ? AND ${fence.sql}`,
    this.sessionId, kind, id, ...fence.values).run();
    return changes(result) === 1;
  }

  async requestCancel(kind, id) {
    const result = await this.statement(`UPDATE review_objects SET cancel_requested = 1
      WHERE session_id = ? AND kind = ? AND id = ?`, this.sessionId, stateKind(kind), identifier(id)).run();
    return changes(result) === 1;
  }

  async isCancelRequested(kind, id) {
    const row = await this.statement(`SELECT cancel_requested FROM review_objects
      WHERE session_id = ? AND kind = ? AND id = ?`, this.sessionId, stateKind(kind), identifier(id)).first();
    return Boolean(row?.cancel_requested);
  }
}

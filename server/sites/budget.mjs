// Persistent accounting for Sites/Workers. Never call the provider before reserve()
// succeeds; a failed or abandoned provider call must still settle its reservation.
// This policy is intentionally runtime-independent; tests keep it equal to the
// filesystem ledger policy, whose module imports Node filesystem APIs.
export const SITES_BUDGET_POLICY = Object.freeze({
  model: 'gemini-3.5-flash-lite',
  inputUsdPerMillion: 0.30,
  outputUsdPerMillion: 2.50,
  inputTokenMaximum: 1048576,
  outputTokenMaximum: 65536,
  conservativeKrwPerUsd: 3000,
  operatingLimitKrw: 40000,
  exclusiveUserLimitKrw: 50000,
  pricingVerifiedAt: '2026-09-21',
  pricingSource: 'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite',
  modelSource: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite',
});

export const SITES_BUDGET_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS provider_budget_ledger (
    ledger_key TEXT PRIMARY KEY,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    ledger_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // A separate receipt prevents silently reimporting an old seed if the active
  // ledger row is accidentally removed. Neither table is ever cleared here.
  `CREATE TABLE IF NOT EXISTS provider_budget_imports (
    ledger_key TEXT PRIMARY KEY,
    imported_at TEXT NOT NULL,
    seed_settled_krw REAL NOT NULL
  )`,
];

const policy = SITES_BUDGET_POLICY;
const fail = (code, message) => Object.assign(new Error(message), { code });
const nonnegative = value => Number.isFinite(value) && value >= 0;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const money = (input, output) => Math.ceil((input * policy.inputUsdPerMillion + output * policy.outputUsdPerMillion) * policy.conservativeKrwPerUsd / 1000000 * 100) / 100;
const reservationKrw = money(policy.inputTokenMaximum, policy.outputTokenMaximum);
const reserved = ledger => Object.values(ledger.reservations).reduce((sum, entry) => sum + entry.reservedKrw, 0);

function validLedger(ledger) {
  if (!ledger || ledger.schemaVersion !== 1 || !nonnegative(ledger.openingSpendKrw) || !nonnegative(ledger.settledKrw)
    || !ledger.reservations || Array.isArray(ledger.reservations) || typeof ledger.reservations !== 'object'
    || !Array.isArray(ledger.calls) || JSON.stringify(ledger.policy) !== JSON.stringify(policy)) return false;
  const ids = new Set();
  for (const [id, entry] of Object.entries(ledger.reservations)) {
    if (!uuid(id) || !entry || entry.id !== id || entry.model !== policy.model || entry.reservedKrw !== reservationKrw
      || !Number.isFinite(Date.parse(entry.reservedAt))) return false;
    ids.add(id);
  }
  let total = ledger.openingSpendKrw;
  for (const call of ledger.calls) {
    if (!call || !uuid(call.id) || ids.has(call.id) || call.model !== policy.model
      || !nonnegative(call.chargedUpperEstimateKrw) || call.chargedUpperEstimateKrw > reservationKrw
      || !['usage-upper-estimate', 'full-reservation-uncertain'].includes(call.accounting)) return false;
    ids.add(call.id);
    total += call.chargedUpperEstimateKrw;
  }
  return Number.isFinite(total) && Number.isFinite(reserved(ledger))
    && Math.round(total * 100) === Math.round(ledger.settledKrw * 100);
}

function parseLedger(value) {
  let ledger;
  try { ledger = typeof value === 'string' ? JSON.parse(value) : structuredClone(value); }
  catch { throw fail('BUDGET_INVALID', 'Cost ledger or pricing policy must be reviewed.'); }
  if (!validLedger(ledger)) throw fail('BUDGET_INVALID', 'Cost ledger or pricing policy must be reviewed.');
  return ledger;
}

async function parseSeed(value) {
  if (typeof value !== 'string' || !value.startsWith('gz:')) return parseLedger(value);
  try {
    // Environment values have a per-value size limit. Compression preserves the
    // entire original ledger, including all prior calls and pending spend.
    const bytes = Uint8Array.from(atob(value.slice(3)), character => character.charCodeAt(0));
    const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));
    return parseLedger(await new Response(stream).text());
  } catch {
    throw fail('BUDGET_INVALID', 'Compressed cost ledger or pricing policy must be reviewed.');
  }
}

/**
 * Import the complete previous ledger once via a deployment secret (seed).
 * Existing persistent state always wins over a subsequent seed. Reads and CAS
 * writes go through D1, so isolate eviction/redeployment does not reset spend.
 */
export function createSitesProviderBudget({ db, seed, enabled = false, ledgerKey = 'project' } = {}) {
  if (!db?.prepare || !db?.batch) throw fail('BUDGET_STORAGE_MISSING', 'Persistent provider budget storage is unavailable.');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(ledgerKey)) throw fail('BUDGET_INVALID', 'Invalid cost ledger key.');
  let initialization;
  const session = () => db.withSession ? db.withSession('first-primary') : db;
  const readRow = connection => connection.prepare('SELECT revision, ledger_json FROM provider_budget_ledger WHERE ledger_key = ?').bind(ledgerKey).first();

  function checkRow(row) {
    if (!row) throw fail('BUDGET_LEDGER_MISSING', 'Persistent cost ledger is missing. Restore its last recorded state before enabling calls.');
    if (!Number.isSafeInteger(row.revision) || row.revision < 0 || row.revision >= Number.MAX_SAFE_INTEGER) {
      throw fail('BUDGET_INVALID', 'Cost ledger revision must be reviewed.');
    }
    return { revision: row.revision, ledger: parseLedger(row.ledger_json) };
  }

  async function initialize() {
    const connection = session();
    await connection.batch(SITES_BUDGET_SCHEMA.map(sql => connection.prepare(sql)));
    const existing = await readRow(connection);
    if (existing) { checkRow(existing); return; }
    const imported = await connection.prepare('SELECT ledger_key FROM provider_budget_imports WHERE ledger_key = ?').bind(ledgerKey).first();
    if (imported) throw fail('BUDGET_LEDGER_MISSING', 'An imported cost ledger is missing. Restore its last recorded state; the seed cannot reset it.');
    if (seed === undefined || seed === null || seed === '') {
      throw fail('BUDGET_LEDGER_MISSING', 'The previous project cost ledger must be supplied before enabling calls.');
    }
    const ledger = await parseSeed(seed);
    const timestamp = new Date().toISOString();
    // D1 executes the batch transactionally. Two cold isolates cannot overwrite
    // one another, and a receipt and ledger are either both committed or neither.
    await connection.batch([
      connection.prepare(`INSERT OR IGNORE INTO provider_budget_ledger (ledger_key, revision, ledger_json, updated_at)
        SELECT ?, 0, ?, ? WHERE NOT EXISTS (SELECT 1 FROM provider_budget_imports WHERE ledger_key = ?)`)
        .bind(ledgerKey, JSON.stringify(ledger), timestamp, ledgerKey),
      connection.prepare(`INSERT OR IGNORE INTO provider_budget_imports (ledger_key, imported_at, seed_settled_krw)
        SELECT ledger_key, ?, ? FROM provider_budget_ledger WHERE ledger_key = ?`)
        .bind(timestamp, ledger.settledKrw, ledgerKey),
    ]);
    checkRow(await readRow(connection));
  }

  async function ensureInitialized() {
    initialization ??= initialize();
    await initialization;
  }

  async function read() {
    await ensureInitialized();
    return checkRow(await readRow(session()));
  }

  async function transact(work) {
    await ensureInitialized();
    for (let attempt = 0; attempt < 64; attempt++) {
      // A fresh primary session also prevents retrying against an old replica.
      const connection = session();
      const { revision, ledger } = checkRow(await readRow(connection));
      const result = work(ledger);
      const timestamp = new Date().toISOString();
      ledger.updatedAt = timestamp;
      const write = await connection.prepare(`UPDATE provider_budget_ledger
        SET ledger_json = ?, revision = revision + 1, updated_at = ?
        WHERE ledger_key = ? AND revision = ?`)
        .bind(JSON.stringify(ledger), timestamp, ledgerKey, revision).run();
      if (write.success !== false && write.meta?.changes === 1) return result;
      if (write.success === false || write.meta?.changes !== 0) {
        // A response failure might have followed a successful write. Do not
        // retry or undo an uncertain reservation and risk unrecorded spending.
        throw fail('BUDGET_STORAGE_UNCERTAIN', 'The cost reservation could not be confirmed. Review persistent accounting before retrying.');
      }
    }
    throw fail('BUDGET_LOCKED', 'Cost ledger is busy. Retry after the current requests finish.');
  }

  async function finish(token, usage) {
    const id = typeof token === 'string' ? token : token?.id;
    if (!uuid(id)) throw fail('BUDGET_RESERVATION_MISSING', 'Missing cost reservation.');
    return transact(ledger => {
      const entry = Object.hasOwn(ledger.reservations, id) ? ledger.reservations[id] : undefined;
      if (!entry) {
        if (ledger.calls.some(call => call.id === id)) return;
        throw fail('BUDGET_RESERVATION_MISSING', 'Missing cost reservation.');
      }
      const input = usage?.promptTokenCount;
      const candidates = usage?.candidatesTokenCount;
      const thoughts = usage?.thoughtsTokenCount ?? 0;
      const valid = [input, candidates, thoughts].every(value => Number.isSafeInteger(value) && value >= 0)
        && input <= policy.inputTokenMaximum && candidates + thoughts <= policy.outputTokenMaximum;
      const cost = valid ? money(input, candidates + thoughts) : entry.reservedKrw;
      ledger.settledKrw = Math.round((ledger.settledKrw + cost) * 100) / 100;
      ledger.calls.push({
        id, model: entry.model, reservedAt: entry.reservedAt, settledAt: new Date().toISOString(),
        accounting: valid ? 'usage-upper-estimate' : 'full-reservation-uncertain',
        chargedUpperEstimateKrw: cost,
        ...(valid ? { inputTokens: input, outputTokens: candidates + thoughts } : {}),
      });
      delete ledger.reservations[id];
      return { chargedUpperEstimateKrw: cost, cumulativeUpperEstimateKrw: ledger.settledKrw };
    });
  }

  return {
    async reserve(request = {}) {
      if (!enabled) throw fail('LIVE_CALLS_DISABLED', 'Live provider calls have not been enabled for this run.');
      const model = String(request.model ?? policy.model).replace(/^models\//, '');
      if (model !== policy.model) throw fail('BUDGET_MODEL_UNPRICED', 'The requested model does not have an approved price policy.');
      const tiers = [request.config?.serviceTier, request.serviceTier, request.config?.service_tier, request.service_tier];
      if (tiers.some(tier => tier !== undefined && tier !== 'standard')) throw fail('BUDGET_TIER_UNPRICED', 'Only standard provider pricing is authorized.');
      if (request.config?.tools?.length || request.tools?.length) throw fail('BUDGET_TOOLS_UNPRICED', 'Priced external tools are not enabled.');
      return transact(ledger => {
        if (ledger.settledKrw + reserved(ledger) + reservationKrw >= policy.operatingLimitKrw) {
          throw fail('BUDGET_LIMIT', 'The next call could exceed the conservative project cost limit.');
        }
        const id = crypto.randomUUID();
        const entry = { id, model, reservedKrw: reservationKrw, reservedAt: new Date().toISOString() };
        ledger.reservations[id] = entry;
        return { ...entry };
      });
    },
    settle: finish,
    // Rejections/aborts can still be billed, so never refund an uncertain call.
    release: token => finish(token, undefined),
    async snapshot() {
      const { ledger } = await read();
      const pendingKrw = reserved(ledger);
      return {
        policy: ledger.policy,
        settledUpperEstimateKrw: ledger.settledKrw,
        reservedKrw: pendingKrw,
        calls: ledger.calls.length,
        pending: Object.keys(ledger.reservations).length,
        remainingOperationalKrw: Math.max(0, policy.operatingLimitKrw - ledger.settledKrw - pendingKrw),
      };
    },
    // Server-side accounting backup/cutover support. This contains no credentials,
    // prompts or documents; callers still should not publish its call history.
    exportLedger: async () => (await read()).ledger,
  };
}

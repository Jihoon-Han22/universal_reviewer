import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { BUDGET_POLICY } from '../../scripts/provider-budget.mjs';
import { createSitesProviderBudget, SITES_BUDGET_POLICY } from './budget.mjs';

// Real SQLite executes the adapter's SQL. Only the asynchronous D1 binding is
// simulated; yielding before queries produces real stale-revision races.
function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const db = {
    conflicts: 0,
    sessions: [],
    failAfterWrite: false,
    sqlite,
    withSession(constraint) { db.sessions.push(constraint); return db; },
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { return { ...statement, values }; },
        async first() {
          await Promise.resolve();
          return sqlite.prepare(sql).get(...this.values) ?? null;
        },
        async run() {
          await Promise.resolve();
          const result = sqlite.prepare(sql).run(...this.values);
          if (/^UPDATE provider_budget_ledger/.test(sql)) {
            if (result.changes === 0) db.conflicts++;
            if (db.failAfterWrite && result.changes === 1) {
              db.failAfterWrite = false;
              throw new Error('Simulated response loss after committed write');
            }
          }
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
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

const seed = (openingSpendKrw = 0) => ({
  schemaVersion: 1,
  policy: BUDGET_POLICY,
  openingSpendKrw,
  settledKrw: openingSpendKrw,
  reservations: {},
  calls: [],
});
const create = (db, options = {}) => createSitesProviderBudget({ db, seed: seed(), enabled: true, ...options });
const usage = { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 20 };

test('worker policy matches the approved existing project policy exactly', () => {
  assert.deepEqual(SITES_BUDGET_POLICY, BUDGET_POLICY);
});

test('missing or invalid prior ledger fails closed without creating accounting state', async t => {
  const db = database(t);
  await assert.rejects(create(db, { seed: undefined }).snapshot(), { code: 'BUDGET_LEDGER_MISSING' });
  await assert.rejects(create(db, { seed: '{broken' }).reserve(), { code: 'BUDGET_INVALID' });
  const invalid = seed(100);
  invalid.settledKrw = 0;
  await assert.rejects(create(db, { seed: invalid }).reserve(), { code: 'BUDGET_INVALID' });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM provider_budget_ledger').get().n, 0);
});

test('imports prior settled and pending spend once and preserves state across instances', async t => {
  const db = database(t);
  const original = create(db, { seed: seed(2000) });
  const reservation = await original.reserve();
  await original.settle(reservation, usage);
  const pending = await original.reserve();
  const exported = await original.exportLedger();
  const importedDb = database(t);
  const imported = create(importedDb, { seed: JSON.stringify(exported) });
  assert.deepEqual(await imported.snapshot(), await original.snapshot());
  assert.deepEqual(await create(importedDb, { seed: seed(0) }).exportLedger(), exported);
  assert.deepEqual(await create(importedDb, { seed: undefined }).exportLedger(), exported);
  await imported.release(pending);
  const final = await create(importedDb, { seed: seed() }).snapshot();
  assert.equal(final.pending, 0);
  assert.equal(final.calls, 2);
  assert.equal(final.settledUpperEstimateKrw, Math.round((exported.settledKrw + pending.reservedKrw) * 100) / 100);
});

test('gzip seeds preserve complete prior accounting and malformed compressed seeds fail closed', async t => {
  const originalDb = database(t);
  const original = create(originalDb, { seed: seed(2000) });
  await original.settle(await original.reserve(), usage);
  await original.reserve();
  const ledger = await original.exportLedger();
  const compressed = `gz:${gzipSync(JSON.stringify(ledger)).toString('base64')}`;
  const importedDb = database(t);
  const imported = create(importedDb, { seed: compressed });
  assert.deepEqual(await imported.exportLedger(), ledger);
  assert.deepEqual(await imported.snapshot(), await original.snapshot());
  assert.deepEqual(await create(importedDb, { seed: 'gz:invalid' }).exportLedger(), ledger);
  const invalidDb = database(t);
  for (const invalid of ['gz:invalid', 'gz:%%%%', `gz:${gzipSync('{broken').toString('base64')}`]) {
    await assert.rejects(create(invalidDb, { seed: invalid }).snapshot(), { code: 'BUDGET_INVALID' });
  }
  assert.equal(invalidDb.sqlite.prepare('SELECT COUNT(*) AS n FROM provider_budget_ledger').get().n, 0);
});

test('concurrent cold imports and reservations do not overwrite spend or bypass the limit', async t => {
  const db = database(t);
  const guards = Array.from({ length: 12 }, () => create(db, { seed: seed(38500) }));
  const results = await Promise.allSettled(guards.map(guard => guard.reserve()));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(results.filter(result => result.status === 'rejected').every(result => result.reason.code === 'BUDGET_LIMIT'));
  const state = await create(db, { seed: undefined }).snapshot();
  assert.equal(state.settledUpperEstimateKrw, 38500);
  assert.equal(state.pending, 1);
  assert.ok(state.settledUpperEstimateKrw + state.reservedKrw < BUDGET_POLICY.operatingLimitKrw);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM provider_budget_imports').get().n, 1);
  assert.ok(db.conflicts > 0);
  assert.ok(db.sessions.every(value => value === 'first-primary'));
});

test('simultaneous reserve and settle operations reconcile once across independent isolates', async t => {
  const db = database(t);
  const guards = Array.from({ length: 10 }, () => create(db));
  const reservations = await Promise.all(guards.map(guard => guard.reserve()));
  assert.equal(new Set(reservations.map(entry => entry.id)).size, 10);
  assert.equal((await guards[0].snapshot()).pending, 10);
  await Promise.all(reservations.flatMap((reservation, index) => [
    guards[index].settle(reservation, usage),
    guards[(index + 1) % guards.length].settle(reservation, usage),
  ]));
  const state = await guards[0].snapshot();
  assert.equal(state.pending, 0);
  assert.equal(state.calls, 10);
  assert.equal(state.settledUpperEstimateKrw, 18);
  assert.ok(db.conflicts >= 10);
});

test('unknown usage, SDK rejection and abandoned reservations remain conservatively charged', async t => {
  const db = database(t);
  const guard = create(db);
  const uncertain = await guard.reserve();
  const invalidUsage = await guard.reserve();
  const abandoned = await guard.reserve();
  await guard.release(uncertain);
  await guard.settle(invalidUsage, { promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: -1 });
  await guard.settle(uncertain, { promptTokenCount: 0, candidatesTokenCount: 0 });
  const afterRestart = create(db, { seed: seed(0) });
  const state = await afterRestart.snapshot();
  assert.equal(state.settledUpperEstimateKrw, uncertain.reservedKrw * 2);
  assert.equal(state.reservedKrw, abandoned.reservedKrw);
  assert.equal(state.pending, 1);
  assert.ok((await afterRestart.exportLedger()).calls.every(call => call.accounting === 'full-reservation-uncertain'));
});

test('uncertain database response never removes a reservation that was committed', async t => {
  const db = database(t);
  const guard = create(db);
  await guard.snapshot();
  db.failAfterWrite = true;
  await assert.rejects(guard.reserve(), /response loss/);
  assert.equal((await create(db, { seed: undefined }).snapshot()).pending, 1);
});

test('deleted or corrupted persistent ledger is never reset from the seed', async t => {
  const db = database(t);
  const guard = create(db, { seed: seed(2000) });
  await guard.reserve();
  db.sqlite.prepare('DELETE FROM provider_budget_ledger').run();
  await assert.rejects(guard.reserve(), { code: 'BUDGET_LEDGER_MISSING' });
  await assert.rejects(create(db).reserve(), { code: 'BUDGET_LEDGER_MISSING' });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM provider_budget_ledger').get().n, 0);

  const corruptDb = database(t);
  await create(corruptDb).snapshot();
  corruptDb.sqlite.prepare('UPDATE provider_budget_ledger SET ledger_json = ?').run('{broken');
  await assert.rejects(create(corruptDb).reserve(), { code: 'BUDGET_INVALID' });
});

test('live calls, model, service tier, paid tools and forged reservation ids are guarded', async t => {
  const db = database(t);
  await assert.rejects(create(db, { enabled: false }).reserve(), { code: 'LIVE_CALLS_DISABLED' });
  const guard = create(db);
  await assert.rejects(guard.reserve({ model: 'unapproved' }), { code: 'BUDGET_MODEL_UNPRICED' });
  await assert.rejects(guard.reserve({ config: { serviceTier: 'priority' } }), { code: 'BUDGET_TIER_UNPRICED' });
  await assert.rejects(guard.reserve({ tools: [{}] }), { code: 'BUDGET_TOOLS_UNPRICED' });
  await assert.rejects(guard.release('__proto__'), { code: 'BUDGET_RESERVATION_MISSING' });
  await assert.rejects(guard.settle(crypto.randomUUID(), usage), { code: 'BUDGET_RESERVATION_MISSING' });
  const valid = await guard.reserve({ model: `models/${BUDGET_POLICY.model}`, serviceTier: 'standard' });
  assert.equal(valid.model, BUDGET_POLICY.model);
});

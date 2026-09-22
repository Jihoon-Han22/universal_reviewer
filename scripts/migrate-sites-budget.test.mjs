import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createProviderBudget } from './provider-budget.mjs';
import { migrateSitesBudget, readSitesMigrationSeed } from './migrate-sites-budget.mjs';

const projectId = 'sites-test-project';
const usage = { promptTokenCount: 1000, candidatesTokenCount: 100 };

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sites-budget-migration-'));
  const budget = createProviderBudget({ directory, enabled: true, openingSpendKrw: 2500, allowInitialize: true });
  await budget.snapshot();
  return { directory, budget };
}

test('cutover preserves ledger bytes and gates existing and new local budget instances', async () => {
  const { directory, budget } = await fixture();
  const reservation = await budget.reserve();
  await budget.settle(reservation, usage);
  const ledgerPath = path.join(directory, 'ledger.json');
  const before = await fs.readFile(ledgerPath, 'utf8');
  const migration = await migrateSitesBudget({ directory, projectId });
  assert.equal(await fs.readFile(ledgerPath, 'utf8'), before);
  assert.deepEqual(JSON.parse(migration.seed), JSON.parse(before));
  assert.equal(migration.marker.pending, 0);
  assert.equal(migration.marker.project_id, projectId);
  await assert.rejects(budget.reserve(), { code: 'BUDGET_MIGRATED' });
  const restarted = createProviderBudget({ directory, enabled: true });
  await assert.rejects(restarted.reserve(), { code: 'BUDGET_MIGRATED' });
  const snapshot = await restarted.snapshot();
  assert.equal(snapshot.settledUpperEstimateKrw, migration.marker.settledUpperEstimateKrw);
  await restarted.settle(reservation, usage);
  assert.equal((await restarted.snapshot()).settledUpperEstimateKrw, snapshot.settledUpperEstimateKrw);
  assert.deepEqual((await readSitesMigrationSeed({ directory, projectId })).ledger.calls, JSON.parse(before).calls);
});

test('pending reservations refuse migration without changing the ledger or creating a marker', async () => {
  const { directory, budget } = await fixture();
  const reservation = await budget.reserve();
  const before = await fs.readFile(path.join(directory, 'ledger.json'), 'utf8');
  await assert.rejects(migrateSitesBudget({ directory, projectId }), { code: 'BUDGET_MIGRATION_PENDING' });
  assert.equal(await fs.readFile(path.join(directory, 'ledger.json'), 'utf8'), before);
  await assert.rejects(fs.access(path.join(directory, 'sites-migration.json')), { code: 'ENOENT' });
  await budget.release(reservation);
  const migration = await migrateSitesBudget({ directory, projectId });
  assert.equal(migration.marker.settledUpperEstimateKrw, 2500 + reservation.reservedKrw);
});

test('same-project cutover is idempotent while different-project cutover is rejected', async () => {
  const { directory, budget } = await fixture();
  const first = await migrateSitesBudget({ directory, projectId });
  const markerBefore = await fs.readFile(first.markerPath, 'utf8');
  await budget.snapshot();
  const again = await migrateSitesBudget({ directory, projectId });
  assert.equal(again.reused, true);
  assert.deepEqual(again.marker, first.marker);
  await assert.rejects(migrateSitesBudget({ directory, projectId: 'another-project' }), { code: 'BUDGET_MIGRATION_PROJECT_MISMATCH' });
  assert.equal(await fs.readFile(first.markerPath, 'utf8'), markerBefore);
});

test('large migration seeds compress within environment limits without discarding call history', async () => {
  const { directory } = await fixture();
  const ledgerPath = path.join(directory, 'ledger.json');
  const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
  ledger.calls = Array.from({ length: 60 }, () => ({
    id: randomUUID(), model: ledger.policy.model, accounting: 'usage-upper-estimate',
    chargedUpperEstimateKrw: 1, inputTokens: 1000, outputTokens: 10,
    reservedAt: '2026-09-22T00:00:00.000Z', settledAt: '2026-09-22T00:00:01.000Z',
  }));
  ledger.settledKrw += ledger.calls.length;
  const before = JSON.stringify(ledger);
  assert.ok(Buffer.byteLength(before) > 5000);
  await fs.writeFile(ledgerPath, before);
  const migration = await migrateSitesBudget({ directory, projectId });
  assert.ok(migration.seed.startsWith('gz:'));
  assert.ok(Buffer.byteLength(migration.seed) <= 5000);
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(migration.seed.slice(3), 'base64')).toString('utf8')), ledger);
  assert.equal(await fs.readFile(ledgerPath, 'utf8'), before);
  assert.equal((await readSitesMigrationSeed({ directory, projectId })).seed, migration.seed);
});

test('oversized compressed seeds refuse cutover before creating a migration marker', async () => {
  const { directory } = await fixture();
  const ledgerPath = path.join(directory, 'ledger.json');
  const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
  ledger.calls = Array.from({ length: 400 }, () => ({
    id: randomUUID(), model: ledger.policy.model, accounting: 'usage-upper-estimate', chargedUpperEstimateKrw: 1,
  }));
  ledger.settledKrw += ledger.calls.length;
  const before = JSON.stringify(ledger);
  await fs.writeFile(ledgerPath, before);
  await assert.rejects(migrateSitesBudget({ directory, projectId }), { code: 'BUDGET_SEED_TOO_LARGE' });
  assert.equal(await fs.readFile(ledgerPath, 'utf8'), before);
  await assert.rejects(fs.access(path.join(directory, 'sites-migration.json')), { code: 'ENOENT' });
});

test('local reserve and migration serialize on the same lock without a spending gap', async () => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { directory, budget } = await fixture();
    const lockPath = path.join(directory, 'ledger.lock');
    const lock = await fs.open(lockPath, 'wx');
    const migration = migrateSitesBudget({ directory, projectId });
    const reservation = budget.reserve();
    await lock.close();
    await fs.unlink(lockPath);
    const [cutover, local] = await Promise.allSettled([migration, reservation]);
    if (cutover.status === 'fulfilled') {
      assert.equal(local.status, 'rejected');
      assert.equal(local.reason.code, 'BUDGET_MIGRATED');
      assert.equal((await budget.snapshot()).pending, 0);
    } else {
      assert.equal(cutover.reason.code, 'BUDGET_MIGRATION_PENDING');
      assert.equal(local.status, 'fulfilled');
      assert.equal((await budget.snapshot()).pending, 1);
      await budget.release(local.value);
      await migrateSitesBudget({ directory, projectId });
    }
    await assert.rejects(budget.reserve(), { code: 'BUDGET_MIGRATED' });
  }
});

test('missing or corrupted accounting and invalid markers fail closed', async () => {
  const missingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'sites-budget-missing-'));
  await assert.rejects(migrateSitesBudget({ directory: missingDirectory, projectId }), { code: 'BUDGET_LEDGER_MISSING' });
  const { directory, budget } = await fixture();
  await assert.rejects(readSitesMigrationSeed({ directory, projectId }), { code: 'BUDGET_MIGRATION_MISSING' });
  for (const invalid of ['{broken', 'null', 'false', '[]']) {
    await fs.writeFile(path.join(directory, 'sites-migration.json'), invalid);
    await assert.rejects(migrateSitesBudget({ directory, projectId }), { code: 'BUDGET_MIGRATION_INVALID' });
    await assert.rejects(budget.reserve(), { code: 'BUDGET_MIGRATED' });
    assert.equal(await fs.readFile(path.join(directory, 'sites-migration.json'), 'utf8'), invalid);
  }
  const corrupt = await fixture();
  const ledgerPath = path.join(corrupt.directory, 'ledger.json');
  const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
  ledger.policy.operatingLimitKrw++;
  await fs.writeFile(ledgerPath, JSON.stringify(ledger));
  await assert.rejects(migrateSitesBudget({ directory: corrupt.directory, projectId }), { code: 'BUDGET_INVALID' });
});

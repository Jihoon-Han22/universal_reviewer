import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isValidProviderBudgetLedger } from './provider-budget.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultDirectory = path.join(projectRoot, '.cache/rebuild/provider-budget');
const fail = (code, message) => Object.assign(new Error(message), { code });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function checkProject(projectId) {
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(projectId)) {
    throw fail('BUDGET_MIGRATION_INVALID', 'A valid explicit Sites project ID is required.');
  }
}

async function locked(directory, work) {
  await fs.mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, 'ledger.lock');
  let lock;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { lock = await fs.open(lockPath, 'wx'); break; }
    catch (error) {
      const existingWindowsLock = error.code === 'EPERM' && await fs.stat(lockPath).then(stat => stat.isFile(), () => false);
      if (error.code !== 'EEXIST' && !existingWindowsLock) throw error;
      if (attempt === 99) throw fail('BUDGET_LOCKED', 'Cost ledger is busy or a prior process stopped. Review the lock before migration.');
      await sleep(30);
    }
  }
  try { return await work(); }
  finally { await lock.close(); await fs.unlink(lockPath); }
}

async function readLedger(ledgerPath) {
  let ledger;
  try { ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw fail('BUDGET_LEDGER_MISSING', 'The existing project cost ledger is required for Sites migration.');
    if (error instanceof SyntaxError) throw fail('BUDGET_INVALID', 'The existing project cost ledger is invalid.');
    throw error;
  }
  if (!isValidProviderBudgetLedger(ledger)) throw fail('BUDGET_INVALID', 'Cost ledger or pricing policy must be reviewed before migration.');
  if (Object.keys(ledger.reservations).length) {
    throw fail('BUDGET_MIGRATION_PENDING', 'Existing provider reservations must finish before Sites migration.');
  }
  return ledger;
}

// Local snapshot/settle retain their existing behavior and can update updatedAt
// after cutover. Fingerprint only the actual financial accounting state.
function ledgerHash(ledger) {
  const { schemaVersion, policy, openingSpendKrw, settledKrw, reservations, calls } = ledger;
  return createHash('sha256').update(JSON.stringify({ schemaVersion, policy, openingSpendKrw, settledKrw, reservations, calls })).digest('hex');
}

async function readMarker(markerPath) {
  try {
    const marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
      throw fail('BUDGET_MIGRATION_INVALID', 'The Sites migration marker is invalid; it must not be replaced automatically.');
    }
    return marker;
  }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw fail('BUDGET_MIGRATION_INVALID', 'The Sites migration marker is invalid; it must not be replaced automatically.');
    throw error;
  }
}

function validateMarker(marker, projectId, ledger) {
  if (!marker || marker.schemaVersion !== 1 || typeof marker.project_id !== 'string'
    || !Number.isFinite(Date.parse(marker.migrated_at)) || marker.pending !== 0
    || marker.settledUpperEstimateKrw !== ledger.settledKrw || marker.ledger_sha256 !== ledgerHash(ledger)) {
    throw fail('BUDGET_MIGRATION_INVALID', 'The Sites migration marker does not match the preserved project ledger.');
  }
  if (marker.project_id !== projectId) {
    throw fail('BUDGET_MIGRATION_PROJECT_MISMATCH', 'Project accounting has already moved to a different Sites project.');
  }
}

function encodeSeed(ledger) {
  const json = JSON.stringify(ledger);
  const seed = Buffer.byteLength(json, 'utf8') <= 5000 ? json : `gz:${gzipSync(json, { level: 9 }).toString('base64')}`;
  if (Buffer.byteLength(seed, 'utf8') > 5000) {
    throw fail('BUDGET_SEED_TOO_LARGE', 'The complete compressed ledger exceeds the deployment secret size limit. Import it directly into persistent storage before cutover.');
  }
  return seed;
}

function result(directory, marker, ledger, reused, seed = encodeSeed(ledger)) {
  return {
    marker,
    ledger,
    // Consume this value directly when installing the deployment secret. CLI
    // output deliberately omits it and does not print provider configuration.
    seed,
    ledgerPath: path.join(directory, 'ledger.json'),
    markerPath: path.join(directory, 'sites-migration.json'),
    reused,
  };
}

/** Freeze new local reservations and return the exact accounting seed for Sites.
 * Merely importing this module never performs migration. The caller must supply
 * the selected Sites project ID and explicitly invoke this function or the CLI.
 */
export async function migrateSitesBudget({ directory = defaultDirectory, projectId } = {}) {
  checkProject(projectId);
  directory = path.resolve(directory);
  return locked(directory, async () => {
    const ledger = await readLedger(path.join(directory, 'ledger.json'));
    // Reject an oversized seed before writing a new migration marker.
    const seed = encodeSeed(ledger);
    const markerPath = path.join(directory, 'sites-migration.json');
    const existing = await readMarker(markerPath);
    if (existing) {
      validateMarker(existing, projectId, ledger);
      return result(directory, existing, ledger, true, seed);
    }
    const marker = {
      schemaVersion: 1,
      project_id: projectId,
      migrated_at: new Date().toISOString(),
      settledUpperEstimateKrw: ledger.settledKrw,
      pending: 0,
      ledger_sha256: ledgerHash(ledger),
    };
    const temporary = `${markerPath}.${randomUUID()}.tmp`;
    const file = await fs.open(temporary, 'wx');
    try { await file.writeFile(`${JSON.stringify(marker, null, 2)}\n`); await file.sync(); }
    finally { await file.close(); }
    await fs.rename(temporary, markerPath);
    return result(directory, marker, ledger, false, seed);
  });
}

/** Read the preserved seed after cutover, without emitting accounting or secrets. */
export async function readSitesMigrationSeed({ directory = defaultDirectory, projectId } = {}) {
  checkProject(projectId);
  directory = path.resolve(directory);
  return locked(directory, async () => {
    const ledger = await readLedger(path.join(directory, 'ledger.json'));
    const marker = await readMarker(path.join(directory, 'sites-migration.json'));
    if (!marker) throw fail('BUDGET_MIGRATION_MISSING', 'Sites migration must be completed before exporting its seed.');
    validateMarker(marker, projectId, ledger);
    return result(directory, marker, ledger, true);
  });
}

async function main(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw fail('BUDGET_MIGRATION_INVALID', 'Usage: node scripts/migrate-sites-budget.mjs --project-id ID [--directory PATH]');
    if (args[index] === '--project-id') options.projectId = value;
    else if (args[index] === '--directory') options.directory = value;
    else throw fail('BUDGET_MIGRATION_INVALID', 'Unknown migration argument.');
    index++;
  }
  const migration = await migrateSitesBudget(options);
  process.stdout.write(`${JSON.stringify({
    project_id: migration.marker.project_id,
    settledUpperEstimateKrw: migration.marker.settledUpperEstimateKrw,
    pending: migration.marker.pending,
    ledgerPath: migration.ledgerPath,
    markerPath: migration.markerPath,
    reused: migration.reused,
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.code ?? 'BUDGET_MIGRATION_FAILED'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { backupDatabase, restoreDatabase } = require('../db/backup');
const { applyPendingMigrations, getMigrationStatus } = require('../db/migrate');

function readArg(name) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find(arg => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : '';
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Rehearsal refuses NODE_ENV=production');
  }

  const sourcePath = path.resolve(readArg('source') || path.join(__dirname, '..', 'db', 'jobapp.db'));
  const keep = process.argv.includes('--keep');
  const rehearsalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-migration-rehearsal-'));
  const workingPath = path.join(rehearsalDir, 'working.db');
  const rollbackBackupPath = path.join(rehearsalDir, 'pre-migration.db');
  const failurePath = path.join(rehearsalDir, 'failure.db');
  const failureMigrationsDir = path.join(rehearsalDir, 'failure-migrations');

  const report = {
    source: sourcePath,
    isolatedDirectory: rehearsalDir,
    productionWrites: 0,
    checks: {}
  };

  try {
    const sourceSnapshot = await backupDatabase(sourcePath, workingPath);
    report.sourceSnapshotBytes = sourceSnapshot.bytes;

    let db = new Database(workingPath);
    db.exec(`
      DROP TABLE IF EXISTS schema_migrations;
      CREATE TABLE IF NOT EXISTS migration_rehearsal_probe (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT OR REPLACE INTO migration_rehearsal_probe (id, value) VALUES (1, 'preserve-me');
    `);
    db.close();

    const backup = await backupDatabase(workingPath, rollbackBackupPath);
    const backupHash = hashFile(rollbackBackupPath);
    report.backup = { bytes: backup.bytes, sha256: backupHash };
    report.checks.backupCreated = backup.bytes > 0;

    db = new Database(workingPath);
    const applyResult = applyPendingMigrations(db);
    const integrity = db.pragma('integrity_check', { simple: true });
    const probeAfterMigration = db.prepare('SELECT value FROM migration_rehearsal_probe WHERE id=1').pluck().get();
    const secondApply = applyPendingMigrations(db);
    const migratedStatus = getMigrationStatus(db);
    db.close();

    assert(integrity === 'ok', `Integrity check failed after migration: ${integrity}`);
    assert(probeAfterMigration === 'preserve-me', 'Migration did not preserve existing data');
    assert(applyResult.appliedNow.length > 0, 'Rehearsal expected at least one pending migration');
    assert(secondApply.appliedNow.length === 0, 'Repeated migration was not idempotent');
    assert(migratedStatus.pending.length === 0, 'Pending migrations remain after apply');
    report.migration = applyResult;
    report.checks.integrityAfterMigration = true;
    report.checks.existingDataPreserved = true;
    report.checks.repeatedApplyIsNoOp = true;

    fs.mkdirSync(failureMigrationsDir);
    fs.writeFileSync(
      path.join(failureMigrationsDir, '9000_forced_failure.sql'),
      'CREATE TABLE should_roll_back (id INTEGER PRIMARY KEY);\nINSERT INTO missing_table (id) VALUES (1);\n',
      'utf8'
    );
    restoreDatabase(rollbackBackupPath, failurePath);
    const failureDb = new Database(failurePath);
    let failureObserved = false;
    try {
      applyPendingMigrations(failureDb, { migrationsDir: failureMigrationsDir });
    } catch (_error) {
      failureObserved = true;
    }
    const partialTable = failureDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='should_roll_back'").get();
    const partialRecord = failureDb.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get('9000');
    failureDb.close();
    assert(failureObserved, 'Forced migration failure was not observed');
    assert(!partialTable && !partialRecord, 'Failed migration left partial schema or version metadata');
    report.checks.failedMigrationRolledBack = true;

    restoreDatabase(rollbackBackupPath, workingPath);
    const restoredHash = hashFile(workingPath);
    assert(restoredHash === backupHash, 'Restored database bytes differ from the verified backup');
    db = new Database(workingPath, { readonly: true });
    const restoredProbe = db.prepare('SELECT value FROM migration_rehearsal_probe WHERE id=1').pluck().get();
    const restoredStatus = getMigrationStatus(db);
    const restoredIntegrity = db.pragma('integrity_check', { simple: true });
    db.close();
    assert(restoredProbe === 'preserve-me', 'Restored database lost the pre-migration probe');
    assert(restoredStatus.applied.length === 0, 'Rollback restore retained migration metadata unexpectedly');
    assert(restoredIntegrity === 'ok', `Integrity check failed after restore: ${restoredIntegrity}`);
    report.checks.restoreChecksumMatches = true;
    report.checks.rollbackRemovedMigrationVersion = true;
    report.checks.integrityAfterRestore = true;
    report.result = 'passed';
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (!keep) fs.rmSync(rehearsalDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`[db-rehearsal] ${error.message}`);
  process.exitCode = 1;
});

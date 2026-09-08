'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { backupDatabase, restoreDatabase } = require('../db/backup');
const { applyPendingMigrations, getMigrationStatus, readMigrations } = require('../db/migrate');

function withTempDir(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-migration-test-'));
  return Promise.resolve(run(directory)).finally(() => fs.rmSync(directory, { recursive: true, force: true }));
}

function createRequiredBaselineTables(db) {
  const requirements = new Map();
  readMigrations().forEach(migration => migration.requirements.forEach(requirement => {
    const columns = requirements.get(requirement.table) || new Set();
    (requirement.columns.length > 0 ? requirement.columns : ['id']).forEach(column => columns.add(column));
    requirements.set(requirement.table, columns);
  }));
  requirements.forEach((columns, table) => {
    db.exec(`CREATE TABLE "${table}" (${Array.from(columns).map(column => `"${column}" TEXT`).join(', ')})`);
  });
}

test('database migration baseline is recorded once and exposes status', () => withTempDir(directory => {
  const db = new Database(path.join(directory, 'baseline.db'));
  createRequiredBaselineTables(db);

  const first = applyPendingMigrations(db);
  const second = applyPendingMigrations(db);
  const status = getMigrationStatus(db);

  assert.equal(first.appliedNow.length, 5);
  assert.equal(second.appliedNow.length, 0);
  assert.equal(status.applied.length, 5);
  assert.equal(status.pending.length, 0);
  assert.match(status.applied[0].checksum, /^[a-f0-9]{64}$/);
  db.close();
}));

test('database migration baseline refuses an incomplete schema', () => withTempDir(directory => {
  const db = new Database(path.join(directory, 'incomplete.db'));
  assert.throws(() => applyPendingMigrations(db), /baseline requirement missing table: users/);
  assert.equal(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get(), 0);
  db.close();
}));

test('failed migration transaction leaves no partial table or applied record', () => withTempDir(directory => {
  const migrationsDir = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDir);
  fs.writeFileSync(
    path.join(migrationsDir, '0001_fail_atomically.sql'),
    'CREATE TABLE partial_change (id INTEGER PRIMARY KEY);\nINSERT INTO table_that_does_not_exist (id) VALUES (1);\n'
  );
  const db = new Database(path.join(directory, 'failure.db'));

  assert.throws(() => applyPendingMigrations(db, { migrationsDir }));
  assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='partial_change'").pluck().get(), 0);
  assert.equal(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get(), 0);
  db.close();
}));

test('applied migration checksum drift is rejected', () => withTempDir(directory => {
  const migrationsDir = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDir);
  const migrationPath = path.join(migrationsDir, '0001_create_example.sql');
  fs.writeFileSync(migrationPath, 'CREATE TABLE example (id INTEGER PRIMARY KEY);\n');
  const db = new Database(path.join(directory, 'checksum.db'));
  applyPendingMigrations(db, { migrationsDir });
  fs.writeFileSync(migrationPath, 'CREATE TABLE example (id INTEGER PRIMARY KEY, name TEXT);\n');

  assert.throws(() => getMigrationStatus(db, { migrationsDir }), /checksum mismatch/);
  db.close();
}));

test('database backup and restore preserve exact bytes and data', () => withTempDir(async directory => {
  const sourcePath = path.join(directory, 'source.db');
  const backupPath = path.join(directory, 'backup.db');
  const restorePath = path.join(directory, 'restore.db');
  const db = new Database(sourcePath);
  db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO sample VALUES (1, 'before');");
  db.close();

  await backupDatabase(sourcePath, backupPath);
  restoreDatabase(backupPath, restorePath);
  assert.deepEqual(fs.readFileSync(restorePath), fs.readFileSync(backupPath));
  const restored = new Database(restorePath, { readonly: true });
  assert.equal(restored.prepare('SELECT value FROM sample WHERE id=1').pluck().get(), 'before');
  assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
  restored.close();
}));

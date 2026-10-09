'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { backupDatabase, restoreDatabase } = require('../db/backup');
const {
  DEFAULT_MIGRATIONS_DIR,
  applyPendingMigrations,
  getMigrationStatus,
  readMigrations
} = require('../db/migrate');

function withTempDir(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-migration-test-'));
  return Promise.resolve()
    .then(() => run(directory))
    .finally(() => fs.rmSync(directory, { recursive: true, force: true }));
}

function copyMigrationsThrough(targetDirectory, lastVersion) {
  fs.mkdirSync(targetDirectory, { recursive: true });
  readMigrations()
    .filter(migration => migration.version <= lastVersion)
    .forEach(migration => {
      fs.copyFileSync(
        path.join(DEFAULT_MIGRATIONS_DIR, migration.fileName),
        path.join(targetDirectory, migration.fileName)
      );
    });
}

function createRequiredBaselineTables(db) {
  const requirements = new Map();
  readMigrations().forEach(migration => migration.requirements.forEach(requirement => {
    const columns = requirements.get(requirement.table) || new Set();
    (requirement.columns.length > 0 ? requirement.columns : ['id']).forEach(column => columns.add(column));
    requirements.set(requirement.table, columns);
  }));
  requirements.forEach((columns, table) => {
    db.exec(`CREATE TABLE "${table}" (${Array.from(columns).map(column => (
      `"${column}" TEXT${column === 'id' ? ' PRIMARY KEY' : ''}`
    )).join(', ')})`);
  });
}

test('database migration baseline is recorded once and exposes status', () => withTempDir(directory => {
  const db = new Database(path.join(directory, 'baseline.db'));
  try {
    createRequiredBaselineTables(db);

    const first = applyPendingMigrations(db);
    const second = applyPendingMigrations(db);
    const status = getMigrationStatus(db);

    assert.equal(first.appliedNow.length, 9);
    assert.equal(second.appliedNow.length, 0);
    assert.equal(status.applied.length, 9);
    assert.equal(status.pending.length, 0);
    assert.match(status.applied[0].checksum, /^[a-f0-9]{64}$/);
    assert.equal(status.applied.at(-1).version, '0009');
    assert.equal(
      db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('ai_conversations','ai_conversation_turns')").pluck().get(),
      2
    );
    assert.deepEqual(
      db.prepare('PRAGMA table_info(application_history)').all()
        .filter(column => ['batch_id', 'batch_size'].includes(column.name))
        .map(column => ({ name: column.name, notnull: column.notnull })),
      [{ name: 'batch_id', notnull: 0 }, { name: 'batch_size', notnull: 0 }]
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_application_history_owner_batch)').all().map(column => column.name),
      ['user_id', 'batch_id', 'id']
    );
    assert.deepEqual(
      db.prepare('PRAGMA table_info(ai_conversation_turns)').all()
        .filter(column => ['request_fingerprint', 'context_snapshot'].includes(column.name))
        .map(column => ({
          name: column.name,
          notnull: column.notnull,
          defaultValue: column.dflt_value
        })),
      [
        { name: 'request_fingerprint', notnull: 1, defaultValue: "''" },
        { name: 'context_snapshot', notnull: 1, defaultValue: "'{}'" }
      ]
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_ai_conversations_owner_application)').all().map(column => column.name),
      ['user_id', 'application_id', 'id']
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_ai_turns_conversation_status)').all().map(column => column.name),
      ['conversation_id', 'status', 'id']
    );
  } finally {
    db.close();
  }
}));

test('database migration upgrades an existing 0001-0006 database through 0009 exactly once', () => withTempDir(directory => {
  const legacyMigrationsDir = path.join(directory, 'migrations-through-0006');
  copyMigrationsThrough(legacyMigrationsDir, '0006');

  const db = new Database(path.join(directory, 'upgrade.db'));
  try {
    createRequiredBaselineTables(db);
    const legacy = applyPendingMigrations(db, { migrationsDir: legacyMigrationsDir });
    assert.deepEqual(legacy.appliedNow.map(migration => migration.version), [
      '0001', '0002', '0003', '0004', '0005', '0006'
    ]);

    const upgrade = applyPendingMigrations(db);
    assert.deepEqual(upgrade.appliedNow.map(migration => migration.version), ['0007', '0008', '0009']);
    assert.equal(
      db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').pluck().get(),
      '0009'
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('ai_conversations','ai_conversation_turns')").pluck().get(),
      2
    );
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally {
    db.close();
  }
}));

test('database migration upgrades an existing 0001-0007 database with nullable batch metadata', () => withTempDir(directory => {
  const previousMigrationsDir = path.join(directory, 'migrations-through-0007');
  copyMigrationsThrough(previousMigrationsDir, '0007');

  const db = new Database(path.join(directory, 'batch-upgrade.db'));
  try {
    createRequiredBaselineTables(db);
    const previous = applyPendingMigrations(db, { migrationsDir: previousMigrationsDir });
    assert.equal(previous.appliedNow.at(-1).version, '0007');
    db.prepare('INSERT INTO application_history (id, application_id, user_id) VALUES (?, ?, ?)').run('1', '11', '21');

    const upgrade = applyPendingMigrations(db);
    assert.deepEqual(upgrade.appliedNow.map(migration => migration.version), ['0008', '0009']);
    assert.deepEqual(
      db.prepare('SELECT batch_id AS batchId, batch_size AS batchSize FROM application_history WHERE id=?').get('1'),
      { batchId: null, batchSize: null }
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_application_history_owner_batch)').all().map(column => column.name),
      ['user_id', 'batch_id', 'id']
    );
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally {
    db.close();
  }
}));

test('database migration upgrades an existing 0001-0008 AI conversation schema through 0009 exactly once', () => withTempDir(directory => {
  const previousMigrationsDir = path.join(directory, 'migrations-through-0008');
  copyMigrationsThrough(previousMigrationsDir, '0008');

  const db = new Database(path.join(directory, 'ai-conversation-upgrade.db'));
  try {
    createRequiredBaselineTables(db);
    const previous = applyPendingMigrations(db, { migrationsDir: previousMigrationsDir });
    assert.equal(previous.appliedNow.at(-1).version, '0008');

    db.prepare('INSERT INTO users (id) VALUES (?)').run('1');
    db.prepare('INSERT INTO applications (id, user_id) VALUES (?, ?)').run('11', '1');
    const conversationId = db.prepare(`
      INSERT INTO ai_conversations (user_id, application_id, title)
      VALUES (?, ?, ?)
    `).run('1', '11', 'Legacy conversation').lastInsertRowid;
    const turnId = db.prepare(`
      INSERT INTO ai_conversation_turns
        (conversation_id, request_id, question, answer, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(conversationId, 'legacy-request', 'Legacy question', 'Legacy answer', 'completed').lastInsertRowid;

    const upgrade = applyPendingMigrations(db);
    assert.deepEqual(upgrade.appliedNow.map(migration => migration.version), ['0009']);
    assert.deepEqual(
      db.prepare(`
        SELECT request_fingerprint AS requestFingerprint,
               context_snapshot AS contextSnapshot
        FROM ai_conversation_turns
        WHERE id=?
      `).get(turnId),
      { requestFingerprint: '', contextSnapshot: '{}' }
    );
    assert.deepEqual(
      db.prepare('PRAGMA table_info(ai_conversation_turns)').all()
        .filter(column => ['request_fingerprint', 'context_snapshot'].includes(column.name))
        .map(column => ({
          name: column.name,
          notnull: column.notnull,
          defaultValue: column.dflt_value
        })),
      [
        { name: 'request_fingerprint', notnull: 1, defaultValue: "''" },
        { name: 'context_snapshot', notnull: 1, defaultValue: "'{}'" }
      ]
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_ai_conversations_owner_application)').all().map(column => column.name),
      ['user_id', 'application_id', 'id']
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_ai_turns_conversation_status)').all().map(column => column.name),
      ['conversation_id', 'status', 'id']
    );
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally {
    db.close();
  }
}));

test('database migration baseline refuses an incomplete schema', () => withTempDir(directory => {
  const db = new Database(path.join(directory, 'incomplete.db'));
  try {
    assert.throws(() => applyPendingMigrations(db), /baseline requirement missing table: users/);
    assert.equal(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get(), 0);
  } finally {
    db.close();
  }
}));

test('failed migration transaction leaves no partial table or applied record', () => withTempDir(directory => {
  const migrationsDir = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDir);
  fs.writeFileSync(
    path.join(migrationsDir, '0001_fail_atomically.sql'),
    'CREATE TABLE partial_change (id INTEGER PRIMARY KEY);\nINSERT INTO table_that_does_not_exist (id) VALUES (1);\n'
  );
  const db = new Database(path.join(directory, 'failure.db'));
  try {
    assert.throws(() => applyPendingMigrations(db, { migrationsDir }));
    assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='partial_change'").pluck().get(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get(), 0);
  } finally {
    db.close();
  }
}));

test('applied migration checksum drift is rejected', () => withTempDir(directory => {
  const migrationsDir = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDir);
  const migrationPath = path.join(migrationsDir, '0001_create_example.sql');
  fs.writeFileSync(migrationPath, 'CREATE TABLE example (id INTEGER PRIMARY KEY);\n');
  const db = new Database(path.join(directory, 'checksum.db'));
  try {
    applyPendingMigrations(db, { migrationsDir });
    fs.writeFileSync(migrationPath, 'CREATE TABLE example (id INTEGER PRIMARY KEY, name TEXT);\n');

    assert.throws(() => getMigrationStatus(db, { migrationsDir }), /checksum mismatch/);
  } finally {
    db.close();
  }
}));

test('database backup and restore preserve exact bytes and data', () => withTempDir(async directory => {
  const sourcePath = path.join(directory, 'source.db');
  const backupPath = path.join(directory, 'backup.db');
  const restorePath = path.join(directory, 'restore.db');
  const db = new Database(sourcePath);
  try {
    db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO sample VALUES (1, 'before');");
  } finally {
    db.close();
  }

  await backupDatabase(sourcePath, backupPath);
  restoreDatabase(backupPath, restorePath);
  assert.deepEqual(fs.readFileSync(restorePath), fs.readFileSync(backupPath));
  const restored = new Database(restorePath, { readonly: true });
  try {
    assert.equal(restored.prepare('SELECT value FROM sample WHERE id=1').pluck().get(), 'before');
    assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
  } finally {
    restored.close();
  }
}));

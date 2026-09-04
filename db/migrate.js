'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_FILE_PATTERN = /^(\d{4,})_([a-z0-9_]+)\.sql$/;
const REQUIRE_TABLE_PATTERN = /^\s*--\s*@require-table\s+([a-zA-Z_][a-zA-Z0-9_]*)(?::([a-zA-Z0-9_,]+))?\s*$/gm;

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseRequirements(sql) {
  const requirements = [];
  let match;
  while ((match = REQUIRE_TABLE_PATTERN.exec(sql)) !== null) {
    requirements.push({
      table: match[1],
      columns: match[2] ? match[2].split(',').filter(Boolean) : []
    });
  }
  REQUIRE_TABLE_PATTERN.lastIndex = 0;
  return requirements;
}

function readMigrations(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  if (!fs.existsSync(migrationsDir)) return [];

  const migrations = fs.readdirSync(migrationsDir)
    .filter(fileName => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map(fileName => {
      const match = MIGRATION_FILE_PATTERN.exec(fileName);
      if (!match) {
        throw new Error(`Invalid migration filename: ${fileName}`);
      }
      const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8');
      if (/\b(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(sql.replace(/^\s*--.*$/gm, ''))) {
        throw new Error(`Migration ${fileName} must not manage transactions directly`);
      }
      return {
        version: match[1],
        name: match[2],
        fileName,
        sql,
        checksum: sha256(sql),
        requirements: parseRequirements(sql)
      };
    });

  const versions = new Set();
  migrations.forEach(migration => {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    versions.add(migration.version);
  });
  return migrations;
}

function hasMigrationsTable(db) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get());
}

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version      TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      checksum     TEXT NOT NULL,
      execution_ms INTEGER NOT NULL DEFAULT 0,
      applied_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function readApplied(db) {
  if (!hasMigrationsTable(db)) return [];
  return db.prepare(`
    SELECT version, name, checksum, execution_ms AS executionMs, applied_at AS appliedAt
    FROM schema_migrations
    ORDER BY version
  `).all();
}

function validateRequirements(db, migration) {
  migration.requirements.forEach(requirement => {
    const tableExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(requirement.table);
    if (!tableExists) {
      throw new Error(`Migration ${migration.fileName} baseline requirement missing table: ${requirement.table}`);
    }
    if (requirement.columns.length === 0) return;
    const actualColumns = new Set(
      db.prepare(`PRAGMA table_info(${quoteIdentifier(requirement.table)})`).all().map(column => column.name)
    );
    const missingColumns = requirement.columns.filter(column => !actualColumns.has(column));
    if (missingColumns.length > 0) {
      throw new Error(
        `Migration ${migration.fileName} baseline requirement missing columns: ${requirement.table}.${missingColumns.join(',')}`
      );
    }
  });
}

function getMigrationStatus(db, options = {}) {
  const migrations = readMigrations(options.migrationsDir);
  const appliedRows = readApplied(db);
  const appliedByVersion = new Map(appliedRows.map(row => [row.version, row]));
  const filesByVersion = new Map(migrations.map(migration => [migration.version, migration]));

  migrations.forEach(migration => {
    const applied = appliedByVersion.get(migration.version);
    if (applied && applied.checksum !== migration.checksum) {
      throw new Error(`Applied migration checksum mismatch: ${migration.fileName}`);
    }
  });

  const unknownApplied = appliedRows.filter(row => !filesByVersion.has(row.version));
  if (unknownApplied.length > 0) {
    throw new Error(`Applied migration files are missing: ${unknownApplied.map(row => row.version).join(', ')}`);
  }

  return {
    trackingTableExists: hasMigrationsTable(db),
    applied: migrations.filter(migration => appliedByVersion.has(migration.version)),
    pending: migrations.filter(migration => !appliedByVersion.has(migration.version)),
    total: migrations.length
  };
}

function applyPendingMigrations(db, options = {}) {
  const migrationsDir = options.migrationsDir || DEFAULT_MIGRATIONS_DIR;
  ensureMigrationsTable(db);
  const initialStatus = getMigrationStatus(db, { migrationsDir });
  const appliedNow = [];
  const insertApplied = db.prepare(`
    INSERT INTO schema_migrations (version, name, checksum, execution_ms)
    VALUES (?, ?, ?, ?)
  `);

  initialStatus.pending.forEach(migration => {
    const startedAt = process.hrtime.bigint();
    const applyOne = db.transaction(() => {
      validateRequirements(db, migration);
      db.exec(migration.sql);
      const executionMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      insertApplied.run(migration.version, migration.name, migration.checksum, Math.round(executionMs));
      return executionMs;
    });
    const executionMs = applyOne.immediate();
    appliedNow.push({
      version: migration.version,
      name: migration.name,
      checksum: migration.checksum,
      executionMs: Math.round(executionMs)
    });
  });

  const finalStatus = getMigrationStatus(db, { migrationsDir });
  return {
    appliedNow,
    alreadyApplied: initialStatus.applied.length,
    pending: finalStatus.pending.length,
    total: finalStatus.total
  };
}

module.exports = {
  DEFAULT_MIGRATIONS_DIR,
  applyPendingMigrations,
  getMigrationStatus,
  readMigrations,
  sha256
};

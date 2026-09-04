'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { applyPendingMigrations, getMigrationStatus } = require('../db/migrate');

function readArg(name) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find(arg => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : '';
}

function summarize(status) {
  return {
    trackingTableExists: status.trackingTableExists,
    applied: status.applied.map(item => ({ version: item.version, name: item.name })),
    pending: status.pending.map(item => ({ version: item.version, name: item.name })),
    total: status.total
  };
}

function main() {
  const dbArg = readArg('db');
  const apply = process.argv.includes('--apply');
  const statusOnly = process.argv.includes('--status') || !apply;
  if (!dbArg) {
    throw new Error('Explicit --db=<path> is required; the migration command never guesses a database target');
  }

  const dbPath = path.resolve(dbArg);
  const db = new Database(dbPath, { readonly: statusOnly, fileMustExist: true });
  try {
    if (statusOnly) {
      console.log(JSON.stringify({ database: dbPath, mode: 'status', ...summarize(getMigrationStatus(db)) }, null, 2));
      return;
    }

    if (readArg('confirm') !== 'APPLY_SCHEMA_MIGRATIONS') {
      throw new Error('Apply requires --confirm=APPLY_SCHEMA_MIGRATIONS');
    }
    const backupArg = readArg('backup');
    if (!backupArg) {
      throw new Error('Apply requires --backup=<verified-backup-path>');
    }
    const backupPath = path.resolve(backupArg);
    if (backupPath === dbPath || !fs.existsSync(backupPath)) {
      throw new Error('Backup must be an existing file different from the migration target');
    }
    const backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });
    try {
      if (backupDb.pragma('integrity_check', { simple: true }) !== 'ok') {
        throw new Error('Backup database integrity_check failed');
      }
    } finally {
      backupDb.close();
    }
    if (process.env.NODE_ENV === 'production' && !process.argv.includes('--production-approved')) {
      throw new Error('Production apply also requires explicit --production-approved after Human approval');
    }

    if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('Target database integrity_check failed before migration');
    }
    const result = applyPendingMigrations(db);
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('Target database integrity_check failed after migration; restore the verified backup');
    }
    console.log(JSON.stringify({ database: dbPath, backup: backupPath, mode: 'apply', ...result }, null, 2));
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(`[db-migrate] ${error.message}`);
  process.exitCode = 1;
}

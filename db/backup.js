'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function backupDatabase(sourcePath, destinationPath) {
  const source = path.resolve(sourcePath);
  const destination = path.resolve(destinationPath);
  if (source === destination) throw new Error('Backup destination must differ from source');
  if (!fs.existsSync(source)) throw new Error(`Database does not exist: ${source}`);
  if (fs.existsSync(destination)) throw new Error(`Backup destination already exists: ${destination}`);

  ensureParent(destination);
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
  } finally {
    db.close();
  }
  return { source, destination, bytes: fs.statSync(destination).size };
}

function restoreDatabase(backupPath, destinationPath) {
  const backup = path.resolve(backupPath);
  const destination = path.resolve(destinationPath);
  if (backup === destination) throw new Error('Restore destination must differ from backup');
  if (!fs.existsSync(backup)) throw new Error(`Backup does not exist: ${backup}`);

  ensureParent(destination);
  fs.copyFileSync(backup, destination);
  return { backup, destination, bytes: fs.statSync(destination).size };
}

module.exports = { backupDatabase, restoreDatabase };

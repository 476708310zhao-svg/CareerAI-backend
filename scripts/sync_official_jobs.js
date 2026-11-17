'use strict';

const path = require('node:path');
const Database = require('better-sqlite3');
const pilot = require('../services/cnOfficialPilot');
const sync = require('../services/officialJobSync');

function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : '';
}

async function main() {
  if (!process.argv.includes('--run') || !arg('db')) {
    throw new Error('Usage: node scripts/sync_official_jobs.js --run --db=<existing-db-path> [--board=<registered-board-id>]');
  }
  const boardId = arg('board');
  const boards = boardId ? pilot.LIVE_BOARDS.filter(board => board.id === boardId) : pilot.LIVE_BOARDS;
  if (!boards.length) throw new Error('Unknown board ID');
  const db = new Database(path.resolve(arg('db')), { fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000');
    if (!sync.hasSchema(db)) throw new Error('Migration 0034 must be applied before syncing');
    const runs = await sync.syncAll(db, { boards });
    console.log(JSON.stringify({ boardCount: boards.length, runs }, null, 2));
    if (runs.some(run => run.status === 'error' || run.status === 'anomalous')) process.exitCode = 1;
  } finally { db.close(); }
}

main().catch(error => {
  console.error(`[official-job-sync] ${error.message}`);
  process.exitCode = 1;
});

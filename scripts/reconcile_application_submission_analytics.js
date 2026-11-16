#!/usr/bin/env node
'use strict';

const path = require('node:path');

const args = process.argv.slice(2);
const value = name => {
  const option = args.find(item => item.startsWith(`${name}=`));
  return option ? option.slice(name.length + 1) : undefined;
};
const afterId = Number(value('--after-id') || 0);
const batchSize = Number(value('--batch-size') || 100);
const maxBatches = Number(value('--max-batches') || 0);
if (!args.includes('--write') || !process.env.DB_PATH || !path.isAbsolute(process.env.DB_PATH)
  || !Number.isSafeInteger(afterId) || afterId < 0
  || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500
  || !Number.isSafeInteger(maxBatches) || maxBatches < 0
  || args.some(item => !item.startsWith('--after-id=') && !item.startsWith('--batch-size=')
    && !item.startsWith('--max-batches=') && item !== '--write')) {
  process.stderr.write('Usage: DB_PATH=<absolute path> node scripts/reconcile_application_submission_analytics.js --write [--after-id=N] [--batch-size=1..500] [--max-batches=N]\n');
  process.exitCode = 2;
} else {
  const db = require('../db/database');
  const reconciliation = require('../services/v4SubmissionAnalyticsReconciliation');
  let cursor = afterId;
  let batches = 0;
  let failed = 0;
  let duplicates = 0;
  let more = false;
  try {
    do {
      const result = reconciliation.reconcileBatch({ afterId: cursor, limit: batchSize });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (!result.available) { process.exitCode = 3; break; }
      cursor = result.nextCursor;
      failed += result.failed;
      duplicates += result.duplicates;
      more = result.hasMore;
      batches += 1;
    } while (more && (!maxBatches || batches < maxBatches));
    if (!process.exitCode && (failed || duplicates || more)) process.exitCode = 1;
  } finally {
    if (db.open) db.close();
  }
}

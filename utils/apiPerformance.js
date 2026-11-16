const NORMAL_SAMPLE_RATE = 0.1;
const SLOW_THRESHOLD_MS = 800;
const RETENTION_DAYS = 30;
const PRUNE_BATCH_SIZE = 5000;

function shouldRecord(durationMs, statusCode, random = Math.random) {
  // Operational alerts rely on complete 5xx and slow-request counts.
  return durationMs >= SLOW_THRESHOLD_MS || statusCode >= 500 || random() < NORMAL_SAMPLE_RATE;
}

function record(db, { route, method, durationMs, statusCode }, random = Math.random) {
  if (!shouldRecord(durationMs, statusCode, random)) return false;
  db.prepare('INSERT INTO api_performance_v4 (route,method,duration_ms,status_code,slow) VALUES (?,?,?,?,?)')
    .run(String(route || '').slice(0, 200), method, durationMs, statusCode,
      durationMs >= SLOW_THRESHOLD_MS ? 1 : 0);
  return true;
}

function prune(db, batchSize = PRUNE_BATCH_SIZE) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > PRUNE_BATCH_SIZE) {
    throw new RangeError('Invalid performance pruning batch size');
  }
  // idx_performance_slow_time supports each bounded deletion without a table scan.
  const remove = db.prepare(`DELETE FROM api_performance_v4 WHERE id IN (
    SELECT id FROM api_performance_v4 WHERE slow=? AND created_at<datetime('now', ?)
    ORDER BY created_at ASC LIMIT ?)`);
  const cutoff = `-${RETENTION_DAYS} days`;
  return db.transaction(() => remove.run(0, cutoff, batchSize).changes +
    remove.run(1, cutoff, batchSize).changes)();
}

module.exports = { NORMAL_SAMPLE_RATE, RETENTION_DAYS, shouldRecord, record, prune };

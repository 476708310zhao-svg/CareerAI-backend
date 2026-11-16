'use strict';
const fs = require('node:fs');
const storeDefault = require('./questionAssetStore');

const problem = (code, status = 400) => Object.assign(new Error(code), { status, code });
const field = (value, max, code) => {
  const text = String(value || '').trim();
  if (!text || text.length > max) throw problem(code);
  return text;
};

function createQuestionAssets(db, store = storeDefault) {
  const batch = id => {
    const row = db.prepare('SELECT * FROM question_asset_batches WHERE id=?').get(id);
    if (!row) throw problem('BATCH_NOT_FOUND', 404);
    return row;
  };
  const source = id => {
    const row = db.prepare('SELECT * FROM question_asset_sources WHERE id=?').get(id);
    if (!row) throw problem('SOURCE_NOT_FOUND', 404);
    return row;
  };
  const audit = (batchId, sourceId, action, actor, detail = {}) => db.prepare('INSERT INTO question_asset_audit(batch_id,source_id,action,actor,detail) VALUES (?,?,?,?,?)').run(batchId, sourceId, action, actor, JSON.stringify(detail));
  const viewSource = row => ({ id: row.id, batchId: row.batch_id, clientKey: row.client_key,
    sourceType: row.source_type, sourceReference: row.source_reference, originalFilename: row.original_filename,
    assetId: row.asset_id, status: row.status, errorCode: row.error_code, attempts: row.attempts,
    validationStatus: row.asset_id ? db.prepare('SELECT validation_status FROM question_pdf_assets WHERE id=?').pluck().get(row.asset_id) : null,
    scanStatus: row.asset_id ? db.prepare('SELECT scan_status FROM question_pdf_assets WHERE id=?').pluck().get(row.asset_id) : null,
    createdAt: row.created_at, updatedAt: row.updated_at });
  return {
    createBatch(input, actor) {
      store.assertAvailable();
      const label = field(input && input.label, 120, 'INVALID_BATCH_LABEL');
      const clientKey = field(input && input.clientBatchKey, 100, 'INVALID_BATCH_KEY');
      store.cleanupStale(db);
      return db.transaction(() => {
        const existing = db.prepare('SELECT * FROM question_asset_batches WHERE created_by=? AND client_key=?').get(actor, clientKey);
        if (existing) {
          if (existing.label !== label) throw problem('CLIENT_BATCH_KEY_CONFLICT', 409);
          return existing;
        }
        const result = db.prepare('INSERT INTO question_asset_batches(label,client_key,created_by) VALUES (?,?,?)').run(label, clientKey, actor);
        audit(result.lastInsertRowid, null, 'batch_created', actor);
        return batch(result.lastInsertRowid);
      })();
    },
    prepare(batchId, input, actor) {
      store.assertAvailable();
      store.cleanupStale(db);
      const currentBatch = batch(batchId);
      if (currentBatch.status !== 'open') throw problem('BATCH_CLOSED', 409);
      const clientKey = field(input && input.clientKey, 100, 'INVALID_CLIENT_KEY');
      const sourceType = field(input && input.sourceType, 40, 'INVALID_SOURCE_TYPE');
      const sourceReference = field(input && input.sourceReference, 500, 'INVALID_SOURCE_REFERENCE');
      const originalFilename = field(input && input.originalFilename, 180, 'INVALID_FILENAME');
      if (!/\.pdf$/i.test(originalFilename) || /[\\/\x00-\x1f]/.test(originalFilename)) throw problem('INVALID_FILENAME');
      return db.transaction(() => {
        const existing = db.prepare('SELECT * FROM question_asset_sources WHERE batch_id=? AND client_key=?').get(batchId, clientKey);
        if (existing) {
          if (existing.source_type !== sourceType || existing.source_reference !== sourceReference || existing.original_filename !== originalFilename) throw problem('CLIENT_KEY_CONFLICT', 409);
          return viewSource(existing);
        }
        const result = db.prepare('INSERT INTO question_asset_sources(batch_id,client_key,source_type,source_reference,original_filename,created_by) VALUES (?,?,?,?,?,?)').run(batchId, clientKey, sourceType, sourceReference, originalFilename, actor);
        audit(batchId, result.lastInsertRowid, 'source_prepared', actor);
        return viewSource(source(result.lastInsertRowid));
      })();
    },
    failUpload(batchId, sourceId, code, actor) {
      return db.transaction(() => {
        const currentBatch = batch(batchId), current = source(sourceId);
        if (current.batch_id !== currentBatch.id) throw problem('SOURCE_NOT_FOUND', 404);
        if (current.status === 'quarantined') return viewSource(current);
        if (currentBatch.status !== 'open') throw problem('BATCH_CLOSED', 409);
        const changed = db.prepare("UPDATE question_asset_sources SET status='failed',error_code=?,attempts=attempts+1,updated_at=datetime('now') WHERE id=? AND status IN ('awaiting_upload','failed') AND asset_id IS NULL").run(code, sourceId);
        if (changed.changes !== 1) throw problem('SOURCE_STATE_CONFLICT', 409);
        audit(batchId, sourceId, 'upload_failed', actor, { code });
        return viewSource(source(sourceId));
      })();
    },
    async complete(batchId, sourceId, file, actor) {
      let retained = null;
      try {
        store.assertAvailable();
        const currentBatch = batch(batchId), current = source(sourceId);
        if (current.batch_id !== currentBatch.id) throw problem('SOURCE_NOT_FOUND', 404);
        if (currentBatch.status !== 'open') throw problem('BATCH_CLOSED', 409);
        if (current.status === 'quarantined') return viewSource(current);
        if (!file) throw problem('PDF_FILE_REQUIRED');
        // Busboy may decode multipart filename bytes as Latin-1 even when the
        // browser sent UTF-8. Require an exact match after either decoding.
        const filenameMatches = file.originalname === current.original_filename ||
          Buffer.from(file.originalname, 'latin1').toString('utf8') === current.original_filename;
        if (file.mimetype !== 'application/pdf' || !filenameMatches) throw problem('INVALID_PDF_TYPE');
        const inspected = await store.inspectPdf(file.path);
        const afterInspection = source(sourceId);
        if (afterInspection.status === 'quarantined') return viewSource(afterInspection);
        if (batch(batchId).status !== 'open') throw problem('BATCH_CLOSED', 409);
        const existing = db.prepare('SELECT * FROM question_pdf_assets WHERE sha256=?').get(inspected.sha256);
        if (existing && (existing.byte_size !== inspected.byteSize || !store.verify(existing.storage_key, inspected.sha256, inspected.byteSize))) throw problem('ASSET_STORAGE_MISMATCH', 503);
        retained = store.retain(file.path, inspected.sha256, inspected.byteSize);
        const result = db.transaction(() => {
          const lockedBatch = batch(batchId), lockedSource = source(sourceId);
          if (lockedSource.batch_id !== lockedBatch.id) throw problem('SOURCE_NOT_FOUND', 404);
          if (lockedSource.status === 'quarantined') return { source: viewSource(lockedSource), used: false };
          if (lockedBatch.status !== 'open') throw problem('BATCH_CLOSED', 409);
          if (!['awaiting_upload', 'failed'].includes(lockedSource.status) || lockedSource.asset_id !== null) throw problem('SOURCE_STATE_CONFLICT', 409);
          db.prepare('INSERT INTO question_pdf_assets(sha256,byte_size,storage_key) VALUES (?,?,?) ON CONFLICT(sha256) DO NOTHING').run(inspected.sha256, inspected.byteSize, retained.key);
          const asset = db.prepare('SELECT id FROM question_pdf_assets WHERE sha256=?').get(inspected.sha256);
          const changed = db.prepare("UPDATE question_asset_sources SET asset_id=?,status='quarantined',error_code=NULL,attempts=attempts+1,updated_at=datetime('now') WHERE id=? AND status IN ('awaiting_upload','failed') AND asset_id IS NULL").run(asset.id, sourceId);
          if (changed.changes !== 1) throw problem('SOURCE_STATE_CONFLICT', 409);
          audit(batchId, sourceId, 'upload_quarantined', actor, { assetId: asset.id, deduplicated: Boolean(existing) });
          return { source: viewSource(source(sourceId)), used: true };
        })();
        if (!result.used && retained.created) store.removeNewFile(retained.key, db);
        return result.source;
      } catch (error) {
        if (retained && retained.created) {
          try { store.removeNewFile(retained.key, db); } catch (_) { /* stale-file reconciliation handles this on the next batch */ }
        }
        if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        if (error.status !== 404 && error.status !== 409 && error.message !== 'PRIVATE_PDF_IMPORT_DISABLED') {
          const current = db.prepare('SELECT * FROM question_asset_sources WHERE id=? AND batch_id=?').get(sourceId, batchId);
          if (current && current.status !== 'quarantined') {
            try { this.failUpload(batchId, sourceId, error.status ? error.code || error.message : 'UPLOAD_INTERNAL_ERROR', actor); }
            catch (_) { /* preserve the original storage/database error */ }
          }
        }
        throw error;
      } finally { if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); }
    },
    list(batchId, options = {}) {
      const current = batch(batchId);
      const { cursor, limit } = page(options);
      const rows = db.prepare('SELECT * FROM question_asset_sources WHERE batch_id=? AND id>? ORDER BY id LIMIT ?').all(batchId, cursor, limit + 1);
      const hasMore = rows.length > limit;
      const sources = rows.slice(0, limit).map(viewSource);
      return { batch: current, sources, total: db.prepare('SELECT COUNT(*) FROM question_asset_sources WHERE batch_id=?').pluck().get(batchId),
        nextCursor: hasMore ? sources.at(-1).id : null };
    },
    listBatches(options = {}) {
      const { cursor, limit } = page(options);
      const rows = db.prepare('SELECT * FROM question_asset_batches WHERE id>? ORDER BY id LIMIT ?').all(cursor, limit + 1);
      const hasMore = rows.length > limit, batches = rows.slice(0, limit);
      return { batches, total: db.prepare('SELECT COUNT(*) FROM question_asset_batches').pluck().get(),
        nextCursor: hasMore ? batches.at(-1).id : null };
    }
  };
}

function page(options) {
  const cursor = options.cursor === undefined ? 0 : Number(options.cursor);
  const limit = options.limit === undefined ? 50 : Number(options.limit);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw problem('INVALID_PAGINATION');
  return { cursor, limit };
}

module.exports = { createQuestionAssets, problem };

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const storeDefault = require('./questionAssetStore');

const problem = (code, status = 400) => Object.assign(new Error(code), { code, status });
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validOffset = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
function fingerprintFile(file, size) {
  const sample = Math.min(size, 64 * 1024), fd = fs.openSync(file, 'r');
  const first = Buffer.alloc(sample), last = Buffer.alloc(sample);
  try {
    fs.readSync(fd, first, 0, sample, 0);
    fs.readSync(fd, last, 0, sample, size - sample);
  } finally { fs.closeSync(fd); }
  return crypto.createHash('sha256').update(first).update(last).digest('hex');
}

function createQuestionPdfUploads(db, assets, store = storeDefault) {
  const tempPath = id => path.join(store.privateRoot, 'tmp', id);
  const view = row => ({ uploadId: row.id, receivedBytes: row.received_bytes,
    byteSize: row.byte_size, chunkSize: store.CHUNK_BYTES, maxBytes: store.MAX_PDF_BYTES });
  const sourceFor = (batchId, sourceId) => {
    const row = db.prepare(`SELECT s.*,b.status AS batch_status FROM question_asset_sources s
      JOIN question_asset_batches b ON b.id=s.batch_id WHERE s.id=? AND s.batch_id=?`).get(sourceId, batchId);
    if (!row) throw problem('SOURCE_NOT_FOUND', 404);
    if (row.batch_status !== 'open') throw problem('BATCH_CLOSED', 409);
    if (row.status === 'quarantined' || row.asset_id !== null) throw problem('SOURCE_STATE_CONFLICT', 409);
    return row;
  };
  const sessionFor = (batchId, sourceId, uploadId) => {
    store.assertAvailable();
    if (!idPattern.test(uploadId)) throw problem('UPLOAD_SESSION_NOT_FOUND', 404);
    sourceFor(batchId, sourceId);
    const row = db.prepare('SELECT * FROM question_pdf_upload_sessions WHERE id=? AND source_id=? AND batch_id=?').get(uploadId, sourceId, batchId);
    if (!row) throw problem('UPLOAD_SESSION_NOT_FOUND', 404);
    return row;
  };
  const remove = row => {
    db.prepare('DELETE FROM question_pdf_upload_sessions WHERE id=?').run(row.id);
    const file = tempPath(row.id);
    if (fs.existsSync(file)) {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw problem('PRIVATE_STORAGE_UNSAFE_PATH', 503);
      fs.unlinkSync(file);
    }
  };
  const reconcile = row => {
    const file = tempPath(row.id);
    if (!fs.existsSync(file)) { db.prepare('DELETE FROM question_pdf_upload_sessions WHERE id=?').run(row.id); return false; }
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < row.received_bytes) throw problem('PRIVATE_STORAGE_UNSAFE_PATH', 503);
    if (stat.size > row.received_bytes) fs.truncateSync(file, row.received_bytes);
    if (row.state === 'finalizing') db.prepare("UPDATE question_pdf_upload_sessions SET state='active' WHERE id=?").run(row.id);
    return true;
  };
  return {
    create(batchId, sourceId, input, actor) {
      store.assertAvailable();
      const source = sourceFor(batchId, sourceId);
      const byteSize = Number(input && input.byteSize);
      const fingerprint = String(input && input.fingerprint || '');
      if (!Number.isSafeInteger(byteSize) || byteSize < 16 || byteSize > store.MAX_PDF_BYTES) throw problem('INVALID_PDF_SIZE', 413);
      if (input.originalFilename !== source.original_filename) throw problem('INVALID_PDF_TYPE');
      if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw problem('INVALID_UPLOAD_FINGERPRINT');
      const old = db.prepare("SELECT * FROM question_pdf_upload_sessions WHERE source_id=?").get(sourceId);
      if (old && old.state === 'finalizing' && Date.now() - Date.parse(old.updated_at.replace(' ', 'T') + 'Z') < 5 * 60 * 1000) {
        throw problem('UPLOAD_FINALIZING', 409);
      }
      if (old && old.original_filename === source.original_filename && old.byte_size === byteSize && old.fingerprint === fingerprint && reconcile(old)) {
        return view(db.prepare('SELECT * FROM question_pdf_upload_sessions WHERE id=?').get(old.id));
      }
      if (old) remove(old);
      const directory = store.temporaryDirectory();
      const id = crypto.randomUUID(), file = path.join(directory, id);
      const fd = fs.openSync(file, 'wx', 0o600);
      fs.closeSync(fd);
      try {
        db.prepare(`INSERT INTO question_pdf_upload_sessions
          (id,source_id,batch_id,actor,original_filename,byte_size,fingerprint) VALUES (?,?,?,?,?,?,?)`)
          .run(id, sourceId, batchId, actor, source.original_filename, byteSize, fingerprint);
      } catch (error) { fs.unlinkSync(file); throw error; }
      return view(db.prepare('SELECT * FROM question_pdf_upload_sessions WHERE id=?').get(id));
    },
    status(batchId, sourceId, uploadId) { return view(sessionFor(batchId, sourceId, uploadId)); },
    append(batchId, sourceId, uploadId, offsetValue, bytes) {
      const row = sessionFor(batchId, sourceId, uploadId), offset = validOffset(offsetValue);
      if (row.state !== 'active') throw problem('UPLOAD_FINALIZING', 409);
      if (offset === null || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > store.CHUNK_BYTES || offset + bytes.length > row.byte_size) throw problem('INVALID_UPLOAD_CHUNK');
      const file = tempPath(row.id);
      if (!fs.existsSync(file)) { remove(row); throw problem('UPLOAD_SESSION_NOT_FOUND', 404); }
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < row.received_bytes) throw problem('ASSET_STORAGE_MISMATCH', 503);
      if (stat.size > row.received_bytes) fs.truncateSync(file, row.received_bytes);
      if (offset < row.received_bytes && offset + bytes.length <= row.received_bytes) {
        const existing = Buffer.alloc(bytes.length), fd = fs.openSync(file, 'r');
        try { fs.readSync(fd, existing, 0, existing.length, offset); } finally { fs.closeSync(fd); }
        if (!existing.equals(bytes)) throw problem('UPLOAD_CHUNK_CONFLICT', 409);
        return view(row);
      }
      if (offset !== row.received_bytes) throw problem('UPLOAD_OFFSET_CONFLICT', 409);
      store.ensureTempCapacity(bytes.length);
      const fd = fs.openSync(file, 'r+');
      try {
        let written = 0;
        while (written < bytes.length) written += fs.writeSync(fd, bytes, written, bytes.length - written, offset + written);
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      db.prepare("UPDATE question_pdf_upload_sessions SET received_bytes=?,updated_at=datetime('now') WHERE id=?").run(offset + bytes.length, row.id);
      return view({ ...row, received_bytes: offset + bytes.length });
    },
    async finish(batchId, sourceId, uploadId, actor) {
      const row = sessionFor(batchId, sourceId, uploadId);
      if (row.state !== 'active') throw problem('UPLOAD_FINALIZING', 409);
      if (row.received_bytes !== row.byte_size) throw problem('UPLOAD_INCOMPLETE', 409);
      const file = tempPath(row.id);
      if (!fs.existsSync(file)) { remove(row); throw problem('UPLOAD_SESSION_NOT_FOUND', 404); }
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== row.byte_size) throw problem('ASSET_STORAGE_MISMATCH', 503);
      if (fingerprintFile(file, row.byte_size) !== row.fingerprint) {
        remove(row);
        assets.failUpload(batchId, sourceId, 'UPLOAD_FINGERPRINT_MISMATCH', actor);
        throw problem('UPLOAD_FINGERPRINT_MISMATCH', 409);
      }
      db.prepare("UPDATE question_pdf_upload_sessions SET state='finalizing',updated_at=datetime('now') WHERE id=?").run(row.id);
      try {
        return await assets.complete(batchId, sourceId, { path: file, originalname: row.original_filename, mimetype: 'application/pdf' }, actor);
      } finally { remove(row); }
    }
  };
}

module.exports = { createQuestionPdfUploads };

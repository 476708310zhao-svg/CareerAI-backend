'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DATA_DIR, UPLOAD_DIR, ROOT_DIR } = require('../utils/paths');

const MAX_PDF_BYTES = 256 * 1024 * 1024;
const DIRECT_MAX_PDF_BYTES = 25 * 1024 * 1024;
const CHUNK_BYTES = 8 * 1024 * 1024;
const STALE_MS = 24 * 60 * 60 * 1000;
const CLEANUP_LIMIT = 100;
const MAX_TEMP_FILES = 256;
const MAX_TEMP_BYTES = 1024 * 1024 * 1024;
const privateRoot = path.resolve(process.env.QUESTION_PDF_PRIVATE_DIR || path.join(DATA_DIR, 'private-question-pdfs'));
const problem = (code, status = 503) => Object.assign(new Error(code), { status, code });
const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return !relative || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
};
const overlap = (left, right) => within(left, right) || within(right, left);

function ensurePrivateDirectory(directory) {
  const relative = path.relative(DATA_DIR, directory);
  if (!relative || !within(DATA_DIR, directory)) throw problem('PRIVATE_STORAGE_OUTSIDE_DATA_DIR');
  let current = DATA_DIR;
  const dataReal = fs.realpathSync(DATA_DIR);
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) fs.mkdirSync(current, { mode: 0o700 });
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !within(dataReal, fs.realpathSync(current))) throw problem('PRIVATE_STORAGE_UNSAFE_PATH');
  }
  return fs.realpathSync(directory);
}

function assertAvailable() {
  // No production object storage or malware scanner has been wired yet.
  if (process.env.NODE_ENV === 'production' || !['test', 'development'].includes(process.env.NODE_ENV) || process.env.QUESTION_PDF_LOCAL_IMPORT_ENABLED !== '1') {
    throw problem('PRIVATE_PDF_IMPORT_DISABLED');
  }
  const rootReal = ensurePrivateDirectory(privateRoot);
  for (const exposed of [UPLOAD_DIR, path.join(ROOT_DIR, 'public'), path.join(ROOT_DIR, 'admin'), path.join(ROOT_DIR, 'miniprogram')]) {
    if (overlap(fs.realpathSync(exposed), rootReal)) throw problem('PRIVATE_STORAGE_EXPOSED');
  }
  return privateRoot;
}

function ensureTempDirectory() {
  assertAvailable();
  const directory = path.join(privateRoot, 'tmp');
  ensurePrivateDirectory(directory);
  return directory;
}

function ensureTempCapacity(additionalBytes = 0) {
  const directory = ensureTempDirectory();
  let count = 0, bytes = 0;
  for (const name of fs.readdirSync(directory)) {
    const stat = fs.lstatSync(path.join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw problem('PRIVATE_STORAGE_UNSAFE_PATH');
    count++;
    bytes += stat.size;
    if ((additionalBytes === 0 && (count >= MAX_TEMP_FILES || bytes >= MAX_TEMP_BYTES)) || bytes + additionalBytes > MAX_TEMP_BYTES) throw problem('PRIVATE_TEMP_QUOTA_EXCEEDED');
  }
  return directory;
}
function temporaryDirectory() { return ensureTempCapacity(); }

function fileDigest(filePath, expectedSize) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== expectedSize) throw problem('ASSET_STORAGE_MISMATCH');
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const chunk = Buffer.alloc(64 * 1024);
  try {
    let length;
    while ((length = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, length));
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

async function inspectPdf(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 16 || stat.size > MAX_PDF_BYTES) throw problem('INVALID_PDF_SIZE', 400);
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(8), tail = Buffer.alloc(Math.min(stat.size, 2048));
    fs.readSync(fd, head, 0, head.length, 0);
    fs.readSync(fd, tail, 0, tail.length, stat.size - tail.length);
    if (!/^%PDF-[12]\.[0-9]/.test(head.toString('latin1')) || !tail.includes(Buffer.from('%%EOF')) || !tail.includes(Buffer.from('startxref'))) {
      throw problem('INVALID_PDF_SIGNATURE', 400);
    }
  } finally { fs.closeSync(fd); }
  const hash = crypto.createHash('sha256');
  let byteSize = 0;
  try {
    for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 1024 * 1024, signal: AbortSignal.timeout(60000) })) {
      byteSize += chunk.length;
      if (byteSize > MAX_PDF_BYTES) throw problem('INVALID_PDF_SIZE', 400);
      hash.update(chunk);
    }
  } catch (error) {
    if (error.status) throw error;
    throw problem(error.name === 'AbortError' ? 'PDF_PRECHECK_TIMEOUT' : 'PDF_PRECHECK_FAILED');
  }
  if (byteSize !== stat.size) throw problem('PDF_PRECHECK_FAILED');
  return { sha256: hash.digest('hex'), byteSize };
}

function verify(key, sha256, byteSize) {
  if (key !== `${sha256.slice(0, 2)}/${sha256}.pdf`) throw problem('ASSET_STORAGE_MISMATCH');
  const root = assertAvailable();
  const directory = path.join(root, path.dirname(key));
  if (!fs.existsSync(directory)) throw problem('ASSET_STORAGE_MISMATCH');
  ensurePrivateDirectory(directory);
  const target = path.join(root, key);
  if (!fs.existsSync(target) || fileDigest(target, byteSize) !== sha256) throw problem('ASSET_STORAGE_MISMATCH');
  return true;
}

function retain(filePath, sha256, byteSize) {
  const root = assertAvailable();
  const subdir = path.join(root, sha256.slice(0, 2));
  ensurePrivateDirectory(subdir);
  const key = `${sha256.slice(0, 2)}/${sha256}.pdf`;
  const target = path.join(root, key);
  if (fs.existsSync(target)) { verify(key, sha256, byteSize); return { key, created: false }; }
  const sourceStat = fs.lstatSync(filePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || !within(path.join(root, 'tmp'), filePath)) throw problem('PRIVATE_STORAGE_UNSAFE_PATH');
  if (fileDigest(filePath, byteSize) !== sha256) throw problem('ASSET_STORAGE_MISMATCH');
  fs.renameSync(filePath, target);
  fs.chmodSync(target, 0o600);
  return { key, created: true };
}

function removeNewFile(key, db) {
  const root = assertAvailable();
  if (db.prepare('SELECT 1 FROM question_pdf_assets WHERE storage_key=?').get(key)) return false;
  ensurePrivateDirectory(path.join(root, path.dirname(key)));
  const target = path.join(root, key);
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw problem('PRIVATE_STORAGE_UNSAFE_PATH');
    fs.unlinkSync(target);
    return true;
  }
  return false;
}

function cleanupStale(db, now = Date.now()) {
  const root = assertAvailable();
  let removed = 0;
  const oldEnough = file => {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink() && now - stat.mtimeMs > STALE_MS;
  };
  const tmp = ensureTempDirectory();
  for (const name of fs.readdirSync(tmp)) {
    if (removed >= CLEANUP_LIMIT) return removed;
    if (/^[a-f0-9-]{36}$/i.test(name) && oldEnough(path.join(tmp, name))) {
      const active = db.prepare("SELECT 1 FROM question_pdf_upload_sessions WHERE id=? AND updated_at>datetime('now','-1 day')").get(name);
      if (active) continue;
      fs.unlinkSync(path.join(tmp, name));
      db.prepare('DELETE FROM question_pdf_upload_sessions WHERE id=?').run(name);
      removed++;
    }
  }
  db.prepare("DELETE FROM question_pdf_upload_sessions WHERE updated_at<=datetime('now','-1 day')").run();
  for (const prefix of fs.readdirSync(root)) {
    if (removed >= CLEANUP_LIMIT) break;
    if (!/^[a-f0-9]{2}$/.test(prefix)) continue;
    const directory = path.join(root, prefix);
    ensurePrivateDirectory(directory);
    for (const name of fs.readdirSync(directory)) {
      if (removed >= CLEANUP_LIMIT) break;
      if (!new RegExp(`^${prefix}[a-f0-9]{62}\\.pdf$`).test(name)) continue;
      const file = path.join(directory, name), key = `${prefix}/${name}`;
      if (oldEnough(file) && !db.prepare('SELECT 1 FROM question_pdf_assets WHERE storage_key=?').get(key)) { fs.unlinkSync(file); removed++; }
    }
  }
  return removed;
}

module.exports = { MAX_PDF_BYTES, DIRECT_MAX_PDF_BYTES, CHUNK_BYTES, STALE_MS, assertAvailable, temporaryDirectory, ensureTempCapacity, inspectPdf, retain, verify, removeNewFile, cleanupStale, privateRoot };

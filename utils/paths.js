const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolvePath(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return path.isAbsolute(raw) ? raw : path.join(ROOT_DIR, raw);
}

const DATA_DIR = ensureDir(resolvePath(process.env.DATA_DIR, path.join(ROOT_DIR, 'data')));
const UPLOAD_DIR = ensureDir(resolvePath(process.env.UPLOAD_DIR, path.join(ROOT_DIR, 'uploads')));
const DB_PATH = resolvePath(process.env.DB_PATH, path.join(ROOT_DIR, 'db', 'jobapp.db'));

ensureDir(path.dirname(DB_PATH));

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  UPLOAD_DIR,
  DB_PATH,
  ensureDir,
  resolvePath
};

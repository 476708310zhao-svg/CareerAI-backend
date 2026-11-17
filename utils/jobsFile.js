const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR, ensureDir } = require('./paths');

const DEFAULT_JOBS_FILE = path.join(__dirname, '../data/jobs.json');
const JOBS_FILE = path.join(ensureDir(DATA_DIR), 'jobs.json');

function ensureJobsFile() {
  if (fs.existsSync(JOBS_FILE)) return;
  const temp = path.join(path.dirname(JOBS_FILE),
    `.${path.basename(JOBS_FILE)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.init`);
  try {
    const contents = fs.existsSync(DEFAULT_JOBS_FILE)
      ? fs.readFileSync(DEFAULT_JOBS_FILE)
      : Buffer.from(JSON.stringify({ jobs: [], companies: [] }, null, 2));
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, contents);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // A same-directory hard link publishes a fully written file only if none exists.
    try { fs.linkSync(temp, JOBS_FILE); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  } finally {
    try { fs.unlinkSync(temp); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

module.exports = { JOBS_FILE, ensureJobsFile };

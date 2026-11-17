const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const workerCode = `
  const store = require(process.env.JOBS_STORE_MODULE);
  process.send({ type: 'ready' });
  process.on('message', ({ op }) => {
    process.send({ type: 'attempting', op });
    try {
      let value;
      if (op === 'create') value = store.createJob({ title: 'New', company: 'Example' }).id;
      if (op === 'update') value = store.updateJob(1, { title: 'Changed' }, { id: 1 }).title;
      if (op === 'verify') value = store.updateJobVerification(1,
        { expectedVersion: 0, status: 'review_needed', deadline: null, note: 'Check' },
        { id: 1, username: 'admin' }).verification.version;
      if (op === 'delete') value = store.deleteJob(2, { id: 1 });
      if (op === 'missing') value = store.updateJob(999, { title: 'Missing' });
      if (op === 'invalid') value = store.createJob({ title: 'No company' });
      if (op === 'stale') value = store.updateJobVerification(1,
        { expectedVersion: 0, status: 'review_needed', deadline: null, note: 'Stale' },
        { id: 1, username: 'admin' });
      process.send({ type: 'result', op, value });
    } catch (error) {
      process.send({ type: 'error', op, message: error.message, statusCode: error.statusCode });
    }
  });
`;

const firstCreateCode = `
  const fs = require('fs');
  const originalWrite = fs.writeFileSync;
  let paused = false;
  fs.writeFileSync = function (file, contents, ...rest) {
    if (!paused && typeof file === 'number') {
      paused = true;
      const bytes = Buffer.from(contents);
      const middle = Math.floor(bytes.length / 2);
      originalWrite.call(fs, file, bytes.subarray(0, middle), ...rest);
      process.send({ type: 'half-written' });
      const sleeper = new Int32Array(new SharedArrayBuffer(4));
      while (!fs.existsSync(process.env.RELEASE_FILE)) Atomics.wait(sleeper, 0, 0, 20);
      return originalWrite.call(fs, file, bytes.subarray(middle), ...rest);
    }
    return originalWrite.call(fs, file, contents, ...rest);
  };
  require(process.env.JOBS_FILE_MODULE).ensureJobsFile();
  process.send({ type: 'created' });
`;

function removeTestTemp(temp) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const resolvedTemp = fs.realpathSync(temp);
  assert.equal(path.dirname(resolvedTemp), tempRoot,
    'Refusing to remove a path outside the test temp directory');
  fs.rmSync(temp, { recursive: true, force: true });
}

function nextMessage(worker, expectedType, expectedOp) {
  return new Promise((resolve, reject) => {
    if (worker.exitCode !== null) return reject(new Error(`Worker exited before ${expectedType}`));
    const cleanup = () => {
      clearTimeout(timer);
      worker.off('message', onMessage);
      worker.off('exit', onExit);
    };
    const onMessage = message => {
      cleanup();
      try {
        assert.equal(message.type, expectedType, message.message);
        if (expectedOp) assert.equal(message.op, expectedOp);
        resolve(message);
      } catch (error) { reject(error); }
    };
    const onExit = code => {
      cleanup();
      reject(new Error(`Worker exited with ${code} before ${expectedType}`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${expectedType}`));
    }, 10000);
    worker.once('message', onMessage);
    worker.once('exit', onExit);
  });
}

test('all jobs.json mutations wait for a shared SQLite writer lock before reading', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-jobs-lock-'));
  const dataDir = path.join(temp, 'data');
  const dbPath = path.join(temp, 'db', 'jobs-lock.db');
  fs.mkdirSync(dataDir);
  fs.mkdirSync(path.dirname(dbPath));
  const jobsPath = path.join(dataDir, 'jobs.json');
  fs.writeFileSync(jobsPath, JSON.stringify({ jobs: [
    { id: 1, title: 'Seed', company: 'Example', applyUrl: 'https://example.com/apply' }
  ] }));
  const worker = spawn(process.execPath, ['-e', workerCode], {
    env: { ...process.env, DATA_DIR: dataDir, DB_PATH: dbPath,
      JOBS_STORE_MODULE: require.resolve('../utils/adminJobsStore') },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  let stderr = '';
  worker.stderr.on('data', chunk => { stderr += chunk; });
  let lockDb;
  try {
    await nextMessage(worker, 'ready');
    lockDb = new Database(dbPath);
    for (const [op, expected] of [['create', 2], ['update', 'Changed'],
      ['verify', 1], ['delete', true]]) {
      lockDb.exec('BEGIN IMMEDIATE');
      worker.send({ op });
      await nextMessage(worker, 'attempting', op);
      let completed = false;
      const resultPromise = nextMessage(worker, 'result', op).then(message => {
        completed = true;
        return message;
      });
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(completed, false, `${op} wrote jobs.json without waiting for the shared lock`);
      lockDb.exec('COMMIT');
      const result = await resultPromise;
      assert.deepEqual(result.value, expected);
    }
    const saved = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
    assert.deepEqual(saved.jobs.map(job => job.id), [1]);
    assert.equal(saved.jobs[0].title, 'Changed');
    assert.equal(saved.jobVerification['1'].version, 1);
    assert.deepEqual(saved.jobVerificationAudit.map(item => item.action),
      ['verification_updated', 'job_deleted']);
    const beforeRejected = fs.readFileSync(jobsPath);
    for (const [op, type] of [['missing', 'result'], ['invalid', 'error'], ['stale', 'error']]) {
      worker.send({ op });
      await nextMessage(worker, 'attempting', op);
      const response = await nextMessage(worker, type, op);
      if (op === 'missing') assert.equal(response.value, null);
      if (op === 'stale') assert.equal(response.statusCode, 409);
      assert.deepEqual(fs.readFileSync(jobsPath), beforeRejected, `${op} rewrote jobs.json`);
    }
  } finally {
    if (lockDb) {
      if (lockDb.inTransaction) lockDb.exec('ROLLBACK');
      lockDb.close();
    }
    const exit = worker.exitCode === null ? once(worker, 'exit') : Promise.resolve();
    worker.kill();
    await exit;
    removeTestTemp(temp);
    assert.equal(stderr, '', stderr);
  }
});

test('first jobs.json creation never exposes a partially written file to another process', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-jobs-init-'));
  const dataDir = path.join(temp, 'data');
  const jobsPath = path.join(dataDir, 'jobs.json');
  const releaseFile = path.join(temp, 'release');
  const env = { ...process.env, DATA_DIR: dataDir, DB_PATH: path.join(temp, 'db', 'jobs.db'),
    JOBS_FILE_MODULE: require.resolve('../utils/jobsFile'), RELEASE_FILE: releaseFile };
  const first = spawn(process.execPath, ['-e', firstCreateCode], {
    env, stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  let second;
  try {
    await nextMessage(first, 'half-written');
    assert.equal(fs.existsSync(jobsPath), false);
    second = spawn(process.execPath, ['-e', `
      const data = require(process.env.JOB_DATA_MODULE).readJobsData();
      process.send({ type: 'read', count: data.jobs.length });
    `], { env: { ...env, JOB_DATA_MODULE: require.resolve('../utils/jobData') },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const read = await nextMessage(second, 'read');
    const defaultFile = path.join(__dirname, '../data/jobs.json');
    const expected = fs.readFileSync(defaultFile);
    assert.equal(read.count, JSON.parse(expected).jobs.length);
    assert.deepEqual(fs.readFileSync(jobsPath), expected);
    fs.writeFileSync(releaseFile, 'release');
    await nextMessage(first, 'created');
    assert.deepEqual(fs.readFileSync(jobsPath), expected);
  } finally {
    fs.writeFileSync(releaseFile, 'release');
    for (const worker of [first, second].filter(Boolean)) {
      const exit = worker.exitCode === null ? once(worker, 'exit') : Promise.resolve();
      worker.kill();
      await exit;
    }
    removeTestTemp(temp);
  }
});

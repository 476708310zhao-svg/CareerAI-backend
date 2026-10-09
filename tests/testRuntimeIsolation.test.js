const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const HELPER_PATH = path.join(__dirname, 'helpers', 'isolatedTestRuntime.cjs');
const TEMP_ROOT = fs.realpathSync.native(os.tmpdir());
const HARNESS_PREFIX = 'jobapp-isolation-regression-';
const SECRET_SENTINEL = 'isolation-secret-must-not-appear-7f53c2d4';

function makeHarness(label) {
  return fs.mkdtempSync(path.join(TEMP_ROOT, `${HARNESS_PREFIX}${label}-`));
}

function removeHarness(harnessRoot) {
  const resolved = path.resolve(harnessRoot);
  assert.equal(fs.realpathSync.native(path.dirname(resolved)), TEMP_ROOT);
  assert.ok(path.basename(resolved).startsWith(HARNESS_PREFIX));
  fs.rmSync(resolved, { recursive: true, force: true });
}

function fingerprint(filePath) {
  const stat = fs.statSync(filePath);
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
  };
}

function runNode(args, environment) {
  const env = {
    ...process.env,
    ...environment,
    ISOLATION_SECRET_SENTINEL: SECRET_SENTINEL,
  };
  // A nested `node --test` inherits this internal marker from the parent
  // runner and otherwise refuses to execute the fixture as a recursive run.
  delete env.NODE_TEST_CONTEXT;
  return childProcess.spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env,
  });
}

function outputOf(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function assertNoSecretOutput(result) {
  assert.doesNotMatch(outputOf(result), new RegExp(SECRET_SENTINEL));
}

function assertSuccessful(result) {
  assert.equal(result.error, undefined, result.error && result.error.message);
  assert.equal(result.status, 0, outputOf(result));
  assertNoSecretOutput(result);
}

function readRecordedRoot(recordPath) {
  const root = fs.readFileSync(recordPath, 'utf8').trim();
  assert.ok(root);
  assert.equal(path.dirname(root), TEMP_ROOT);
  assert.ok(path.basename(root).startsWith('jobapp-test-'));
  return root;
}

test('isolated runtime overrides bait paths, uses its own database, and cleans on normal exit', () => {
  const harnessRoot = makeHarness('override');
  try {
    const baitDb = path.join(harnessRoot, 'do-not-open.sqlite');
    const baitData = path.join(harnessRoot, 'data');
    const baitUploads = path.join(harnessRoot, 'uploads');
    const recordPath = path.join(harnessRoot, 'runtime-root.txt');
    fs.writeFileSync(baitDb, 'not-a-sqlite-database-and-must-stay-unchanged');
    fs.mkdirSync(baitData);
    fs.mkdirSync(baitUploads);
    fs.writeFileSync(path.join(baitData, 'marker.txt'), 'data-marker');
    fs.writeFileSync(path.join(baitUploads, 'marker.txt'), 'upload-marker');
    const before = fingerprint(baitDb);

    const script = `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const path = require('node:path');
      const runtime = require(${JSON.stringify(HELPER_PATH)});
      runtime.install();
      const paths = runtime.paths();
      assert.notEqual(paths.dbPath, process.env.BAIT_DB_PATH);
      assert.notEqual(paths.dataDir, process.env.BAIT_DATA_DIR);
      assert.notEqual(paths.uploadDir, process.env.BAIT_UPLOAD_DIR);
      assert.equal(process.env.DB_PATH, paths.dbPath);
      assert.equal(process.env.DATA_DIR, paths.dataDir);
      assert.equal(process.env.UPLOAD_DIR, paths.uploadDir);
      runtime.prepare();
      fs.writeFileSync(process.env.ISOLATION_RECORD_PATH, paths.root);
    `;
    const result = runNode(['-e', script], {
      DB_PATH: baitDb,
      DATA_DIR: baitData,
      UPLOAD_DIR: baitUploads,
      BAIT_DB_PATH: baitDb,
      BAIT_DATA_DIR: baitData,
      BAIT_UPLOAD_DIR: baitUploads,
      ISOLATION_RECORD_PATH: recordPath,
    });

    assertSuccessful(result);
    const isolatedRoot = readRecordedRoot(recordPath);
    assert.equal(fs.existsSync(isolatedRoot), false);
    assert.deepEqual(fingerprint(baitDb), before);
    assert.equal(fs.readFileSync(path.join(baitData, 'marker.txt'), 'utf8'), 'data-marker');
    assert.equal(fs.readFileSync(path.join(baitUploads, 'marker.txt'), 'utf8'), 'upload-marker');
  } finally {
    removeHarness(harnessRoot);
  }
});

test('isolated runtime cleans after zero-match and failing node:test runs', () => {
  const harnessRoot = makeHarness('node-test');
  try {
    const fixturePath = path.join(harnessRoot, 'fixture.test.cjs');
    fs.writeFileSync(fixturePath, `
      const test = require('node:test');
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const runtime = require(${JSON.stringify(HELPER_PATH)});
      runtime.install();
      runtime.registerCleanup(test);
      fs.writeFileSync(process.env.ISOLATION_RECORD_PATH, runtime.paths().root);
      test('fixture test', () => {
        if (process.env.FAIL_FIXTURE === '1') assert.fail('intentional isolation regression failure');
      });
    `);

    const zeroMatchRecord = path.join(harnessRoot, 'zero-match-root.txt');
    const zeroMatch = runNode(
      ['--test', '--test-name-pattern=does-not-match', fixturePath],
      { ISOLATION_RECORD_PATH: zeroMatchRecord }
    );
    assertSuccessful(zeroMatch);
    assert.ok(fs.existsSync(zeroMatchRecord), outputOf(zeroMatch));
    assert.equal(fs.existsSync(readRecordedRoot(zeroMatchRecord)), false);

    const failureRecord = path.join(harnessRoot, 'failure-root.txt');
    const failure = runNode(['--test', fixturePath], {
      FAIL_FIXTURE: '1',
      ISOLATION_RECORD_PATH: failureRecord,
    });
    assert.equal(failure.error, undefined, failure.error && failure.error.message);
    assert.notEqual(failure.status, 0, outputOf(failure));
    assertNoSecretOutput(failure);
    assert.ok(fs.existsSync(failureRecord), outputOf(failure));
    assert.equal(fs.existsSync(readRecordedRoot(failureRecord)), false);
  } finally {
    removeHarness(harnessRoot);
  }
});

test('public path fields and replacement global state cannot redirect cleanup', () => {
  const harnessRoot = makeHarness('state-tamper');
  const baitRoot = fs.mkdtempSync(path.join(TEMP_ROOT, 'jobapp-test-bait-'));
  try {
    const baitMarker = path.join(baitRoot, 'marker.txt');
    const recordPath = path.join(harnessRoot, 'runtime-root.txt');
    fs.writeFileSync(baitMarker, 'must-survive');

    const script = `
      'use strict';
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const runtime = require(${JSON.stringify(HELPER_PATH)});
      (async () => {
        runtime.install();
        const paths = runtime.paths();
        fs.writeFileSync(process.env.ISOLATION_RECORD_PATH, paths.root);
        const stateKey = Symbol.for('jobapp.tests.isolated-runtime.v1');
        const publishedState = globalThis[stateKey];
        assert.equal(Object.isFrozen(runtime), true);
        assert.equal(Object.isFrozen(paths), true);
        assert.equal(Object.isFrozen(publishedState), true);
        assert.throws(() => { paths.root = process.env.BAIT_ROOT; }, TypeError);
        assert.throws(() => { publishedState.root = process.env.BAIT_ROOT; }, TypeError);
        globalThis[stateKey] = {
          root: process.env.BAIT_ROOT,
          tempRoot: require('node:path').dirname(process.env.BAIT_ROOT),
          servers: new Set(),
        };
        await runtime.cleanup();
        assert.equal(fs.readFileSync(process.env.BAIT_MARKER, 'utf8'), 'must-survive');
      })().catch(error => {
        console.error(error && error.message ? error.message : String(error));
        process.exitCode = 1;
      });
    `;
    const result = runNode(['-e', script], {
      BAIT_ROOT: baitRoot,
      BAIT_MARKER: baitMarker,
      ISOLATION_RECORD_PATH: recordPath,
    });

    assertSuccessful(result);
    assert.equal(fs.readFileSync(baitMarker, 'utf8'), 'must-survive');
    assert.equal(fs.existsSync(readRecordedRoot(recordPath)), false);
  } finally {
    fs.rmSync(baitRoot, { recursive: true, force: true });
    removeHarness(harnessRoot);
  }
});

test('cleanup rejects a root replaced by a symlink or junction without touching its target', t => {
  const harnessRoot = makeHarness('root-link');
  try {
    const baitRoot = path.join(harnessRoot, 'link-target');
    const baitMarker = path.join(baitRoot, 'marker.txt');
    const resultPath = path.join(harnessRoot, 'result.txt');
    fs.mkdirSync(baitRoot);
    fs.writeFileSync(baitMarker, 'link-target-must-survive');

    const script = `
      'use strict';
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const runtime = require(${JSON.stringify(HELPER_PATH)});
      (async () => {
        runtime.install();
        const root = runtime.paths().root;
        const originalRoot = root + '-original';
        let linkCreated = false;
        fs.renameSync(root, originalRoot);
        try {
          try {
            fs.symlinkSync(process.env.BAIT_ROOT, root, process.platform === 'win32' ? 'junction' : 'dir');
            linkCreated = true;
          } catch (error) {
            if (process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
              fs.writeFileSync(process.env.RESULT_PATH, 'SKIP_LINK_CREATION:' + error.code);
              return;
            }
            throw error;
          }
          await assert.rejects(runtime.cleanup(), /cleanup failed/i);
          assert.equal(fs.readFileSync(process.env.BAIT_MARKER, 'utf8'), 'link-target-must-survive');
          fs.writeFileSync(process.env.RESULT_PATH, 'REJECTED_REPLACED_ROOT');
        } finally {
          if (linkCreated && fs.lstatSync(root).isSymbolicLink()) fs.unlinkSync(root);
          fs.rmSync(originalRoot, { recursive: true, force: true });
        }
      })().catch(error => {
        console.error(error && error.stack ? error.stack : String(error));
        process.exitCode = 1;
      });
    `;
    const result = runNode(['-e', script], {
      BAIT_ROOT: baitRoot,
      BAIT_MARKER: baitMarker,
      RESULT_PATH: resultPath,
    });

    assertSuccessful(result);
    const outcome = fs.readFileSync(resultPath, 'utf8');
    if (outcome.startsWith('SKIP_LINK_CREATION:')) {
      t.skip(`symlink/junction creation unavailable: ${outcome.split(':')[1]}`);
      return;
    }
    assert.equal(outcome, 'REJECTED_REPLACED_ROOT');
    assert.equal(fs.readFileSync(baitMarker, 'utf8'), 'link-target-must-survive');
  } finally {
    removeHarness(harnessRoot);
  }
});

test('normal cleanup reports server errors after continuing through root removal', () => {
  const harnessRoot = makeHarness('cleanup-errors');
  try {
    const recordPath = path.join(harnessRoot, 'runtime-root.txt');
    const script = `
      'use strict';
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const runtime = require(${JSON.stringify(HELPER_PATH)});
      (async () => {
        runtime.install();
        const root = runtime.paths().root;
        fs.writeFileSync(process.env.ISOLATION_RECORD_PATH, root);
        runtime.trackServer({
          listening: true,
          close(callback) { callback(new Error('intentional close failure')); },
          closeAllConnections() {},
        });
        await assert.rejects(runtime.cleanup(), error => {
          assert.equal(error instanceof AggregateError, true);
          assert.match(error.message, /cleanup failed/i);
          assert.equal(error.errors.some(item => /intentional close failure/.test(item.message)), true);
          return true;
        });
        assert.equal(fs.existsSync(root), false);
      })().catch(error => {
        console.error(error && error.stack ? error.stack : String(error));
        process.exitCode = 1;
      });
    `;
    const result = runNode(['-e', script], { ISOLATION_RECORD_PATH: recordPath });

    assertSuccessful(result);
    assert.equal(fs.existsSync(readRecordedRoot(recordPath)), false);
  } finally {
    removeHarness(harnessRoot);
  }
});

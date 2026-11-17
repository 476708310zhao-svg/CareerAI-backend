'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('submission fact analytics reconciliation is isolated, retryable and idempotent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-submission-reconcile-'));
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  assert.match(path.basename(root), /^jobapp-submission-reconcile-[A-Za-z0-9_-]+$/);
  try {
    const result = spawnSync(process.execPath, [
      '--test', '--test-reporter=spec', path.join(__dirname, 'helpers/applicationSubmissionReconciliationFixture.cjs')
    ], { encoding: 'utf8', timeout: 120000,
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_'))),
        APPLICATION_RECONCILE_FIXTURE_ROOT: root } });
    const output = `${result.stdout || ''}${result.stderr || ''}${result.error || ''}`;
    assert.equal(result.status, 0, output);
    assert.match(result.stdout, /fail 0/);
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^jobapp-submission-reconcile-[A-Za-z0-9_-]+$/);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

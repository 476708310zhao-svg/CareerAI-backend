'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('application resume selection and user material checklist are owner isolated and CAS protected', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-application-readiness-'));
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.match(path.basename(resolved), /^jobapp-application-readiness-[A-Za-z0-9_-]+$/);
  try {
    const result = spawnSync(process.execPath,
      ['--test', '--test-reporter=dot', path.join(__dirname, 'helpers/applicationReadinessFixture.cjs')], {
        encoding: 'utf8', timeout: 120000,
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_'))),
          APPLICATION_READINESS_FIXTURE_ROOT: resolved }
      });
    const output = `${result.stdout || ''}${result.stderr || ''}${result.error || ''}`;
    assert.equal(result.status, 0, output);
  } finally {
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^jobapp-application-readiness-[A-Za-z0-9_-]+$/);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

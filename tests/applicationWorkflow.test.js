'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('application workflow and workspace backend pass in an isolated process', () => {
  const prefix = 'jobapp-application-workflow-';
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const resolvedRoot = path.resolve(temporaryRoot);
  const validateRoot = () => {
    assert.equal(path.dirname(resolvedRoot), path.resolve(os.tmpdir()), 'fixture root must be directly under the system temp directory');
    assert.match(path.basename(resolvedRoot), new RegExp(`^${prefix}[A-Za-z0-9_-]+$`));
  };
  validateRoot();
  try {
    const environment = {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_'))),
      APPLICATION_WORKFLOW_FIXTURE_ROOT: resolvedRoot
    };
    const result = spawnSync(process.execPath, [
      '--test', '--test-reporter=spec', path.join(__dirname, 'helpers/applicationWorkflowFixture.cjs')
    ], {
      encoding: 'utf8',
      timeout: 120000,
      env: environment
    });
    const output = `${result.stdout || ''}${result.stderr || ''}${result.error || ''}`;
    assert.equal(result.status, 0, output);
    assert.match(result.stdout, /tests 21/);
    assert.match(result.stdout, /fail 0/);
  } finally {
    validateRoot();
    fs.rmSync(resolvedRoot, { recursive: true, force: true });
  }
});

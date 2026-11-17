'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
test('commerce audit and refund decisions require live memberships permission', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-commerce-audit-'));
  try {
    const result = spawnSync(process.execPath, ['--test', path.join(__dirname, 'helpers', 'commerceAuditAuthFixture.cjs')], {
      encoding: 'utf8', timeout: 120000,
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_'))), COMMERCE_AUDIT_FIXTURE_ROOT: root }
    });
    assert.equal(result.status, 0, `${result.stdout || ''}${result.stderr || ''}${result.error || ''}`);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^jobapp-commerce-audit-[A-Za-z0-9_-]+$/);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

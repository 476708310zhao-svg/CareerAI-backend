'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isAllowedBrowserExtensionOrigin } = require('../utils/browserExtensionOrigin');

test('extension API CORS requires the one configured extension ID and only the grant consumer', () => {
  const allowed = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  assert.equal(isAllowedBrowserExtensionOrigin(allowed, allowed), true);
  assert.equal(isAllowedBrowserExtensionOrigin('chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', allowed), false);
  assert.equal(isAllowedBrowserExtensionOrigin('https://evil.example', allowed), false);
  assert.equal(isAllowedBrowserExtensionOrigin(allowed, ''), false);
});

test('MV3 package has narrow ATS access and its content script never sends page data', () => {
  const root = path.join(__dirname, '..', 'extensions', 'career-form-assistant');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, [
    'https://boards.greenhouse.io/*', 'https://job-boards.greenhouse.io/*', 'https://jobs.lever.co/*',
    'https://jobs.ashbyhq.com/*'
  ]);
  const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  assert.doesNotMatch(content, /fetch\s*\(|XMLHttpRequest|sendBeacon|innerHTML|\.submit\s*\(|\.click\s*\(/i);
  assert.match(content, /sender\?\.tab\?\.id/);
  assert.match(content, /senderUrl\.hostname === location\.hostname/);
  assert.match(content, /message\.host !== location\.hostname/);
  assert.match(content, /candidate\.element\.isConnected/);
  assert.match(content, /controls\.clear\(\)/);
  const popup = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  assert.doesNotMatch(popup, /localStorage|sessionStorage/);
  assert.match(popup, /tokenInput\.value\s*=\s*''/);
  assert.match(popup, /expectedIds\.some\(\(id, index\) => id !== actualIds\[index\]\)/);
  assert.match(popup, /permissions\.request\(\{ origins: \[originPattern\] \}\)/);
});

test('browser extension grants are short-lived, owner-scoped, single-use and origin constrained', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-extension-grant-'));
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.match(path.basename(resolved), /^jobapp-extension-grant-[A-Za-z0-9_-]+$/);
  try {
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec',
      path.join(__dirname, 'helpers/browserExtensionGrantFixture.cjs')], {
      encoding: 'utf8', timeout: 120000,
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_'))),
        BROWSER_EXTENSION_GRANT_FIXTURE_ROOT: resolved }
    });
    const output = `${result.stdout || ''}${result.stderr || ''}${result.error || ''}`;
    assert.equal(result.status, 0, output);
  } finally {
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^jobapp-extension-grant-[A-Za-z0-9_-]+$/);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

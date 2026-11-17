'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('smoke suite runs in its own process with live job sources disabled before server load', () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('NODE_TEST_')));
  env.LIVE_JOBS_ENABLED = 'false';
  env.DISABLE_FREE_JOB_SOURCES = 'true';
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', path.join(__dirname, 'smoke.test.js')], {
    cwd: path.join(__dirname, '..'), env, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.equal(result.status, 0, output.slice(-6000) || String(result.error || 'smoke 子进程未成功退出'));
  assert.match(output, /tests\s+74\b/, 'smoke 子进程没有执行完整 74 项');
  assert.match(output, /fail\s+0\b/, 'smoke 子进程仍有失败');
});

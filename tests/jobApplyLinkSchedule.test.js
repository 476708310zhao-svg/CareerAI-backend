const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const runtime = require('./helpers/isolatedTestRuntime.cjs');

runtime.install();
runtime.registerCleanup(test);

const store = require('../utils/adminJobsStore');
const { runScheduledLinkCheck, shanghaiHourSlot, LEASE_MS, LINK_COOLDOWN_MS } =
  require('../services/jobApplyLinkSchedule');

function fixture(t, data = { jobs: [], companies: [] }) {
  runtime.prepare();
  const jobsPath = path.join(runtime.paths().dataDir, 'jobs.json');
  require('../utils/jobsFile').ensureJobsFile();
  const previous = fs.readFileSync(jobsPath);
  fs.writeFileSync(jobsPath, JSON.stringify(data));
  t.after(() => fs.writeFileSync(jobsPath, previous));
  return jobsPath;
}

function childClaim(slot, nowMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'helpers/jobLinkScheduleClaimProbe.cjs'),
      slot, String(nowMs)], { cwd: path.join(__dirname, '..'), env: { ...process.env },
      windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claim child exited ${code}: ${stderr}`));
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
  });
}

function runCli(args, scheduleEnabled) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '../scripts/check_job_apply_links.js'), ...args], {
      cwd: path.join(__dirname, '..'), env: { ...process.env,
        JOB_LINK_CHECK_SCHEDULE_ENABLED: scheduleEnabled }, windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

test('Shanghai hour slot rolls over at local midnight', () => {
  assert.equal(shanghaiHourSlot(Date.parse('2026-10-28T15:59:00.000Z')), '2026-10-28T23');
  assert.equal(shanghaiHourSlot(Date.parse('2026-10-28T16:00:00.000Z')), '2026-10-29T00');
});

test('shared schedule claim rejects duplicates and stale owners, then allows recovery', t => {
  const jobsPath = fixture(t);
  const nowMs = Date.parse('2026-10-28T16:05:00.000Z');
  const slot = shanghaiHourSlot(nowMs);
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  assert.equal(store.claimScheduledLinkCheck({ slot, owner: first, nowMs, leaseMs: LEASE_MS }).claimed, true);
  assert.deepEqual(store.claimScheduledLinkCheck({ slot, owner: second, nowMs, leaseMs: LEASE_MS }),
    { claimed: false, reason: 'already_running' });
  assert.equal(store.finishScheduledLinkCheck({ slot, owner: second, nowMs, succeeded: true }), false);
  assert.equal(store.claimScheduledLinkCheck({ slot, owner: second, nowMs: nowMs + LEASE_MS + 1,
    leaseMs: LEASE_MS }).claimed, true);
  assert.equal(store.finishScheduledLinkCheck({ slot, owner: first,
    nowMs: nowMs + LEASE_MS + 2, succeeded: true }), false);
  assert.equal(store.finishScheduledLinkCheck({ slot, owner: second,
    nowMs: nowMs + LEASE_MS + 3, succeeded: true, summary: { selected: 2, recorded: 1 } }), true);
  assert.deepEqual(store.claimScheduledLinkCheck({ slot, owner: first, nowMs: nowMs + LEASE_MS + 4,
    leaseMs: LEASE_MS }), { claimed: false, reason: 'already_completed' });
  const nextSlot = shanghaiHourSlot(nowMs + 60 * 60 * 1000);
  assert.equal(store.claimScheduledLinkCheck({ slot: nextSlot, owner: first,
    nowMs: nowMs + 60 * 60 * 1000, leaseMs: LEASE_MS }).claimed, true);
  const saved = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
  assert.equal(saved.jobApplyLinkSchedule.lastCompletedSlot, slot);
  assert.equal(saved.jobApplyLinkSchedule.lastRun.summary.recorded, 1);
});

test('two isolated processes cannot claim the same hour', async t => {
  fixture(t);
  const nowMs = Date.parse('2026-10-29T00:01:00.000Z');
  const slot = shanghaiHourSlot(nowMs);
  const results = await Promise.all([childClaim(slot, nowMs), childClaim(slot, nowMs)]);
  assert.equal(results.filter(result => result.claimed).length, 1);
  assert.equal(results.filter(result => result.reason === 'already_running').length, 1);
});

test('failed batch can retry in the same hour and success skips duplicates', async t => {
  const jobsPath = fixture(t, { jobs: [{ id: 1, title: 'Open', company: 'A',
    applyUrl: 'https://example.com/apply' }], companies: [], jobVerification: {
    '1': { status: 'open', employerApplyUrl: 'https://example.com/apply', version: 1,
      availabilityHold: false }
  } });
  let nowMs = Date.parse('2026-10-29T01:00:00.000Z');
  let calls = 0;
  const runBatch = async options => {
    calls += 1;
    assert.equal(options.minAgeMs, LINK_COOLDOWN_MS);
    if (calls === 1) throw new Error('synthetic batch failure');
    return { selected: 0, attempted: 0, deferred: 0, recorded: 0 };
  };
  const options = { store, runBatch, now: () => nowMs };
  assert.equal((await runScheduledLinkCheck(options)).status, 'failed');
  assert.equal(JSON.parse(fs.readFileSync(jobsPath, 'utf8')).jobApplyLinkSchedule.lastCompletedSlot, null);
  assert.equal((await runScheduledLinkCheck(options)).status, 'ran');
  assert.deepEqual(await runScheduledLinkCheck(options), {
    status: 'skipped', reason: 'already_completed', slot: shanghaiHourSlot(nowMs)
  });
  nowMs += 60 * 60 * 1000;
  assert.equal((await runScheduledLinkCheck(options)).status, 'ran');
  assert.equal(calls, 3);
  assert.equal(JSON.parse(fs.readFileSync(jobsPath, 'utf8')).jobVerification['1'].status, 'open');
});

test('scheduled candidates cool down for 24 hours while manual candidates remain available', t => {
  fixture(t, { jobs: [{ id: 1, title: 'Open', company: 'A',
    applyUrl: 'https://example.com/apply' }], companies: [], jobVerification: {
    '1': { status: 'open', employerApplyUrl: 'https://example.com/apply', version: 1,
      availabilityHold: false }
  } });
  const checkedAt = Date.parse('2026-10-29T02:00:00.000Z');
  assert.equal(store.recordLinkCheck(1, 'https://example.com/apply', {
    checkedAt: new Date(checkedAt).toISOString(), outcome: 'reachable', reason: 'http_success',
    statusCode: 200, redirects: 0
  }), true);
  assert.equal(store.listLinkCheckCandidates(10).length, 1);
  assert.equal(store.listLinkCheckCandidates(10, {
    minAgeMs: LINK_COOLDOWN_MS, nowMs: checkedAt + 60 * 60 * 1000
  }).length, 0);
  assert.equal(store.listLinkCheckCandidates(10, {
    minAgeMs: LINK_COOLDOWN_MS, nowMs: checkedAt + LINK_COOLDOWN_MS
  }).length, 1);
});

test('scheduled CLI stays disabled by default and deduplicates an empty isolated batch', async t => {
  const jobsPath = fixture(t);
  const before = fs.readFileSync(jobsPath);
  const disabled = await runCli(['--scheduled', '--limit', '1'], '0');
  assert.equal(disabled.code, 2);
  assert.deepEqual(JSON.parse(disabled.stdout), { status: 'failed', reason: 'schedule_disabled' });
  assert.deepEqual(fs.readFileSync(jobsPath), before);
  const first = await runCli(['--scheduled', '--limit', '1'], '1');
  assert.equal(first.code, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).status, 'ran');
  assert.equal(JSON.parse(first.stdout).summary.selected, 0);
  const second = await runCli(['--scheduled', '--limit', '1'], '1');
  assert.equal(second.code, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).status, 'skipped');
  assert.equal(JSON.parse(second.stdout).reason, 'already_completed');
});

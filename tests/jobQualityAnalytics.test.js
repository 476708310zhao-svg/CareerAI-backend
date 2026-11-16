'use strict';
const runtime = require('./helpers/isolatedTestRuntime.cjs');
runtime.install();
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = runtime.prepare();
const { app } = require('../server');
const { aggregateJobs } = require('../services/v4JobQualityAnalytics');
const { permissionForAdminPath } = require('../utils/adminPermissions');
runtime.registerCleanup(test);

let server;
let base;
test.before(async () => {
  db.prepare(`INSERT INTO admin_accounts(id,username,password_hash,role,permissions,is_active)
    VALUES (99221,'job-quality-viewer','test-only','operator',?,1)`)
    .run(JSON.stringify(['dashboard']));
  db.prepare(`INSERT INTO admin_accounts(id,username,password_hash,role,permissions,is_active)
    VALUES (99222,'job-quality-jobs-only','test-only','operator',?,1)`)
    .run(JSON.stringify(['jobs']));
  server = runtime.trackServer(app.listen(0, '127.0.0.1'));
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/admin/api/v4/operations/jobs/quality`;
});

test('job quality aggregates only traceable verified, reachable, non-fallback future jobs', () => {
  const now = new Date('2026-11-02T04:00:00.000Z');
  const good = {
    id: 1, region: '上海', jobType: '实习', source: 'greenhouse', applyUrl: 'https://jobs.example/apply',
    deadline: '2026-12-01', updatedAt: '2026-10-20',
    verification: { status: 'open', verifiedAt: '2026-10-30T00:00:00.000Z', employerApplyUrl: 'https://jobs.example/apply' },
    linkHealth: { outcome: 'reachable', checkedAt: '2026-11-01T00:00:00.000Z' }
  };
  const fallback = { ...good, id: 2, isFallback: true };
  const unverified = { ...good, id: 3, verification: { ...good.verification, status: 'review_needed' } };
  const staleLink = { ...good, id: 4, linkHealth: { outcome: 'needs_review', checkedAt: '2026-11-01T00:00:00.000Z' } };
  const unknownDeadline = { ...good, id: 5, deadline: null, verification: { ...good.verification, deadline: null } };
  const result = aggregateJobs([good, fallback, unverified, staleLink, unknownDeadline], now);
  assert.equal(result.qualifiedLiveJobs, 1);
  assert.equal(result.totalSnapshotJobs, 5);
  assert.equal(result.exclusions.fallback, 1);
  assert.equal(result.exclusions.unverified, 1);
  assert.equal(result.exclusions.linkNotReachable, 1);
  assert.equal(result.exclusions.deadlineUnknown, 1);
  assert.deepEqual(result.breakdown.sources, [{ key: 'greenhouse', count: 1 }]);
  assert.equal(JSON.stringify(result).includes('userId'), false);
});

test('quality analytics endpoint is dashboard-only and returns aggregate data without personal fields', async () => {
  assert.equal(permissionForAdminPath('/admin/api/v4/operations/jobs/quality'), 'dashboard');
  assert.equal(permissionForAdminPath('/admin/api/v4/operations/jobs/quality-extra'), null);
  const noAuth = await fetch(base);
  assert.equal(noAuth.status, 401);
  const token = permissions => jwt.sign({ role: 'admin', id: permissions.includes('jobs') ? 99222 : 99221,
    sub: permissions.includes('jobs') ? 'job-quality-jobs-only' : 'job-quality-viewer', permissions }, process.env.JWT_SECRET);
  const denied = await fetch(base, { headers: { Authorization: `Bearer ${token(['jobs'])}` } });
  assert.equal(denied.status, 403);
  const allowed = await fetch(base, { headers: { Authorization: `Bearer ${token(['dashboard'])}` } });
  assert.equal(allowed.status, 200);
  const body = await allowed.json();
  assert.equal(body.code, 0);
  assert.equal(JSON.stringify(body.data).includes('userId'), false);
  assert.equal(body.data.jobQuality.universe, 'local_jobs_json_only');
  assert.equal(body.data.submissionConversions.applications, null, 'no sample must not be reported as zero conversions');
  assert.equal(permissionForAdminPath('/admin/api/v4/operations/dashboard'), 'dashboard');
});

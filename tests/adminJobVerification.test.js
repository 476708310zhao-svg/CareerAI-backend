const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const runtime = require('./helpers/isolatedTestRuntime.cjs');

runtime.install();
runtime.registerCleanup(test);

test('local deadline hold uses only valid calendar dates in Shanghai', () => {
  const { isExpiredLocalJob, isUnavailableLocalJob } = require('../utils/jobData');
  const beforeMidnight = new Date('2026-10-27T15:59:59.000Z');
  const atMidnight = new Date('2026-10-27T16:00:00.000Z');
  const job = { deadline: '2026-10-27' };
  assert.equal(isExpiredLocalJob(job, beforeMidnight), false);
  assert.equal(isExpiredLocalJob(job, atMidnight), true);
  assert.equal(isUnavailableLocalJob(job, { status: 'open' }, beforeMidnight), false);
  assert.equal(isUnavailableLocalJob(job, { status: 'open' }, atMidnight), true);
  assert.equal(isUnavailableLocalJob(job, { status: 'closed' }, beforeMidnight), true);
  assert.equal(isExpiredLocalJob({ deadline: '2026-10-27T12:00:00+08:00' }, new Date('2026-10-27T03:59:59Z')), false);
  assert.equal(isExpiredLocalJob({ deadline: '2026-10-27T12:00:00+08:00' }, new Date('2026-10-27T04:00:00Z')), true);
  for (const deadline of [undefined, '', '2026-02-30', '2026-02-30T12:00:00Z',
    '2026-10-27T12:00:00', '2026-10-27T12:00:00+14:30', 'unknown']) {
    assert.equal(isExpiredLocalJob({ deadline }, atMidnight), false, String(deadline));
  }
});

test('admin job verification keeps server-owned audit, rejects spoofing and invalid links', async () => {
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'admin_password';
  process.env.JWT_SECRET = 'test_secret_please_do_not_use_in_production_1234567890';
  process.env.RAPID_API_KEY = '';
  process.env.LIVE_JOBS_ENABLED = 'false';
  process.env.DISABLE_FREE_JOB_SOURCES = 'true';
  runtime.prepare();
  require('../utils/featureFlags').updateFeatureFlag('recruitment', true);
  const server = runtime.trackServer(require('../server').startServer(0));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/admin/api/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin_password' }) });
  assert.equal(login.status, 200);
  const token = (await login.json()).data.token;
  const request = async (method, url, body, auth = token) => {
    const res = await fetch(`${base}${url}`, { method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, retryAfter: res.headers.get('retry-after'), body: await res.json() };
  };
  const userToken = jwt.sign({ userId: 1 }, process.env.JWT_SECRET);
  // An old JSON row may contain an invalid date that the current admin form rejects.
  // Check this before the long test reaches the shared jobs search rate limit.
  const jobsPath = path.join(runtime.paths().dataDir, 'jobs.json');
  const legacyData = require('../utils/jobData').readJobsData();
  const invalidId = Math.max(...legacyData.jobs.map(job => Number(job.id) || 0)) + 1;
  legacyData.jobs.unshift({ id: invalidId, title: '旧数据无效日期', company: 'Legacy Employer',
    location: 'Remote', region: '美国', jobType: 'Remote',
    postedAt: new Date().toISOString().slice(0, 10), applyUrl: 'https://example.com/legacy', deadline: '2026-02-30' });
  fs.writeFileSync(jobsPath, JSON.stringify(legacyData));
  const invalidWeb = await request('GET', `/api/jobs/${invalidId}`);
  assert.equal(invalidWeb.body.data.isApplyAvailable, true);
  assert.equal(invalidWeb.body.data.dataMeta.isExpired, false);
  const invalidV4 = await request('GET', `/api/v4/jobs/${invalidId}/detail`, undefined, userToken);
  assert.equal(invalidV4.body.data.job.isApplyAvailable, true);
  assert.equal(invalidV4.body.data.job.dataMeta.isExpired, false);
  const invalidSearch = await request('GET', `/api/jobs/search?country=global&query=${encodeURIComponent('旧数据无效日期')}`);
  const invalidSearchRow = invalidSearch.body.data.find(job => job.job_id === String(invalidId));
  assert.ok(invalidSearchRow);
  assert.equal(invalidSearchRow.dataMeta.isExpired, false);
  const title = `核验测试 ${Date.now()}`;
  let result = await request('POST', '/admin/api/jobs', { title, company: 'Example', verificationStatus: 'open' });
  assert.equal(result.status, 400);
  result = await request('POST', '/admin/api/jobs', { title: { unsafe: true }, company: 'Example' });
  assert.equal(result.status, 400);
  result = await request('POST', '/admin/api/jobs', { title, company: 'Example', _source: 'internal' });
  assert.equal(result.status, 400);
  result = await request('POST', '/admin/api/jobs', { title, company: 'Example', applyUrl: 'javascript:alert(1)' });
  assert.equal(result.status, 400);
  result = await request('POST', '/admin/api/jobs', { title, company: 'Example', applyUrl: 'https://example.com/apply' });
  assert.equal(result.status, 200);
  const id = result.body.data.id;
  const endpoint = `/admin/api/jobs/${id}/verification`;
  const db = require('../db/database');
  const oldBusyTimeout = db.pragma('busy_timeout', { simple: true });
  const blocker = new Database(runtime.paths().dbPath);
  const beforeBusy = fs.readFileSync(jobsPath);
  try {
    db.pragma('busy_timeout = 20');
    blocker.exec('BEGIN IMMEDIATE');
    for (const [method, url, body] of [
      ['POST', '/admin/api/jobs', { title: 'Blocked', company: 'Example' }],
      ['PUT', `/admin/api/jobs/${id}`, { title: 'Blocked' }],
      ['PUT', endpoint, { expectedVersion: 0, status: 'review_needed', deadline: null }],
      ['DELETE', `/admin/api/jobs/${id}`, undefined]
    ]) {
      const busy = await request(method, url, body);
      assert.equal(busy.status, 503, `${method} ${url}`);
      assert.equal(busy.retryAfter, '1');
      assert.equal(busy.body.message, '岗位更新暂时繁忙，请稍后重试');
      assert.deepEqual(fs.readFileSync(jobsPath), beforeBusy);
    }
  } finally {
    if (blocker.inTransaction) blocker.exec('ROLLBACK');
    blocker.close();
    db.pragma(`busy_timeout = ${oldBusyTimeout}`);
  }
  const beforeMalformed = fs.readFileSync(jobsPath);
  try {
    fs.writeFileSync(jobsPath, '{ invalid json');
    for (const [method, url, body] of [
      ['POST', '/admin/api/jobs', { title: 'Blocked', company: 'Example' }],
      ['PUT', `/admin/api/jobs/${id}`, { title: 'Blocked' }],
      ['PUT', endpoint, { expectedVersion: 0, status: 'review_needed', deadline: null }],
      ['DELETE', `/admin/api/jobs/${id}`, undefined]
    ]) {
      const malformed = await request(method, url, body);
      assert.equal(malformed.status, 500, `${method} ${url}`);
      assert.equal(malformed.body.message, '岗位更新失败');
      assert.equal(malformed.retryAfter, null);
    }
  } finally {
    fs.writeFileSync(jobsPath, beforeMalformed);
  }
  result = await request('GET', endpoint, undefined, '');
  assert.equal(result.status, 401);
  result = await request('GET', endpoint);
  assert.equal(result.body.data.verification.status, 'unverified');
  assert.equal(result.body.data.verification.version, 0);
  result = await request('PUT', endpoint, { expectedVersion: 0, status: 'open',
    announcementUrl: 'file:///test', employerApplyUrl: 'https://example.com/apply', deadline: null });
  assert.equal(result.status, 400);
  result = await request('PUT', endpoint, { expectedVersion: 0, status: 'open',
    announcementUrl: 'https://example.com/notice', employerApplyUrl: 'https://example.com/apply',
    deadline: null, verifiedAt: '2000-01-01', note: '人工查看' });
  assert.equal(result.status, 400);
  const forged = jwt.sign({ role: 'admin', id: 999999, permissions: ['jobs'] }, process.env.JWT_SECRET);
  result = await request('PUT', endpoint, { expectedVersion: 0, status: 'open',
    announcementUrl: '', employerApplyUrl: 'https://example.com/apply', deadline: null }, forged);
  assert.equal(result.status, 403);
  result = await request('PUT', endpoint, { expectedVersion: 0, status: 'open',
    announcementUrl: '', employerApplyUrl: 'https://example.com/different', deadline: null });
  assert.equal(result.status, 400);
  result = await request('PUT', endpoint, { expectedVersion: 0, status: 'open',
    announcementUrl: 'https://example.com/notice', employerApplyUrl: 'https://example.com/apply',
    deadline: null, note: '人工查看' });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.verification.status, 'open');
  assert.equal(result.body.data.verification.version, 1);
  assert.equal(result.body.data.verification.verifiedBy.username, 'admin');
  assert.ok(result.body.data.verification.verifiedAt);
  assert.equal(result.body.data.audit.length, 1);
  const savedApplication = await request('POST', '/api/v4/applications', { jobId: String(id),
    sourceType: 'job' }, userToken);
  assert.equal(savedApplication.status, 200);
  const applicationId = savedApplication.body.data.id;
  result = await request('PUT', endpoint, { expectedVersion: 0, status: 'closed',
    announcementUrl: '', employerApplyUrl: '', deadline: null });
  assert.equal(result.status, 409);
  result = await request('PUT', `/admin/api/jobs/${id}`, { title, company: 'Example',
    applyUrl: 'https://example.com/new-apply', verification: { status: 'open' } });
  assert.equal(result.status, 400);
  result = await request('PUT', `/admin/api/jobs/${id}`, { title, company: 'Example',
    applyUrl: 'https://example.com/new-apply' });
  assert.equal(result.status, 200);
  result = await request('GET', endpoint);
  assert.equal(result.body.data.verification.status, 'review_needed');
  assert.equal(result.body.data.verification.verifiedAt, null);
  assert.equal(result.body.data.audit.length, 2);
  assert.equal(result.body.data.audit[1].jobSnapshotBefore.applyUrl, 'https://example.com/apply');
  assert.equal(result.body.data.audit[1].jobSnapshot.applyUrl, 'https://example.com/new-apply');
  const publicJob = await request('GET', `/api/jobs/${id}`);
  assert.equal(publicJob.status, 200);
  assert.equal(Object.hasOwn(publicJob.body.data, 'verification'), false);
  assert.equal(publicJob.body.data.applicationStatus, 'review_needed');
  assert.equal(publicJob.body.data.isApplyAvailable, false);
  assert.equal(publicJob.body.data.applyUrl, '');
  const localList = await request('GET', `/api/jobs?source=local&keyword=${encodeURIComponent(title)}`);
  assert.equal(localList.status, 200);
  assert.equal(localList.body.data.list.some(job => job.id === String(id)), false);
  const snapshotList = await request('GET', `/api/jobs?pagination=snapshot&keyword=${encodeURIComponent(title)}`);
  assert.equal(snapshotList.status, 200);
  assert.equal(snapshotList.body.data.list.some(job => job.id === String(id)), false);
  result = await request('PUT', endpoint, { expectedVersion: 2, status: 'closed',
    announcementUrl: 'https://example.com/notice', employerApplyUrl: 'https://example.com/new-apply',
    deadline: null, note: '人工确认关闭' });
  assert.equal(result.status, 200);
  const jobData = require('../utils/jobData');
  assert.equal(jobData.listBrowsableJobs().some(job => job.id === id), false);
  assert.equal(jobData.listJobsByCompanyNames(['Example'], 100).some(job => job.id === id), false);
  const v4Detail = await request('GET', `/api/v4/jobs/${id}/detail`, undefined, userToken);
  assert.equal(v4Detail.status, 200);
  assert.equal(v4Detail.body.data.job.applicationStatus, 'closed');
  assert.equal(v4Detail.body.data.job.officialApplyUrl, '');
  assert.equal(v4Detail.body.data.trust.officialVerification.url, '');
  assert.equal(v4Detail.body.data.trust.level, 'risk');
  const heldCreate = await request('POST', '/api/v4/applications', { jobId: String(id),
    sourceType: 'job', jobSnapshot: { title, company: 'Example', source: 'local',
      applyUrl: 'https://example.com/old-link' } }, userToken);
  assert.equal(heldCreate.status, 409);
  const oldApply = await request('POST', `/api/v4/applications/${applicationId}/official-apply`, {}, userToken);
  assert.equal(oldApply.status, 409);
  const savedDetail = await request('GET', `/api/v4/applications/${applicationId}/detail`, undefined, userToken);
  assert.equal(savedDetail.status, 200);
  assert.equal(savedDetail.body.data.application.officialApplyUrl, '');
  assert.equal(savedDetail.body.data.application.jobSnapshot.applyUrl, '');
  assert.equal(savedDetail.body.data.application.isApplyAvailable, false);
  const legacyList = await request('GET', '/api/applications', undefined, userToken);
  assert.equal(legacyList.status, 200);
  const legacyItem = legacyList.body.data.list.find(item => item.id === applicationId);
  assert.ok(legacyItem);
  assert.equal(legacyItem.jobSnapshot.applyUrl, '');
  assert.equal(legacyItem.jobLink, '');
  const legacyDetail = await request('GET', `/api/applications/${applicationId}`, undefined, userToken);
  assert.equal(legacyDetail.status, 200);
  assert.equal(legacyDetail.body.data.jobSnapshot.applyUrl, '');
  assert.equal(legacyDetail.body.data.jobLink, '');
  const legacyProgress = await request('GET', '/api/applications/progress', undefined, userToken);
  assert.equal(legacyProgress.status, 200);
  const legacyProgressItem = legacyProgress.body.data.find(item => item.id === String(applicationId));
  assert.ok(legacyProgressItem);
  assert.equal(legacyProgressItem.jobSnapshot.applyUrl, '');
  assert.equal(legacyProgressItem.jobLink, '');
  const savedBoard = await request('GET', '/api/v4/applications/board', undefined, userToken);
  assert.equal(savedBoard.status, 200);
  assert.equal(savedBoard.body.data.groups.preparing.concat(savedBoard.body.data.groups.applied)
    .some(item => item.id === applicationId && item.officialApplyUrl), false);
  const trustResponse = await request('GET', `/api/v4/jobs/${id}/trust`, undefined, userToken);
  assert.equal(trustResponse.status, 200);
  assert.equal(trustResponse.body.data.officialVerification.url, '');
  const observed = await request('POST', `/api/v4/jobs/${id}/trust/observations`, {
    confirmObserved: true, status: 'closed', officialUrl: 'https://example.com/historical-link'
  }, userToken);
  assert.equal(observed.status, 200);
  assert.equal(observed.body.data.officialVerification.url, '');
  assert.equal(observed.body.data.observations.at(-1).officialUrl, '');
  const unrelatedExternal = await request('POST', '/api/v4/applications', {
    jobId: `external_${Date.now()}`, sourceType: 'jsearch',
    jobSnapshot: { source: 'jsearch', title: 'External', company: 'Elsewhere',
      applyUrl: 'https://example.com/external-apply' }
  }, userToken);
  assert.equal(unrelatedExternal.status, 200);
  const externalApply = await request('POST',
    `/api/v4/applications/${unrelatedExternal.body.data.id}/official-apply`, {}, userToken);
  assert.equal(externalApply.status, 200);
  assert.equal(externalApply.body.data.url, 'https://example.com/external-apply');
  const spoofedExternal = await request('POST', '/api/v4/applications', {
    jobId: String(id), sourceType: 'jsearch',
    jobSnapshot: { source: 'jsearch', title: 'Pretend external', company: 'Elsewhere',
      applyUrl: 'https://example.com/bypass' }
  }, userToken);
  assert.equal(spoofedExternal.status, 409);
  // A genuine external numeric ID is indistinguishable from the spoof above;
  // callers must namespace it to avoid colliding with this held local ID.
  const ambiguousExternal = await request('POST', '/api/v4/applications', {
    jobId: String(id), sourceType: 'jsearch',
    jobSnapshot: { source: 'jsearch', title: 'External ID collision', company: 'Other Employer',
      applyUrl: 'https://example.com/real-external' }
  }, userToken);
  assert.equal(ambiguousExternal.status, 409);
  const v4List = await request('GET', `/api/v4/jobs?keyword=${encodeURIComponent(title)}`, undefined, userToken);
  assert.equal(v4List.status, 200);
  assert.equal(v4List.body.data.list.some(job => job.id === id), false);
  result = await request('PUT', `/admin/api/jobs/${id}`, { description: '新增岗位描述' });
  assert.equal(result.status, 200);
  result = await request('GET', endpoint);
  assert.equal(result.body.data.verification.status, 'review_needed');
  assert.equal(result.body.data.verification.availabilityHold, true);
  const afterEditList = await request('GET', `/api/jobs?source=local&keyword=${encodeURIComponent(title)}`);
  assert.equal(afterEditList.body.data.list.some(job => job.id === String(id)), false);
  const materialEdits = [
    { title: `${title} 更新` }, { company: 'Example Updated' }, { location: 'Shanghai' },
    { region: '中国' }, { salary: '面议' }, { jobType: '实习' }, { industry: '金融' },
    { companyLogo: 'https://example.com/logo.png' }, { requirements: ['新增要求'] },
    { visaSponsored: true }, { deadline: '2099-01-01' }
  ];
  let expectedVersion = 4;
  for (const edit of materialEdits) {
    result = await request('PUT', `/admin/api/jobs/${id}`, edit);
    assert.equal(result.status, 200);
    result = await request('GET', endpoint);
    expectedVersion += 1;
    assert.equal(result.body.data.verification.version, expectedVersion);
    assert.equal(result.body.data.verification.status, 'review_needed');
    assert.equal(result.body.data.verification.availabilityHold, true);
  }
  result = await request('POST', '/admin/api/jobs', { title: `${title} 过期`, company: 'Example',
    applyUrl: 'https://example.com/expired', deadline: '2020-01-01' });
  assert.equal(result.status, 200);
  const expiredId = result.body.data.id;
  result = await request('PUT', `/admin/api/jobs/${expiredId}/verification`, { expectedVersion: 0,
    status: 'open', announcementUrl: '', employerApplyUrl: 'https://example.com/expired',
    deadline: '2020-01-01', note: '' });
  assert.equal(result.status, 400);
  const futureTitle = `截止联动 ${Date.now()}`;
  const futureJob = await request('POST', '/admin/api/jobs', { title: futureTitle, company: 'Expiry Employer',
    applyUrl: 'https://example.com/future-apply', deadline: '2099-12-31' });
  assert.equal(futureJob.status, 200);
  const futureId = futureJob.body.data.id;
  const beforeExpiryApplication = await request('POST', '/api/v4/applications', {
    jobId: String(futureId), sourceType: 'job'
  }, userToken);
  assert.equal(beforeExpiryApplication.status, 200);
  const expiringApplicationId = beforeExpiryApplication.body.data.id;
  const expire = await request('PUT', `/admin/api/jobs/${futureId}`, { deadline: '2020-01-01' });
  assert.equal(expire.status, 200);
  result = await request('GET', `/admin/api/jobs/${futureId}/verification`);
  assert.equal(result.body.data.verification.status, 'unverified', 'expiration does not forge a manual verdict');
  const expiredWebDetail = await request('GET', `/api/jobs/${futureId}`);
  assert.equal(expiredWebDetail.status, 200);
  assert.equal(expiredWebDetail.body.data.applicationStatus, 'unverified');
  assert.equal(expiredWebDetail.body.data.isApplyAvailable, false);
  assert.equal(expiredWebDetail.body.data.applyUrl, '');
  assert.match(expiredWebDetail.body.data.applicationNotice, /截止日期已过/);
  const expiredLegacyDetail = await request('GET', `/api/jobs/detail?job_id=${futureId}`);
  assert.equal(expiredLegacyDetail.status, 200);
  assert.equal(expiredLegacyDetail.body.data[0].job_apply_link, '');
  assert.equal(expiredLegacyDetail.body.data[0].is_apply_available, false);
  assert.match(expiredLegacyDetail.body.data[0].application_notice, /截止日期已过/);
  const expiredV4Detail = await request('GET', `/api/v4/jobs/${futureId}/detail`, undefined, userToken);
  assert.equal(expiredV4Detail.status, 200);
  assert.equal(expiredV4Detail.body.data.job.applicationStatus, 'unverified');
  assert.equal(expiredV4Detail.body.data.job.isApplyAvailable, false);
  assert.equal(expiredV4Detail.body.data.job.officialApplyUrl, '');
  assert.equal(expiredV4Detail.body.data.trust.officialVerification.url, '');
  assert.equal(expiredV4Detail.body.data.trust.officialVerification.status, 'deadline_expired');
  assert.match(expiredV4Detail.body.data.trust.label, /截止日期已过/);
  assert.doesNotMatch(expiredV4Detail.body.data.trust.notice, /管理员/);
  assert.match(expiredV4Detail.body.data.job.applicationNotice, /截止日期已过/);
  assert.equal(require('../utils/jobData').listBrowsableJobs().some(job => job.id === futureId), false);
  const expiredV4List = await request('GET', `/api/v4/jobs?keyword=${encodeURIComponent(futureTitle)}`, undefined, userToken);
  assert.equal(expiredV4List.body.data.list.some(job => job.id === futureId), false);
  const expiredCreate = await request('POST', '/api/v4/applications', { jobId: String(futureId), sourceType: 'job' }, userToken);
  assert.equal(expiredCreate.status, 409);
  const expiredOldApplication = await request('GET', `/api/v4/applications/${expiringApplicationId}/detail`, undefined, userToken);
  assert.equal(expiredOldApplication.status, 200);
  assert.equal(expiredOldApplication.body.data.application.officialApplyUrl, '');
  assert.equal(expiredOldApplication.body.data.application.jobSnapshot.applyUrl, '');
  const expiredOfficialApply = await request('POST', `/api/v4/applications/${expiringApplicationId}/official-apply`, {}, userToken);
  assert.equal(expiredOfficialApply.status, 409);
  const extendDeadline = await request('PUT', `/admin/api/jobs/${futureId}`, { deadline: '2099-12-31' });
  assert.equal(extendDeadline.status, 200);
  assert.equal(require('../utils/jobData').isHeldLocalJobId(String(futureId)), false);
  assert.equal(require('../utils/jobData').listBrowsableJobs().some(job => job.id === futureId), true);
  const secondFuture = await request('POST', '/admin/api/jobs', { title: `${futureTitle} 第二个`, company: 'Expiry Employer',
    applyUrl: 'https://example.com/second-future', deadline: '2099-12-31' });
  assert.equal(secondFuture.status, 200);
  const expirySnapshotQuery = `pagination=snapshot&country=global&pageSize=1&keyword=${encodeURIComponent(futureTitle)}`;
  const beforeExpirySnapshot = await request('GET', `/api/jobs?${expirySnapshotQuery}`);
  assert.equal(beforeExpirySnapshot.status, 200);
  assert.ok(beforeExpirySnapshot.body.data.nextCursor);
  const expireSecond = await request('PUT', `/admin/api/jobs/${secondFuture.body.data.id}`, { deadline: '2020-01-01' });
  assert.equal(expireSecond.status, 200);
  const expiredContinuation = await request('GET', `/api/jobs?${expirySnapshotQuery}&cursor=${encodeURIComponent(beforeExpirySnapshot.body.data.nextCursor)}`);
  assert.equal(expiredContinuation.status, 410);
  result = await request('DELETE', `/admin/api/jobs/${id}`);
  assert.equal(result.status, 200);
  const saved = JSON.parse(fs.readFileSync(path.join(runtime.paths().dataDir, 'jobs.json'), 'utf8'));
  const audits = saved.jobVerificationAudit.filter(item => item.jobId === id);
  assert.equal(audits.at(-1).action, 'job_deleted');
  assert.equal(audits.at(-1).actor.username, 'admin');
  assert.equal(audits.at(-1).before.status, 'review_needed');
  assert.equal(saved.jobVerification[String(id)], undefined);
  const deletedAudit = await request('GET', `/admin/api/jobs/${id}/verification/audit`);
  assert.equal(deletedAudit.status, 200);
  assert.equal(deletedAudit.body.data.audit.at(-1).action, 'job_deleted');
  const oldAliases = ['applyUrl', 'apply_url', 'applyLink', 'job_apply_link', 'sourceUrl',
    'source_url', 'officialApplyUrl', 'jobLink', 'job_link'];
  const aliasSnapshot = Object.fromEntries(oldAliases.map(key => [key, `https://example.com/${key}`]));
  require('../db/database').prepare('UPDATE applications SET job_snapshot=? WHERE id=?')
    .run(JSON.stringify({ title, company: 'Example', ...aliasSnapshot }), applicationId);
  const deletedLegacyDetail = await request('GET', `/api/applications/${applicationId}`, undefined, userToken);
  assert.equal(deletedLegacyDetail.status, 200);
  assert.equal(deletedLegacyDetail.body.data.jobLink, '');
  for (const key of oldAliases) assert.equal(deletedLegacyDetail.body.data.jobSnapshot[key], '');
  const deletedLegacyProgress = await request('GET', '/api/applications/progress', undefined, userToken);
  const deletedProgressRow = deletedLegacyProgress.body.data.find(item => item.id === String(applicationId));
  assert.equal(deletedProgressRow.jobLink, '');
  for (const key of oldAliases) assert.equal(deletedProgressRow.jobSnapshot[key], '');
  const deletedV4Detail = await request('GET', `/api/v4/applications/${applicationId}/detail`, undefined, userToken);
  assert.equal(deletedV4Detail.status, 200);
  assert.equal(deletedV4Detail.body.data.application.officialApplyUrl, '');
  for (const key of oldAliases) assert.equal(deletedV4Detail.body.data.application.jobSnapshot[key], '');
  const deletedOfficialApply = await request('POST', `/api/v4/applications/${applicationId}/official-apply`, {}, userToken);
  assert.equal(deletedOfficialApply.status, 409);
  const neverLocalNumeric = await request('POST', '/api/v4/applications', {
    jobId: '9999999', sourceType: 'jsearch',
    jobSnapshot: { source: 'jsearch', title: 'External numeric job', company: 'Other Employer',
      applyUrl: 'https://example.com/never-local' }
  }, userToken);
  assert.equal(neverLocalNumeric.status, 200);
  const snapshotKeyword = `游标核验 ${Date.now()}`;
  const ids = [];
  for (let index = 0; index < 3; index += 1) {
    const created = await request('POST', '/admin/api/jobs', { title: `${snapshotKeyword} ${index}`,
      company: 'Example', applyUrl: `https://example.com/snapshot-${index}` });
    assert.equal(created.status, 200);
    ids.push(created.body.data.id);
  }
  const query = `pagination=snapshot&country=global&pageSize=1&keyword=${encodeURIComponent(snapshotKeyword)}`;
  const firstPage = await request('GET', `/api/jobs?${query}`);
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.data.list.length, 1);
  const secondPage = await request('GET', `/api/jobs?${query}&cursor=${encodeURIComponent(firstPage.body.data.nextCursor)}`);
  assert.equal(secondPage.status, 200);
  const firstTwoIds = new Set([firstPage.body.data.list[0].id, secondPage.body.data.list[0].id]);
  const hiddenId = ids.find(value => !firstTwoIds.has(String(value)));
  assert.ok(hiddenId);
  const hiddenIndex = ids.indexOf(hiddenId);
  result = await request('PUT', `/admin/api/jobs/${hiddenId}/verification`, { expectedVersion: 0,
    status: 'closed', announcementUrl: '', employerApplyUrl: `https://example.com/snapshot-${hiddenIndex}`,
    deadline: null, note: '' });
  assert.equal(result.status, 200);
  const continuation = await request('GET', `/api/jobs?${query}&cursor=${encodeURIComponent(firstPage.body.data.nextCursor)}`);
  assert.equal(continuation.status, 410);
  result = await request('PUT', `/admin/api/jobs/${hiddenId}/verification`, { expectedVersion: 1,
    status: 'unverified', announcementUrl: '', employerApplyUrl: '', deadline: null, note: '' });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.verification.availabilityHold, true);
  result = await request('PUT', `/admin/api/jobs/${hiddenId}/verification`, { expectedVersion: 2,
    status: 'open', announcementUrl: '', employerApplyUrl: `https://example.com/snapshot-${hiddenIndex}`,
    deadline: null, note: '重新人工核验' });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.verification.availabilityHold, false);
  const reopened = await request('GET', `/api/jobs?source=local&keyword=${encodeURIComponent(snapshotKeyword)}`);
  const reopenedJob = reopened.body.data.list.find(job => job.id === String(hiddenId));
  assert.ok(reopenedJob);
  assert.equal(Object.hasOwn(reopenedJob, 'verification'), false);
  assert.equal(Object.hasOwn(reopenedJob, 'announcementUrl'), false);

});

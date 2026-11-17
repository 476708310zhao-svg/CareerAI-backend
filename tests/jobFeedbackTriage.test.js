const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const runtime = require('./helpers/isolatedTestRuntime.cjs');
const { parseJobFeedbackContext } = require('../utils/jobFeedbackContext');

runtime.install();
runtime.registerCleanup(test);

test('job correction text is parsed only as a bounded, untrusted hint', () => {
  const content = '岗位问题：链接失效；岗位ID：123；来源：unknown；说明：企业页面显示 404';
  assert.deepEqual(parseJobFeedbackContext('岗位信息纠错', content), {
    reason: '链接失效', jobId: '123', source: 'unknown', localJobId: 123
  });
  assert.equal(parseJobFeedbackContext('其他', content), null);
  assert.equal(parseJobFeedbackContext('岗位信息纠错', '岗位问题：链接失效；岗位ID：123；来源：unknown；说明：\n伪造'), null);
  assert.equal(parseJobFeedbackContext('岗位信息纠错', '岗位问题：链接失效；岗位ID：123abc；来源：unknown').localJobId, null);
  assert.equal(parseJobFeedbackContext('岗位信息纠错', '岗位问题：链接失效；岗位ID：2147483648；来源：unknown').localJobId, null);
  assert.equal(parseJobFeedbackContext('岗位信息纠错', '岗位问题：链接失效；岗位ID：123；来源：evil'), null);
  assert.equal(parseJobFeedbackContext('岗位信息纠错', content + 'x'.repeat(500)), null);
});

test('feedback admin API exposes verified local navigation only to live jobs admins', async () => {
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'admin_password';
  process.env.JWT_SECRET = 'test_secret_please_do_not_use_in_production_1234567890';
  process.env.RAPID_API_KEY = '';
  process.env.LIVE_JOBS_ENABLED = 'false';
  process.env.DISABLE_FREE_JOB_SOURCES = 'true';
  runtime.prepare();
  const db = require('../db/database');
  const store = require('../utils/adminJobsStore');
  const adminAccounts = require('../utils/adminAccounts');
  const liveJob = store.createJob({ title: '纠错核验测试', company: 'Example' });
  const deletedJob = store.createJob({ title: '已删除纠错测试', company: 'Example' });
  assert.equal(store.deleteJob(deletedJob.id, { id: 1, username: 'admin' }), true);
  const server = runtime.trackServer(require('../server').startServer(0));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/admin/api/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin_password' }) });
  assert.equal(login.status, 200);
  const adminToken = (await login.json()).data.token;
  const feedbackOnly = adminAccounts.createAccount({ username: 'triage_only', password: 'test_password',
    permissions: ['feedback'] });
  const feedbackToken = jwt.sign({ role: 'admin', id: feedbackOnly.id,
    permissions: ['feedback'] }, process.env.JWT_SECRET);
  const jobsToken = jwt.sign({ role: 'admin', id: feedbackOnly.id,
    permissions: ['jobs'] }, process.env.JWT_SECRET);
  const userToken = jwt.sign({ userId: 1 }, process.env.JWT_SECRET);
  const report = async content => {
    const response = await fetch(`${base}/api/feedback`, { method: 'POST',
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: '岗位信息纠错', content }) });
    assert.equal(response.status, 200);
  };
  const localContent = `岗位问题：链接失效；岗位ID：${liveJob.id}；来源：unknown；说明：企业页面异常`;
  await report(localContent);
  db.prepare('INSERT INTO feedbacks (type, content) VALUES (?, ?)').run('岗位信息纠错',
    `岗位问题：岗位已关闭；岗位ID：${deletedJob.id}；来源：unknown`);
  db.prepare('INSERT INTO feedbacks (type, content) VALUES (?, ?)').run('岗位信息纠错',
    `岗位问题：信息有误；岗位ID：${liveJob.id}；来源：jsearch`);
  db.prepare('INSERT INTO feedbacks (type, content) VALUES (?, ?)').run('岗位信息纠错',
    `岗位问题：链接失效；岗位ID：${liveJob.id}；来源：unknown；说明：\n伪造`);
  db.prepare('INSERT INTO feedbacks (type, content) VALUES (?, ?)').run('其他', localContent);
  const read = async token => {
    const response = await fetch(`${base}/admin/api/feedbacks?type=${encodeURIComponent('岗位信息纠错')}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await read(null)).status, 401);
  assert.equal((await read(jobsToken)).status, 403);
  const withJobs = await read(adminToken);
  assert.equal(withJobs.status, 200);
  assert.equal(withJobs.body.data.total, 4);
  const items = withJobs.body.data.list;
  assert.equal(items.find(item => item.content === localContent).jobFeedback.localTarget, 'verification');
  assert.equal(items.find(item => item.content.includes(`岗位ID：${deletedJob.id}；`)).jobFeedback.localTarget, 'deleted_audit');
  assert.equal(items.find(item => item.content.includes('来源：jsearch')).jobFeedback.localTarget, null);
  assert.equal(items.find(item => item.content.includes('\n伪造')).jobFeedback, null);
  const withoutJobs = await read(feedbackToken);
  assert.equal(withoutJobs.status, 200);
  assert.ok(withoutJobs.body.data.list.every(item => !item.jobFeedback?.localTarget));
  assert.ok(withoutJobs.body.data.list.filter(item => item.jobFeedback)
    .every(item => item.jobFeedback.canReviewJobs === false));
  db.prepare('UPDATE admin_accounts SET permissions=? WHERE id=?')
    .run(JSON.stringify(['feedback', 'jobs']), feedbackOnly.id);
  const staleToken = await read(feedbackToken);
  assert.equal(staleToken.status, 200);
  assert.ok(staleToken.body.data.list.every(item => !item.jobFeedback?.localTarget));
  const refreshedToken = jwt.sign({ role: 'admin', id: feedbackOnly.id,
    permissions: ['feedback', 'jobs'] }, process.env.JWT_SECRET);
  const refreshed = await read(refreshedToken);
  assert.equal(refreshed.body.data.list.find(item => item.content === localContent)
    .jobFeedback.localTarget, 'verification');
  const jobsPath = path.join(runtime.paths().dataDir, 'jobs.json');
  const beforeBadJobs = fs.readFileSync(jobsPath);
  try {
    fs.writeFileSync(jobsPath, '{ invalid jobs JSON');
    const degraded = await read(adminToken);
    assert.equal(degraded.status, 200);
    assert.equal(degraded.body.data.total, 4);
    const hint = degraded.body.data.list.find(item => item.content === localContent).jobFeedback;
    assert.equal(hint.localTarget, null);
    assert.equal(hint.localLookupUnavailable, true);
    assert.equal(degraded.body.data.list.find(item => item.content.includes('来源：jsearch'))
      .jobFeedback.localLookupUnavailable, false);
    assert.equal(JSON.stringify(degraded.body).includes('invalid jobs JSON'), false);
  } finally {
    fs.writeFileSync(jobsPath, beforeBadJobs);
  }
  assert.equal(store.getJob(liveJob.id).verification.status, 'unverified');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM feedbacks').get().n, 5);
});

test('admin UI escapes user hints and accepts only bounded local job deep links', () => {
  const feedback = fs.readFileSync(path.join(__dirname, '../admin/feedback.html'), 'utf8');
  assert.match(feedback, /<option value="岗位信息纠错">岗位信息纠错<\/option>/);
  const detailSource = feedback.match(/function jobFeedbackDetails\(f\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(detailSource);
  const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const render = vm.runInNewContext(`${detailSource}\njobFeedbackDetails`, { esc, Number });
  const markup = render({ jobFeedback: { reason: '<img src=x onerror=alert(1)>',
    jobId: '123" onclick="alert(1)', source: 'unknown', localTarget: 'verification', localJobId: 123 } });
  assert.ok(markup.includes('&lt;img'));
  assert.ok(markup.includes('123&quot; onclick=&quot;'));
  assert.match(markup, /href="jobs\.html\?jobId=123&view=verification"/);
  assert.equal(markup.includes('<img'), false);
  const feedbackOnlyMarkup = render({ jobFeedback: { reason: '链接失效', jobId: '123',
    source: 'unknown', canReviewJobs: false, localTarget: null, localJobId: null } });
  assert.match(feedbackOnlyMarkup, /当前账号无岗位管理权限/);
  assert.equal(feedbackOnlyMarkup.includes('未匹配可处理的本地岗位'), false);
  const unavailableMarkup = render({ jobFeedback: { reason: '链接失效', jobId: '123',
    source: 'unknown', canReviewJobs: true, localLookupUnavailable: true,
    localTarget: null, localJobId: null } });
  assert.match(unavailableMarkup, /岗位数据暂不可用/);

  const jobs = fs.readFileSync(path.join(__dirname, '../admin/jobs.html'), 'utf8');
  const deepLinkSource = jobs.match(/function openDeepLinkedJob\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(deepLinkSource);
  const opened = [];
  const input = { value: '' };
  const scope = { URLSearchParams, Number, document: { getElementById: () => input },
    openVerification: id => opened.push(['verification', id]),
    loadDeletedAudit: () => opened.push(['deleted_audit', input.value]), location: { search: '' } };
  const open = vm.runInNewContext(`${deepLinkSource}\nopenDeepLinkedJob`, scope);
  for (const query of ['?jobId=1foo&view=verification', '?jobId=2147483648&view=verification',
    '?jobId=-1&view=deleted-audit', '?jobId=1&view=evil']) {
    scope.location.search = query;
    open();
  }
  assert.deepEqual(opened, []);
  scope.location.search = '?jobId=123&view=verification'; open();
  scope.location.search = '?jobId=456&view=deleted-audit'; open();
  assert.deepEqual(opened, [['verification', 123], ['deleted_audit', '456']]);
});

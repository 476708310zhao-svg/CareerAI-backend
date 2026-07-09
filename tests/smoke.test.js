const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db/database');
const featureFlags = require('../utils/featureFlags');

const HOST = '127.0.0.1';
let BASE_URL = '';
const testAccount = {
  nickname: 'Smoke Test User',
  email: `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`,
  phone: `188${Math.floor(10000000 + Math.random() * 90000000)}`,
  password: 'smoke_password_123'
};

let server;
let authToken;
let adminToken;
let createdOrderNo;
const uploadedFiles = [];

function startServer() {
  Object.assign(process.env, {
    PORT: '0',
    JWT_SECRET: 'test_secret_please_do_not_use_in_production_1234567890',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'admin_password',
    CRON_SECRET: 'smoke_cron_secret_1234567890abcdef',
    ALLOWED_ORIGIN: `http://${HOST}`,
    WEBHOOK_SECRET: 'test_webhook_secret',
    PAYMENT_ENABLED: 'true',
    PAYMENT_PROVIDER: 'wxpay',
    ENABLE_MOCK_PAYMENT: 'true',
    VIRTUAL_PAY_NOTIFY_TOKEN: '',
    WXPAY_MCH_ID: '',
    WXPAY_API_KEY: '',
    WXPAY_APP_ID: '',
    WXPAY_NOTIFY_URL: '',
    RAPID_API_KEY: '',
    ADZUNA_APP_ID: '',
    ADZUNA_APP_KEY: '',
    LIVE_JOBS_ENABLED: 'false',
    DISABLE_FREE_JOB_SOURCES: 'true',
    NEWS_RSS_ENABLED: 'false',
    NEWS_JOB_API_ENABLED: 'false',
    RECRUITMENT_FEATURE_ENABLED: 'true',
    MEMBERSHIP_FEATURE_ENABLED: 'false'
  });

  featureFlags.updateFeatureFlag('recruitment', true);
  featureFlags.updateFeatureFlag('membership', false);

  const { startServer: listen } = require('../server');
  server = listen(0);
  const address = server.address();
  BASE_URL = `http://${HOST}:${address.port}`;
}

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('server did not become ready');
}

async function readJson(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function authHeaders() {
  return { Authorization: `Bearer ${authToken}` };
}

function adminHeaders() {
  return { Authorization: `Bearer ${adminToken}` };
}

async function ensureAdminToken() {
  if (adminToken) return adminToken;
  const loginRes = await fetch(`${BASE_URL}/admin/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin_password' })
  });
  assert.equal(loginRes.status, 200);
  const loginBody = await readJson(loginRes);
  adminToken = loginBody.data.token;
  return adminToken;
}

function pngBlob() {
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D
  ]);
  return new Blob([bytes], { type: 'image/png' });
}

function pdfBlob(type = 'application/pdf', text = 'Smoke Test User\nsmoke@example.com\nPython SQL React') {
  const pdfText = text
    .split('\n')
    .map(line => `(${line}) Tj`)
    .join('\n');
  return new Blob([`%PDF-1.4\n${pdfText}\n%%EOF`], { type });
}

function trackUploadedUrl(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  uploadedFiles.push(path.join(process.cwd(), url.replace(/^\//, '')));
}

test.before(async () => {
  startServer();
  await waitForServer();
});

test.after(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(testAccount.email);
  if (user) {
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM messages WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM job_reminders WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM application_materials WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM jd_match_reports WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM interview_daily_practice WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM interview_notebook WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  }
  uploadedFiles.forEach(file => {
    try { fs.unlinkSync(file); } catch (e) {}
  });
});

test('health endpoint is available', async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('public feature flags expose recruitment availability', async () => {
  const res = await fetch(`${BASE_URL}/api/features`);
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.equal(body.data.recruitment, true);
  assert.equal(body.data.membership, false);
});

test('recruitment switch blocks recruitment APIs without affecting other features', async () => {
  const previous = featureFlags.isFeatureEnabled('recruitment');
  featureFlags.updateFeatureFlag('recruitment', false);
  try {
    const jobsRes = await fetch(`${BASE_URL}/api/jobs?page=1&pageSize=1`);
    assert.equal(jobsRes.status, 503);
    const jobsBody = await readJson(jobsRes);
    assert.equal(jobsBody.code, -1);
    assert.equal(jobsBody.data.feature, 'recruitment');

    const experiencesRes = await fetch(`${BASE_URL}/api/experiences?page=1&pageSize=1`);
    assert.equal(experiencesRes.status, 200);

    const campusRes = await fetch(`${BASE_URL}/api/campus?page=1&pageSize=1`);
    assert.equal(campusRes.status, 200);

    const companiesRes = await fetch(`${BASE_URL}/api/companies?page=1&pageSize=1`);
    assert.equal(companiesRes.status, 200);
  } finally {
    featureFlags.updateFeatureFlag('recruitment', previous);
  }
});

test('public jobs endpoint returns a list payload', async () => {
  const res = await fetch(`${BASE_URL}/api/jobs?page=1&pageSize=1`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.code, 0);
  assert.ok(Array.isArray(body.data.list));
});

test('public campus endpoint handles filtered summer internship query', async () => {
  const query = new URLSearchParams({
    region: '',
    position_type: '\u7efc\u5408',
    year: '',
    keyword: '',
    recruit_type: '\u6691\u671f\u5b9e\u4e60',
    written_test: '',
    grad_year: '',
    sort: '',
    page: '0',
    pageSize: '12'
  });
  const res = await fetch(`${BASE_URL}/api/campus?${query.toString()}`);
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.ok(Array.isArray(body.data.list));
  assert.equal(typeof body.data.total, 'number');
});

test('aggregate jobs endpoint returns a paginated recommendation pool sorted by recency', async () => {
  const res = await fetch(`${BASE_URL}/api/jobs/aggregate?query=Software%20Engineer&page=1&pageSize=20`);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.status, 'OK');
  assert.ok(Array.isArray(body.data));
  assert.equal(body.data.length, 20);
  assert.ok(body.total > body.data.length);
  assert.equal(body.hasMore, true);

  const times = body.data
    .map(job => Date.parse(job.job_posted_at_datetime_utc || job.postedAt || job.publication_date || ''))
    .filter(Number.isFinite);
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i - 1] >= times[i]);
  }
});

test('public banners endpoint returns a list payload', async () => {
  const res = await fetch(`${BASE_URL}/api/banners`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.code, 0);
  assert.ok(Array.isArray(body.data));
});

test('public share config endpoint returns default payload', async () => {
  const res = await fetch(`${BASE_URL}/api/share/configs`);
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.equal(typeof body.data.default.title, 'string');
  assert.equal(typeof body.data.default.imageUrl, 'string');
  assert.equal(typeof body.data.routes, 'object');
});

test('public career tips news endpoint returns articles', async () => {
  const res = await fetch(`${BASE_URL}/api/news?tab=tip&limit=5`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.articles));
  assert.ok(body.articles.length > 0);
});

test('public visa policy endpoint returns official resource items', async () => {
  const res = await fetch(`${BASE_URL}/api/content/visa-policies?country=${encodeURIComponent('美国')}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.code, 0);
  assert.ok(Array.isArray(body.data.items));
  assert.ok(body.data.items.length > 0);
  assert.ok(body.data.items[0].officialUrl);
});

test('public help center endpoint returns product help articles', async () => {
  const res = await fetch(`${BASE_URL}/api/content/help-center?keyword=${encodeURIComponent('职位')}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.code, 0);
  assert.ok(Array.isArray(body.data.items));
  assert.ok(body.data.items.length > 0);
});

test('public interview experiences endpoint includes curated library content', async () => {
  const res = await fetch(`${BASE_URL}/api/experiences?page=1&pageSize=20`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.code, 0);
  assert.ok(Array.isArray(body.data.list));
  assert.ok(body.data.list.length >= 8);
});

test('public companies endpoint returns a data payload', async () => {
  const res = await fetch(`${BASE_URL}/api/companies?page=1&pageSize=1`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.code, 0);
  assert.ok(body.data);
});

test('protected endpoint rejects anonymous requests', async () => {
  const res = await fetch(`${BASE_URL}/api/applications`);
  assert.equal(res.status, 401);
});

test('internal task endpoints reject anonymous requests', async () => {
  const logsRes = await fetch(`${BASE_URL}/api/aggregate/cron-logs`);
  assert.equal(logsRes.status, 401);

  const pollRes = await fetch(`${BASE_URL}/api/applications/poll-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(pollRes.status, 401);
});

test('internal task endpoints accept cron secret', async () => {
  const logsRes = await fetch(`${BASE_URL}/api/aggregate/cron-logs`, {
    headers: { 'X-Cron-Secret': 'smoke_cron_secret_1234567890abcdef' }
  });
  assert.equal(logsRes.status, 200);
  const logsBody = await readJson(logsRes);
  assert.equal(logsBody.ok, true);

  const pollRes = await fetch(`${BASE_URL}/api/applications/poll-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cron-Secret': 'smoke_cron_secret_1234567890abcdef'
    },
    body: JSON.stringify({})
  });
  assert.equal(pollRes.status, 200);
  const pollBody = await readJson(pollRes);
  assert.equal(pollBody.ok, true);
});

test('payment orders endpoint rejects anonymous requests', async () => {
  const res = await fetch(`${BASE_URL}/api/payment/orders`);
  assert.equal(res.status, 401);
});

test('payment config uses standard response shape', async () => {
  const res = await fetch(`${BASE_URL}/api/payment/config`);
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.equal(body.data.enabled, true);
  assert.equal(body.data.configured, false);
  assert.equal(body.data.mock, true);
});

test('web-register creates a user with a hashed password', async () => {
  const res = await fetch(`${BASE_URL}/api/users/web-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testAccount)
  });
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.ok(body.data.token);

  const user = db.prepare('SELECT password FROM users WHERE email = ?').get(testAccount.email);
  assert.ok(user);
  assert.match(user.password, /^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
  assert.notEqual(user.password, testAccount.password);
});

test('web-login returns a token for valid credentials', async () => {
  const res = await fetch(`${BASE_URL}/api/users/web-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: testAccount.email, password: testAccount.password })
  });
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.ok(body.data.token);
  authToken = body.data.token;
});

test('legacy users resumes endpoint is marked deprecated', async () => {
  assert.ok(authToken);
  const res = await fetch(`${BASE_URL}/api/users/resumes`, {
    headers: authHeaders()
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('deprecation'), 'true');
  assert.match(res.headers.get('link') || '', /\/api\/resumes/);
});

test('user profile stores standardized education and job preference fields', async () => {
  assert.ok(authToken);
  const schemaRes = await fetch(`${BASE_URL}/api/users/profile-schema`);
  assert.equal(schemaRes.status, 200);
  const schemaBody = await readJson(schemaRes);
  assert.equal(schemaBody.code, 0);
  assert.equal(schemaBody.data.version, 'user_profile_standard_v1');

  const updateRes = await fetch(`${BASE_URL}/api/users/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      nickname: '标准档案用户',
      education: {
        school: 'New York University',
        major: 'Computer Science',
        degree: '硕士',
        gradYear: '2026'
      },
      jobPreference: {
        status: 'fresh_grad',
        targetRoles: ['软件工程师', '软件工程师', 'Data Analyst'],
        targetLocation: ['美国', '远程'],
        targetIndustries: ['互联网/科技'],
        jobTypes: ['实习', 'fulltime'],
        workAuthorization: 'opt',
        skills: ['Python', 'SQL', 'Python']
      }
    })
  });
  assert.equal(updateRes.status, 200);
  const updateBody = await readJson(updateRes);
  assert.equal(updateBody.code, 0);
  assert.equal(updateBody.data.education.degree, 'master');
  assert.equal(updateBody.data.jobPreference.status, 'fresh');
  assert.deepEqual(updateBody.data.jobPreference.targetRoles, ['软件工程师', 'Data Analyst']);
  assert.deepEqual(updateBody.data.jobPreference.jobTypes, ['internship', 'fulltime']);
  assert.deepEqual(updateBody.data.jobPreference.skills, ['Python', 'SQL']);
  assert.equal(updateBody.data.profile.school, 'New York University');

  const profileRes = await fetch(`${BASE_URL}/api/users/profile`, { headers: authHeaders() });
  assert.equal(profileRes.status, 200);
  const profileBody = await readJson(profileRes);
  assert.equal(profileBody.data.profile.gradYear, '2026');
  assert.ok(profileBody.data.profileCompleteness >= 80);
});

test('career asset APIs persist materials, match reports and interview notebook', async () => {
  assert.ok(authToken);

  const materialRes = await fetch(`${BASE_URL}/api/career-assets/application-materials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      id: 'material_smoke_1',
      questionType: 'why_company',
      questionLabel: 'Why this company?',
      jobId: 'job_smoke_1',
      company: 'OpenAI',
      jobTitle: 'Software Engineer',
      resumeName: 'SDE Resume',
      resumeVersionId: 'resume_version_smoke_1',
      content: 'I am excited by the company mission and the role impact.'
    })
  });
  assert.equal(materialRes.status, 200);
  const materialBody = await readJson(materialRes);
  assert.equal(materialBody.code, 0);
  assert.equal(materialBody.data.questionType, 'why_company');
  assert.equal(materialBody.data.resumeVersionId, 'resume_version_smoke_1');

  const materialListRes = await fetch(`${BASE_URL}/api/career-assets/application-materials`, {
    headers: authHeaders()
  });
  assert.equal(materialListRes.status, 200);
  const materialList = await readJson(materialListRes);
  assert.ok(materialList.data.some(item => item.clientId === 'material_smoke_1'));

  const materialUpdateRes = await fetch(`${BASE_URL}/api/career-assets/application-materials/${encodeURIComponent('material_smoke_1')}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ content: 'Updated application answer.' })
  });
  assert.equal(materialUpdateRes.status, 200);
  const materialUpdate = await readJson(materialUpdateRes);
  assert.equal(materialUpdate.data.content, 'Updated application answer.');

  const reportRes = await fetch(`${BASE_URL}/api/career-assets/jd-match-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      id: 'match_smoke_1',
      jobId: 'job_smoke_1',
      jobTitle: 'Software Engineer',
      company: 'OpenAI',
      jobLink: 'https://openai.com/careers/software-engineer',
      resumeName: 'SDE Resume',
      resumeVersionId: 'resume_version_smoke_1',
      score: 88,
      matchedKeywords: ['Python'],
      missingKeywords: ['Kubernetes'],
      projectSuggestion: 'Job Matching Platform',
      atsRisk: '低',
      suggestions: ['补充云原生关键词'],
      recommendText: '建议投递前补充云原生项目表达',
      interviewPrep: ['准备系统设计案例'],
      jdText: 'Python Kubernetes distributed systems',
      resumeText: 'Python backend platform',
      useOnlineResume: false
    })
  });
  assert.equal(reportRes.status, 200);
  const reportBody = await readJson(reportRes);
  assert.equal(reportBody.data.score, 88);
  assert.deepEqual(reportBody.data.missingKeywords, ['Kubernetes']);
  assert.equal(reportBody.data.jobLink, 'https://openai.com/careers/software-engineer');
  assert.equal(reportBody.data.resumeVersionId, 'resume_version_smoke_1');
  assert.equal(reportBody.data.recommendText, '建议投递前补充云原生项目表达');
  assert.deepEqual(reportBody.data.interviewPrep, ['准备系统设计案例']);
  assert.equal(reportBody.data.useOnlineResume, false);

  const reportDetailRes = await fetch(`${BASE_URL}/api/career-assets/jd-match-reports/${encodeURIComponent('match_smoke_1')}`, {
    headers: authHeaders()
  });
  assert.equal(reportDetailRes.status, 200);
  const reportDetail = await readJson(reportDetailRes);
  assert.equal(reportDetail.data.company, 'OpenAI');
  assert.match(reportDetail.data.jdText, /Kubernetes/);

  const notebookRes = await fetch(`${BASE_URL}/api/career-assets/interview-notebook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      id: 'q_smoke_1',
      title: 'Tell me about a conflict experience',
      answer: 'Use STAR structure.',
      category: 'behavior',
      difficulty: '中等',
      status: 'unknown'
    })
  });
  assert.equal(notebookRes.status, 200);
  const notebookBody = await readJson(notebookRes);
  assert.equal(notebookBody.data.status, 'unknown');

  const statusRes = await fetch(`${BASE_URL}/api/career-assets/interview-notebook/${encodeURIComponent('q_smoke_1')}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status: 'mastered' })
  });
  assert.equal(statusRes.status, 200);
  const statusBody = await readJson(statusRes);
  assert.equal(statusBody.data.status, 'mastered');

  const dailyRes = await fetch(`${BASE_URL}/api/career-assets/interview-daily-practice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      id: 'q_smoke_1',
      title: 'Tell me about a conflict experience',
      category: 'behavior'
    })
  });
  assert.equal(dailyRes.status, 200);

  const dailyListRes = await fetch(`${BASE_URL}/api/career-assets/interview-daily-practice`, {
    headers: authHeaders()
  });
  assert.equal(dailyListRes.status, 200);
  const dailyList = await readJson(dailyListRes);
  assert.ok(dailyList.data.some(item => item.id === 'q_smoke_1'));

  const deleteDailyRes = await fetch(`${BASE_URL}/api/career-assets/interview-daily-practice/${encodeURIComponent('q_smoke_1')}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  assert.equal(deleteDailyRes.status, 200);

  const deleteNotebookRes = await fetch(`${BASE_URL}/api/career-assets/interview-notebook/${encodeURIComponent('q_smoke_1')}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  assert.equal(deleteNotebookRes.status, 200);

  const deleteMaterialRes = await fetch(`${BASE_URL}/api/career-assets/application-materials/${encodeURIComponent('material_smoke_1')}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  assert.equal(deleteMaterialRes.status, 200);
});

test('job reminder APIs persist and dispatch reminders once', async () => {
  assert.ok(authToken);
  const targetId = `job_reminder_smoke_${Date.now()}`;

  const upsertRes = await fetch(`${BASE_URL}/api/notify/reminders`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      sourceType: 'favorite_job',
      targetId,
      reminderType: 'deadline',
      reminderDate: '2026-07-04',
      title: 'Software Engineer',
      company: 'OpenAI',
      jobTitle: 'Software Engineer',
      leadDays: [3],
      payload: { city: 'Remote' }
    })
  });
  assert.equal(upsertRes.status, 200);
  const upsertBody = await readJson(upsertRes);
  assert.equal(upsertBody.code, 0);
  assert.equal(upsertBody.data.targetId, targetId);
  assert.deepEqual(upsertBody.data.leadDays, [3]);

  const listRes = await fetch(`${BASE_URL}/api/notify/reminders?sourceType=favorite_job&reminderType=deadline`, {
    headers: authHeaders()
  });
  assert.equal(listRes.status, 200);
  const listBody = await readJson(listRes);
  assert.ok(listBody.data.some(item => item.targetId === targetId && item.enabled));

  const dispatchRes = await fetch(`${BASE_URL}/api/notify/reminders/dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cron-Secret': 'smoke_cron_secret_1234567890abcdef'
    },
    body: JSON.stringify({ date: '2026-07-01' })
  });
  assert.equal(dispatchRes.status, 200);
  const dispatchBody = await readJson(dispatchRes);
  assert.equal(dispatchBody.code, 0);
  const targetSent = dispatchBody.data.sent.filter(item => item.key.includes(`:${targetId}:`));
  assert.equal(targetSent.length, 1);
  assert.equal(targetSent[0].type, 'job_deadline');

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(testAccount.email);
  const message = db.prepare(`
    SELECT title, content FROM messages
    WHERE user_id=? AND type='job_deadline'
    ORDER BY id DESC
  `).get(user.id);
  assert.ok(message);
  assert.match(message.title, /Deadline reminder/);
  assert.match(message.content, /OpenAI/);

  const repeatRes = await fetch(`${BASE_URL}/api/notify/reminders/dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cron-Secret': 'smoke_cron_secret_1234567890abcdef'
    },
    body: JSON.stringify({ date: '2026-07-01' })
  });
  assert.equal(repeatRes.status, 200);
  const repeatBody = await readJson(repeatRes);
  assert.equal(repeatBody.data.sent.filter(item => item.key.includes(`:${targetId}:`)).length, 0);
  assert.ok(repeatBody.data.skipped.some(item => item.reason === 'already_sent' && item.key.includes(`:${targetId}:`)));

  const deleteRes = await fetch(`${BASE_URL}/api/notify/reminders/favorite_job/${encodeURIComponent(targetId)}/deadline`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  assert.equal(deleteRes.status, 200);

  const disabled = db.prepare(`
    SELECT enabled FROM job_reminders
    WHERE user_id=? AND source_type='favorite_job' AND target_id=? AND reminder_type='deadline'
  `).get(user.id, targetId);
  assert.equal(disabled.enabled, 0);
});

test('campus deadline reminders persist and dispatch as campus messages', async () => {
  assert.ok(authToken);
  const targetId = `campus_reminder_smoke_${Date.now()}`;
  const company = `CampusCo ${Date.now()}`;

  const upsertRes = await fetch(`${BASE_URL}/api/notify/reminders`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      sourceType: 'campus_schedule',
      targetId,
      reminderType: 'campus_deadline',
      reminderDate: '2026-07-08',
      title: `${company} 校招`,
      company,
      jobTitle: '管培生',
      leadDays: [7, 3, 1, 0],
      payload: { recruitType: '秋招' }
    })
  });
  assert.equal(upsertRes.status, 200);
  const upsertBody = await readJson(upsertRes);
  assert.equal(upsertBody.code, 0);
  assert.equal(upsertBody.data.targetId, targetId);
  assert.deepEqual(upsertBody.data.leadDays, [7, 3, 1, 0]);

  const detailRes = await fetch(`${BASE_URL}/api/notify/reminders?sourceType=campus_schedule&reminderType=campus_deadline&targetId=${encodeURIComponent(targetId)}`, {
    headers: authHeaders()
  });
  assert.equal(detailRes.status, 200);
  const detailBody = await readJson(detailRes);
  assert.ok(detailBody.data.some(item => item.targetId === targetId && item.enabled));

  const dispatchRes = await fetch(`${BASE_URL}/api/notify/reminders/dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cron-Secret': 'smoke_cron_secret_1234567890abcdef'
    },
    body: JSON.stringify({ date: '2026-07-01' })
  });
  assert.equal(dispatchRes.status, 200);
  const dispatchBody = await readJson(dispatchRes);
  const targetSent = dispatchBody.data.sent.filter(item => item.key.includes(`:${targetId}:`));
  assert.equal(targetSent.length, 1);
  assert.equal(targetSent[0].type, 'campus_deadline');

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(testAccount.email);
  const message = db.prepare(`
    SELECT title, content FROM messages
    WHERE user_id=? AND type='campus_deadline' AND content LIKE ?
    ORDER BY id DESC
  `).get(user.id, `%${company}%`);
  assert.ok(message);
  assert.match(message.title, /校招截止提醒/);
  assert.match(message.content, new RegExp(company));

  const repeatRes = await fetch(`${BASE_URL}/api/notify/reminders/dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cron-Secret': 'smoke_cron_secret_1234567890abcdef'
    },
    body: JSON.stringify({ date: '2026-07-01' })
  });
  assert.equal(repeatRes.status, 200);
  const repeatBody = await readJson(repeatRes);
  assert.equal(repeatBody.data.sent.filter(item => item.key.includes(`:${targetId}:`)).length, 0);

  const deleteRes = await fetch(`${BASE_URL}/api/notify/reminders/campus_schedule/${encodeURIComponent(targetId)}/campus_deadline`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  assert.equal(deleteRes.status, 200);
});

test('ai workflow requires vip', async () => {
  assert.ok(authToken);
  const res = await fetch(`${BASE_URL}/api/ai/workflow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message: '帮我优化简历' })
  });
  assert.equal(res.status, 403);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.equal(body.data.vipRequired, true);
});

test('ai chat validation uses standard error shape', async () => {
  assert.ok(authToken);
  const res = await fetch(`${BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ messages: [] })
  });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.match(body.message, /messages/);
});

test('ai chat rejects anonymous requests before spending AI quota', async () => {
  const res = await fetch(`${BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
  });
  assert.equal(res.status, 401);
});

test('ai usage endpoint reports quota and blocks exhausted free features before upstream AI', async () => {
  assert.ok(authToken);
  const usageRes = await fetch(`${BASE_URL}/api/ai/usage`, {
    headers: authHeaders()
  });
  assert.equal(usageRes.status, 200);
  const usageBody = await readJson(usageRes);
  assert.equal(usageBody.code, 0);
  assert.equal(usageBody.data.isVip, false);
  assert.ok(usageBody.data.features.some(item => item.feature === 'ats' && item.limit === 3));

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(testAccount.email);
  const day = usageBody.data.date;
  db.prepare(`
    INSERT INTO ai_usage (user_id, feature, usage_date, count, updated_at)
    VALUES (?, 'ats', ?, 3, datetime('now'))
    ON CONFLICT(user_id, feature, usage_date)
    DO UPDATE SET count=3, updated_at=datetime('now')
  `).run(user.id, day);

  const atsRes = await fetch(`${BASE_URL}/api/ai/ats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      resumeData: { basicInfo: { name: 'Smoke' }, skills: ['JavaScript'] },
      jobDescription: 'Software engineer role requiring JavaScript, API design, testing and collaboration.',
      jobTitle: 'Software Engineer'
    })
  });
  assert.equal(atsRes.status, 429);
  const atsBody = await readJson(atsRes);
  assert.equal(atsBody.code, -1);
  assert.equal(atsBody.data.feature, 'ats');
  assert.equal(atsBody.data.vipRequired, true);
  assert.equal(atsBody.data.remaining, 0);
});

test('ai project builder validation uses standard error shape', async () => {
  assert.ok(authToken);
  const res = await fetch(`${BASE_URL}/api/ai/project-builder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.match(body.message, /项目方向/);
});

test('admin banner upload rejects content that does not match image MIME', async () => {
  const loginRes = await fetch(`${BASE_URL}/admin/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin_password' })
  });
  assert.equal(loginRes.status, 200);
  const loginBody = await readJson(loginRes);
  adminToken = loginBody.data.token;

  const form = new FormData();
  form.append('file', new Blob(['not a real png'], { type: 'image/png' }), 'fake.png');

  const res = await fetch(`${BASE_URL}/admin/api/upload/banner`, {
    method: 'POST',
    headers: adminHeaders(),
    body: form
  });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.match(body.message, /文件内容与格式不符/);
});

test('admin banner upload rejects non-image MIME before magic byte check', async () => {
  assert.ok(adminToken);
  const form = new FormData();
  form.append('file', new Blob(['plain text'], { type: 'text/plain' }), 'fake.txt');

  const res = await fetch(`${BASE_URL}/admin/api/upload/banner`, {
    method: 'POST',
    headers: adminHeaders(),
    body: form
  });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.match(body.message, /只允许/);
});

test('admin jobs list reads jobs json through admin API', async () => {
  assert.ok(adminToken);
  const res = await fetch(`${BASE_URL}/admin/api/jobs?page=1&pageSize=1`, {
    headers: adminHeaders()
  });
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.ok(Array.isArray(body.data.list));
  assert.equal(body.data.list.length, 1);
  assert.ok(body.data.total >= 1);
});

test('admin announcements are exposed through public news feed', async () => {
  await ensureAdminToken();
  const title = `Smoke 求职资讯 ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
  let announcementId;

  const createRes = await fetch(`${BASE_URL}/admin/api/announcements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: JSON.stringify({
      title,
      content: '这是一条由 smoke test 发布的求职攻略，用于验证后台资讯可以进入小程序公共快讯接口。',
      category: '攻略',
      summary: 'Smoke test 自有求职干货摘要',
      tags: ['ATS', '简历优化'],
      target_roles: ['SDE', 'Data Analyst'],
      target_regions: ['北美'],
      action_type: 'jd_match',
      action_label: '去做 JD 匹配',
      action_url: '/package-ai/pages/jd-match/jd-match',
      source_url: 'https://example.com/jobapp-smoke-news',
      sort_order: 99,
      is_pinned: true,
      is_published: true
    })
  });
  assert.equal(createRes.status, 200);
  const createBody = await readJson(createRes);
  assert.equal(createBody.code, 0);
  announcementId = createBody.data.id;

  try {
    const newsRes = await fetch(`${BASE_URL}/api/news?tab=tip&keyword=${encodeURIComponent(title)}&limit=5`);
    assert.equal(newsRes.status, 200);
    const newsBody = await readJson(newsRes);
    assert.ok(Array.isArray(newsBody.articles));
    const article = newsBody.articles.find(item => item.title === title);
    assert.ok(article);
    assert.equal(article.source, '职引');
    assert.equal(article.type, 'tip');
    assert.equal(article.desc, 'Smoke test 自有求职干货摘要');
    assert.ok(article.tags.includes('ATS'));
    assert.deepEqual(article.targetRoles, ['SDE', 'Data Analyst']);
    assert.deepEqual(article.targetRegions, ['北美']);
    assert.equal(article.action.label, '去做 JD 匹配');
    assert.equal(article.action.url, '/package-ai/pages/jd-match/jd-match');
    assert.equal(article.url, 'https://example.com/jobapp-smoke-news');
    assert.equal(article.sortOrder, 99);
    assert.match(article.content, /smoke test/);
  } finally {
    if (announcementId) {
      await fetch(`${BASE_URL}/admin/api/announcements/${announcementId}`, {
        method: 'DELETE',
        headers: adminHeaders()
      });
    }
  }
});

test('admin can toggle recruitment feature flag', async () => {
  assert.ok(adminToken);
  const listRes = await fetch(`${BASE_URL}/admin/api/feature-flags`, {
    headers: adminHeaders()
  });
  assert.equal(listRes.status, 200);
  const listBody = await readJson(listRes);
  assert.ok(listBody.data.some(item => item.feature === 'recruitment'));

  const offRes = await fetch(`${BASE_URL}/admin/api/feature-flags/recruitment`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: JSON.stringify({ enabled: false })
  });
  assert.equal(offRes.status, 200);
  const featuresOff = await readJson(await fetch(`${BASE_URL}/api/features`));
  assert.equal(featuresOff.data.recruitment, false);

  const onRes = await fetch(`${BASE_URL}/admin/api/feature-flags/recruitment`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: JSON.stringify({ enabled: true })
  });
  assert.equal(onRes.status, 200);
  const featuresOn = await readJson(await fetch(`${BASE_URL}/api/features`));
  assert.equal(featuresOn.data.recruitment, true);
});

test('admin can update page share config', async () => {
  assert.ok(adminToken);
  const listRes = await fetch(`${BASE_URL}/admin/api/share-configs`, {
    headers: adminHeaders()
  });
  assert.equal(listRes.status, 200);
  const listBody = await readJson(listRes);
  const home = listBody.data.find(item => item.route === 'pages/index/index');
  assert.ok(home);

  const title = `分享测试 ${Date.now()}`;
  const updateRes = await fetch(`${BASE_URL}/admin/api/share-configs/${home.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: JSON.stringify({
      pageName: home.pageName,
      title,
      imageUrl: '/uploads/banners/share-test.jpg',
      isActive: true,
      sortOrder: home.sortOrder
    })
  });
  assert.equal(updateRes.status, 200);
  const updateBody = await readJson(updateRes);
  assert.equal(updateBody.code, 0);

  const publicRes = await fetch(`${BASE_URL}/api/share/configs`);
  const publicBody = await readJson(publicRes);
  assert.equal(publicBody.data.routes['pages/index/index'].title, title);
  assert.equal(publicBody.data.routes['pages/index/index'].imageUrl, '/uploads/banners/share-test.jpg');
});

test('admin account permissions are enforced by module', async () => {
  assert.ok(adminToken);
  const username = `ops_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const createRes = await fetch(`${BASE_URL}/admin/api/admin-accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: JSON.stringify({
      username,
      password: 'ops_password',
      display_name: 'Ops Test',
      role: 'operator',
      permissions: ['jobs'],
      is_active: 1
    })
  });
  assert.equal(createRes.status, 200);
  const created = await readJson(createRes);
  assert.equal(created.code, 0);
  assert.deepEqual(created.data.permissions, ['jobs']);

  const loginRes = await fetch(`${BASE_URL}/admin/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'ops_password' })
  });
  assert.equal(loginRes.status, 200);
  const loginBody = await readJson(loginRes);
  const operatorToken = loginBody.data.token;
  assert.ok(operatorToken);

  const allowedRes = await fetch(`${BASE_URL}/admin/api/jobs?page=1&pageSize=1`, {
    headers: { Authorization: `Bearer ${operatorToken}` }
  });
  assert.equal(allowedRes.status, 200);

  const deniedRes = await fetch(`${BASE_URL}/admin/api/stats`, {
    headers: { Authorization: `Bearer ${operatorToken}` }
  });
  assert.equal(deniedRes.status, 403);

  const deleteRes = await fetch(`${BASE_URL}/admin/api/admin-accounts/${created.data.id}`, {
    method: 'DELETE',
    headers: adminHeaders()
  });
  assert.equal(deleteRes.status, 200);
});

test('payment mock create-order, confirm and verify flow works', async () => {
  assert.ok(authToken);

  const createRes = await fetch(`${BASE_URL}/api/payment/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ planId: 0 })
  });
  assert.equal(createRes.status, 200);
  const createBody = await readJson(createRes);
  assert.equal(createBody.code, 0);
  const created = createBody.data;
  assert.equal(created.mock, true);
  assert.ok(created.orderNo);
  createdOrderNo = created.orderNo;

  const confirmRes = await fetch(`${BASE_URL}/api/payment/mock-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ orderNo: createdOrderNo })
  });
  assert.equal(confirmRes.status, 200);
  const confirmBody = await readJson(confirmRes);
  assert.equal(confirmBody.code, 0);
  const confirmed = confirmBody.data;
  assert.equal(confirmed.success, true);

  const verifyRes = await fetch(`${BASE_URL}/api/payment/verify/${encodeURIComponent(createdOrderNo)}`, {
    headers: authHeaders()
  });
  assert.equal(verifyRes.status, 200);
  const verifyBody = await readJson(verifyRes);
  assert.equal(verifyBody.code, 0);
  const verified = verifyBody.data;
  assert.equal(verified.status, 'paid');

  const ordersRes = await fetch(`${BASE_URL}/api/payment/orders`, {
    headers: authHeaders()
  });
  assert.equal(ordersRes.status, 200);
  const ordersBody = await readJson(ordersRes);
  assert.equal(ordersBody.code, 0);
  assert.ok(Array.isArray(ordersBody.data.orders));
  assert.ok(ordersBody.data.orders.some(order => order.order_no === createdOrderNo));
});

test('virtual payment notify accepts WeChat OutTradeNo field', async () => {
  assert.ok(authToken);
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(testAccount.email);
  assert.ok(user);

  const orderNo = `SMOKEVP${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32);
  db.prepare(`
    INSERT INTO orders (order_no, user_id, plan_id, plan_name, amount, status, provider, product_id)
    VALUES (?, ?, ?, ?, ?, 'pending', 'virtual', ?)
  `).run(orderNo, user.id, 3, '体验会员', 1000, 'viptrial7d');

  const notifyRes = await fetch(`${BASE_URL}/api/payment/virtual-notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Event: 'xpay_goods_deliver_notify',
      OutTradeNo: orderNo,
      WeChatPayInfo: JSON.stringify({
        PayAmount: 1000,
        TransactionId: `WX_SMOKE_${orderNo}`
      }),
      GoodsInfo: JSON.stringify({
        GoodsPrice: 1000
      })
    })
  });
  assert.equal(notifyRes.status, 200);
  const notifyBody = await readJson(notifyRes);
  assert.equal(notifyBody.ErrCode, 0);

  const paid = db.prepare('SELECT status, transaction_id FROM orders WHERE order_no = ?').get(orderNo);
  assert.equal(paid.status, 'paid');
  assert.equal(paid.transaction_id, `WX_SMOKE_${orderNo}`);
});

test('avatar upload rejects content that does not match image MIME', async () => {
  assert.ok(authToken);
  const form = new FormData();
  form.append('file', new Blob(['not a real png'], { type: 'image/png' }), 'fake.png');

  const res = await fetch(`${BASE_URL}/api/upload/avatar`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.match(body.message, /文件内容与格式不符/);
});

test('avatar upload accepts a valid png image', async () => {
  assert.ok(authToken);
  const form = new FormData();
  form.append('file', pngBlob(), 'avatar.png');

  const res = await fetch(`${BASE_URL}/api/upload/avatar`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.match(body.data.url, /^\/uploads\/\d{4}-\d{2}-\d{2}\//);
  trackUploadedUrl(body.data.url);
});

test('resume pdf upload accepts valid pdf and preserves original name', async () => {
  assert.ok(authToken);
  const form = new FormData();
  form.append('originalName', '新简历_2026-05-18.pdf');
  form.append('file', pdfBlob(), 'wechat-temp.pdf');

  const res = await fetch(`${BASE_URL}/api/upload/resume-pdf`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.equal(body.data.filename, '新简历_2026-05-18.pdf');
  assert.match(body.data.url, /^\/uploads\/resumes\/resume_/);
  trackUploadedUrl(body.data.url);

  const listRes = await fetch(`${BASE_URL}/api/upload/resume-pdfs`, {
    headers: authHeaders()
  });
  assert.equal(listRes.status, 200);
  const listBody = await readJson(listRes);
  assert.equal(listBody.code, 0);
  assert.ok(listBody.data.some(item => item.original_name === '新简历_2026-05-18.pdf'));
});

test('resume pdf upload rejects non-pdf content', async () => {
  assert.ok(authToken);
  const form = new FormData();
  form.append('originalName', 'fake.pdf');
  form.append('file', new Blob(['plain text'], { type: 'application/pdf' }), 'fake.pdf');

  const res = await fetch(`${BASE_URL}/api/upload/resume-pdf`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.match(body.message, /PDF/);
});

test('resume pdf extract returns an online resume draft', async () => {
  assert.ok(authToken);
  const form = new FormData();
  form.append('originalName', 'john_doe_resume.pdf');
  form.append('file', pdfBlob('application/pdf', [
    'John Doe',
    'john.doe@example.com',
    '+1 415 555 1234',
    'linkedin.com/in/johndoe',
    'Software Engineer with Python SQL React experience',
    'Education',
    'University of California Berkeley',
    'Master of Science in Computer Science',
    '2022 - 2024',
    'Experience',
    'Google',
    'Software Engineer Intern',
    '2023 - 2024',
    'Built React and Node.js internal tools',
    'Projects',
    'Job Matching Platform',
    'Designed a recommendation engine with Python and SQL'
  ].join('\n')), 'john.pdf');

  const uploadRes = await fetch(`${BASE_URL}/api/upload/resume-pdf`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  assert.equal(uploadRes.status, 200);
  const uploadBody = await readJson(uploadRes);
  trackUploadedUrl(uploadBody.data.url);

  const extractRes = await fetch(`${BASE_URL}/api/upload/resume-pdf/${uploadBody.data.id}/extract`, {
    method: 'POST',
    headers: authHeaders()
  });
  assert.equal(extractRes.status, 200);
  const body = await readJson(extractRes);
  assert.equal(body.code, 0);
  assert.equal(body.data.resume.basicInfo.name, 'John Doe');
  assert.equal(body.data.resume.basicInfo.email, 'john.doe@example.com');
  assert.ok(body.data.resume.skills.includes('Python'));
  assert.equal(body.data.resume.education[0].school, 'University of California Berkeley');
  assert.equal(body.data.resume.workExp[0].company, 'Google');
  assert.equal(body.data.resume.workExp[0].role, 'Software Engineer Intern');
  assert.equal(body.data.resume.projects[0].name, 'Job Matching Platform');
  assert.ok(body.data.text.includes('Software Engineer'));
});

test('webhook rejects missing GitHub signature', async () => {
  const res = await fetch(`${BASE_URL}/webhook/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'refs/heads/main' })
  });
  assert.equal(res.status, 401);
});

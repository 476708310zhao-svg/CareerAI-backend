'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(process.env.APPLICATION_READINESS_FIXTURE_ROOT || '');
assert.ok(process.env.APPLICATION_READINESS_FIXTURE_ROOT);
assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
assert.match(path.basename(root), /^jobapp-application-readiness-[A-Za-z0-9_-]+$/);
Object.assign(process.env, {
  WEB_TEST_ISOLATED: '1', DB_PATH: path.join(root, 'db', 'readiness.db'),
  DATA_DIR: path.join(root, 'data'), UPLOAD_DIR: path.join(root, 'uploads'),
  JWT_SECRET: 'readiness_fixture_secret_not_for_production',
  ANALYTICS_DATA_CLASS: 'test', V4_AI_LIVE_ENABLED: 'false'
});

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db/database');
const { applyPendingMigrations } = require('../../db/migrate');
require('../../routes/payment');
require('../../routes/aggregate');
require('../../routes/oa');
require('../../db/v4Schema').ensureV4Schema();

const ownerId = Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('ready_owner','Owner')").run().lastInsertRowid);
const otherId = Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('ready_other','Other')").run().lastInsertRowid);
const token = userId => jwt.sign({ userId }, process.env.JWT_SECRET);
let sequence = 0;
function resume(userId, name) {
  const id = Number(db.prepare('INSERT INTO resumes(user_id,name,data) VALUES (?,?,?)')
    .run(userId, name, '{}').lastInsertRowid);
  const version = Number(db.prepare(`INSERT INTO resume_versions_v4
    (resume_id,user_id,version_no,name,content) VALUES (?,?,1,?,?)`)
    .run(id, userId, name, '{}').lastInsertRowid);
  db.prepare('UPDATE resumes SET current_version_id=? WHERE id=?').run(version, id);
  return { id, version };
}
const ownA = resume(ownerId, 'Own A');
const ownB = resume(ownerId, 'Own B');
const foreign = resume(otherId, 'Foreign resume');
function application(userId = ownerId) {
  const number = ++sequence;
  return Number(db.prepare(`INSERT INTO applications
    (user_id,job_id,source_job_id,source_type,job_snapshot,status,status_text,v4_status,progress_status,company,job_title)
    VALUES (?,?,?,?,?,'pending','准备申请','preparing','online_apply','Example','Role')`)
    .run(userId, `readiness-job-${number}`, `readiness-job-${number}`, 'job', '{}').lastInsertRowid);
}

const app = express();
app.use(express.json());
app.use('/api/v4/applications', require('../../routes/v4/applications'));
app.use('/api/v4/resumes', require('../../routes/v4/resumes'));
app.use('/api/applications', require('../../routes/applications'));
app.use((error, request, response, next) => {
  void request; void next;
  response.status(error.status || 500).json({ code: -1, message: error.message });
});
let server;
let base;
before(async () => {
  server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db.open) db.close();
});
async function call(route, method = 'GET', body, userId = ownerId) {
  const response = await fetch(`${base}${route}`, {
    method, headers: { 'Content-Type': 'application/json',
      ...(userId ? { Authorization: `Bearer ${token(userId)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}
const v4 = (id, suffix = '') => `/api/v4/applications/${id}${suffix}`;
const selection = (id, resumeVersionId, expectedResumeSelectionVersion) =>
  call(v4(id, '/resume-selection'), 'PUT', { resumeVersionId, expectedResumeSelectionVersion });
const row = id => db.prepare('SELECT resume_id,resume_version_id,resume_selection_version FROM applications WHERE id=?').get(id);

test('old schema reads degrade and rejects new writes', async () => {
  const id = application();
  const detail = await call(v4(id, '/detail'));
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.data.materialChecklist,
    { available: false, unavailableReason: 'migration_pending', items: [] });
  assert.equal(detail.body.data.application.resumeSelectionAvailable, false);
  assert.equal((await call(v4(id, '/resume-selection'), 'PUT',
    { resumeVersionId: ownA.version, expectedResumeSelectionVersion: 0 })).status, 503);
  assert.equal((await call(v4(id, '/material-checklist'), 'POST',
    { label: '成绩单', clientKey: 'before-migration' })).status, 503);
  applyPendingMigrations(db);
  assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
});

test('selection is owner isolated, versioned, ABA safe, and unchanged choices preserve version', async () => {
  const id = application();
  assert.equal((await call(v4(id, '/resume-selection'), 'PUT',
    { resumeVersionId: foreign.version, expectedResumeSelectionVersion: 0 })).status, 404);
  assert.equal((await call(v4(id, '/resume-selection'), 'PUT',
    { resumeVersionId: ownA.version, expectedResumeSelectionVersion: 0 }, otherId)).status, 404);
  const a = await selection(id, ownA.version, 0);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.data.resumeSelectionVersion, 1);
  assert.equal((await selection(id, ownA.version, 1)).body.data.changed, false);
  assert.equal((await selection(id, ownB.version, 1)).status, 200);
  assert.equal((await selection(id, ownA.version, 2)).status, 200);
  assert.equal((await selection(id, ownB.version, 1)).status, 409);
  assert.equal(row(id).resume_selection_version, 3);
  assert.equal(row(id).resume_id, ownA.id);
  assert.equal((await call(v4(id), 'PATCH', { resumeVersionId: String(ownB.version) })).status, 400);
  assert.equal((await call(v4(id), 'PATCH', { notes: 'updated' })).status, 200);
  assert.equal(row(id).resume_selection_version, 3);
  db.prepare("UPDATE resumes SET archived_at=datetime('now') WHERE id=?").run(ownB.id);
  assert.equal((await selection(id, ownB.version, 3)).status, 404);
  db.prepare('UPDATE resumes SET archived_at=NULL WHERE id=?').run(ownB.id);
});

test('confirmed submission freezes selection while the user can still correct checklist notes', async () => {
  const id = application();
  assert.equal((await selection(id, ownA.version, 0)).status, 200);
  const add = await call(v4(id, '/material-checklist'), 'POST',
    { label: '作品集', clientKey: 'confirmed-item-1' });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  const itemId = add.body.data.item.id;
  db.prepare(`INSERT INTO application_submission_events
    (application_id,user_id,action,client_key,channel,created_at)
    VALUES (?,?,'confirmed','fixture-confirm-1','web',?)`).run(id, ownerId, new Date().toISOString());
  assert.equal((await selection(id, null, 1)).status, 409);
  const corrected = await call(v4(id, `/material-checklist/${itemId}`), 'PATCH',
    { expectedVersion: 1, state: 'ready' });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  assert.equal(corrected.body.data.item.state, 'ready');
  db.prepare(`INSERT INTO application_submission_events
    (application_id,user_id,action,client_key,channel,created_at)
    VALUES (?,?,'revoked','fixture-revoke-1','web',?)`).run(id, ownerId, new Date().toISOString());
  assert.equal((await selection(id, null, 1)).status, 200);
});

test('checklist idempotency, CAS, limit, soft delete, archived state and account isolation', async () => {
  const id = application();
  const first = await call(v4(id, '/material-checklist'), 'POST',
    { label: ' 成绩单 ', clientKey: 'checklist-item-1' });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const item = first.body.data.item;
  assert.equal(first.body.data.changed, true);
  const repeat = await call(v4(id, '/material-checklist'), 'POST',
    { label: '成绩单', clientKey: 'checklist-item-1' });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.data.changed, false);
  assert.equal((await call(v4(id, '/material-checklist'), 'POST',
    { label: '作品集', clientKey: 'checklist-item-1' })).status, 409);
  assert.equal((await call(v4(id, '/material-checklist'), 'POST',
    { label: '跨账号', clientKey: 'other-owner-item' }, otherId)).status, 404);
  assert.equal((await call(v4(id, `/material-checklist/${item.id}`), 'PATCH',
    { expectedVersion: 1, state: 'ready' }, otherId)).status, 404);
  const update = await call(v4(id, `/material-checklist/${item.id}`), 'PATCH',
    { expectedVersion: 1, state: 'ready' });
  assert.equal(update.status, 200);
  assert.equal(update.body.data.item.version, 2);
  assert.equal((await call(v4(id, `/material-checklist/${item.id}`), 'PATCH',
    { expectedVersion: 1, state: 'needed' })).status, 409);
  assert.equal((await call(v4(id, '/material-checklist'), 'POST',
    { label: '成绩单', clientKey: 'checklist-item-1' })).status, 409);
  for (let index = 2; index <= 30; index++) {
    const response = await call(v4(id, '/material-checklist'), 'POST',
      { label: `材料 ${index}`, clientKey: `checklist-item-${index}` });
    assert.equal(response.status, 200, JSON.stringify(response.body));
  }
  assert.equal((await call(v4(id, '/material-checklist'), 'POST',
    { label: '超额', clientKey: 'checklist-item-31' })).status, 409);
  assert.equal((await call(v4(id, `/material-checklist/${item.id}`), 'DELETE',
    { expectedVersion: 1 })).status, 409);
  assert.equal((await call(v4(id, `/material-checklist/${item.id}`), 'DELETE',
    { expectedVersion: 2 })).status, 200);
  assert.equal((await call(v4(id, '/material-checklist'), 'POST',
    { label: '重新创建', clientKey: 'checklist-item-1' })).status, 409);
  assert.equal((await call(v4(id, '/material-checklist'), 'POST',
    { label: '补充', clientKey: 'checklist-item-31' })).status, 200);
  db.prepare("UPDATE applications SET archived_at=datetime('now') WHERE id=?").run(id);
  const detail = await call(v4(id, '/workspace'));
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.materialChecklist.unavailableReason, 'archived');
  assert.equal(detail.body.data.materialChecklist.items.length, 30);
  assert.equal((await selection(id, null, 0)).status, 404);
  assert.equal((await call(v4(id, '/material-checklist'), 'POST',
    { label: '不可写', clientKey: 'archived-item-1' })).status, 404);
});

test('legacy progress and resume links cannot override an explicitly selected version', async () => {
  const id = application();
  const selected = await selection(id, ownA.version, 0);
  assert.equal(selected.status, 200);
  const payload = { id, company: 'Example', jobTitle: 'Role', notes: 'legacy note' };
  const post = await call('/api/applications/progress', 'POST', payload);
  assert.equal(post.status, 200, JSON.stringify(post.body));
  assert.equal(row(id).resume_version_id, String(ownA.version));
  const beforeHistory = Number(db.prepare('SELECT COALESCE(MAX(id),0) FROM application_history WHERE application_id=? AND user_id=?').pluck().get(id, ownerId));
  assert.equal((await call(`/api/applications/progress/${id}`, 'PUT', { ...payload, status: 'applied' })).status, 428);
  assert.equal((await call('/api/applications/progress', 'POST', { ...payload, progressStatus: 'applied' })).status, 428);
  assert.equal(Number(db.prepare('SELECT COALESCE(MAX(id),0) FROM application_history WHERE application_id=? AND user_id=?').pluck().get(id, ownerId)), beforeHistory);
  assert.equal(db.prepare('SELECT progress_status FROM applications WHERE id=?').pluck().get(id), 'online_apply');
  const statusUpdate = await call(`/api/v4/applications/${id}/status`, 'PATCH', {
    status: 'applied', expectedState: { status: 'preparing', historyId: beforeHistory }
  });
  assert.equal(statusUpdate.status, 200, JSON.stringify(statusUpdate.body));
  assert.ok(statusUpdate.body.data.historyId > beforeHistory);
  assert.equal((await call(`/api/applications/progress/${id}`, 'PUT', { ...payload, status: 'preparing' })).status, 428);
  const put = await call(`/api/applications/progress/${id}`, 'PUT', payload);
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(db.prepare('SELECT progress_status FROM applications WHERE id=?').pluck().get(id), 'applied');
  assert.equal(row(id).resume_version_id, String(ownA.version));
  assert.equal((await call('/api/applications/progress', 'POST',
    { ...payload, resumeVersionId: ownB.version })).status, 409);
  assert.equal((await call(`/api/applications/progress/${id}`, 'PUT',
    { ...payload, resumeId: ownB.id })).status, 409);
  assert.equal((await call(`/api/v4/resumes/${ownB.id}/links`, 'POST',
    { applicationId: id })).status, 200);
  assert.equal(row(id).resume_version_id, String(ownA.version));
  assert.equal(row(id).resume_selection_version, 1);
});

test('AI change-set confirmation saves a new version without replacing confirmed application selection', async () => {
  const id = application();
  assert.equal((await selection(id, ownA.version, 0)).status, 200);
  db.prepare(`INSERT INTO application_submission_events
    (application_id,user_id,action,client_key,channel,created_at)
    VALUES (?,?,'confirmed','ai-freeze-confirm','web',?)`).run(id, ownerId, new Date().toISOString());
  const changeSetId = Number(db.prepare(`INSERT INTO resume_ai_change_sets
    (user_id,resume_id,source_version_id,job_id,application_id,suggestions,ai_model,prompt_version)
    VALUES (?,?,?,?,?,'[]','fixture','fixture')`)
    .run(ownerId, ownA.id, ownA.version, 'ai-fixture-job', id).lastInsertRowid);
  const saved = await call(`/api/v4/resumes/ai-change-sets/${changeSetId}/confirm`, 'POST',
    { decisions: {}, manualContent: { summary: '用户确认的新版本' } });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  assert.notEqual(saved.body.data.version.id, ownA.version);
  assert.equal(row(id).resume_version_id, String(ownA.version));
  assert.equal(row(id).resume_selection_version, 1);
  assert.equal((await selection(id, saved.body.data.version.id, 1)).status, 409);
});

test('legacy application paths enforce resume ownership and never disclose foreign resume content', async () => {
  assert.equal((await call('/api/applications', 'POST',
    { jobId: `legacy-foreign-${++sequence}`, resumeId: foreign.id })).status, 404);
  assert.equal((await call('/api/applications/progress', 'POST',
    { company: 'Example', jobTitle: 'Role', clientId: `legacy-${++sequence}`,
      resumeId: foreign.id })).status, 404);
  assert.equal((await call('/api/applications/progress', 'POST',
    { company: 'Example', jobTitle: 'Role', clientId: `legacy-${++sequence}`,
      resumeVersionId: foreign.version })).status, 404);
  assert.equal((await call('/api/applications/progress', 'POST',
    { company: 'Example', jobTitle: 'Role', clientId: `legacy-${++sequence}`,
      resumeId: ownA.id, resumeVersionId: ownB.version })).status, 400);
  const valid = await call('/api/applications/progress', 'POST',
    { company: 'Example', jobTitle: 'Role', clientId: `legacy-${++sequence}`,
      resumeVersionId: ownA.version });
  assert.equal(valid.status, 200, JSON.stringify(valid.body));
  assert.equal(db.prepare('SELECT resume_id FROM applications WHERE id=?').pluck().get(valid.body.data.id), ownA.id);
  const id = application();
  db.prepare('UPDATE applications SET resume_id=? WHERE id=?').run(foreign.id, id);
  const detail = await call(`/api/applications/${id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.resume, null);
  assert.equal((await call(`/api/applications/${id}`, 'GET', undefined, otherId)).status, 404);
});

test('application interview reports are owner scoped and convert to one task only after confirmed CAS', async () => {
  applyPendingMigrations(db);
  const id = application();
  const reportPayload = {
    clientKey: `report-${++sequence}`, totalScore: 82, summary: '需要补充量化结果。',
    strengths: ['逻辑清晰'], weaknesses: ['缺少数据'], actions: [{ title: '补充项目数据', summary: '整理基线和结果' }],
    qaList: [{ q: 'must never persist', a: 'private transcript' }], audio: 'private-audio'
  };
  const saved = await call(v4(id, '/interview-reports'), 'POST', reportPayload);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const reportId = saved.body.data.report.id;
  assert.equal((await call(v4(id, '/interview-reports'), 'GET', undefined, otherId)).status, 404);
  const duplicate = await call(v4(id, '/interview-reports'), 'POST', reportPayload);
  assert.equal(duplicate.body.data.report.id, reportId);
  const stored = db.prepare('SELECT * FROM application_interview_reports WHERE id=?').get(reportId);
  assert.equal(stored.summary, '需要补充量化结果。');
  assert.equal(JSON.stringify(stored).includes('private transcript'), false);
  assert.equal(JSON.stringify(stored).includes('private-audio'), false);
  const expectedState = { status: 'preparing', historyId: 0 };
  const convert = () => call(v4(id, `/interview-reports/${reportId}/convert-to-task`), 'POST', {
    clientKey: `interview-task-${reportId}`, title: '补充项目数据', expectedState
  });
  const results = await Promise.all([convert(), convert()]);
  assert.equal(results[0].status, 200, JSON.stringify(results[0].body));
  assert.equal(results[1].status, 200, JSON.stringify(results[1].body));
  assert.equal(results[0].body.data.taskId, results[1].body.data.taskId);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM application_tasks WHERE application_id=?').get(id).count, 1);
  assert.equal((await call(v4(id, `/interview-reports/${reportId}/convert-to-task`), 'POST', {
    clientKey: 'other-task-key', title: '另一个任务', expectedState
  })).status, 409);
  const replay = await call(v4(id, `/interview-reports/${reportId}/convert-to-task`), 'POST', {
    clientKey: `interview-task-${reportId}`, title: '补充项目数据', expectedState: { status: 'offer', historyId: 0 }
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data.taskId, results[0].body.data.taskId);
  db.prepare("UPDATE applications SET archived_at=datetime('now') WHERE id=?").run(id);
  assert.equal((await call(v4(id, '/interview-reports'), 'POST', { ...reportPayload, clientKey: `report-${++sequence}` })).status, 404);
});

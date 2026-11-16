'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(process.env.APPLICATION_INTERVIEW_SUMMARY_FIXTURE_ROOT || '');
assert.ok(process.env.APPLICATION_INTERVIEW_SUMMARY_FIXTURE_ROOT);
assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
assert.match(path.basename(root), /^jobapp-interview-summary-[A-Za-z0-9_-]+$/);
Object.assign(process.env, { DB_PATH: path.join(root, 'db', 'fixture.db'), DATA_DIR: path.join(root, 'data'),
  UPLOAD_DIR: path.join(root, 'uploads'), WEB_TEST_ISOLATED: '1', JWT_SECRET: 'interview-summary-fixture-secret', ANALYTICS_DATA_CLASS: 'test' });

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db/database');
const { applyPendingMigrations } = require('../../db/migrate');
require('../../routes/payment');
require('../../routes/aggregate');
require('../../routes/oa');
require('../../db/v4Schema').ensureV4Schema();
applyPendingMigrations(db);
const ownerId = Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('interview_owner','Owner')").run().lastInsertRowid);
const otherId = Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('interview_other','Other')").run().lastInsertRowid);
const applicationId = Number(db.prepare(`INSERT INTO applications
  (user_id,job_id,source_job_id,source_type,job_snapshot,status,status_text,v4_status,progress_status,company,job_title)
  VALUES (?,'interview-job','interview-job','job','{}','pending','准备中','preparing','online_apply','Example','Analyst')`).run(ownerId).lastInsertRowid);
const app = express(); app.use(express.json()); app.use('/api/v4/applications', require('../../routes/v4/applications'));
const token = userId => jwt.sign({ userId }, process.env.JWT_SECRET);
let server; let base;
before(async () => { server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); }); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db.open) db.close(); });
async function call(route, method = 'GET', body, userId = ownerId) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(userId)}` },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const pathFor = suffix => `/api/v4/applications/${applicationId}${suffix}`;
const reportInput = { clientKey: 'practice-report-0001', totalScore: 84, summary: '准备突出可核验的项目结果。',
  company: 'Example', jobTitle: 'Analyst', interviewType: 'behavior', strengths: ['结构清晰'],
  weaknesses: ['结果量化不足'], actions: [{ title: '整理项目数据', summary: '补充基线与结果' }],
  // Deliberately sent by an old client: the server must discard these fields.
  qaList: [{ q: 'private question', a: 'private answer' }], audio: 'private-audio' };

test('only the owning user can save/read an allowlisted summary; transcript fields are discarded', async () => {
  assert.equal((await call(pathFor('/interview-reports'), 'POST', reportInput, otherId)).status, 404);
  const saved = await call(pathFor('/interview-reports'), 'POST', reportInput);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const reports = await call(pathFor('/interview-reports'));
  assert.equal(reports.status, 200);
  assert.equal(reports.body.data.reports.length, 1);
  assert.equal(reports.body.data.reports[0].summary, reportInput.summary);
  assert.equal(JSON.stringify(reports.body).includes('private answer'), false);
  assert.equal(JSON.stringify(reports.body).includes('private-audio'), false);
  assert.equal((await call(pathFor('/interview-reports'), 'GET', undefined, otherId)).status, 404);
});

test('confirmed conversion uses expected application state and one idempotent task under concurrency', async () => {
  const report = await call(pathFor('/interview-reports'), 'POST', reportInput);
  const id = report.body.data.report.id;
  const route = pathFor(`/interview-reports/${id}/convert-to-task`);
  const payload = { clientKey: 'interview-task-0001', title: '整理项目数据', expectedState: { status: 'preparing', historyId: 0 } };
  assert.equal((await call(route, 'POST', { ...payload, expectedState: undefined })).status, 428);
  assert.equal((await call(route, 'POST', payload, otherId)).status, 404);
  const [a, b] = await Promise.all([call(route, 'POST', payload), call(route, 'POST', payload)]);
  assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(a.body.data.taskId, b.body.data.taskId);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM application_tasks WHERE application_id=? AND user_id=?').get(applicationId, ownerId).count, 1);
  assert.equal((await call(route, 'POST', { ...payload, clientKey: 'interview-task-0002' })).status, 409);
  assert.equal((await call(route, 'POST', payload, otherId)).status, 404);
  db.prepare("UPDATE applications SET archived_at=datetime('now') WHERE id=?").run(applicationId);
  const another = await call(pathFor('/interview-reports'), 'POST', { ...reportInput, clientKey: 'practice-report-0002' });
  assert.equal(another.status, 404);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('./helpers/isolatedTestRuntime.cjs');

runtime.install();
runtime.registerCleanup(test);

test('feedback updates require migration and record versioned handling atomically', async () => {
  const jobsFile = path.join(__dirname, '../data/jobs.json');
  const jobsHashBefore = require('node:crypto').createHash('sha256').update(fs.readFileSync(jobsFile)).digest('hex');
  process.env.ADMIN_USERNAME = 'audit_admin';
  process.env.ADMIN_PASSWORD = 'audit_password';
  process.env.JWT_SECRET = 'test_secret_please_do_not_use_in_production_1234567890';
  process.env.RAPID_API_KEY = '';
  process.env.LIVE_JOBS_ENABLED = 'false';
  process.env.DISABLE_FREE_JOB_SOURCES = 'true';
  runtime.prepare();
  const db = require('../db/database');
  const { applyPendingMigrations } = require('../db/migrate');
  // The isolated runtime applies all migrations. Remove the audit table only
  // in its temporary DB to prove writes fail closed if schema is incomplete.
  db.exec('DROP TABLE feedback_handling_events');
  const adminAccounts = require('../utils/adminAccounts');
  const jwt = require('jsonwebtoken');
  const createdAt = new Date(Date.now() - 100 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const feedbackId = Number(db.prepare(`INSERT INTO feedbacks (user_id,type,content,contact,created_at)
    VALUES (1,'岗位信息纠错','岗位问题：链接失效；岗位ID：123；来源：unknown','','${createdAt}')`).run().lastInsertRowid);
  const server = runtime.trackServer(require('../server').startServer(0));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/admin/api/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'audit_admin', password: 'audit_password' }) });
  assert.equal(login.status, 200);
  const token = (await login.json()).data.token;
  const request = (method, suffix, body, auth = token) => fetch(`${base}/admin/api/feedbacks${suffix}`, {
    method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const idPath = `/${feedbackId}`;
  const initial = await request('GET', '?type=岗位信息纠错');
  assert.equal(initial.status, 200);
  const initialBody = await initial.json();
  assert.equal(initialBody.data.auditReady, false);
  assert.equal(initialBody.data.list[0].review_version, null);
  const pending = await request('PUT', idPath, { status: 'processing', adminNote: '正在核查', expectedVersion: 0 });
  assert.equal(pending.status, 503);
  assert.equal(db.prepare('SELECT status FROM feedbacks WHERE id=?').pluck().get(feedbackId), 'open');
  assert.equal((await request('GET', `${idPath}/audit`)).status, 503);

  const migrationSql = fs.readFileSync(path.join(__dirname, '../db/migrations/0023_feedback_handling_audit.sql'), 'utf8');
  db.exec(migrationSql.slice(migrationSql.indexOf('CREATE TABLE feedback_handling_events')));
  assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  const shortNote = await request('PUT', idPath, { status: 'resolved', adminNote: '已处理', expectedVersion: 0 });
  assert.equal(shortNote.status, 400);
  assert.equal((await request('PUT', idPath, { status: 'ignored', adminNote: '无效', expectedVersion: 0 })).status, 400);
  assert.equal((await request('PUT', idPath, { status: 'processing', adminNote: '字'.repeat(1001), expectedVersion: 0 })).status, 400);
  assert.equal(db.prepare('SELECT review_version FROM feedbacks WHERE id=?').pluck().get(feedbackId), 0);
  const first = await request('PUT', idPath, { status: 'processing', adminNote: '正在核对企业公告及岗位链接', expectedVersion: 0 });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).data.review_version, 1);
  const stale = await request('PUT', idPath, { status: 'resolved', adminNote: '已经核实并完成岗位说明修正', expectedVersion: 0 });
  assert.equal(stale.status, 409);
  const duplicate = await request('PUT', idPath, { status: 'processing', adminNote: '正在核对企业公告及岗位链接', expectedVersion: 1 });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).data.review_version, 1);
  assert.equal(db.prepare('SELECT COUNT(*) FROM feedback_handling_events WHERE feedback_id=?').pluck().get(feedbackId), 1);
  const beforeFailedAudit = db.prepare('SELECT status, admin_note, review_version FROM feedbacks WHERE id=?').get(feedbackId);
  db.exec(`CREATE TRIGGER reject_feedback_audit_insert BEFORE INSERT ON feedback_handling_events
    BEGIN SELECT RAISE(ABORT, 'isolated audit insert rejection'); END`);
  const failedAudit = await request('PUT', idPath, {
    status: 'resolved', adminNote: '已核实企业官网并完成岗位链接修正', expectedVersion: 1
  });
  assert.equal(failedAudit.status, 500);
  const failedBody = await failedAudit.json();
  assert.equal(failedBody.message, '反馈处理失败');
  assert.doesNotMatch(JSON.stringify(failedBody), /isolated audit insert rejection|SQLITE_|trigger/i);
  assert.deepEqual(db.prepare('SELECT status, admin_note, review_version FROM feedbacks WHERE id=?').get(feedbackId), beforeFailedAudit);
  assert.equal(db.prepare('SELECT COUNT(*) FROM feedback_handling_events WHERE feedback_id=?').pluck().get(feedbackId), 1);
  db.exec('DROP TRIGGER reject_feedback_audit_insert');
  const second = await request('PUT', idPath, { status: 'resolved', adminNote: '已核实企业官网并完成岗位链接修正', expectedVersion: 1 });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).data.review_version, 2);
  const audit = await request('GET', `${idPath}/audit`);
  assert.equal(audit.status, 200);
  const events = (await audit.json()).data;
  assert.equal(events.total, 2);
  assert.deepEqual(events.list.map(item => item.version), [2, 1]);
  assert.equal(events.list[0].actor_name, 'audit_admin');
  assert.equal(events.list[0].from_status, 'processing');
  assert.equal(events.list[0].to_status, 'resolved');
  const after = await request('GET', '?type=岗位信息纠错');
  const finalRow = (await after.json()).data.list.find(item => item.id === feedbackId);
  assert.equal(finalRow.review_version, 2);
  assert.equal(finalRow.timing.completedAt, events.list[0].acted_at);
  const expectedSeconds = Math.floor((Date.parse(events.list[0].acted_at) - Date.parse(`${createdAt.replace(' ', 'T')}Z`)) / 1000);
  assert.equal(finalRow.timing.handlingSeconds, expectedSeconds);
  const reopened = await request('PUT', idPath, { status: 'open', adminNote: '重新核对用户补充线索', expectedVersion: 2 });
  assert.equal(reopened.status, 200);
  const reopenedList = await request('GET', '?type=岗位信息纠错');
  const reopenedRow = (await reopenedList.json()).data.list.find(item => item.id === feedbackId);
  assert.equal(reopenedRow.timing.completedAt, null);
  assert.ok(reopenedRow.timing.handlingSeconds >= 100 * 60);

  const historicalId = Number(db.prepare(`INSERT INTO feedbacks (user_id,type,content,contact,status,admin_note,created_at)
    VALUES (1,'岗位信息纠错','迁移前已处理的历史反馈','','resolved','历史处理备注',?)`).run(createdAt).lastInsertRowid);
  const historicalList = await request('GET', '?type=岗位信息纠错');
  const historicalRow = (await historicalList.json()).data.list.find(item => item.id === historicalId);
  assert.equal(historicalRow.review_version, 0);
  assert.equal(historicalRow.timing.historyAvailable, false);
  assert.equal(historicalRow.timing.completedAt, null);
  assert.equal(historicalRow.timing.handlingSeconds, null);
  const historicalAudit = await request('GET', `/${historicalId}/audit`);
  assert.equal(historicalAudit.status, 200);
  assert.equal((await historicalAudit.json()).data.total, 0);
  const historicalNoteChange = await request('PUT', `/${historicalId}`, {
    status: 'resolved', adminNote: '迁移后补充说明但处理日期未知', expectedVersion: 0
  });
  assert.equal(historicalNoteChange.status, 200);
  const historicalAfterNote = await request('GET', '?type=岗位信息纠错');
  const historicalAfterNoteRow = (await historicalAfterNote.json()).data.list.find(item => item.id === historicalId);
  assert.equal(historicalAfterNoteRow.review_version, 1);
  assert.equal(historicalAfterNoteRow.timing.historyAvailable, true);
  assert.equal(historicalAfterNoteRow.timing.completedAt, null);
  assert.equal(historicalAfterNoteRow.timing.handlingSeconds, null);

  const restricted = adminAccounts.createAccount({ username: 'audit_restricted', password: 'test_password', permissions: ['feedback'] });
  const restrictedToken = jwt.sign({ role: 'admin', id: restricted.id, permissions: ['feedback'] }, process.env.JWT_SECRET);
  db.prepare('UPDATE admin_accounts SET permissions=? WHERE id=?').run(JSON.stringify(['jobs']), restricted.id);
  assert.equal((await request('GET', '', undefined, restrictedToken)).status, 403);
  assert.equal((await request('PUT', idPath, { status: 'ignored', adminNote: '拒绝', expectedVersion: 2 }, restrictedToken)).status, 403);
  assert.equal((await request('GET', `${idPath}/audit`, undefined, restrictedToken)).status, 403);
  assert.equal((await request('DELETE', idPath)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) FROM feedback_handling_events WHERE feedback_id=?').pluck().get(feedbackId), 0);
  assert.equal((await request('GET', `${idPath}/audit`)).status, 404);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const jobsHashAfter = require('node:crypto').createHash('sha256').update(fs.readFileSync(jobsFile)).digest('hex');
  assert.equal(jobsHashAfter, jobsHashBefore);
});

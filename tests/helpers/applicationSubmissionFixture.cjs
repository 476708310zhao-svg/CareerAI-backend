'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(process.env.APPLICATION_SUBMISSION_FIXTURE_ROOT || '');
assert.ok(process.env.APPLICATION_SUBMISSION_FIXTURE_ROOT);
assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
assert.match(path.basename(root), /^jobapp-submission-confirmation-[A-Za-z0-9_-]+$/);
Object.assign(process.env, {
  WEB_TEST_ISOLATED: '1',
  DB_PATH: path.join(root, 'db', 'submission.db'),
  DATA_DIR: path.join(root, 'data'),
  UPLOAD_DIR: path.join(root, 'uploads'),
  JWT_SECRET: 'submission_fixture_secret_not_for_production',
  ANALYTICS_DATA_CLASS: 'test',
  V4_AI_LIVE_ENABLED: 'false'
});

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db/database');
const { applyPendingMigrations } = require('../../db/migrate');
require('../../routes/payment');
require('../../routes/aggregate');
require('../../routes/oa');
require('../../db/v4Schema').ensureV4Schema();

const ownerId = Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('submission_owner','Owner')").run().lastInsertRowid);
const otherId = Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('submission_other','Other')").run().lastInsertRowid);
const token = userId => jwt.sign({ userId }, process.env.JWT_SECRET);
let sequence = 0;
function createApplication(userId = ownerId, status = 'preparing') {
  const id = Number(db.prepare(`INSERT INTO applications
    (user_id,job_id,source_job_id,source_type,job_snapshot,status,status_text,v4_status,progress_status,company,job_title)
    VALUES (?,?,?,?,?,'pending','准备申请',?,?,'Example','Role')`)
    .run(userId, `submission-job-${++sequence}`, `submission-job-${sequence}`, 'job', '{}', status,
      status === 'applied' ? 'applied' : 'online_apply').lastInsertRowid);
  const historyId = Number(db.prepare(`INSERT INTO application_history
    (application_id,user_id,from_status,to_status,note,actor_type)
    VALUES (?,?,'',?,'测试初始状态','user')`).run(id, userId, status).lastInsertRowid);
  return { id, status, historyId, submissionEventId: 0 };
}

const app = express();
app.use(express.json());
app.use('/api/v4/applications', require('../../routes/v4/applications'));
app.use((error, request, response, next) => {
  void request; void next;
  response.status(error.status || 500).json({ code: -1, message: '测试服务错误' });
});
let server;
let base;
before(async () => {
  server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  base = `http://127.0.0.1:${server.address().port}/api/v4/applications`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db.open) db.close();
});
async function call(id, suffix, method = 'GET', body, userId = ownerId) {
  const response = await fetch(`${base}/${id}${suffix}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(userId ? { Authorization: `Bearer ${token(userId)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}
const input = (row, key, channel = 'web') => ({
  expectedState: { status: row.status, historyId: row.historyId },
  expectedSubmissionEventId: row.submissionEventId,
  clientKey: key, channel
});

test('pre-migration reads remain available and confirmation writes fail closed', async () => {
  const row = createApplication();
  const detail = await call(row.id, '/detail');
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.data.application.submissionConfirmation,
    { available: false, unavailableReason: 'migration_pending', confirmed: false, eventId: 0, confirmedAt: null });
  const write = await call(row.id, '/submission-confirmation', 'POST', input(row, 'before-migration'));
  assert.equal(write.status, 503);
  assert.equal(db.prepare('SELECT v4_status FROM applications WHERE id=?').pluck().get(row.id), 'preparing');
  applyPendingMigrations(db);
});

test('confirm, retry, stale CAS, revoke and reconfirm keep independent facts', async () => {
  const row = createApplication();
  const first = await call(row.id, '/submission-confirmation', 'POST', input(row, 'confirm-first'));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.changed, true);
  assert.equal(first.body.data.status, 'applied');
  assert.equal(first.body.data.submissionConfirmation.confirmed, true);
  assert.match(first.body.data.submissionConfirmation.confirmedAt, /^\d{4}-\d\d-\d\dT/);
  const afterFirst = { status: first.body.data.status, historyId: first.body.data.historyId,
    submissionEventId: first.body.data.submissionConfirmation.eventId };
  const retry = await call(row.id, '/submission-confirmation', 'POST', input(row, 'confirm-first'));
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.changed, false);
  assert.equal(db.prepare('SELECT COUNT(*) FROM application_submission_events WHERE application_id=?').pluck().get(row.id), 1);
  assert.equal(db.prepare("SELECT COUNT(*) FROM analytics_events WHERE user_id=? AND event_name='application_submission_confirmed'").pluck().get(ownerId), 1);
  assert.equal(db.prepare("SELECT COUNT(*) FROM analytics_events WHERE user_id=? AND event_name='application_submitted'").pluck().get(ownerId), 1);
  const stale = await call(row.id, '/submission-confirmation/revoke', 'POST', input(row, 'revoke-stale'));
  assert.equal(stale.status, 409);
  const staleStatus = await call(row.id, '/submission-confirmation/revoke', 'POST', input({
    ...row, submissionEventId: afterFirst.submissionEventId
  }, 'revoke-stale-status'));
  assert.equal(staleStatus.status, 409);
  const reusedKey = await call(row.id, '/submission-confirmation/revoke', 'POST', input(afterFirst, 'confirm-first'));
  assert.equal(reusedKey.status, 409);
  const revoked = await call(row.id, '/submission-confirmation/revoke', 'POST', input(afterFirst, 'revoke-first', 'miniprogram'));
  assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
  assert.equal(revoked.body.data.status, 'applied');
  assert.equal(revoked.body.data.historyId, afterFirst.historyId);
  assert.equal(revoked.body.data.submissionConfirmation.confirmed, false);
  assert.equal(revoked.body.data.submissionConfirmation.confirmedAt, null);
  assert.equal((await call(row.id, '/submission-confirmation', 'POST', input(row, 'confirm-first'))).status, 409);
  const afterRevoke = { status: revoked.body.data.status, historyId: revoked.body.data.historyId,
    submissionEventId: revoked.body.data.submissionConfirmation.eventId };
  const again = await call(row.id, '/submission-confirmation', 'POST', input(afterRevoke, 'confirm-again'));
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.data.status, 'applied');
  assert.equal(again.body.data.historyId, afterFirst.historyId);
  assert.equal(again.body.data.submissionConfirmation.confirmed, true);
  assert.equal(db.prepare("SELECT COUNT(*) FROM analytics_events WHERE user_id=? AND event_name='application_submitted'").pluck().get(ownerId), 1);
  const events = db.prepare('SELECT action,supersedes_id,channel FROM application_submission_events WHERE application_id=? ORDER BY id').all(row.id);
  assert.deepEqual(events.map(event => event.action), ['confirmed', 'revoked', 'confirmed']);
  assert.equal(events[1].supersedes_id, afterFirst.submissionEventId);
  assert.equal(events[2].supersedes_id, afterRevoke.submissionEventId);
});

test('owner, anonymous and invalid requests cannot write confirmation facts', async () => {
  const row = createApplication();
  assert.equal((await call(row.id, '/submission-confirmation', 'POST', input(row, 'foreign-key'), otherId)).status, 404);
  assert.equal((await call(row.id, '/submission-confirmation', 'POST', input(row, 'anonymous'), null)).status, 401);
  assert.equal((await call(row.id, '/submission-confirmation', 'POST', { ...input(row, 'bad'), clientKey: 'x' })).status, 400);
  assert.equal((await call(row.id, '/submission-confirmation', 'POST', { ...input(row, 'bad-channel'), channel: 'admin' })).status, 400);
  assert.equal((await call(row.id, '/detail', 'GET', undefined, otherId)).status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) FROM application_submission_events WHERE application_id=?').pluck().get(row.id), 0);
});

test('event insert failure rolls back status, history and old funnel event', async () => {
  const row = createApplication();
  const funnelBefore = db.prepare("SELECT COUNT(*) FROM analytics_events WHERE user_id=? AND event_name='application_submitted' AND route='/api/v4/applications/:id/status'").pluck().get(ownerId);
  db.exec(`CREATE TEMP TRIGGER reject_submission_event BEFORE INSERT ON application_submission_events
    WHEN NEW.client_key='rollback-test' BEGIN SELECT RAISE(ABORT,'test reject event'); END`);
  try {
    const result = await call(row.id, '/submission-confirmation', 'POST', input(row, 'rollback-test'));
    assert.equal(result.status, 500);
    assert.equal(db.prepare('SELECT v4_status FROM applications WHERE id=?').pluck().get(row.id), 'preparing');
    assert.equal(db.prepare('SELECT COUNT(*) FROM application_history WHERE application_id=?').pluck().get(row.id), 1);
    assert.equal(db.prepare('SELECT COUNT(*) FROM application_submission_events WHERE application_id=?').pluck().get(row.id), 0);
    assert.equal(db.prepare("SELECT COUNT(*) FROM analytics_events WHERE user_id=? AND event_name='application_submitted' AND route='/api/v4/applications/:id/status'").pluck().get(ownerId), funnelBefore);
  } finally { db.exec('DROP TRIGGER reject_submission_event'); }
});

test('analytics failure does not erase a committed confirmation fact', async () => {
  const row = createApplication(ownerId, 'applied');
  const legacy = await call(row.id, '/detail');
  assert.equal(legacy.body.data.application.status, 'applied');
  assert.deepEqual(legacy.body.data.application.submissionConfirmation,
    { available: true, unavailableReason: null, confirmed: false, eventId: 0, confirmedAt: null });
  db.exec(`CREATE TEMP TRIGGER reject_submission_analytics BEFORE INSERT ON analytics_events
    WHEN NEW.event_name='application_submission_confirmed' BEGIN SELECT RAISE(ABORT,'test analytics failure'); END`);
  try {
    const result = await call(row.id, '/submission-confirmation', 'POST', input(row, 'analytics-failure'));
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.data.submissionConfirmation.confirmed, true);
    assert.equal(db.prepare('SELECT COUNT(*) FROM application_submission_events WHERE application_id=?').pluck().get(row.id), 1);
  } finally { db.exec('DROP TRIGGER reject_submission_analytics'); }
});

test('same-key concurrent confirmations record one fact and one independent event', async () => {
  const row = createApplication(ownerId, 'applied');
  const body = input(row, 'concurrent-same-key');
  const responses = await Promise.all([
    call(row.id, '/submission-confirmation', 'POST', body),
    call(row.id, '/submission-confirmation', 'POST', body)
  ]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  assert.deepEqual(responses.map(response => response.body.data.changed).sort(), [false, true]);
  assert.equal(db.prepare('SELECT COUNT(*) FROM application_submission_events WHERE application_id=?').pluck().get(row.id), 1);
});

test('archived details remain readable but disable confirmation actions', async () => {
  const row = createApplication(ownerId, 'applied');
  const confirmed = await call(row.id, '/submission-confirmation', 'POST', input(row, 'archived-confirm'));
  assert.equal(confirmed.status, 200);
  db.prepare("UPDATE applications SET archived_at=datetime('now') WHERE id=?").run(row.id);
  const detail = await call(row.id, '/detail');
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.application.submissionConfirmation.available, false);
  assert.equal(detail.body.data.application.submissionConfirmation.unavailableReason, 'archived');
  assert.equal(detail.body.data.application.submissionConfirmation.confirmed, true);
  assert.equal(detail.body.data.application.submissionConfirmation.confirmedAt,
    confirmed.body.data.submissionConfirmation.confirmedAt);
  assert.equal((await call(row.id, '/submission-confirmation', 'POST', input(row, 'archived-app'))).status, 404);
});

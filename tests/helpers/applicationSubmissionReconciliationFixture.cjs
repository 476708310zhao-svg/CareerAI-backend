'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(process.env.APPLICATION_RECONCILE_FIXTURE_ROOT || '');
assert.ok(process.env.APPLICATION_RECONCILE_FIXTURE_ROOT);
assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
assert.match(path.basename(root), /^jobapp-submission-reconcile-[A-Za-z0-9_-]+$/);
Object.assign(process.env, {
  WEB_TEST_ISOLATED: '1',
  DB_PATH: path.join(root, 'db', 'reconcile.db'),
  DATA_DIR: path.join(root, 'data'),
  UPLOAD_DIR: path.join(root, 'uploads'),
  JWT_SECRET: 'reconciliation_test_secret_not_for_production',
  ANALYTICS_DATA_CLASS: 'test',
  V4_AI_LIVE_ENABLED: 'false'
});

const db = require('../../db/database');
const { applyPendingMigrations } = require('../../db/migrate');
require('../../routes/payment');
require('../../routes/aggregate');
require('../../routes/oa');
require('../../db/v4Schema').ensureV4Schema();
const analytics = require('../../services/v4Analytics');
const submission = require('../../services/v4ApplicationSubmission');
const reconciliation = require('../../services/v4SubmissionAnalyticsReconciliation');
after(() => { if (db.open) db.close(); });

let sequence = 0;
const owner = Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('reconcile_owner','Owner')").run().lastInsertRowid);
const other = Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('reconcile_other','Other')").run().lastInsertRowid);
function app(userId = owner) {
  const id = Number(db.prepare(`INSERT INTO applications
    (user_id,job_id,source_job_id,source_type,job_snapshot,status,status_text,v4_status,progress_status,company,job_title)
    VALUES (?,?,?,?,?,'applied','已申请','applied','applied','Company','Role')`)
    .run(userId, `reconcile-job-${++sequence}`, `reconcile-job-${sequence}`, 'job', '{}').lastInsertRowid);
  const historyId = Number(db.prepare(`INSERT INTO application_history
    (application_id,user_id,from_status,to_status,note,actor_type)
    VALUES (?,?,'','applied','initial','user')`).run(id, userId).lastInsertRowid);
  return { id, historyId };
}
function fact(application, userId = owner, action = 'confirmed', channel = 'web') {
  return Number(db.prepare(`INSERT INTO application_submission_events
    (application_id,user_id,action,client_key,channel,created_at)
    VALUES (?,?,?,?,?,?)`).run(application.id, userId, action, `reconcile-${++sequence}`, channel,
      new Date().toISOString()).lastInsertRowid);
}
function eventRows(eventId) {
  return db.prepare(`SELECT id,user_id AS userId,event_name AS eventName,payload,created_at AS createdAt
    FROM analytics_events WHERE event_name IN ('application_submission_confirmed','application_submission_revoked')
      AND json_valid(payload) AND json_extract(payload,'$.confirmationEventId')=? ORDER BY id`).all(eventId);
}

test('migration pending is explicit and does not manufacture confirmed conversion', () => {
  assert.equal(reconciliation.report('test').available, false);
  assert.equal(reconciliation.reconcileBatch().reason, 'migration_pending');
  applyPendingMigrations(db);
  assert.equal(reconciliation.report('test').complete, true);
});

test('confirmation write is immediate, a failed analytics insert remains recoverable', () => {
  const application = app();
  db.exec(`CREATE TEMP TRIGGER reject_confirmation_analytics BEFORE INSERT ON analytics_events
    WHEN NEW.event_name='application_submission_confirmed' BEGIN SELECT RAISE(ABORT,'injected analytics outage'); END`);
  let created;
  try {
    created = submission.change(owner, application.id, 'confirmed', {
      expectedState: { status: 'applied', historyId: application.historyId },
      expectedSubmissionEventId: 0, clientKey: 'reconcile-confirm-1', channel: 'web'
    });
    assert.equal(created.changed, true);
    assert.equal(eventRows(created.submissionConfirmation.eventId).length, 0);
    const pending = reconciliation.report('test');
    assert.equal(pending.complete, false);
    assert.equal(pending.pendingEvents, 1);
    assert.equal(pending.historicallyConfirmed30d, null);
  } finally { db.exec('DROP TRIGGER reject_confirmation_analytics'); }
  const batch = reconciliation.reconcileBatch({ afterId: 0, limit: 1 });
  assert.equal(batch.scanned, 1);
  assert.equal(batch.inserted, 1);
  assert.equal(batch.failed, 0);
  assert.equal(batch.hasMore, false);
  const row = eventRows(created.submissionConfirmation.eventId)[0];
  assert.equal(row.userId, owner);
  assert.equal(JSON.parse(row.payload).applicationId, application.id);
  assert.equal(JSON.parse(row.payload).channel, 'web');
  assert.equal(reconciliation.reconcileBatch({ afterId: 0, limit: 10 }).inserted, 0);
  assert.equal(eventRows(created.submissionConfirmation.eventId).length, 1);
  const report = reconciliation.report('test');
  assert.equal(report.complete, true);
  assert.deepEqual(report.historicallyConfirmed30d, { applications: 1, users: 1, events: 1 });
  assert.deepEqual(report.currentlyConfirmed, { applications: 1, users: 1 });
  assert.deepEqual(reconciliation.report('production').historicallyConfirmed30d,
    { applications: 0, users: 0, events: 0 });
});

test('old-format event identity, foreign user and action mismatches never suppress repair', () => {
  const first = app();
  const firstId = fact(first);
  const old = analytics.track(owner, 'application_submission_confirmed', {
    applicationId: first.id, confirmationEventId: firstId, channel: 'web', refs: { userId: owner, applicationId: first.id }
  }, '/api/v4/applications/:id/submission-confirmation', 'server', { eventVersion: 2 });
  assert.equal(old.inserted, true);
  assert.equal(reconciliation.reconcileOne(firstId).reason, 'already_recorded');
  assert.equal(eventRows(firstId).length, 1);

  const second = app();
  const secondId = fact(second);
  analytics.track(other, 'application_submission_confirmed', {
    applicationId: second.id, confirmationEventId: secondId, channel: 'web'
  }, '', 'server', { eventVersion: 2 });
  analytics.track(owner, 'application_submission_revoked', {
    applicationId: second.id, confirmationEventId: secondId, channel: 'web'
  }, '', 'server', { eventVersion: 2 });
  assert.equal(reconciliation.reconcileOne(secondId).inserted, true);
  assert.equal(eventRows(secondId).filter(row => row.userId === owner && row.eventName === 'application_submission_confirmed').length, 1);
  assert.equal(reconciliation.report('test').complete, true);
});

test('cursor batches resume, revoke is separate and current state differs from ever confirmed', () => {
  const target = app();
  const confirmedId = fact(target);
  const revokedId = fact(target, owner, 'revoked', 'miniprogram');
  const first = reconciliation.reconcileBatch({ afterId: 0, limit: 2 });
  assert.equal(first.scanned, 2);
  assert.equal(first.hasMore, true);
  let nextCursor = first.nextCursor;
  let more = first.hasMore;
  while (more) {
    const next = reconciliation.reconcileBatch({ afterId: nextCursor, limit: 2 });
    assert.ok(next.scanned >= 1);
    nextCursor = next.nextCursor;
    more = next.hasMore;
  }
  assert.equal(reconciliation.reconcileOne(confirmedId).reason, 'already_recorded');
  assert.equal(reconciliation.reconcileOne(revokedId).reason, 'already_recorded');
  const report = reconciliation.report('test');
  assert.equal(report.complete, true);
  assert.equal(report.historicallyConfirmed30d.applications, 4);
  assert.equal(report.currentlyConfirmed.applications, 3);
  assert.equal(eventRows(revokedId)[0].eventName, 'application_submission_revoked');
});

test('duplicate analytics is surfaced and fact metrics still count once', () => {
  const target = app();
  const eventId = fact(target);
  assert.equal(reconciliation.reconcileOne(eventId).inserted, true);
  const payload = JSON.parse(eventRows(eventId)[0].payload);
  analytics.track(owner, 'application_submission_confirmed', payload, '', 'server', { eventVersion: 2 });
  const report = reconciliation.report('test');
  assert.equal(report.complete, false);
  assert.equal(report.duplicateEvents, 1);
  assert.equal(report.historicallyConfirmed30d, null);
  assert.equal(report.currentlyConfirmed, null);
  assert.equal(reconciliation.reconcileOne(eventId).reason, 'duplicate_existing');
});

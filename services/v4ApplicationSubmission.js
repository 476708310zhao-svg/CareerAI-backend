'use strict';

const db = require('../db/database');
const workflow = require('./v4ApplicationWorkflow');
const reconciliation = require('./v4SubmissionAnalyticsReconciliation');
const { STATUS_TEXT, toV4Status } = require('../utils/applicationStatus');

function problem(status, message) {
  return Object.assign(new Error(message), { status, isApplicationSubmissionError: true });
}

function schemaAvailable() {
  const migration = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  if (!migration) return false;
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version='0024'").get();
  if (!applied) return false;
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='application_submission_events'").get());
}

function latest(userId, applicationId) {
  return db.prepare(`SELECT id,action,created_at AS createdAt FROM application_submission_events
    WHERE user_id=? AND application_id=? ORDER BY id DESC LIMIT 1`).get(userId, applicationId);
}

function present(event, available = true, unavailableReason = null) {
  return {
    available,
    unavailableReason,
    confirmed: Boolean(event && event.action === 'confirmed'),
    eventId: event ? event.id : 0,
    confirmedAt: event && event.action === 'confirmed' ? event.createdAt : null
  };
}

function read(userId, applicationId) {
  if (!schemaAvailable()) return present(null, false, 'migration_pending');
  return present(latest(userId, applicationId));
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw problem(400, '提交确认参数无效');
  const expected = body.expectedState;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)
    || !Object.prototype.hasOwnProperty.call(STATUS_TEXT, expected.status)
    || !Number.isSafeInteger(expected.historyId) || expected.historyId < 0
    || !Number.isSafeInteger(body.expectedSubmissionEventId) || body.expectedSubmissionEventId < 0
    || typeof body.clientKey !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(body.clientKey)
    || !['web', 'miniprogram'].includes(body.channel)) {
    throw problem(400, '请刷新申请后提交有效的确认参数');
  }
  return { expected, expectedSubmissionEventId: body.expectedSubmissionEventId,
    clientKey: body.clientKey, channel: body.channel };
}

function change(userId, applicationId, action, body) {
  if (!Number.isSafeInteger(applicationId) || applicationId <= 0) throw problem(400, '申请记录 ID 无效');
  const input = validate(body);
  const result = db.transaction(() => {
    const row = db.prepare("SELECT * FROM applications WHERE id=? AND user_id=? AND COALESCE(archived_at,'')=''")
      .get(applicationId, userId);
    if (!row) throw problem(404, '申请记录不存在');
    if (!schemaAvailable()) throw problem(503, '提交确认记录尚未完成迁移，请稍后重试');

    const existingKey = db.prepare(`SELECT id,action,channel FROM application_submission_events
      WHERE user_id=? AND application_id=? AND client_key=?`).get(userId, applicationId, input.clientKey);
    if (existingKey) {
      if (existingKey.action !== action || existingKey.channel !== input.channel) {
        throw problem(409, '请求标识已用于其他提交确认操作');
      }
      const newest = latest(userId, applicationId);
      if (!newest || newest.id !== existingKey.id) {
        throw problem(409, '提交确认已被后续操作更新，请刷新后重试');
      }
      const currentRow = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(applicationId, userId);
      return { changed: false, status: toV4Status(currentRow), historyId: workflow.revision(userId, applicationId),
        submissionConfirmation: present(newest) };
    }

    const current = latest(userId, applicationId);
    const currentEventId = current ? current.id : 0;
    const status = toV4Status(row);
    const historyId = workflow.revision(userId, applicationId);
    if (input.expectedSubmissionEventId !== currentEventId
      || input.expected.status !== status || input.expected.historyId !== historyId) {
      throw problem(409, '申请已在其他页面或设备更新，请刷新后重试');
    }
    if (action === 'confirmed') {
      if (!['preparing', 'applied'].includes(status)) throw problem(409, '请先将申请准备好，再确认已提交');
      if (current && current.action === 'confirmed') throw problem(409, '这条申请已确认提交，请刷新后查看');
      if (status === 'preparing') {
        workflow.changeStatus(userId, applicationId, 'applied', '用户确认已在企业招聘系统完成最终提交', input.expected);
      }
    } else if (action === 'revoked') {
      if (!current || current.action !== 'confirmed') throw problem(409, '当前没有可撤回的提交确认');
    } else {
      throw problem(400, '提交确认操作无效');
    }

    const createdAt = new Date().toISOString();
    const inserted = db.prepare(`INSERT INTO application_submission_events
      (application_id,user_id,action,supersedes_id,client_key,channel,created_at)
      VALUES (?,?,?,?,?,?,?)`).run(applicationId, userId, action, currentEventId || null, input.clientKey, input.channel, createdAt);
    const event = { id: Number(inserted.lastInsertRowid), action, createdAt };
    const updatedRow = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(applicationId, userId);
    return { changed: true, status: toV4Status(updatedRow), historyId: workflow.revision(userId, applicationId),
      submissionConfirmation: present(event) };
  }).immediate();

  if (result.changed) {
    // Confirmation is the source of truth. Reconciliation is retryable if analytics fails.
    try { reconciliation.reconcileOne(result.submissionConfirmation.eventId); } catch (_) { /* retried by the batch job */ }
  }
  return result;
}

module.exports = { read, change, schemaAvailable };

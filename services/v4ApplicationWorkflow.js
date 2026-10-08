'use strict';

const { randomUUID } = require('node:crypto');
const db = require('../db/database');
const { ensureSpace } = require('./v4Interview');
const analytics = require('./v4Analytics');
const { applicationRefs, mergeCoreRefs, withCoreRefs } = require('../utils/coreEntityRefs');
const { STATUS_TEXT, TRANSITIONS, V4_TO_PROGRESS, toV4Status, broadStatus } = require('../utils/applicationStatus');
const { eventForApplicationStatus } = require('../utils/funnelAnalytics');

const MAX_BATCH = 50;
const UNDO_MS = 10 * 60 * 1000;
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function error(status, message, details) {
  return Object.assign(new Error(message), { status, details, isApplicationWorkflowError: true });
}
function revision(userId, id) {
  return db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM application_history WHERE application_id=? AND user_id=?').get(id, userId).id;
}
function application(userId, id) {
  return db.prepare("SELECT * FROM applications WHERE id=? AND user_id=? AND COALESCE(archived_at,'')=''").get(id, userId);
}
function validate(row, nextStatus, expected, userId) {
  if (!row) throw error(404, '申请不存在或不可操作');
  if (!owns(STATUS_TEXT, nextStatus)) throw error(400, '无效的申请状态');
  const currentStatus = toV4Status(row);
  // Always read the revision inside the caller's IMMEDIATE transaction. Legacy
  // clients may omit expectedState, while newer clients get strict ABA safety.
  const currentHistoryId = revision(userId, row.id);
  if (expected !== undefined && (!expected || typeof expected !== 'object' || Array.isArray(expected)
    || !owns(expected, 'status') || !owns(expected, 'historyId')
    || !owns(STATUS_TEXT, expected.status)
    || !Number.isSafeInteger(expected.historyId) || expected.historyId < 0)) {
    throw error(400, '请刷新申请状态后重试');
  }
  if (expected !== undefined && (expected.status !== currentStatus || expected.historyId !== currentHistoryId)) {
    throw error(409, '申请已在其他页面或设备更新，请刷新后重试', { applicationId: row.id, currentStatus });
  }
  if (currentStatus !== nextStatus && !(TRANSITIONS[currentStatus] || []).includes(nextStatus)) {
    throw error(409, `不能从“${STATUS_TEXT[currentStatus]}”直接变更为“${STATUS_TEXT[nextStatus]}”`, {
      applicationId: row.id, currentStatus, allowedStatuses: TRANSITIONS[currentStatus] || []
    });
  }
  return { currentStatus, currentHistoryId };
}

// Single and bulk updates share writes, history, interview preparation and funnel events.
function writeChange(userId, row, nextStatus, {
  actor = 'user', note = '', restoring = false, batchId = null, batchSize = null
} = {}) {
  const previousStatus = toV4Status(row);
  if (previousStatus === nextStatus) return { id: row.id, status: nextStatus, statusText: STATUS_TEXT[nextStatus], changed: false };
  db.prepare(`UPDATE applications SET status=?,status_text=?,progress_status=?,v4_status=?,updated_at=datetime('now') WHERE id=? AND user_id=?`)
    .run(broadStatus(nextStatus), STATUS_TEXT[nextStatus], V4_TO_PROGRESS[nextStatus], nextStatus, row.id, userId);
  const history = db.prepare(`INSERT INTO application_history
    (application_id,user_id,from_status,to_status,note,actor_type,batch_id,batch_size)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(row.id, userId, previousStatus, nextStatus, note.slice(0, 500), actor, batchId, batchSize);
  const space = !restoring && ['phone_screen', 'interview_1', 'interview_2', 'final'].includes(nextStatus) ? ensureSpace(userId, row.id) : null;
  const refs = mergeCoreRefs(applicationRefs(row), { interviewSpaceId: space && space.id });
  const route = actor === 'web_bulk_undo'
    ? '/api/v4/applications/bulk-status/undo'
    : actor.startsWith('web_') ? '/api/v4/applications/bulk-status' : '/api/v4/applications/:id/status';
  const payload = withCoreRefs({ applicationId: row.id, from: previousStatus, to: nextStatus, source: actor.startsWith('web_') ? 'web' : 'client' }, refs);
  analytics.track(userId, restoring ? 'application_status_restored' : 'application_status_changed', payload, route);
  const event = eventForApplicationStatus(nextStatus);
  if (!restoring && event && event !== eventForApplicationStatus(previousStatus)) analytics.trackFunnel(userId, event, payload, route);
  return { id: row.id, status: nextStatus, statusText: STATUS_TEXT[nextStatus], previousStatus, historyId: Number(history.lastInsertRowid), changed: true, interviewSpaceId: refs.interviewSpaceId, refs };
}

function changeStatus(userId, id, nextStatus, note, expected) {
  return db.transaction(() => {
    const row = application(userId, id);
    validate(row, nextStatus, expected, userId);
    return writeChange(userId, row, nextStatus, { note: String(note || '').trim() });
  }).immediate();
}

function bulkStatus(userId, items, status) {
  if (!Array.isArray(items) || !items.length || items.length > MAX_BATCH || !owns(STATUS_TEXT, status)) {
    throw error(400, '请选择 1～50 条申请及有效目标状态');
  }
  if (items.some(item => !item || !Number.isSafeInteger(item.id) || item.id <= 0 || !Number.isSafeInteger(item.historyId) || item.historyId < 0 || !owns(STATUS_TEXT, item.status)) || new Set(items.map(item => item.id)).size !== items.length) {
    throw error(400, '申请标识或状态版本无效，请刷新后重试');
  }
  return db.transaction(() => {
    // Validate every row before any side effect: a conflict rolls back the entire batch.
    const rows = items.map(item => {
      const row = application(userId, item.id);
      validate(row, status, item, userId);
      return row;
    });
    const batchSize = rows.reduce((count, row) => count + (toV4Status(row) === status ? 0 : 1), 0);
    const batchId = batchSize ? randomUUID() : null;
    const results = rows.map(row => writeChange(userId, row, status, {
      actor: 'web_bulk',
      note: 'Web 批量更新申请状态',
      batchId,
      batchSize
    }));
    const changed = results.filter(item => item.changed);
    return { results, changed: changed.length, unchanged: results.length - changed.length, batchId,
      undo: changed.length ? {
        historyIds: changed.map(item => item.historyId),
        expiresAt: new Date(Date.now() + UNDO_MS).toISOString(),
        batchId
      } : null };
  }).immediate();
}

function undoBulk(userId, historyIds) {
  if (!Array.isArray(historyIds) || !historyIds.length || historyIds.length > MAX_BATCH || historyIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(historyIds).size !== historyIds.length) throw error(400, '撤销记录无效');
  return db.transaction(() => {
    const events = historyIds.map(id => {
      const event = db.prepare("SELECT * FROM application_history WHERE id=? AND user_id=? AND actor_type='web_bulk'").get(id, userId);
      if (!event) throw error(404, '批量操作记录不存在');
      return event;
    });
    const batchId = events[0].batch_id;
    const batchSize = events[0].batch_size;
    if (typeof batchId !== 'string' || !batchId.trim()
      || !Number.isSafeInteger(batchSize) || batchSize <= 0
      || events.some(event => event.batch_id !== batchId || event.batch_size !== batchSize)) {
      throw error(409, '撤销记录不属于同一完整批次，本批次未撤销');
    }
    const storedBatch = db.prepare(`SELECT id,user_id,actor_type,batch_size
      FROM application_history WHERE batch_id=? ORDER BY id`).all(batchId);
    const requestedIds = [...historyIds].sort((left, right) => left - right);
    if (storedBatch.length !== batchSize
      || storedBatch.some(event => event.user_id !== userId || event.actor_type !== 'web_bulk' || event.batch_size !== batchSize)
      || storedBatch.length !== historyIds.length
      || storedBatch.some((event, index) => event.id !== requestedIds[index])) {
      throw error(409, '请提交该批次的全部撤销记录，本批次未撤销');
    }
    const pairs = events.map(event => {
      const row = application(userId, event.application_id);
      const createdAt = Date.parse(event.created_at.replace(' ', 'T') + 'Z');
      if (!row || !Number.isFinite(createdAt) || Date.now() - createdAt > UNDO_MS || revision(userId, row.id) !== event.id || toV4Status(row) !== event.to_status) {
        throw error(409, '撤销已过期或申请已再次更新，本批次未撤销');
      }
      return { row, event };
    });
    const results = pairs.map(({ row, event }) => writeChange(userId, row, event.from_status, { actor: 'web_bulk_undo', note: `撤销批量状态记录 ${event.id}`, restoring: true }));
    return { results, restored: results.length };
  }).immediate();
}

module.exports = { changeStatus, bulkStatus, undoBulk, revision, MAX_BATCH };

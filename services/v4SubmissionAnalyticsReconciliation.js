'use strict';

const db = require('../db/database');
const analytics = require('./v4Analytics');
const { withCoreRefs } = require('../utils/coreEntityRefs');

const EVENT_NAMES = Object.freeze({
  confirmed: 'application_submission_confirmed',
  revoked: 'application_submission_revoked'
});

function available() {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
    && db.prepare("SELECT 1 FROM schema_migrations WHERE version='0024'").get()
    && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='application_submission_events'").get());
}

function eventMatches(fact) {
  return db.prepare(`SELECT id,data_class AS dataClass,is_test AS isTest FROM analytics_events
    WHERE user_id=? AND event_name=? AND source='server'
      AND CASE WHEN json_valid(payload) THEN json_extract(payload,'$.confirmationEventId') END=?
      AND CASE WHEN json_valid(payload) THEN json_extract(payload,'$.applicationId') END=?
      AND CASE WHEN json_valid(payload) THEN json_extract(payload,'$.channel') END=?
    ORDER BY id`).all(fact.user_id, EVENT_NAMES[fact.action], fact.id, fact.application_id, fact.channel);
}

function reconcileOne(eventId) {
  if (!Number.isSafeInteger(eventId) || eventId <= 0) throw new TypeError('确认事实 ID 无效');
  if (!available()) return { available: false, eventId, inserted: false, reason: 'migration_pending' };
  return db.transaction(() => {
    const fact = db.prepare(`SELECT e.*,a.id AS retained_application_id,a.job_id,a.source_job_id,
      a.source_type,a.job_snapshot,a.resume_id,a.resume_version_id
      FROM application_submission_events e LEFT JOIN applications a
        ON a.id=e.application_id AND a.user_id=e.user_id WHERE e.id=?`).get(eventId);
    if (!fact) return { available: true, eventId, inserted: false, reason: 'fact_missing' };
    const existing = eventMatches(fact);
    if (existing.length) return { available: true, eventId, inserted: false,
      reason: existing.length > 1 ? 'duplicate_existing' : 'already_recorded', matches: existing.length };
    const payload = withCoreRefs({
      applicationId: fact.application_id, confirmationEventId: fact.id, channel: fact.channel,
      reconciled: true, refsSnapshotAvailable: false
    }, { userId: fact.user_id, applicationId: fact.application_id,
      jobId: fact.retained_application_id ? (fact.source_job_id || fact.job_id) : undefined });
    const route = `/api/v4/applications/:id/submission-confirmation${fact.action === 'revoked' ? '/revoke' : ''}`;
    const written = analytics.track(fact.user_id, EVENT_NAMES[fact.action], payload, route, 'server', { eventVersion: 2 });
    if (!written.inserted) throw new Error(`确认事件补写失败: ${written.error || 'unknown'}`);
    db.prepare('UPDATE analytics_events SET created_at=? WHERE id=?').run(fact.created_at, written.id);
    return { available: true, eventId, inserted: true, analyticsEventId: written.id, matches: 1 };
  }).immediate();
}

function reconcileBatch({ afterId = 0, limit = 100 } = {}) {
  if (!Number.isSafeInteger(afterId) || afterId < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new TypeError('对账游标或批量大小无效');
  }
  if (!available()) return { available: false, reason: 'migration_pending', afterId, nextCursor: afterId,
    scanned: 0, inserted: 0, alreadyRecorded: 0, duplicates: 0, failed: 0, failures: [], hasMore: false };
  const ids = db.prepare('SELECT id FROM application_submission_events WHERE id>? ORDER BY id LIMIT ?').all(afterId, limit + 1);
  const page = ids.slice(0, limit);
  const result = { available: true, reason: null, afterId, nextCursor: afterId, scanned: 0,
    inserted: 0, alreadyRecorded: 0, duplicates: 0, failed: 0, failures: [], hasMore: ids.length > limit };
  for (const { id } of page) {
    result.scanned += 1;
    result.nextCursor = id;
    try {
      const item = reconcileOne(id);
      if (item.inserted) result.inserted += 1;
      else if (item.reason === 'duplicate_existing') result.duplicates += 1;
      else result.alreadyRecorded += 1;
    } catch (error) {
      result.failed += 1;
      result.failures.push({ eventId: id, error: String(error.message || error).slice(0, 160) });
    }
  }
  return result;
}

function report(dataClass = 'production') {
  if (!available()) return { available: false, reason: 'migration_pending', complete: false,
    totalFacts: null, pendingEvents: null, duplicateEvents: null, historicallyConfirmed30d: null,
    currentlyConfirmed: null };
  const facts = db.prepare(`SELECT f.id,f.application_id AS applicationId,f.user_id AS userId,f.action,
    f.channel,f.created_at AS createdAt, a.id AS retainedApplicationId
    FROM application_submission_events f
    LEFT JOIN applications a ON a.id=f.application_id AND a.user_id=f.user_id
    ORDER BY f.id`).all();
  const factById = new Map(facts.map(fact => [fact.id, fact]));
  const links = new Map();
  const candidates = db.prepare(`SELECT id,user_id AS userId,event_name AS eventName,
    payload,data_class AS dataClass,is_test AS isTest FROM analytics_events
    WHERE source='server' AND event_name IN ('application_submission_confirmed','application_submission_revoked')
      AND json_valid(payload)`);
  for (const row of candidates.iterate()) {
    const payload = JSON.parse(row.payload);
    const fact = factById.get(payload.confirmationEventId);
    if (!fact || fact.userId !== row.userId || fact.applicationId !== payload.applicationId
      || fact.channel !== payload.channel || EVENT_NAMES[fact.action] !== row.eventName) continue;
    const list = links.get(fact.id) || [];
    list.push(row);
    links.set(fact.id, list);
  }
  let pendingEvents = 0;
  let duplicateEvents = 0;
  const matched = [];
  for (const fact of facts) {
    const rows = links.get(fact.id) || [];
    if (!rows.length) pendingEvents += 1;
    if (rows.length > 1) duplicateEvents += rows.length - 1;
    if (rows.length) matched.push({ ...fact, ...rows[0] });
  }
  // A duplicate analytics row is also a reconciliation discrepancy: although
  // facts are counted once below, conflicting data-class metadata must not be
  // presented as a complete production funnel.
  const complete = pendingEvents === 0 && duplicateEvents === 0;
  const scoped = dataClass === 'all' ? matched : matched.filter(item =>
    (item.dataClass || 'production') === dataClass && Number(item.isTest || 0) === (dataClass === 'test' ? 1 : 0));
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const confirmed30d = scoped.filter(item => item.action === 'confirmed' && Date.parse(item.createdAt) >= since);
  const latest = new Map();
  matched.forEach(item => latest.set(`${item.userId}:${item.applicationId}`, item));
  const current = [...latest.values()].filter(item => item.action === 'confirmed' && item.retainedApplicationId
    && (dataClass === 'all' || ((item.dataClass || 'production') === dataClass
      && Number(item.isTest || 0) === (dataClass === 'test' ? 1 : 0))));
  return {
    available: true, reason: null, complete, totalFacts: facts.length, pendingEvents, duplicateEvents,
    coverage: 'retained_confirmation_facts', dataClass,
    historicallyConfirmed30d: complete ? { applications: new Set(confirmed30d.map(item => item.applicationId)).size,
      users: new Set(confirmed30d.map(item => item.userId)).size, events: confirmed30d.length } : null,
    currentlyConfirmed: complete ? { applications: current.length,
      users: new Set(current.map(item => item.userId)).size } : null
  };
}

module.exports = { available, reconcileOne, reconcileBatch, report };

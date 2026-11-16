'use strict';

const db = require('../db/database');
const submission = require('./v4ApplicationSubmission');

const STATES = new Set(['needed', 'ready', 'not_applicable']);
const MAX_ITEMS = 30;

function problem(status, message) {
  return Object.assign(new Error(message), { status, isApplicationReadinessError: true });
}

function schemaAvailable() {
  const migrations = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  if (!migrations || !db.prepare("SELECT 1 FROM schema_migrations WHERE version='0025'").get()) return false;
  const checklist = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='application_material_checklist_items'").get();
  const selectionColumn = db.pragma('table_info(applications)').some(column => column.name === 'resume_selection_version');
  return Boolean(checklist && selectionColumn);
}

function activeApplication(userId, applicationId) {
  return db.prepare("SELECT * FROM applications WHERE id=? AND user_id=? AND COALESCE(archived_at,'')=''")
    .get(applicationId, userId);
}

function validId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function requireApplication(userId, applicationId) {
  if (!validId(applicationId)) throw problem(400, '申请记录 ID 无效');
  const row = activeApplication(userId, applicationId);
  if (!row) throw problem(404, '申请记录不存在或已归档');
  if (!schemaAvailable()) throw problem(503, '申请材料清单尚未完成迁移，请稍后重试');
  return row;
}

function selectionView(row) {
  const available = schemaAvailable();
  return {
    resumeSelectionVersion: available ? Number(row.resume_selection_version || 0) : 0,
    resumeSelectionAvailable: available && !row.archived_at
  };
}

function checklistView(userId, row) {
  if (!schemaAvailable()) return { available: false, unavailableReason: 'migration_pending', items: [] };
  const items = db.prepare(`SELECT id,label,state,version,created_at AS createdAt,updated_at AS updatedAt
    FROM application_material_checklist_items WHERE user_id=? AND application_id=? AND deleted_at IS NULL
    ORDER BY id ASC`).all(userId, row.id);
  const archived = Boolean(row.archived_at);
  return { available: !archived, unavailableReason: archived ? 'archived' : null, items };
}

function selectResume(userId, applicationId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !Object.prototype.hasOwnProperty.call(body, 'resumeVersionId')
    || !Number.isSafeInteger(body.expectedResumeSelectionVersion)
    || body.expectedResumeSelectionVersion < 0
    || (body.resumeVersionId !== null && !validId(body.resumeVersionId))) {
    throw problem(400, '请提供有效简历版本及当前选择版本');
  }
  return db.transaction(() => {
    const row = requireApplication(userId, applicationId);
    if (row.resume_selection_version !== body.expectedResumeSelectionVersion) {
      throw problem(409, '简历版本已在其他页面或设备更新，请刷新后重试');
    }
    if (submission.read(userId, applicationId).confirmed) {
      throw problem(409, '已确认提交的申请需先撤回确认，才能更换简历版本');
    }
    let resumeId = null;
    let versionId = '';
    if (body.resumeVersionId !== null) {
      const version = db.prepare(`SELECT v.id,v.resume_id FROM resume_versions_v4 v
        JOIN resumes r ON r.id=v.resume_id AND r.user_id=v.user_id
        WHERE v.id=? AND v.user_id=? AND COALESCE(r.archived_at,'')=''`).get(body.resumeVersionId, userId);
      if (!version) throw problem(404, '简历版本不存在或无权使用');
      resumeId = version.resume_id;
      versionId = String(version.id);
    }
    if (String(row.resume_version_id || '') === versionId && Number(row.resume_id || 0) === Number(resumeId || 0)) {
      return { changed: false, resumeVersionId: body.resumeVersionId, resumeSelectionVersion: row.resume_selection_version };
    }
    const result = db.prepare(`UPDATE applications SET resume_id=?,resume_version_id=?,
      resume_selection_version=resume_selection_version+1,updated_at=datetime('now')
      WHERE id=? AND user_id=? AND resume_selection_version=? AND COALESCE(archived_at,'')=''`)
      .run(resumeId, versionId, applicationId, userId, body.expectedResumeSelectionVersion);
    if (result.changes !== 1) throw problem(409, '简历版本已在其他页面或设备更新，请刷新后重试');
    return { changed: true, resumeVersionId: body.resumeVersionId,
      resumeSelectionVersion: body.expectedResumeSelectionVersion + 1 };
  }).immediate();
}

function cleanLabel(value) {
  if (typeof value !== 'string') throw problem(400, '请填写材料名称');
  const label = value.replace(/\s+/g, ' ').trim();
  if (!label || label.length > 120) throw problem(400, '材料名称需为 1 至 120 字');
  return label;
}

function stateOf(value, fallback = 'needed') {
  const state = value === undefined ? fallback : value;
  if (!STATES.has(state)) throw problem(400, '材料准备状态无效');
  return state;
}

function itemView(row) {
  return { id: row.id, label: row.label, state: row.state, version: row.version,
    createdAt: row.created_at, updatedAt: row.updated_at };
}

function itemById(userId, applicationId, itemId) {
  if (!validId(itemId)) throw problem(400, '材料项 ID 无效');
  const row = db.prepare(`SELECT * FROM application_material_checklist_items
    WHERE id=? AND user_id=? AND application_id=? AND deleted_at IS NULL`).get(itemId, userId, applicationId);
  if (!row) throw problem(404, '材料项不存在');
  return row;
}

function createItem(userId, applicationId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || typeof body.clientKey !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(body.clientKey)) {
    throw problem(400, '材料项请求标识无效');
  }
  const label = cleanLabel(body.label);
  const state = stateOf(body.state);
  return db.transaction(() => {
    requireApplication(userId, applicationId);
    const prior = db.prepare(`SELECT * FROM application_material_checklist_items
      WHERE user_id=? AND application_id=? AND client_key=?`).get(userId, applicationId, body.clientKey);
    if (prior) {
      if (prior.deleted_at || prior.version !== 1 || prior.label !== label || prior.state !== state) {
        throw problem(409, '该请求标识已用于其他材料项操作，请刷新后重试');
      }
      return { item: itemView(prior), changed: false };
    }
    const count = db.prepare(`SELECT COUNT(*) AS count FROM application_material_checklist_items
      WHERE user_id=? AND application_id=? AND deleted_at IS NULL`).get(userId, applicationId).count;
    if (count >= MAX_ITEMS) throw problem(409, '每条申请最多保留 30 项材料');
    const now = new Date().toISOString();
    const result = db.prepare(`INSERT INTO application_material_checklist_items
      (application_id,user_id,label,state,version,client_key,created_at,updated_at)
      VALUES (?,?,?,?,1,?,?,?)`).run(applicationId, userId, label, state, body.clientKey, now, now);
    const row = db.prepare('SELECT * FROM application_material_checklist_items WHERE id=?').get(Number(result.lastInsertRowid));
    return { item: itemView(row), changed: true };
  }).immediate();
}

function updateItem(userId, applicationId, itemId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1
    || (body.label === undefined && body.state === undefined)) {
    throw problem(400, '请提供材料项修改和当前版本');
  }
  const label = body.label === undefined ? undefined : cleanLabel(body.label);
  const state = body.state === undefined ? undefined : stateOf(body.state);
  return db.transaction(() => {
    requireApplication(userId, applicationId);
    const row = itemById(userId, applicationId, itemId);
    if (row.version !== body.expectedVersion) throw problem(409, '材料项已在其他设备更新，请刷新后重试');
    const nextLabel = label === undefined ? row.label : label;
    const nextState = state === undefined ? row.state : state;
    if (nextLabel === row.label && nextState === row.state) return { item: itemView(row), changed: false };
    const now = new Date().toISOString();
    const result = db.prepare(`UPDATE application_material_checklist_items SET label=?,state=?,version=version+1,updated_at=?
      WHERE id=? AND user_id=? AND application_id=? AND version=? AND deleted_at IS NULL`)
      .run(nextLabel, nextState, now, itemId, userId, applicationId, body.expectedVersion);
    if (result.changes !== 1) throw problem(409, '材料项已在其他设备更新，请刷新后重试');
    return { item: { id: row.id, label: nextLabel, state: nextState, version: row.version + 1,
      createdAt: row.created_at, updatedAt: now }, changed: true };
  }).immediate();
}

function deleteItem(userId, applicationId, itemId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) {
    throw problem(400, '请提供材料项当前版本');
  }
  return db.transaction(() => {
    requireApplication(userId, applicationId);
    const row = itemById(userId, applicationId, itemId);
    if (row.version !== body.expectedVersion) throw problem(409, '材料项已在其他设备更新，请刷新后重试');
    const now = new Date().toISOString();
    const result = db.prepare(`UPDATE application_material_checklist_items SET version=version+1,
      deleted_at=?,updated_at=? WHERE id=? AND user_id=? AND application_id=? AND version=? AND deleted_at IS NULL`)
      .run(now, now, itemId, userId, applicationId, body.expectedVersion);
    if (result.changes !== 1) throw problem(409, '材料项已在其他设备更新，请刷新后重试');
    return { id: itemId, deleted: true, changed: true };
  }).immediate();
}

module.exports = { schemaAvailable, selectionView, checklistView, selectResume,
  createItem, updateItem, deleteItem, MAX_ITEMS };

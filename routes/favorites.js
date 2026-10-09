const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { isFeatureEnabled } = require('../utils/featureFlags');

const FAVORITE_TYPES = new Set(['job', 'experience', 'company', 'agency', 'campus']);

function safeJson(value, fallback = {}) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

const MAX_CLIENT_CLOCK_SKEW_MS = 5 * 60 * 1000;

function normalizeTimestamp(value, nowMs = Date.now()) {
  const timestamp = new Date(String(value || '')).getTime();
  if (!Number.isFinite(timestamp) || timestamp > nowMs + MAX_CLIENT_CLOCK_SKEW_MS) {
    return new Date(nowMs).toISOString();
  }
  return new Date(timestamp).toISOString();
}

function timestampValue(value) {
  const text = String(value || '');
  const timestamp = new Date(text.includes('T') ? text : text.replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function format(f) {
  return {
    id: f.id, userId: f.user_id, type: f.type, targetId: f.target_id,
    title: f.title, subtitle: f.subtitle, status: f.status || 'active',
    deleted: f.status === 'deleted', payload: safeJson(f.payload, {}),
    clientUpdatedAt: f.client_updated_at || '',
    createdAt: f.created_at, updatedAt: f.updated_at || f.created_at
  };
}

function backfillLegacyFavorites(userId) {
  db.prepare(`INSERT OR IGNORE INTO favorite_sync_v4
    (user_id,type,target_id,status,title,subtitle,payload,client_updated_at,created_at,updated_at)
    SELECT user_id,type,target_id,'active',title,subtitle,'{}',created_at,created_at,created_at
    FROM favorites WHERE user_id=?`).run(userId);
}

function readSyncRow(userId, type, targetId) {
  return db.prepare('SELECT * FROM favorite_sync_v4 WHERE user_id=? AND type=? AND target_id=?')
    .get(userId, type, targetId);
}

function readFavoriteRows(userId, type, includeDeleted) {
  const params = [userId];
  let query = 'SELECT * FROM favorite_sync_v4 WHERE user_id=?';
  if (type) { query += ' AND type=?'; params.push(type); }
  if (!includeDeleted) query += " AND status='active'";
  const rows = db.prepare(query).all(...params).map(format);
  const legacyParams = [userId];
  let legacyQuery = `SELECT f.* FROM favorites f
    WHERE f.user_id=? AND NOT EXISTS (
      SELECT 1 FROM favorite_sync_v4 s
      WHERE s.user_id=f.user_id AND s.type=f.type AND s.target_id=f.target_id
    )`;
  if (type) { legacyQuery += ' AND f.type=?'; legacyParams.push(type); }
  db.prepare(legacyQuery).all(...legacyParams).forEach(row => rows.push({
    id: row.id, userId: row.user_id, type: row.type, targetId: row.target_id,
    title: row.title || '', subtitle: row.subtitle || '', status: 'active', deleted: false,
    payload: {}, clientUpdatedAt: row.created_at || '', createdAt: row.created_at, updatedAt: row.created_at
  }));
  rows.sort((left, right) => timestampValue(right.updatedAt) - timestampValue(left.updatedAt));
  return rows;
}

function validateFavoriteType(value) {
  const type = String(value || '').trim();
  if (!FAVORITE_TYPES.has(type)) {
    const error = new Error('收藏类型无效');
    error.statusCode = 400;
    throw error;
  }
  return type;
}

function applyFavoriteOperation(userId, body, action) {
  const type = validateFavoriteType(body.type);
  if (type === 'job' && !isFeatureEnabled('recruitment')) {
    const error = new Error('职位功能当前未开放');
    error.statusCode = 503;
    throw error;
  }
  const targetId = String(body.targetId === undefined || body.targetId === null ? '' : body.targetId).trim();
  if (!targetId || targetId.length > 200) {
    const error = new Error('参数不完整');
    error.statusCode = 400;
    throw error;
  }
  const operationId = String(body.operationId || '').trim().slice(0, 120);
  const incomingAt = normalizeTimestamp(body.updatedAt || body.clientUpdatedAt);
  const payloadText = JSON.stringify(body.payload && typeof body.payload === 'object' ? body.payload : {}).slice(0, 12000);

  return db.transaction(() => {
    backfillLegacyFavorites(userId);
    if (operationId) {
      const duplicate = db.prepare('SELECT type,target_id FROM favorite_operations_v4 WHERE user_id=? AND operation_id=?')
        .get(userId, operationId);
      if (duplicate) {
        if (duplicate.type !== type || duplicate.target_id !== targetId) {
          const error = new Error('operationId 已用于其他收藏操作');
          error.statusCode = 409;
          throw error;
        }
        return { row: readSyncRow(userId, type, targetId), duplicate: true, stale: false };
      }
    }
    const current = readSyncRow(userId, type, targetId);
    if (current && timestampValue(incomingAt) <= timestampValue(current.client_updated_at)) {
      if (operationId) {
        db.prepare(`INSERT OR IGNORE INTO favorite_operations_v4
          (user_id,operation_id,type,target_id,action) VALUES (?,?,?,?,?)`)
          .run(userId, operationId, type, targetId, action);
      }
      return { row: current, duplicate: false, stale: true };
    }

    if (action === 'upsert') {
      const legacy = db.prepare('SELECT id FROM favorites WHERE user_id=? AND type=? AND target_id=?')
        .get(userId, type, targetId);
      if (legacy) {
        db.prepare('UPDATE favorites SET title=?, subtitle=? WHERE id=?')
          .run(String(body.title || ''), String(body.subtitle || ''), legacy.id);
      } else {
        db.prepare('INSERT INTO favorites (user_id,type,target_id,title,subtitle) VALUES (?,?,?,?,?)')
          .run(userId, type, targetId, String(body.title || ''), String(body.subtitle || ''));
      }
    } else {
      db.prepare('DELETE FROM favorites WHERE user_id=? AND type=? AND target_id=?').run(userId, type, targetId);
    }

    db.prepare(`INSERT INTO favorite_sync_v4
      (user_id,type,target_id,status,title,subtitle,payload,client_updated_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(user_id,type,target_id) DO UPDATE SET
        status=excluded.status,title=excluded.title,subtitle=excluded.subtitle,payload=excluded.payload,
        client_updated_at=excluded.client_updated_at,updated_at=datetime('now')`)
      .run(userId, type, targetId, action === 'upsert' ? 'active' : 'deleted',
        String(body.title || ''), String(body.subtitle || ''), payloadText, incomingAt);
    if (operationId) {
      db.prepare(`INSERT OR IGNORE INTO favorite_operations_v4
        (user_id,operation_id,type,target_id,action) VALUES (?,?,?,?,?)`)
        .run(userId, operationId, type, targetId, action);
    }
    return { row: readSyncRow(userId, type, targetId), duplicate: false, stale: false };
  }).immediate();
}

router.get('/', authMiddleware, (req, res) => {
  try {
    const type = req.query.type ? validateFavoriteType(req.query.type) : '';
    res.set('Cache-Control', 'no-store');
    const rows = readFavoriteRows(req.user.userId, type, req.query.includeDeleted === '1')
      .filter(row => row.type !== 'job' || isFeatureEnabled('recruitment'));
    res.json({ code: 0, data: rows });
  } catch (error) {
    res.status(error.statusCode || 500).json({ code: -1, message: error.statusCode ? error.message : '读取收藏失败' });
  }
});

router.post('/', authMiddleware, (req, res) => {
  try {
    const result = applyFavoriteOperation(req.user.userId, req.body || {}, 'upsert');
    res.json({ code: 0, message: result.duplicate ? '操作已同步' : (result.stale ? '已保留较新状态' : '收藏成功'), data: format(result.row) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ code: -1, message: error.statusCode ? error.message : '收藏失败' });
  }
});

router.delete('/', authMiddleware, (req, res) => {
  try {
    const result = applyFavoriteOperation(req.user.userId, req.body || {}, 'delete');
    res.json({ code: 0, message: result.stale ? '已保留较新状态' : '取消收藏成功', data: format(result.row) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ code: -1, message: error.statusCode ? error.message : '取消收藏失败' });
  }
});

router.get('/check', authMiddleware, (req, res) => {
  try {
    const type = validateFavoriteType(req.query.type);
    if (type === 'job' && !isFeatureEnabled('recruitment')) {
      return res.status(503).json({ code: -1, message: '职位功能当前未开放' });
    }
    const targetId = String(req.query.targetId || '').trim();
    if (!targetId || targetId.length > 200) return res.status(400).json({ code: -1, message: '参数不完整' });
    const row = readSyncRow(req.user.userId, type, targetId);
    const legacy = row ? null : db.prepare('SELECT created_at FROM favorites WHERE user_id=? AND type=? AND target_id=?')
      .get(req.user.userId, type, targetId);
    res.set('Cache-Control', 'no-store');
    res.json({ code: 0, data: {
      isFavorited: row ? row.status === 'active' : !!legacy,
      updatedAt: row ? (row.updated_at || '') : (legacy && legacy.created_at || '')
    } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ code: -1, message: error.statusCode ? error.message : '读取收藏状态失败' });
  }
});

module.exports = router;
module.exports.applyFavoriteOperation = applyFavoriteOperation;
module.exports.readFavoriteRows = readFavoriteRows;
module.exports.normalizeTimestamp = normalizeTimestamp;
module.exports.MAX_CLIENT_CLOCK_SKEW_MS = MAX_CLIENT_CLOCK_SKEW_MS;

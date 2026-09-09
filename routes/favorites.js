const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

function safeJson(value, fallback = {}) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function normalizeTimestamp(value) {
  const timestamp = new Date(String(value || '')).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
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

function applyFavoriteOperation(userId, body, action) {
  const type = String(body.type || '').trim();
  const targetId = String(body.targetId === undefined || body.targetId === null ? '' : body.targetId).trim();
  if (!type || !targetId) {
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
  backfillLegacyFavorites(req.user.userId);
  const params = [req.user.userId];
  let query = 'SELECT * FROM favorite_sync_v4 WHERE user_id=?';
  if (req.query.type) { query += ' AND type=?'; params.push(String(req.query.type)); }
  if (req.query.includeDeleted !== '1') query += " AND status='active'";
  query += ' ORDER BY updated_at DESC, id DESC';
  res.json({ code: 0, data: db.prepare(query).all(...params).map(format) });
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
  backfillLegacyFavorites(req.user.userId);
  const row = readSyncRow(req.user.userId, String(req.query.type || ''), String(req.query.targetId || ''));
  res.json({ code: 0, data: { isFavorited: !!row && row.status === 'active', updatedAt: row && row.updated_at || '' } });
});

module.exports = router;
module.exports.applyFavoriteOperation = applyFavoriteOperation;

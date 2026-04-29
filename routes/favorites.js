const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

function format(f) {
  return { id: f.id, userId: f.user_id, type: f.type, targetId: f.target_id,
           title: f.title, subtitle: f.subtitle, createdAt: f.created_at };
}

// ─── 获取收藏列表 ─────────────────────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  const { type } = req.query;
  let query = 'SELECT * FROM favorites WHERE user_id = ?';
  const params = [req.user.userId];
  if (type) { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY created_at DESC';
  res.json({ code: 0, data: db.prepare(query).all(...params).map(format) });
});

// ─── 添加收藏 ─────────────────────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  const { type, targetId, title, subtitle } = req.body;
  if (!type || !targetId) return res.status(400).json({ code: -1, message: '参数不完整' });

  const exists = db.prepare('SELECT * FROM favorites WHERE user_id = ? AND type = ? AND target_id = ?')
                   .get(req.user.userId, type, String(targetId));
  if (exists) return res.json({ code: 0, message: '已收藏', data: format(exists) });

  const result = db.prepare(
    'INSERT INTO favorites (user_id, type, target_id, title, subtitle) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.userId, type, String(targetId), title || '', subtitle || '');

  const fav = db.prepare('SELECT * FROM favorites WHERE id = ?').get(result.lastInsertRowid);
  res.json({ code: 0, message: '收藏成功', data: format(fav) });
});

// ─── 取消收藏 ─────────────────────────────────────────────────────────────────
router.delete('/', authMiddleware, (req, res) => {
  const { type, targetId } = req.body;
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND type = ? AND target_id = ?')
    .run(req.user.userId, type, String(targetId));
  res.json({ code: 0, message: '取消收藏成功' });
});

// ─── 检查是否已收藏 ───────────────────────────────────────────────────────────
router.get('/check', authMiddleware, (req, res) => {
  const { type, targetId } = req.query;
  const exists = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND type = ? AND target_id = ?')
                   .get(req.user.userId, type, String(targetId));
  res.json({ code: 0, data: { isFavorited: !!exists } });
});

module.exports = router;

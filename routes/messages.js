const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { parseId } = require('../db/utils');

function format(m) {
  return { id: m.id, userId: m.user_id, type: m.type,
           title: m.title, content: m.content,
           isRead: !!m.is_read, createdAt: m.created_at };
}

// ─── 消息列表 ─────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  const { type } = req.query;
  let query = 'SELECT * FROM messages WHERE user_id = ?';
  const params = [req.user.userId];
  if (type) { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY created_at DESC';
  const list = db.prepare(query).all(...params).map(format);
  const unreadCount = list.filter(m => !m.isRead).length;
  res.json({ code: 0, data: { list, unreadCount } });
});

// ─── 标记单条已读 ─────────────────────────────────────────────────────────────
router.put('/:id/read', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const result = db.prepare('UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?')
                   .run(id, req.user.userId);
  if (result.changes === 0) return res.status(404).json({ code: -1, message: '消息不存在' });
  res.json({ code: 0, message: '已标记为已读' });
});

// ─── 全部已读 ─────────────────────────────────────────────────────────────────
router.put('/read-all', authMiddleware, (req, res) => {
  db.prepare('UPDATE messages SET is_read = 1 WHERE user_id = ?').run(req.user.userId);
  res.json({ code: 0, message: '全部已读' });
});

// ─── 未读数量 ─────────────────────────────────────────────────────────────────
router.get('/unread-count', authMiddleware, (req, res) => {
  const { c } = db.prepare('SELECT COUNT(*) as c FROM messages WHERE user_id = ? AND is_read = 0').get(req.user.userId);
  res.json({ code: 0, data: { count: c } });
});

module.exports = router;

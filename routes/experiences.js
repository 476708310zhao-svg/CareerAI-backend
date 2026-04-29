const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

const { parseId } = require('../db/utils');
const { formatExperience: format } = require('../db/formatters');
const { parsePage, pageResult } = require('../db/paginate');

// ─── 列表（支持搜索、公司、类型、分页）────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { keyword, company, type } = req.query;
    const { page, pageSize, offset } = parsePage(req.query);
    let where = '1=1';
    const params = [];

    if (keyword) {
      where += ' AND (title LIKE ? OR company LIKE ? OR position LIKE ? OR content LIKE ?)';
      const k = `%${keyword}%`;
      params.push(k, k, k, k);
    }
    if (company) { where += ' AND company LIKE ?'; params.push(`%${company}%`); }
    if (type)    { where += ' AND type = ?'; params.push(type); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM experiences WHERE ${where}`).get(...params).c;
    const rows  = db.prepare(`SELECT * FROM experiences WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
                    .all(...params, pageSize, offset);

    res.json({ code: 0, message: 'success', data: pageResult(rows.map(format), total, page, pageSize) });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 详情 ─────────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const e = db.prepare('SELECT * FROM experiences WHERE id = ?').get(id);
  if (!e) return res.status(404).json({ code: -1, message: '面经不存在' });
  res.json({ code: 0, message: 'success', data: format(e) });
});

// ─── 发布面经（需登录）────────────────────────────────────────────────────────
router.post('/', writeLimiter, authMiddleware, (req, res) => {
  try {
    const { company, position, type = '面试', round = '一面', title, content, tags = [], isAnonymous = false } = req.body;
    if (!company || !title || !content) return res.status(400).json({ code: -1, message: '公司、标题、内容不能为空' });

    const user = db.prepare('SELECT nickname, avatar FROM users WHERE id = ?').get(req.user.userId);
    const result = db.prepare(`
      INSERT INTO experiences (user_id, user_name, user_avatar, company, position, type, round, title, content, tags, is_anonymous)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.userId, isAnonymous ? '匿名用户' : (user ? user.nickname : '用户'),
      isAnonymous ? '' : (user ? user.avatar : ''),
      company, position || '', type, round, title, content,
      JSON.stringify(tags), isAnonymous ? 1 : 0);

    const e = db.prepare('SELECT * FROM experiences WHERE id = ?').get(result.lastInsertRowid);
    res.json({ code: 0, message: '发布成功', data: format(e) });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 点赞/取消点赞面经（需登录，幂等切换）──────────────────────────────────────
router.post('/:id/like', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });

  const e = db.prepare('SELECT id FROM experiences WHERE id = ?').get(id);
  if (!e) return res.status(404).json({ code: -1, message: '面经不存在' });

  const existing = db.prepare(
    'SELECT id FROM experience_likes WHERE experience_id = ? AND user_id = ?'
  ).get(id, req.user.userId);

  let isLiked;
  if (existing) {
    db.prepare('DELETE FROM experience_likes WHERE experience_id = ? AND user_id = ?')
      .run(id, req.user.userId);
    db.prepare('UPDATE experiences SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(id);
    isLiked = false;
  } else {
    db.prepare('INSERT INTO experience_likes (experience_id, user_id) VALUES (?, ?)')
      .run(id, req.user.userId);
    db.prepare('UPDATE experiences SET likes_count = likes_count + 1 WHERE id = ?').run(id);
    isLiked = true;
  }

  const { likes_count } = db.prepare('SELECT likes_count FROM experiences WHERE id = ?').get(id);
  res.json({ code: 0, data: { likesCount: likes_count, isLiked } });
});

// ─── 删除面经（仅本人）────────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });

  const e = db.prepare('SELECT * FROM experiences WHERE id = ? AND user_id = ?').get(id, req.user.userId);
  if (!e) return res.status(404).json({ code: -1, message: '面经不存在或无权限删除' });

  db.prepare('DELETE FROM experiences WHERE id = ?').run(id);
  res.json({ code: 0, message: '删除成功' });
});

module.exports = router;

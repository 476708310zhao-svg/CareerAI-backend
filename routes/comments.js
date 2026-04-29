const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const { parseId } = require('../db/utils');
const { formatComment } = require('../db/formatters');

// ─── 获取某篇面经的评论列表（可选登录，登录后返回 isLiked 状态）───────────────
router.get('/:experienceId', optionalAuth, (req, res) => {
  const expId = parseId(req.params.experienceId);
  if (!expId) return res.status(400).json({ code: -1, message: '参数无效' });

  const userId = req.user ? req.user.userId : null;

  const comments = db.prepare(
    'SELECT * FROM comments WHERE experience_id = ? ORDER BY created_at DESC'
  ).all(expId);

  // 批量查询当前用户已点赞的评论 id
  const likedSet = new Set();
  if (userId) {
    const likedIds = db.prepare(
      `SELECT comment_id FROM comment_likes WHERE user_id = ? AND comment_id IN (${comments.map(() => '?').join(',')})`
    ).all(userId, ...comments.map(c => c.id));
    likedIds.forEach(r => likedSet.add(r.comment_id));
  }

  const result = comments.map(c => {
    const replies = db.prepare(
      'SELECT * FROM comment_replies WHERE comment_id = ? ORDER BY created_at ASC'
    ).all(c.id);
    return {
      ...formatComment(c, replies),
      isLiked: likedSet.has(c.id)
    };
  });

  res.json({ code: 0, data: result, total: result.length });
});

// ─── 发表评论（需要登录）────────────────────────────────────────────────────
router.post('/', writeLimiter, authMiddleware, (req, res) => {
  const { experienceId, content } = req.body;
  if (!experienceId || !content || !content.trim()) {
    return res.status(400).json({ code: -1, message: '参数不完整' });
  }
  if (content.trim().length > 2000) {
    return res.status(400).json({ code: -1, message: '评论不能超过 2000 字' });
  }

  const expId = parseId(String(experienceId));
  if (!expId) return res.status(400).json({ code: -1, message: '参数无效' });

  const user = db.prepare('SELECT nickname, avatar FROM users WHERE id = ?').get(req.user.userId);
  const userName = user ? user.nickname : '匿名用户';
  const userAvatar = user ? user.avatar : '';

  const result = db.prepare(
    'INSERT INTO comments (experience_id, user_id, user_name, user_avatar, content) VALUES (?, ?, ?, ?, ?)'
  ).run(expId, req.user.userId, userName, userAvatar, content.trim());

  db.prepare('UPDATE experiences SET comments_count = comments_count + 1 WHERE id = ?').run(expId);

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(result.lastInsertRowid);
  res.json({
    code: 0,
    message: '评论成功',
    data: { ...formatComment(comment, []), isLiked: false }
  });
});

// ─── 回复评论（需要登录）────────────────────────────────────────────────────
router.post('/:commentId/reply', writeLimiter, authMiddleware, (req, res) => {
  const commentId = parseId(req.params.commentId);
  if (!commentId) return res.status(400).json({ code: -1, message: '参数无效' });

  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ code: -1, message: '回复内容不能为空' });

  const comment = db.prepare('SELECT id FROM comments WHERE id = ?').get(commentId);
  if (!comment) return res.status(404).json({ code: -1, message: '评论不存在' });

  const user = db.prepare('SELECT nickname FROM users WHERE id = ?').get(req.user.userId);
  const userName = user ? user.nickname : '匿名用户';

  const result = db.prepare(
    'INSERT INTO comment_replies (comment_id, user_id, user_name, content) VALUES (?, ?, ?, ?)'
  ).run(commentId, req.user.userId, userName, content.trim());

  const reply = db.prepare('SELECT * FROM comment_replies WHERE id = ?').get(result.lastInsertRowid);
  // 返回 camelCase，与前端解构一致
  res.json({
    code: 0,
    message: '回复成功',
    data: {
      id: reply.id,
      userName: reply.user_name,
      content: reply.content,
      createdAt: reply.created_at
    }
  });
});

// ─── 评论点赞/取消点赞（需要登录，幂等切换）────────────────────────────────────
router.post('/:commentId/like', authMiddleware, (req, res) => {
  const commentId = parseId(req.params.commentId);
  if (!commentId) return res.status(400).json({ code: -1, message: '参数无效' });

  const existing = db.prepare(
    'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?'
  ).get(commentId, req.user.userId);

  let isLiked;
  if (existing) {
    // 已点赞 → 取消
    db.prepare('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?')
      .run(commentId, req.user.userId);
    db.prepare('UPDATE comments SET likes_count = MAX(0, likes_count - 1) WHERE id = ?')
      .run(commentId);
    isLiked = false;
  } else {
    // 未点赞 → 添加
    db.prepare('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)')
      .run(commentId, req.user.userId);
    db.prepare('UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?')
      .run(commentId);
    isLiked = true;
  }

  const { likes_count } = db.prepare('SELECT likes_count FROM comments WHERE id = ?').get(commentId);
  res.json({ code: 0, data: { likesCount: likes_count, isLiked } });
});

// ─── 删除评论（仅本人）────────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });

  const c = db.prepare('SELECT * FROM comments WHERE id = ? AND user_id = ?').get(id, req.user.userId);
  if (!c) return res.status(404).json({ code: -1, message: '评论不存在或无权限删除' });

  db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  db.prepare('UPDATE experiences SET comments_count = MAX(0, comments_count - 1) WHERE id = ?').run(c.experience_id);
  res.json({ code: 0, message: '删除成功' });
});

module.exports = router;

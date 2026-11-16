const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { writeLimiter } = require('../middleware/rateLimit');
const { authMiddleware } = require('../middleware/auth');
const { parseJobFeedbackContext } = require('../utils/jobFeedbackContext');

const PUBLIC_STATUSES = new Set(['open', 'processing', 'resolved', 'ignored']);

function positiveInteger(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function publicTimestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  // SQLite datetime('now') is UTC but has no timezone suffix.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(iso)) return null;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

// GET /api/feedback/mine — only the token owner and public handling state.
router.get('/mine', authMiddleware, (req, res) => {
  const userId = req.user && req.user.userId;
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ code: -1, message: '请重新登录' });
  }
  const limit = req.query.limit === undefined ? 20 : positiveInteger(req.query.limit);
  const cursor = req.query.cursor === undefined ? null : positiveInteger(req.query.cursor);
  if (limit === null || (req.query.cursor !== undefined && cursor === null)) {
    return res.status(400).json({ code: -1, message: '分页参数无效' });
  }
  const pageSize = Math.min(limit, 50);
  try {
    const rows = cursor === null
      ? db.prepare(`SELECT id, type, content, status, created_at, updated_at
          FROM feedbacks WHERE user_id=? ORDER BY id DESC LIMIT ?`).all(userId, pageSize + 1)
      : db.prepare(`SELECT id, type, content, status, created_at, updated_at
          FROM feedbacks WHERE user_id=? AND id<? ORDER BY id DESC LIMIT ?`).all(userId, cursor, pageSize + 1);
    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    const items = page.map(row => {
      const parsed = parseJobFeedbackContext(row.type, row.content);
      return {
        id: row.id,
        type: row.type,
        content: row.content,
        status: PUBLIC_STATUSES.has(row.status) ? row.status : (row.status ? 'unknown' : 'open'),
        createdAt: publicTimestamp(row.created_at),
        updatedAt: publicTimestamp(row.updated_at),
        jobFeedback: parsed ? { reason: parsed.reason, jobId: parsed.jobId, source: parsed.source } : null
      };
    });
    return res.json({ code: 0, data: { items, nextCursor: hasMore ? page[page.length - 1].id : null } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// POST /api/feedback
router.post('/', authMiddleware, writeLimiter, (req, res) => {
  try {
    const { type, content, contact } = req.body;
    if (!content || content.trim().length < 10) return res.status(400).json({ code: -1, message: '反馈内容至少10个字' });
    if (content.trim().length > 500) return res.status(400).json({ code: -1, message: '反馈内容不超过500字' });

    db.prepare('INSERT INTO feedbacks (user_id, type, content, contact) VALUES (?, ?, ?, ?)')
      .run(req.user ? req.user.userId : null, type || '其他', content.trim(), (contact || '').trim());

    res.json({ code: 0, message: '感谢您的反馈' });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { writeLimiter } = require('../middleware/rateLimit');
const { authMiddleware } = require('../middleware/auth');

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

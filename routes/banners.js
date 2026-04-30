const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

// 公开接口：小程序首页拉取激活中的 Banner（按排序顺序）
router.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  const list = db.prepare('SELECT id, title, subtitle, icon, gradient, image_url, url FROM banners WHERE is_active=1 ORDER BY sort_order ASC, id DESC').all();
  res.json({ code: 0, data: list });
});

module.exports = router;

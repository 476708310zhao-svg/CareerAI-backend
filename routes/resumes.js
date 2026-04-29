/**
 * routes/resumes.js — 多份简历 CRUD
 *
 * 免费用户：最多 1 份
 * VIP 用户：最多 5 份
 *
 * GET    /api/resumes          列表（当前用户）
 * GET    /api/resumes/:id      单条
 * POST   /api/resumes          新建
 * PUT    /api/resumes/:id      更新
 * DELETE /api/resumes/:id      删除
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { parseId }        = require('../db/utils');

const MAX_FREE = 1;
const MAX_VIP  = 999; // VIP 无限份（实际上限 999）

// ── 列表 ─────────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, name, language, updated_at, created_at
      FROM resumes WHERE user_id = ? ORDER BY updated_at DESC
    `).all(req.user.userId);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

// ── 单条 ─────────────────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数错误' });
  try {
    const row = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(id, req.user.userId);
    if (!row) return res.status(404).json({ code: -1, message: '简历不存在' });
    res.json({
      code: 0,
      data: { ...row, data: row.data ? JSON.parse(row.data) : null }
    });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

// ── 新建 ─────────────────────────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const user   = db.prepare('SELECT vip_level FROM users WHERE id = ?').get(userId);
    const maxCount = (user && user.vip_level > 0) ? MAX_VIP : MAX_FREE;
    const count    = db.prepare('SELECT COUNT(*) as c FROM resumes WHERE user_id = ?').get(userId).c;

    if (count >= maxCount) {
      const msg = (user && user.vip_level > 0)
        ? `已达简历上限`
        : `免费用户最多保存 ${MAX_FREE} 份简历，升级VIP可无限创建`;
      return res.status(400).json({ code: -1, message: msg });
    }

    const { name = '新建简历', language = 'zh', data } = req.body;
    const result = db.prepare(`
      INSERT INTO resumes (user_id, name, language, data, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(userId, (name || '').trim() || '新建简历', language, data ? JSON.stringify(data) : '');

    res.json({ code: 0, data: { id: result.lastInsertRowid } });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

// ── 更新 ─────────────────────────────────────────────────────────────────────
router.put('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数错误' });
  try {
    const row = db.prepare('SELECT id FROM resumes WHERE id = ? AND user_id = ?').get(id, req.user.userId);
    if (!row) return res.status(404).json({ code: -1, message: '简历不存在' });

    const { name, language, data } = req.body;
    db.prepare(`
      UPDATE resumes SET
        name       = COALESCE(?, name),
        language   = COALESCE(?, language),
        data       = COALESCE(?, data),
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(
      name !== undefined ? (name.trim() || null) : null,
      language || null,
      data !== undefined ? JSON.stringify(data) : null,
      id, req.user.userId
    );
    res.json({ code: 0, message: '已保存' });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

// ── 删除 ─────────────────────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数错误' });
  try {
    const changes = db.prepare('DELETE FROM resumes WHERE id = ? AND user_id = ?')
      .run(id, req.user.userId).changes;
    if (!changes) return res.status(404).json({ code: -1, message: '简历不存在' });
    res.json({ code: 0, message: '已删除' });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

module.exports = router;

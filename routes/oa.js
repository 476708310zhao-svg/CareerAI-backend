'use strict';
// routes/oa.js — OA 题库管理
// GET    /api/oa                 列表（当前用户）
// POST   /api/oa                 新建题目记录
// PUT    /api/oa/:id             更新（含状态/截止时间/笔记）
// DELETE /api/oa/:id             删除

const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { parseId }        = require('../db/utils');

// ── 建表 ──────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS oa_questions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    company      TEXT NOT NULL,
    role         TEXT DEFAULT '',
    oa_type      TEXT DEFAULT 'coding',
    platform     TEXT DEFAULT '',
    difficulty   TEXT DEFAULT 'medium',
    status       TEXT DEFAULT 'pending',
    deadline     TEXT DEFAULT '',
    duration_min INTEGER DEFAULT 0,
    question_cnt INTEGER DEFAULT 0,
    topics       TEXT DEFAULT '[]',
    notes        TEXT DEFAULT '',
    source_url   TEXT DEFAULT '',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_oa_user   ON oa_questions(user_id);
  CREATE INDEX IF NOT EXISTS idx_oa_status ON oa_questions(status);
`);

// ── 列表 ─────────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  const { status, company, keyword, page = 1, pageSize = 30 } = req.query;
  const userId = req.user.userId;
  const pg   = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 30));

  const conditions = ['user_id = @userId'];
  const params     = { userId };

  if (status)  { conditions.push("status = @status");  params.status  = status; }
  if (company) { conditions.push("company LIKE '%' || @company || '%'"); params.company = company; }
  if (keyword) {
    conditions.push("(company LIKE '%'||@kw||'%' OR role LIKE '%'||@kw||'%' OR notes LIKE '%'||@kw||'%')");
    params.kw = keyword;
  }

  const where  = 'WHERE ' + conditions.join(' AND ');
  const offset = (pg - 1) * size;
  const total  = db.prepare(`SELECT COUNT(*) AS n FROM oa_questions ${where}`).get(params).n;
  const rows   = db.prepare(
    `SELECT * FROM oa_questions ${where} ORDER BY deadline ASC, created_at DESC LIMIT ${size} OFFSET ${offset}`
  ).all(params);

  const items = rows.map(r => ({ ...r, topics: _parseJson(r.topics, []) }));
  res.json({ code: 0, data: { total, page: pg, pageSize: size, items } });
});

// ── 统计 ─────────────────────────────────────────────────────────────────────
router.get('/stats', authMiddleware, (req, res) => {
  const uid = req.user.userId;
  const byStatus  = db.prepare(`SELECT status, COUNT(*) AS n FROM oa_questions WHERE user_id=? GROUP BY status`).all(uid);
  const byType    = db.prepare(`SELECT oa_type, COUNT(*) AS n FROM oa_questions WHERE user_id=? GROUP BY oa_type`).all(uid);
  const upcoming  = db.prepare(
    `SELECT id, company, role, deadline, status FROM oa_questions
     WHERE user_id=? AND deadline!='' AND deadline >= date('now') AND status!='done'
     ORDER BY deadline ASC LIMIT 5`
  ).all(uid);
  res.json({ code: 0, data: { byStatus, byType, upcoming } });
});

// ── 单条 ─────────────────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数错误' });
  const row = db.prepare('SELECT * FROM oa_questions WHERE id=? AND user_id=?').get(id, req.user.userId);
  if (!row) return res.status(404).json({ code: -1, message: '记录不存在' });
  res.json({ code: 0, data: { ...row, topics: _parseJson(row.topics, []) } });
});

// ── 新建 ─────────────────────────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  const userId = req.user.userId;
  const {
    company, role = '', oa_type = 'coding', platform = '',
    difficulty = 'medium', status = 'pending',
    deadline = '', duration_min = 0, question_cnt = 0,
    topics = [], notes = '', source_url = '',
  } = req.body;

  if (!company || !company.trim()) return res.status(400).json({ code: -1, message: '公司名不能为空' });

  const r = db.prepare(`
    INSERT INTO oa_questions
      (user_id, company, role, oa_type, platform, difficulty, status,
       deadline, duration_min, question_cnt, topics, notes, source_url, updated_at)
    VALUES
      (@userId, @company, @role, @oa_type, @platform, @difficulty, @status,
       @deadline, @duration_min, @question_cnt, @topics, @notes, @source_url, datetime('now'))
  `).run({
    userId,
    company: company.trim(),
    role:         (role || '').trim(),
    oa_type,
    platform:     (platform || '').trim(),
    difficulty,
    status,
    deadline:     (deadline || '').slice(0, 10),
    duration_min: parseInt(duration_min) || 0,
    question_cnt: parseInt(question_cnt) || 0,
    topics:       JSON.stringify(Array.isArray(topics) ? topics : []),
    notes:        (notes || '').slice(0, 2000),
    source_url:   (source_url || '').slice(0, 500),
  });

  res.json({ code: 0, data: { id: r.lastInsertRowid } });
});

// ── 更新 ─────────────────────────────────────────────────────────────────────
router.put('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数错误' });
  const row = db.prepare('SELECT id FROM oa_questions WHERE id=? AND user_id=?').get(id, req.user.userId);
  if (!row) return res.status(404).json({ code: -1, message: '记录不存在' });

  const {
    company, role, oa_type, platform, difficulty, status,
    deadline, duration_min, question_cnt, topics, notes, source_url,
  } = req.body;

  const fields = [];
  const params = { id };

  if (company     !== undefined) { fields.push('company = @company');           params.company     = company.trim(); }
  if (role        !== undefined) { fields.push('role = @role');                 params.role        = role; }
  if (oa_type     !== undefined) { fields.push('oa_type = @oa_type');           params.oa_type     = oa_type; }
  if (platform    !== undefined) { fields.push('platform = @platform');         params.platform    = platform; }
  if (difficulty  !== undefined) { fields.push('difficulty = @difficulty');     params.difficulty  = difficulty; }
  if (status      !== undefined) { fields.push('status = @status');             params.status      = status; }
  if (deadline    !== undefined) { fields.push('deadline = @deadline');         params.deadline    = (deadline || '').slice(0, 10); }
  if (duration_min!== undefined) { fields.push('duration_min = @duration_min');params.duration_min= parseInt(duration_min) || 0; }
  if (question_cnt!== undefined) { fields.push('question_cnt = @question_cnt');params.question_cnt= parseInt(question_cnt) || 0; }
  if (topics      !== undefined) { fields.push('topics = @topics');             params.topics      = JSON.stringify(Array.isArray(topics) ? topics : []); }
  if (notes       !== undefined) { fields.push('notes = @notes');               params.notes       = (notes || '').slice(0, 2000); }
  if (source_url  !== undefined) { fields.push('source_url = @source_url');     params.source_url  = (source_url || '').slice(0, 500); }

  if (!fields.length) return res.status(400).json({ code: -1, message: '无更新字段' });

  fields.push("updated_at = datetime('now')");
  db.prepare(`UPDATE oa_questions SET ${fields.join(', ')} WHERE id = @id`).run(params);
  res.json({ code: 0, message: '已更新' });
});

// ── 删除 ─────────────────────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数错误' });
  const changes = db.prepare('DELETE FROM oa_questions WHERE id=? AND user_id=?')
    .run(id, req.user.userId).changes;
  if (!changes) return res.status(404).json({ code: -1, message: '记录不存在' });
  res.json({ code: 0, message: '已删除' });
});

function _parseJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;

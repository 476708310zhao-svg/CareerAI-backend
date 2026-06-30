const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

function safeJsonParse(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  try { return JSON.parse(value); } catch (e) { return fallback; }
}

function jsonString(value, fallback) {
  if (value === undefined) return JSON.stringify(fallback);
  return JSON.stringify(value || fallback);
}

function stringValue(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function makeClientId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function materialRow(row) {
  return {
    id: String(row.id),
    clientId: row.client_id || '',
    questionType: row.question_type || '',
    questionLabel: row.question_label || '',
    jobId: row.job_id || '',
    company: row.company || '',
    jobTitle: row.job_title || '',
    content: row.content || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function reportRow(row) {
  return {
    id: String(row.id),
    clientId: row.client_id || '',
    jobId: row.job_id || '',
    jobTitle: row.job_title || '',
    company: row.company || '',
    resumeName: row.resume_name || '',
    score: row.score || 0,
    matchedKeywords: safeJsonParse(row.matched_keywords, []),
    missingKeywords: safeJsonParse(row.missing_keywords, []),
    projectSuggestion: row.project_suggestion || '',
    atsRisk: row.ats_risk || '',
    suggestions: safeJsonParse(row.suggestions, []),
    createdAt: row.created_at
  };
}

function notebookRow(row) {
  return {
    id: row.question_id,
    serverId: String(row.id),
    title: row.title || '',
    answer: row.answer || '',
    category: row.category || '',
    difficulty: row.difficulty || '',
    status: row.status || 'unknown',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function dailyRow(row) {
  const payload = safeJsonParse(row.payload, {});
  return Object.assign({}, payload, {
    id: row.question_id,
    serverId: String(row.id),
    addedAt: row.added_at
  });
}

function findOwnedRow(table, userId, id) {
  return db.prepare(`SELECT * FROM ${table} WHERE user_id=? AND (id=? OR client_id=?)`)
    .get(userId, Number(id) || -1, String(id));
}

router.get('/application-materials', authMiddleware, (req, res) => {
  const { questionType, jobId } = req.query;
  const where = ['user_id = ?'];
  const params = [req.user.userId];
  if (questionType) { where.push('question_type = ?'); params.push(String(questionType)); }
  if (jobId) { where.push('job_id = ?'); params.push(String(jobId)); }
  const rows = db.prepare(`
    SELECT * FROM application_materials
    WHERE ${where.join(' AND ')}
    ORDER BY updated_at DESC, id DESC
  `).all(...params);
  res.json({ code: 0, data: rows.map(materialRow) });
});

router.post('/application-materials', authMiddleware, (req, res) => {
  const body = req.body || {};
  const content = stringValue(body.content).trim();
  if (!content) return res.status(400).json({ code: -1, message: '请填写材料内容' });

  const clientId = stringValue(body.id || body.clientId) || makeClientId('material');
  if (clientId) {
    const existing = db.prepare('SELECT id FROM application_materials WHERE user_id=? AND client_id=?')
      .get(req.user.userId, clientId);
    if (existing) {
      db.prepare(`
        UPDATE application_materials SET
          question_type=@questionType,
          question_label=@questionLabel,
          job_id=@jobId,
          company=@company,
          job_title=@jobTitle,
          content=@content,
          updated_at=datetime('now')
        WHERE id=@id AND user_id=@userId
      `).run({
        id: existing.id,
        userId: req.user.userId,
        questionType: stringValue(body.questionType),
        questionLabel: stringValue(body.questionLabel),
        jobId: stringValue(body.jobId),
        company: stringValue(body.company),
        jobTitle: stringValue(body.jobTitle),
        content
      });
      const row = db.prepare('SELECT * FROM application_materials WHERE id=?').get(existing.id);
      return res.json({ code: 0, data: materialRow(row), message: '已保存' });
    }
  }

  const result = db.prepare(`
    INSERT INTO application_materials
      (user_id, client_id, question_type, question_label, job_id, company, job_title, content, updated_at)
    VALUES
      (@userId, @clientId, @questionType, @questionLabel, @jobId, @company, @jobTitle, @content, datetime('now'))
  `).run({
    userId: req.user.userId,
    clientId,
    questionType: stringValue(body.questionType),
    questionLabel: stringValue(body.questionLabel),
    jobId: stringValue(body.jobId),
    company: stringValue(body.company),
    jobTitle: stringValue(body.jobTitle),
    content
  });
  const row = db.prepare('SELECT * FROM application_materials WHERE id=?').get(result.lastInsertRowid);
  res.json({ code: 0, data: materialRow(row), message: '已保存' });
});

router.put('/application-materials/:id', authMiddleware, (req, res) => {
  const id = req.params.id;
  const row = findOwnedRow('application_materials', req.user.userId, id);
  if (!row) return res.status(404).json({ code: -1, message: '材料不存在' });
  const body = req.body || {};
  const content = body.content !== undefined ? stringValue(body.content).trim() : row.content;
  if (!content) return res.status(400).json({ code: -1, message: '请填写材料内容' });
  db.prepare(`
    UPDATE application_materials SET
      question_type=@questionType,
      question_label=@questionLabel,
      job_id=@jobId,
      company=@company,
      job_title=@jobTitle,
      content=@content,
      updated_at=datetime('now')
    WHERE id=@id AND user_id=@userId
  `).run({
    id: row.id,
    userId: req.user.userId,
    questionType: body.questionType !== undefined ? stringValue(body.questionType) : row.question_type,
    questionLabel: body.questionLabel !== undefined ? stringValue(body.questionLabel) : row.question_label,
    jobId: body.jobId !== undefined ? stringValue(body.jobId) : row.job_id,
    company: body.company !== undefined ? stringValue(body.company) : row.company,
    jobTitle: body.jobTitle !== undefined ? stringValue(body.jobTitle) : row.job_title,
    content
  });
  const next = db.prepare('SELECT * FROM application_materials WHERE id=?').get(row.id);
  res.json({ code: 0, data: materialRow(next), message: '已更新' });
});

router.delete('/application-materials/:id', authMiddleware, (req, res) => {
  const row = findOwnedRow('application_materials', req.user.userId, req.params.id);
  if (!row) return res.status(404).json({ code: -1, message: '材料不存在' });
  db.prepare('DELETE FROM application_materials WHERE id=? AND user_id=?').run(row.id, req.user.userId);
  res.json({ code: 0, message: '已删除' });
});

router.get('/jd-match-reports', authMiddleware, (req, res) => {
  const { jobId, resumeName } = req.query;
  const where = ['user_id = ?'];
  const params = [req.user.userId];
  if (jobId) { where.push('job_id = ?'); params.push(String(jobId)); }
  if (resumeName) { where.push('resume_name = ?'); params.push(String(resumeName)); }
  const rows = db.prepare(`
    SELECT * FROM jd_match_reports
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC, id DESC
  `).all(...params);
  res.json({ code: 0, data: rows.map(reportRow) });
});

router.get('/jd-match-reports/:id', authMiddleware, (req, res) => {
  const row = findOwnedRow('jd_match_reports', req.user.userId, req.params.id);
  if (!row) return res.status(404).json({ code: -1, message: '报告不存在' });
  res.json({ code: 0, data: reportRow(row) });
});

router.post('/jd-match-reports', authMiddleware, (req, res) => {
  const body = req.body || {};
  const clientId = stringValue(body.id || body.clientId) || makeClientId('match');
  const result = db.prepare(`
    INSERT INTO jd_match_reports
      (user_id, client_id, job_id, job_title, company, resume_name, score, matched_keywords,
       missing_keywords, project_suggestion, ats_risk, suggestions)
    VALUES
      (@userId, @clientId, @jobId, @jobTitle, @company, @resumeName, @score, @matchedKeywords,
       @missingKeywords, @projectSuggestion, @atsRisk, @suggestions)
    ON CONFLICT(user_id, client_id) DO UPDATE SET
      job_id=excluded.job_id,
      job_title=excluded.job_title,
      company=excluded.company,
      resume_name=excluded.resume_name,
      score=excluded.score,
      matched_keywords=excluded.matched_keywords,
      missing_keywords=excluded.missing_keywords,
      project_suggestion=excluded.project_suggestion,
      ats_risk=excluded.ats_risk,
      suggestions=excluded.suggestions
  `).run({
    userId: req.user.userId,
    clientId,
    jobId: stringValue(body.jobId),
    jobTitle: stringValue(body.jobTitle),
    company: stringValue(body.company),
    resumeName: stringValue(body.resumeName),
    score: Number(body.score) || 0,
    matchedKeywords: jsonString(body.matchedKeywords, []),
    missingKeywords: jsonString(body.missingKeywords, []),
    projectSuggestion: stringValue(body.projectSuggestion),
    atsRisk: stringValue(body.atsRisk),
    suggestions: jsonString(body.suggestions, [])
  });
  const row = clientId
    ? db.prepare('SELECT * FROM jd_match_reports WHERE user_id=? AND client_id=?').get(req.user.userId, clientId)
    : db.prepare('SELECT * FROM jd_match_reports WHERE id=?').get(result.lastInsertRowid);
  res.json({ code: 0, data: reportRow(row), message: '已保存' });
});

router.get('/interview-notebook', authMiddleware, (req, res) => {
  const { status, category } = req.query;
  const where = ['user_id = ?'];
  const params = [req.user.userId];
  if (status) { where.push('status = ?'); params.push(String(status)); }
  if (category) { where.push('category = ?'); params.push(String(category)); }
  const rows = db.prepare(`
    SELECT * FROM interview_notebook
    WHERE ${where.join(' AND ')}
    ORDER BY updated_at DESC, id DESC
  `).all(...params);
  res.json({ code: 0, data: rows.map(notebookRow) });
});

router.post('/interview-notebook', authMiddleware, (req, res) => {
  const body = req.body || {};
  const questionId = stringValue(body.id || body.questionId || body.qid).trim();
  const title = stringValue(body.title || body.question).trim();
  if (!questionId || !title) return res.status(400).json({ code: -1, message: '题目信息不完整' });
  db.prepare(`
    INSERT INTO interview_notebook
      (user_id, question_id, title, answer, category, difficulty, status, updated_at)
    VALUES
      (@userId, @questionId, @title, @answer, @category, @difficulty, @status, datetime('now'))
    ON CONFLICT(user_id, question_id) DO UPDATE SET
      title=excluded.title,
      answer=excluded.answer,
      category=excluded.category,
      difficulty=excluded.difficulty,
      status=excluded.status,
      updated_at=datetime('now')
  `).run({
    userId: req.user.userId,
    questionId,
    title,
    answer: stringValue(body.answer),
    category: stringValue(body.category, 'behavior'),
    difficulty: stringValue(body.difficulty, '中等'),
    status: stringValue(body.status, 'unknown')
  });
  const row = db.prepare('SELECT * FROM interview_notebook WHERE user_id=? AND question_id=?')
    .get(req.user.userId, questionId);
  res.json({ code: 0, data: notebookRow(row), message: '已保存' });
});

router.put('/interview-notebook/:id/status', authMiddleware, (req, res) => {
  const status = stringValue(req.body && req.body.status, 'unknown');
  if (!['unknown', 'mastered', 'saved'].includes(status)) {
    return res.status(400).json({ code: -1, message: '状态无效' });
  }
  const result = db.prepare(`
    UPDATE interview_notebook
    SET status=?, updated_at=datetime('now')
    WHERE user_id=? AND question_id=?
  `).run(status, req.user.userId, String(req.params.id));
  if (!result.changes) return res.status(404).json({ code: -1, message: '题目不存在' });
  const row = db.prepare('SELECT * FROM interview_notebook WHERE user_id=? AND question_id=?')
    .get(req.user.userId, String(req.params.id));
  res.json({ code: 0, data: notebookRow(row), message: '已更新' });
});

router.delete('/interview-notebook/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM interview_daily_practice WHERE user_id=? AND question_id=?')
    .run(req.user.userId, String(req.params.id));
  const result = db.prepare('DELETE FROM interview_notebook WHERE user_id=? AND question_id=?')
    .run(req.user.userId, String(req.params.id));
  if (!result.changes) return res.status(404).json({ code: -1, message: '题目不存在' });
  res.json({ code: 0, message: '已删除' });
});

router.get('/interview-daily-practice', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM interview_daily_practice
    WHERE user_id=?
    ORDER BY added_at DESC, id DESC
  `).all(req.user.userId);
  res.json({ code: 0, data: rows.map(dailyRow) });
});

router.post('/interview-daily-practice', authMiddleware, (req, res) => {
  const body = req.body || {};
  const questionId = stringValue(body.id || body.questionId || body.qid).trim();
  const title = stringValue(body.title || body.question).trim();
  if (!questionId || !title) return res.status(400).json({ code: -1, message: '题目信息不完整' });
  const payload = {
    id: questionId,
    title,
    answer: stringValue(body.answer),
    category: stringValue(body.category, 'behavior'),
    difficulty: stringValue(body.difficulty, '中等')
  };
  db.prepare(`
    INSERT INTO interview_daily_practice (user_id, question_id, payload)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, question_id) DO UPDATE SET
      payload=excluded.payload,
      added_at=datetime('now')
  `).run(req.user.userId, questionId, JSON.stringify(payload));
  const row = db.prepare('SELECT * FROM interview_daily_practice WHERE user_id=? AND question_id=?')
    .get(req.user.userId, questionId);
  res.json({ code: 0, data: dailyRow(row), message: '已加入每日练习' });
});

router.delete('/interview-daily-practice/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM interview_daily_practice WHERE user_id=? AND question_id=?')
    .run(req.user.userId, String(req.params.id));
  res.json({ code: 0, message: '已移出每日练习' });
});

module.exports = router;

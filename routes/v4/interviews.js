const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const interview = require('../../services/v4Interview');
const analytics = require('../../services/v4Analytics');
const todayTasks = require('../../services/v4TodayTasks');
const router = express.Router();
router.use(authMiddleware);

function error(res, err) { return res.status(err.status || 500).json({ code: err.code || -1, message: err.message, data: err.data }); }

router.get('/spaces', (req, res) => {
  const applications = db.prepare("SELECT id FROM applications WHERE user_id=? AND progress_status IN ('first_interview','second_interview','hr_interview')").all(req.user.userId);
  applications.forEach(item => interview.ensureSpace(req.user.userId, item.id));
  const rows = db.prepare('SELECT * FROM interview_spaces_v4 WHERE user_id=? ORDER BY interview_time, updated_at DESC').all(req.user.userId);
  res.json({ code: 0, data: rows.map(interview.spaceView) });
});
router.get('/spaces/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM interview_spaces_v4 WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.userId);
  if (!row) return res.status(404).json({ code: -1, message: '面试空间不存在' });
  const sessions = db.prepare('SELECT id, session_type AS sessionType, status, started_at AS startedAt, completed_at AS completedAt FROM interview_sessions_v4 WHERE space_id=? AND user_id=? ORDER BY id DESC').all(row.id, req.user.userId);
  res.json({ code: 0, data: { space: interview.spaceView(row), sessions } });
});
router.patch('/spaces/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM interview_spaces_v4 WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.userId);
  if (!row) return res.status(404).json({ code: -1, message: '面试空间不存在' });
  const completion = Math.max(0, Math.min(100, Number(req.body.preparationCompletion === undefined ? row.preparation_completion : req.body.preparationCompletion)));
  db.prepare("UPDATE interview_spaces_v4 SET interview_time=?, round=?, preparation_completion=?, updated_at=datetime('now') WHERE id=?")
    .run(String(req.body.interviewTime === undefined ? row.interview_time : req.body.interviewTime).slice(0, 80), String(req.body.round || row.round).slice(0, 40), completion, row.id);
  res.json({ code: 0, data: interview.spaceView(db.prepare('SELECT * FROM interview_spaces_v4 WHERE id=?').get(row.id)) });
});
router.post('/spaces/:id/sessions', (req, res) => { try {
  const data = interview.startSession(req.user.userId, Number(req.params.id), req.body && req.body.sessionType);
  analytics.track(req.user.userId, 'interview_training_started', { spaceId: data.space_id, sessionId: data.id, type: data.session_type }, '/api/v4/interviews/spaces/:id/sessions');
  res.status(201).json({ code: 0, data: { id: data.id, spaceId: data.space_id, sessionType: data.session_type, status: data.status, aiModel: data.ai_model, promptVersion: data.prompt_version } });
} catch (err) { error(res, err); } });
router.post('/sessions/:id/answers', async (req, res) => { try {
  const session = db.prepare(`SELECT s.*, p.job_title FROM interview_sessions_v4 s JOIN interview_spaces_v4 p ON p.id=s.space_id WHERE s.id=? AND s.user_id=? AND s.status='active'`).get(Number(req.params.id), req.user.userId);
  if (!session) return res.status(404).json({ code: -1, message: '训练会话不存在或已结束' });
  const question = String(req.body.question || '').trim().slice(0, 1000); const answer = String(req.body.answer || '').trim().slice(0, 12000);
  if (!question || !answer) return res.status(400).json({ code: -1, message: '问题和回答不能为空' });
  const score = await interview.scoreAnswer(answer, question, session.job_title);
  const result = db.prepare(`INSERT INTO interview_answers_v4
    (session_id,user_id,question_type,question,answer,feedback,content_score,structure_score,expression_score,job_match_score)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(session.id, req.user.userId, String(req.body.questionType || 'role').slice(0, 30), question, answer, score.feedback, score.content, score.structure, score.expression, score.jobMatch);
  db.prepare('UPDATE interview_sessions_v4 SET ai_model=? WHERE id=?').run(score.generation.model, session.id);
  res.status(201).json({ code: 0, data: { id: result.lastInsertRowid, ...score } });
} catch (err) { error(res, err); }
});
router.post('/sessions/:id/complete', (req, res) => { try {
  const report = interview.reportView(interview.completeSession(req.user.userId, Number(req.params.id)));
  analytics.track(req.user.userId, 'interview_training_completed', { sessionId: report.sessionId, score: report.overallScore }, '/api/v4/interviews/sessions/:id/complete');
  res.status(201).json({ code: 0, data: report });
} catch (err) { error(res, err); } });
router.post('/sessions/:id/cancel', (req, res) => {
  const result = db.prepare("UPDATE interview_sessions_v4 SET status='cancelled', cancelled_at=datetime('now') WHERE id=? AND user_id=? AND status='active'").run(Number(req.params.id), req.user.userId);
  if (!result.changes) return res.status(409).json({ code: -1, message: '会话不存在或已结束' });
  res.json({ code: 0, message: '训练已取消' });
});
router.get('/reports', (req, res) => {
  const rows = db.prepare('SELECT * FROM interview_reports_v4 WHERE user_id=? ORDER BY created_at DESC,id DESC').all(req.user.userId);
  res.json({ code: 0, data: rows.map(interview.reportView) });
});
router.get('/trends', (req, res) => {
  const rows = db.prepare('SELECT overall_score, dimensions, created_at FROM interview_reports_v4 WHERE user_id=? ORDER BY created_at,id').all(req.user.userId);
  res.json({ code: 0, data: rows.map(row => ({ date: row.created_at, overallScore: row.overall_score, dimensions: JSON.parse(row.dimensions || '{}') })) });
});
router.get('/today-tasks', (req, res) => {
  res.json({ code: 0, data: todayTasks.list(req.user.userId) });
});
router.patch('/today-tasks/:id', (req, res) => {
  const done = req.body && req.body.completed === true;
  const data = todayTasks.updateStatus(req.user.userId, req.params.id, done);
  if (!data) return res.status(404).json({ code: -1, message: '任务不存在' });
  if (done) analytics.track(req.user.userId, 'today_task_completed', { taskId: Number(req.params.id) }, '/api/v4/interviews/today-tasks/:id');
  res.json({ code: 0, data, message: '任务已更新' });
});

module.exports = router;

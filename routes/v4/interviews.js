const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const interview = require('../../services/v4Interview');
const analytics = require('../../services/v4Analytics');
const todayTasks = require('../../services/v4TodayTasks');
const { withCoreRefs } = require('../../utils/coreEntityRefs');
const router = express.Router();
router.use((req, res, next) => { if (req.method === 'GET') res.set('Cache-Control', 'no-store'); next(); });
router.use(authMiddleware);

function positiveId(value) { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; }
function error(res, err) {
  const status = err.status || 500;
  return res.status(status).json({ code: err.code || -1, message: status >= 500 ? '面试服务暂时不可用' : (err.message || '请求失败'), data: status < 500 ? err.data : undefined });
}

router.get('/spaces', (req, res) => {
  const rows = db.prepare('SELECT * FROM interview_spaces_v4 WHERE user_id=? ORDER BY interview_time, updated_at DESC').all(req.user.userId);
  res.json({ code: 0, data: rows.map(interview.spaceView) });
});
router.post('/spaces', (req, res) => { try {
  const applicationId = positiveId(req.body && req.body.applicationId);
  if (!applicationId) return res.status(400).json({ code:-1, message:'申请记录 ID 无效' });
  const application = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(applicationId, req.user.userId);
  if (!application) return res.status(404).json({ code:-1, message:'申请记录不存在' });
  const stage = String(application.v4_status || application.progress_status || application.status || '');
  const allowed = new Set(['phone_screen','interview_1','interview_2','final','first_interview','second_interview','hr_interview']);
  if (!allowed.has(stage)) return res.status(409).json({ code:'INTERVIEW_STAGE_REQUIRED', message:'申请记录尚未进入面试阶段' });
  const existing = db.prepare('SELECT id FROM interview_spaces_v4 WHERE user_id=? AND application_id=?').get(req.user.userId, applicationId);
  const row = interview.ensureSpace(req.user.userId, applicationId);
  res.status(existing ? 200 : 201).json({ code:0, data:interview.spaceView(row), idempotent:!!existing });
} catch (err) { error(res, err); } });
router.get('/spaces/:id', (req, res) => {
  const spaceId = positiveId(req.params.id);
  if (!spaceId) return res.status(400).json({ code:-1, message:'面试空间 ID 无效' });
  const row = db.prepare('SELECT * FROM interview_spaces_v4 WHERE id=? AND user_id=?').get(spaceId, req.user.userId);
  if (!row) return res.status(404).json({ code: -1, message: '面试空间不存在' });
  const sessions = db.prepare('SELECT * FROM interview_sessions_v4 WHERE space_id=? AND user_id=? ORDER BY id DESC').all(row.id, req.user.userId);
  res.json({ code: 0, data: { space: interview.spaceView(row), sessions: sessions.map(interview.sessionView) } });
});
router.patch('/spaces/:id', (req, res) => {
  const spaceId = positiveId(req.params.id);
  if (!spaceId) return res.status(400).json({ code:-1, message:'面试空间 ID 无效' });
  const row = db.prepare('SELECT * FROM interview_spaces_v4 WHERE id=? AND user_id=?').get(spaceId, req.user.userId);
  if (!row) return res.status(404).json({ code: -1, message: '面试空间不存在' });
  const requestedCompletion = Number(req.body.preparationCompletion === undefined ? row.preparation_completion : req.body.preparationCompletion);
  if (!Number.isFinite(requestedCompletion)) return res.status(400).json({ code:-1, message:'准备进度无效' });
  const completion = Math.max(0, Math.min(100, requestedCompletion));
  db.prepare("UPDATE interview_spaces_v4 SET interview_time=?, round=?, preparation_completion=?, updated_at=datetime('now') WHERE id=?")
    .run(String(req.body.interviewTime === undefined ? row.interview_time : req.body.interviewTime).slice(0, 80), String(req.body.round || row.round).slice(0, 40), completion, row.id);
  res.json({ code: 0, data: interview.spaceView(db.prepare('SELECT * FROM interview_spaces_v4 WHERE id=?').get(row.id)) });
});
router.post('/spaces/:id/sessions', (req, res) => { try {
  const spaceId = positiveId(req.params.id);
  if (!spaceId) return res.status(400).json({ code:-1, message:'面试空间 ID 无效' });
  const started = interview.startSession(req.user.userId, spaceId, req.body && req.body.sessionType);
  const session = interview.sessionView(started.session);
  if (started.created) analytics.track(req.user.userId, 'interview_training_started', withCoreRefs(
    { spaceId: started.session.space_id, sessionId: started.session.id, type: started.session.session_type },
    session.refs
  ), '/api/v4/interviews/spaces/:id/sessions');
  res.status(started.created ? 201 : 200).json({ code: 0, data: session, created: started.created });
} catch (err) { error(res, err); } });
router.post('/sessions/:id/answers', async (req, res) => { try {
  const sessionId = positiveId(req.params.id);
  if (!sessionId) return res.status(400).json({ code:-1, message:'会话 ID 无效' });
  const session = db.prepare(`SELECT s.*, p.job_title FROM interview_sessions_v4 s JOIN interview_spaces_v4 p ON p.id=s.space_id WHERE s.id=? AND s.user_id=? AND s.status='active'`).get(sessionId, req.user.userId);
  if (!session) return res.status(404).json({ code: -1, message: '训练会话不存在或已结束' });
  const question = String(req.body.question || '').trim().slice(0, 1000); const answer = String(req.body.answer || '').trim().slice(0, 12000);
  if (!question || !answer) return res.status(400).json({ code: -1, message: '问题和回答不能为空' });
  const score = await interview.scoreAnswer(answer, question, session.job_title);
  const result = db.transaction(() => {
    const active = db.prepare("SELECT id FROM interview_sessions_v4 WHERE id=? AND user_id=? AND status='active'").get(session.id, req.user.userId);
    if (!active) throw Object.assign(new Error('训练会话已结束，本次评分未写入'), { status:409, code:'INTERVIEW_SESSION_ENDED' });
    const inserted = db.prepare(`INSERT INTO interview_answers_v4
      (session_id,user_id,question_type,question,answer,feedback,content_score,structure_score,expression_score,job_match_score)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(session.id, req.user.userId, String(req.body.questionType || 'role').slice(0, 30), question, answer, score.feedback, score.content, score.structure, score.expression, score.jobMatch);
    db.prepare("UPDATE interview_sessions_v4 SET ai_model=? WHERE id=? AND user_id=? AND status='active'").run(score.generation.model, session.id, req.user.userId);
    return inserted;
  }).immediate();
  analytics.track(req.user.userId, 'interview_answer_scored', withCoreRefs(
    { sessionId: session.id, generation: score.generation },
    interview.sessionView(session).refs
  ), '/api/v4/interviews/sessions/:id/answers');
  res.status(201).json({ code: 0, data: { id: result.lastInsertRowid, ...score, refs: interview.sessionView(session).refs } });
} catch (err) { error(res, err); }
});
router.post('/sessions/:id/complete', (req, res) => { try {
  const sessionId = positiveId(req.params.id);
  if (!sessionId) return res.status(400).json({ code:-1, message:'会话 ID 无效' });
  if (!req.body || req.body.confirmEffects !== true) {
    return res.json({ code:0, data:interview.previewCompletion(req.user.userId, sessionId), message:'请确认后生成报告和复练任务' });
  }
  const completed = interview.completeSession(req.user.userId, sessionId);
  const report = interview.reportView(completed.report);
  if (!completed.alreadyCompleted) analytics.track(req.user.userId, 'interview_training_completed', withCoreRefs(
    { sessionId: report.sessionId, score: report.overallScore },
    report.refs
  ), '/api/v4/interviews/sessions/:id/complete');
  res.status(completed.alreadyCompleted ? 200 : 201).json({ code: 0, data: report, alreadyCompleted: completed.alreadyCompleted });
} catch (err) { error(res, err); } });
router.post('/sessions/:id/cancel', (req, res) => {
  const sessionId = positiveId(req.params.id);
  if (!sessionId) return res.status(400).json({ code:-1, message:'会话 ID 无效' });
  const result = db.prepare("UPDATE interview_sessions_v4 SET status='cancelled', cancelled_at=datetime('now') WHERE id=? AND user_id=? AND status='active'").run(sessionId, req.user.userId);
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
  const taskId = positiveId(req.params.id);
  if (!taskId) return res.status(400).json({ code:-1, message:'任务 ID 无效' });
  const done = req.body && req.body.completed === true;
  const data = todayTasks.updateStatus(req.user.userId, taskId, done, req.body && req.body.updatedAt);
  if (!data) return res.status(404).json({ code: -1, message: '任务不存在' });
  if (done) analytics.track(req.user.userId, 'today_task_completed', withCoreRefs({ taskId: data.id }, data.refs), '/api/v4/interviews/today-tasks/:id');
  res.json({ code: 0, data, message: '任务已更新' });
});

module.exports = router;

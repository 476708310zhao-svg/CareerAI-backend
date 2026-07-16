const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const agents = require('../../services/v4Agents');
const analytics = require('../../services/v4Analytics');
const membership = require('../../services/v4Membership');
const router = express.Router();
router.use(authMiddleware);
function sendError(res, err) { return res.status(err.status || 500).json({ code: err.code || -1, message: err.message }); }
router.get('/', (_req, res) => res.json({ code: 0, data: Object.entries(agents.AGENTS).map(([code, item]) => ({ code, name: item.name })) }));
router.get('/tasks', (req, res) => {
  const rows = db.prepare('SELECT * FROM ai_agent_tasks_v4 WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.userId);
  res.json({ code: 0, data: rows.map(agents.view) });
});
router.post('/tasks', async (req, res) => { try {
  membership.consumeQuota(req.user.userId, 'ai_daily', 1, 'day');
  const row = await agents.createTask(req.user.userId, req.body.agentType, Number(req.body.applicationId) || null, req.body.input || {}, req.body.timeoutMs);
  analytics.track(req.user.userId, 'ai_agent_started', { taskId: row.id, agentType: row.agent_type }, '/api/v4/agents/tasks');
  res.status(201).json({ code: 0, data: agents.view(row) });
} catch (err) { sendError(res, err); } });
router.post('/tasks/:id/retry', async (req, res) => {
  const row = db.prepare("SELECT * FROM ai_agent_tasks_v4 WHERE id=? AND user_id=? AND status='failed'").get(Number(req.params.id), req.user.userId);
  if (!row) return res.status(409).json({ code: -1, message: '仅失败任务可以重试' });
  db.prepare("UPDATE ai_agent_tasks_v4 SET status='queued',error_code='',error_message='',retry_count=retry_count+1,timeout_ms=? WHERE id=?")
    .run(Math.max(1000, Number(req.body.timeoutMs) || 20000), row.id);
  res.json({ code: 0, data: agents.view(await agents.runTask(req.user.userId, row.id)) });
});
router.post('/tasks/:id/cancel', (req, res) => {
  const result = db.prepare("UPDATE ai_agent_tasks_v4 SET status='cancelled',cancelled_at=datetime('now') WHERE id=? AND user_id=? AND status IN ('queued','running','awaiting_confirmation')").run(Number(req.params.id), req.user.userId);
  if (!result.changes) return res.status(409).json({ code: -1, message: '任务不可取消' });
  res.json({ code: 0, message: '任务已取消' });
});
router.post('/tasks/:id/confirm', (req, res) => { try {
  res.json({ code: 0, data: agents.view(agents.confirmWrite(req.user.userId, Number(req.params.id), req.body.confirmationToken)), message: '写操作已由用户确认并执行' });
} catch (err) { sendError(res, err); } });

module.exports = router;

const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const todayTasks = require('../../services/v4TodayTasks');
const analytics = require('../../services/v4Analytics');

const router = express.Router();
router.use(authMiddleware);

router.get('/tasks', (req, res) => {
  res.json({ code: 0, data: todayTasks.list(req.user.userId) });
});

router.post('/tasks/sync', (req, res) => {
  const tasks = req.body && req.body.tasks;
  if (!Array.isArray(tasks)) return res.status(400).json({ code: -1, message: 'tasks 必须是数组' });
  const data = todayTasks.syncLocal(req.user.userId, tasks);
  analytics.track(req.user.userId, 'today_tasks_synced', {
    localCount: tasks.length,
    totalCount: data.length
  }, '/api/v4/today/tasks/sync');
  res.json({ code: 0, data, message: '今日任务已同步' });
});

router.patch('/tasks/:id', (req, res) => {
  const completed = req.body && req.body.completed === true;
  const data = todayTasks.updateStatus(req.user.userId, req.params.id, completed);
  if (!data) return res.status(404).json({ code: -1, message: '任务不存在' });
  if (completed) {
    analytics.track(req.user.userId, 'today_task_completed', { taskId: data.id }, '/api/v4/today/tasks/:id');
  }
  res.json({ code: 0, data, message: '任务已更新' });
});

module.exports = router;

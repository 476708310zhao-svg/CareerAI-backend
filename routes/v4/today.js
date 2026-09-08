const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const todayTasks = require('../../services/v4TodayTasks');
const analytics = require('../../services/v4Analytics');
const { withCoreRefs } = require('../../utils/coreEntityRefs');
const careerCoach = require('../../services/v4CareerCoach');

const router = express.Router();
router.use(authMiddleware);

router.get('/tasks', (req, res) => {
  careerCoach.ensureDailyTasks(req.user.userId);
  res.json({ code: 0, data: todayTasks.list(req.user.userId) });
});

router.post('/tasks/sync', (req, res) => {
  const tasks = req.body && req.body.tasks;
  if (!Array.isArray(tasks)) return res.status(400).json({ code: -1, message: 'tasks 必须是数组' });
  const data = todayTasks.syncLocal(req.user.userId, tasks);
  analytics.track(req.user.userId, 'today_tasks_synced', withCoreRefs({
    localCount: tasks.length,
    totalCount: data.length
  }, { userId: req.user.userId }), '/api/v4/today/tasks/sync');
  res.json({ code: 0, data, message: '今日任务已同步' });
});

router.patch('/tasks/:id', (req, res) => {
  const completed = req.body && req.body.completed === true;
  const data = todayTasks.updateStatus(req.user.userId, req.params.id, completed);
  if (!data) return res.status(404).json({ code: -1, message: '任务不存在' });
  if (completed) {
    analytics.track(req.user.userId, 'today_task_completed', withCoreRefs({ taskId: data.id }, data.refs), '/api/v4/today/tasks/:id');
  }
  res.json({ code: 0, data, message: '任务已更新' });
});

router.post('/tasks/:id/defer', (req, res) => {
  const rawDays = req.body && req.body.days;
  const days = rawDays === undefined ? 1 : Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    return res.status(400).json({ code: -1, message: '延期天数必须为 1～30 的整数' });
  }
  const result = todayTasks.deferTask(req.user.userId, req.params.id, days);
  if (result.conflict) {
    return res.status(409).json({ code: 'TASK_ALREADY_SCHEDULED', message: '目标日期已有同一任务', data: result });
  }
  if (!result.task) return res.status(404).json({ code: -1, message: '任务不存在' });
  analytics.track(req.user.userId, 'today_task_deferred', withCoreRefs({
    taskId: result.task.id, days, taskDate: result.task.taskDate
  }, result.task.refs), '/api/v4/today/tasks/:id/defer');
  return res.json({ code: 0, data: result.task, message: `任务已延期 ${days} 天` });
});

module.exports = router;

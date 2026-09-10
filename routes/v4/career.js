'use strict';

const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const careerCoach = require('../../services/v4CareerCoach');
const todayTasks = require('../../services/v4TodayTasks');
const analytics = require('../../services/v4Analytics');

const router = express.Router();
router.use(authMiddleware);

function dashboard(userId) {
  const now = new Date();
  const state = careerCoach.buildCareerState(userId, now);
  const generation = careerCoach.ensureDailyTasks(userId, now, state);
  return {
    diagnostic: state.diagnostic,
    dynamicPlan: state.dynamicPlan,
    weeklyReport: state.weeklyReport,
    today: {
      ...generation,
      tasks: todayTasks.list(userId),
      scheduled: todayTasks.listScheduled(userId)
    }
  };
}

router.get('/dashboard', (req, res) => {
  return res.json({ code: 0, data: dashboard(req.user.userId) });
});

router.get('/diagnostic', (req, res) => {
  const data = careerCoach.buildCareerState(req.user.userId).diagnostic;
  return res.json({ code: 0, data });
});

router.post('/diagnostic/tasks', (req, res) => {
  const keys = req.body && req.body.dimensions;
  if (keys !== undefined && !Array.isArray(keys)) {
    return res.status(400).json({ code: -1, message: 'dimensions 必须是数组' });
  }
  const result = careerCoach.createDiagnosticTasks(req.user.userId, keys);
  analytics.track(req.user.userId, 'career_diagnostic_tasks_created', {
    dimensions: Array.isArray(keys) ? keys.slice(0, 7) : [], created: result.created
  }, '/api/v4/career/diagnostic/tasks');
  return res.status(201).json({
    code: 0,
    data: { ...result, tasks: todayTasks.list(req.user.userId) },
    message: '补强任务已加入 Today'
  });
});

router.get('/plan', (req, res) => {
  const state = careerCoach.buildCareerState(req.user.userId);
  return res.json({ code: 0, data: state.dynamicPlan });
});

router.get('/weekly-report', (req, res) => {
  const state = careerCoach.buildCareerState(req.user.userId);
  return res.json({ code: 0, data: state.weeklyReport });
});

router.post('/today/generate', (req, res) => {
  const result = careerCoach.ensureDailyTasks(req.user.userId);
  return res.status(201).json({
    code: 0,
    data: {
      ...result,
      tasks: todayTasks.list(req.user.userId),
      scheduled: todayTasks.listScheduled(req.user.userId)
    },
    message: '今日关键任务已生成'
  });
});

module.exports = router;

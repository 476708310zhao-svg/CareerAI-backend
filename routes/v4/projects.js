'use strict';

const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const projects = require('../../services/v4ProjectBuilder');

const router = express.Router();
router.use(authMiddleware);

function run(res, action) {
  try { return action(); } catch (error) {
    return res.status(error.status || 400).json({ code: error.code || 'PROJECT_ERROR', message: error.message || '项目操作失败', data: null });
  }
}

router.get('/dashboard', (req, res) => run(res, () => {
  res.json({ code: 0, data: projects.dashboard(req.user.userId) });
}));

router.post('/', (req, res) => run(res, () => {
  const data = projects.createProject(req.user.userId, req.body);
  res.status(201).json({ code: 0, data, message: '证据型项目计划已创建；这不代表项目已经完成' });
}));

router.patch('/:id/milestones/:milestoneId', (req, res) => run(res, () => {
  const data = projects.updateMilestone(req.user.userId, req.params.id, req.params.milestoneId, req.body);
  res.json({ code: 0, data, message: '项目里程碑已更新' });
}));

router.post('/:id/complete', (req, res) => run(res, () => {
  const data = projects.completeProject(req.user.userId, req.params.id, req.body);
  res.json({ code: 0, data, message: '项目已按本人确认的真实证据标记完成' });
}));

router.post('/:id/export-experience', (req, res) => run(res, () => {
  const data = projects.exportToExperience(req.user.userId, req.params.id, req.body);
  res.status(201).json({ code: 0, data, message: '真实项目成果已写入简历经历库' });
}));

module.exports = router;

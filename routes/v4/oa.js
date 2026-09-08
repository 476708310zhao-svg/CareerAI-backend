'use strict';

const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const oa = require('../../services/v4OaCopilot');

const router = express.Router();
router.use(authMiddleware);

function run(res, action) {
  try { return action(); } catch (error) {
    return res.status(error.status || 400).json({ code: error.code || 'OA_ERROR', message: error.message || 'OA 操作失败', data: null });
  }
}

router.get('/dashboard', (req, res) => run(res, () => {
  res.json({ code: 0, data: oa.dashboard(req.user.userId) });
}));

router.post('/plans', (req, res) => run(res, () => {
  const data = oa.createPlan(req.user.userId, req.body);
  res.status(201).json({ code: 0, data, message: 'OA 训练计划已创建' });
}));

router.patch('/plans/:id', (req, res) => run(res, () => {
  const data = oa.updatePlan(req.user.userId, req.params.id, req.body);
  res.json({ code: 0, data, message: 'OA 训练计划已更新' });
}));

router.post('/plans/:id/sessions', (req, res) => run(res, () => {
  const data = oa.startSession(req.user.userId, req.params.id, req.body);
  res.status(201).json({ code: 0, data, message: '计时练习已开始' });
}));

router.post('/sessions/:id/complete', (req, res) => run(res, () => {
  const data = oa.completeSession(req.user.userId, req.params.id, req.body);
  res.json({ code: 0, data, message: '练习结果已按本人记录保存' });
}));

router.post('/sessions/:id/abandon', (req, res) => run(res, () => {
  const data = oa.abandonSession(req.user.userId, req.params.id);
  res.json({ code: 0, data, message: '本次练习已结束且不计入能力统计' });
}));

router.patch('/mistakes/:id', (req, res) => run(res, () => {
  const data = oa.updateMistake(req.user.userId, req.params.id, req.body);
  res.json({ code: 0, data, message: data.status === 'mastered' ? '已标记掌握' : '已重新加入错题练习' });
}));

module.exports = router;

const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const membership = require('../../services/v4Membership');
const analytics = require('../../services/v4Analytics');
const router = express.Router();

router.get('/plans', (_req, res) => res.json({ code: 0, data: membership.listPlans(), paymentLive: false }));
router.get('/status', authMiddleware, (req, res) => {
  const current = membership.getMembership(req.user.userId);
  analytics.track(req.user.userId, 'membership_viewed', { planCode: current.planCode }, '/api/v4/membership/status');
  res.json({ code: 0, data: { ...current, quotas: {
    interview: membership.quotaStatus(req.user.userId, 'interview_monthly'),
    resumeVersions: membership.quotaStatus(req.user.userId, 'resume_versions'),
    aiDaily: membership.quotaStatus(req.user.userId, 'ai_daily', 'day')
  }, paymentLive: false } });
});
router.get('/orders', authMiddleware, (req, res) => {
  const orders = db.prepare('SELECT order_no AS orderNo, plan_name AS planName, amount, status, provider, created_at AS createdAt, paid_at AS paidAt FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.userId);
  const refunds = db.prepare('SELECT refund_no AS refundNo, order_no AS orderNo, amount, status, reason, created_at AS createdAt FROM payment_refunds_v4 WHERE user_id=? ORDER BY id DESC').all(req.user.userId);
  res.json({ code: 0, data: { orders, refunds } });
});

module.exports = router;

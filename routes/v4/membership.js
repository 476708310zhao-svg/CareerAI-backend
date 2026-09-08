const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const membership = require('../../services/v4Membership');
const analytics = require('../../services/v4Analytics');
const commerce = require('../../services/v4Commerce');
const router = express.Router();

function run(res, action) {
  try { return action(); } catch (error) {
    return res.status(error.status || 400).json({ code: error.code || 'COMMERCE_ERROR', message: error.message || '商业权益操作失败', data: error.data || null });
  }
}

router.get('/plans', (_req, res) => res.json({ code: 0, data: membership.listPlans(), paymentLive: false }));
router.get('/status', authMiddleware, (req, res) => {
  const current = membership.getMembership(req.user.userId);
  analytics.track(req.user.userId, 'membership_viewed', { planCode: current.planCode }, '/api/v4/membership/status');
  res.json({ code: 0, data: { ...current, quotas: {
    interview: membership.quotaStatus(req.user.userId, 'interview_monthly'),
    resumeVersions: membership.quotaStatus(req.user.userId, 'resume_versions'),
    applicationAssistant: membership.quotaStatus(req.user.userId, 'application_assistant'),
    aiDaily: membership.quotaStatus(req.user.userId, 'ai_daily', 'day')
  }, paymentLive: false } });
});
router.get('/orders', authMiddleware, (req, res) => {
  const orders = db.prepare('SELECT order_no AS orderNo, plan_name AS planName, amount, status, provider, created_at AS createdAt, paid_at AS paidAt FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.userId);
  const refunds = db.prepare('SELECT refund_no AS refundNo, order_no AS orderNo, amount, status, reason, created_at AS createdAt FROM payment_refunds_v4 WHERE user_id=? ORDER BY id DESC').all(req.user.userId);
  res.json({ code: 0, data: { orders, refunds } });
});

router.get('/ledger', authMiddleware, (req, res) => {
  res.json({ code: 0, data: { list: commerce.listLedger(req.user.userId, req.query.limit),
    notice: '账本只记录订单、权益、额度和退款状态，不代表外部支付或退款已执行。' } });
});

router.post('/refunds', authMiddleware, (req, res) => run(res, () => {
  const data = commerce.requestRefund(req.user.userId, req.body);
  res.status(201).json({ code: 0, data, message: '退款申请已记录，尚未执行外部退款' });
}));

module.exports = router;

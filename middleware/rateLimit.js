const rateLimit = require('express-rate-limit');

// 职位搜索限速：每个 IP 每分钟最多 30 次
const jobsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' }
});

// AI 接口限速：每个 IP 每分钟最多 10 次（AI生成慢且贵）
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI请求过于频繁，请稍后再试' }
});

// 写入接口限速：每个 IP 每分钟最多 20 次（发面经/评论/反馈）
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: -1, error: '提交过于频繁，请稍后再试' }
});

// 登录接口限速：每个 IP 15分钟最多 10 次（防暴力破解）
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: -1, message: '登录尝试过多，请 15 分钟后再试' }
});

// 管理后台登录限速：每个 IP 15分钟最多 5 次
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: -1, message: '管理员登录尝试过多，请稍后再试' }
});

// 支付接口限速：每个 IP 每分钟最多 3 次（防刷单）
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '订单创建过于频繁，请稍后再试' }
});

module.exports = { jobsLimiter, aiLimiter, writeLimiter, loginLimiter, adminLoginLimiter, paymentLimiter };

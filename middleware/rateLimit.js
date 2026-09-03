const rateLimit = require('express-rate-limit');

function normalizeLoginIdentity(value) {
  return String(value || '').trim().toLowerCase().slice(0, 100) || 'anonymous';
}

function adminLoginKey(req) {
  return `${req.ip}:${normalizeLoginIdentity(req.body && req.body.username)}`;
}

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

// 管理后台登录限速：每个 IP + 账号 15 分钟最多 5 次失败。
// 成功登录不计入限额，避免正常管理员在多次登录后被误封。
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: adminLoginKey,
  handler: (req, res, _next, options) => {
    const resetTime = req.rateLimit && req.rateLimit.resetTime;
    const retryAfter = resetTime instanceof Date
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(options.windowMs / 1000);
    res.status(options.statusCode).json({
      code: -1,
      message: `密码错误次数过多，请 ${Math.ceil(retryAfter / 60)} 分钟后再试`,
      retryAfter
    });
  }
});

// 支付接口限速：每个 IP 每分钟最多 3 次（防刷单）
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '订单创建过于频繁，请稍后再试' }
});

module.exports = {
  jobsLimiter,
  aiLimiter,
  writeLimiter,
  loginLimiter,
  adminLoginLimiter,
  paymentLimiter,
  adminLoginKey,
  normalizeLoginIdentity
};

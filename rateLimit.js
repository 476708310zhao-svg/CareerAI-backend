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

module.exports = { jobsLimiter, aiLimiter };

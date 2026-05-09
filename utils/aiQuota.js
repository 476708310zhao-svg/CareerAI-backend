const db = require('../db/database');

const DAILY_LIMITS = {
  assistant: 5,
  career_plan: 1
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getUser(userId) {
  return db.prepare('SELECT vip_level, vip_expires_at FROM users WHERE id = ?').get(userId);
}

function isVipUser(user) {
  if (!user || user.vip_level <= 0) return false;
  if (!user.vip_expires_at) return true;
  return new Date(user.vip_expires_at) >= new Date();
}

function getUsage(userId, feature, day) {
  const row = db.prepare(`
    SELECT count FROM ai_usage WHERE user_id = ? AND feature = ? AND usage_date = ?
  `).get(userId, feature, day);
  return row ? row.count : 0;
}

function incrementUsage(userId, feature, day) {
  db.prepare(`
    INSERT INTO ai_usage (user_id, feature, usage_date, count, updated_at)
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(user_id, feature, usage_date)
    DO UPDATE SET count = count + 1, updated_at = datetime('now')
  `).run(userId, feature, day);
}

function consumeDailyLimit(req, res, feature) {
  const limit = DAILY_LIMITS[feature];
  if (!limit) return true;

  const userId = req.user && req.user.userId;
  const user = getUser(userId);
  if (isVipUser(user)) return true;

  const day = todayKey();
  const used = getUsage(userId, feature, day);
  if (used >= limit) {
    res.status(429).json({
      code: -1,
      message: `今日免费次数已用完，${feature === 'assistant' ? 'AI助手' : '求职规划'}每日可免费使用 ${limit} 次，开通 VIP 可继续使用`,
      data: { feature, limit, used, vipRequired: true }
    });
    return false;
  }

  incrementUsage(userId, feature, day);
  return true;
}

function requireVip(featureName) {
  return (req, res, next) => {
    const user = getUser(req.user && req.user.userId);
    if (isVipUser(user)) return next();
    return res.status(403).json({
      code: -1,
      message: `${featureName || '该功能'}仅 VIP 可用`,
      data: { vipRequired: true }
    });
  };
}

module.exports = {
  consumeDailyLimit,
  requireVip
};

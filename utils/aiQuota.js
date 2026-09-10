const db = require('../db/database');

const DAILY_LIMITS = {
  assistant: 5,
  chat: 20,
  ats: 3,
  career_plan: 1,
  project_builder: 1,
  networking: 5,
  resume_optimize: 3,
  application_assistant: 3
};

const FEATURE_LABELS = {
  assistant: 'AI 求职助手',
  chat: 'AI 面试/题库训练',
  ats: 'ATS 简历优化',
  career_plan: 'AI 求职规划',
  project_builder: 'AI 项目生成器',
  networking: 'Networking 消息',
  resume_optimize: 'AI 简历优化',
  application_assistant: 'AI 申请助手'
};

const VIP_ONLY_FEATURES = {
  workflow: 'AI 工作流'
};

function todayKey() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).reduce((acc, item) => {
    acc[item.type] = item.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getUser(userId) {
  return db.prepare('SELECT vip_level, vip_expires_at FROM users WHERE id = ?').get(userId);
}

function isVipUser(user) {
  if (!user || user.vip_level <= 0) return false;
  if (!user.vip_expires_at) return true;
  return String(user.vip_expires_at).slice(0, 10) >= todayKey();
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

function getFeatureStatus(userId, feature, user, day) {
  const limit = DAILY_LIMITS[feature] || 0;
  const used = userId && limit ? getUsage(userId, feature, day) : 0;
  const isVip = isVipUser(user);
  return {
    feature,
    label: FEATURE_LABELS[feature] || feature,
    limit,
    used,
    remaining: isVip || !limit ? null : Math.max(0, limit - used),
    unlimited: isVip,
    vipRequired: !isVip && !!limit && used >= limit
  };
}

function getQuotaStatus(userId) {
  const user = getUser(userId) || {};
  const day = todayKey();
  const isVip = isVipUser(user);
  const features = Object.keys(DAILY_LIMITS).map(feature => getFeatureStatus(userId, feature, user, day));
  const vipOnly = Object.keys(VIP_ONLY_FEATURES).map(feature => ({
    feature,
    label: VIP_ONLY_FEATURES[feature],
    vipOnly: true,
    available: isVip,
    vipRequired: !isVip
  }));
  return {
    date: day,
    isVip,
    vipLevel: Number(user.vip_level || 0),
    vipExpiresAt: user.vip_expires_at || '',
    features,
    vipOnly
  };
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
    const label = FEATURE_LABELS[feature] || feature;
    res.status(429).json({
      code: -1,
      message: `今日免费次数已用完，${label}每日可免费使用 ${limit} 次，开通 VIP 可继续使用`,
      data: {
        feature,
        label,
        limit,
        used,
        remaining: 0,
        date: day,
        vipRequired: true
      }
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
      data: { vipRequired: true, feature: 'workflow', label: featureName || '该功能' }
    });
  };
}

module.exports = {
  DAILY_LIMITS,
  FEATURE_LABELS,
  getQuotaStatus,
  consumeDailyLimit,
  requireVip
};

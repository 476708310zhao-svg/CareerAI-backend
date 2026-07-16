const db = require('../db/database');

function parseJson(value, fallback) { try { return JSON.parse(value); } catch (e) { return fallback; } }
function monthKey() { return new Date().toISOString().slice(0, 7); }
function dayKey() { return new Date().toISOString().slice(0, 10); }

function downgradeExpired(userId) {
  const user = db.prepare('SELECT vip_level, vip_expires_at FROM users WHERE id=?').get(userId);
  if (user && user.vip_level > 0 && user.vip_expires_at && String(user.vip_expires_at).slice(0, 10) < dayKey()) {
    db.prepare('UPDATE users SET vip_level=0 WHERE id=?').run(userId);
    db.prepare("UPDATE user_subscriptions_v4 SET status='expired', updated_at=datetime('now') WHERE user_id=? AND status='active' AND expires_at < ?")
      .run(userId, dayKey());
  }
}

function getMembership(userId) {
  downgradeExpired(userId);
  const user = db.prepare('SELECT vip_level, vip_expires_at FROM users WHERE id=?').get(userId) || {};
  const subscription = db.prepare("SELECT * FROM user_subscriptions_v4 WHERE user_id=? AND status='active' AND (expires_at='' OR expires_at>=?) ORDER BY id DESC LIMIT 1")
    .get(userId, dayKey());
  const planCode = subscription ? subscription.plan_code : (Number(user.vip_level) > 0 ? 'pro_month' : 'free');
  const plan = db.prepare('SELECT * FROM membership_plans_v4 WHERE code=? AND enabled=1').get(planCode)
    || db.prepare("SELECT * FROM membership_plans_v4 WHERE code='free'").get();
  return {
    planCode: plan.code, planName: plan.name, isMember: plan.code !== 'free',
    expiresAt: subscription ? subscription.expires_at : (user.vip_expires_at || ''),
    subscriptionStatus: subscription ? subscription.status : (plan.code === 'free' ? 'inactive' : 'legacy_active'),
    entitlements: parseJson(plan.entitlements, {})
  };
}

function quotaStatus(userId, quotaKey, period = 'month') {
  const membership = getMembership(userId);
  const limit = Number(membership.entitlements[quotaKey] || 0);
  const periodKey = period === 'day' ? dayKey() : monthKey();
  const row = db.prepare('SELECT used FROM quota_usage_v4 WHERE user_id=? AND quota_key=? AND period_key=?').get(userId, quotaKey, periodKey);
  const used = Number(row && row.used || 0);
  return { quotaKey, periodKey, limit, used, remaining: Math.max(0, limit - used), unlimited: limit < 0 };
}

function consumeQuota(userId, quotaKey, amount = 1, period = 'month') {
  const status = quotaStatus(userId, quotaKey, period);
  if (!status.unlimited && status.used + amount > status.limit) {
    const error = new Error('当前套餐额度不足'); error.status = 429; error.code = 'QUOTA_EXCEEDED'; error.data = status; throw error;
  }
  db.prepare(`INSERT INTO quota_usage_v4 (user_id, quota_key, period_key, used) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, quota_key, period_key) DO UPDATE SET used=used+excluded.used, updated_at=datetime('now')`)
    .run(userId, quotaKey, status.periodKey, amount);
  return quotaStatus(userId, quotaKey, period);
}

function listPlans() {
  return db.prepare('SELECT * FROM membership_plans_v4 WHERE enabled=1 ORDER BY sort_order, id').all().map(row => ({
    code: row.code, name: row.name, priceCents: row.price_cents, durationDays: row.duration_days,
    entitlements: parseJson(row.entitlements, {})
  }));
}

module.exports = { getMembership, quotaStatus, consumeQuota, listPlans, downgradeExpired };

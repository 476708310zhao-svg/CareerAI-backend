'use strict';

const crypto = require('node:crypto');
const db = require('../db/database');
const { planKind, productById } = require('./v4CommerceCatalog');

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}
function clean(value, max = 1000) { return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max); }
function problem(code, message, status = 400, data) { return Object.assign(new Error(message), { code, status, data }); }
function dateOnly(value) { return String(value || '').slice(0, 10); }
function addDays(value, days) {
  const base = value ? new Date(`${dateOnly(value)}T00:00:00+08:00`) : new Date();
  base.setDate(base.getDate() + Math.max(0, Number(days) || 0));
  return base.toISOString().slice(0, 10);
}

function recordLedger(event = {}) {
  const key = clean(event.idempotencyKey, 240);
  if (!key) throw problem('LEDGER_KEY_REQUIRED', '商业账本必须提供幂等键');
  const result = db.prepare(`INSERT OR IGNORE INTO commerce_ledger_v4
    (idempotency_key,event_type,user_id,order_no,refund_no,plan_code,amount_delta,currency,
     quota_key,quota_delta,entitlement_snapshot,metadata,actor_type,actor_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    key, clean(event.eventType, 80), event.userId || null, clean(event.orderNo, 80), clean(event.refundNo, 80),
    clean(event.planCode, 80), Number(event.amountDelta) || 0, clean(event.currency || 'CNY', 12),
    clean(event.quotaKey, 80), Number(event.quotaDelta) || 0, JSON.stringify(event.entitlements || {}),
    JSON.stringify(event.metadata || {}), clean(event.actorType || 'system', 40), clean(event.actorId, 120));
  const row = db.prepare('SELECT * FROM commerce_ledger_v4 WHERE idempotency_key=?').get(key);
  return { created: result.changes === 1, row };
}

function expireGrants(userId) {
  const params = [];
  let where = "status='active' AND expires_at < date('now')";
  if (userId) { where += ' AND user_id=?'; params.push(userId); }
  db.prepare(`UPDATE entitlement_grants_v4 SET status='expired',updated_at=datetime('now') WHERE ${where}`).run(...params);
}

function activeScenarioGrants(userId) {
  expireGrants(userId);
  return db.prepare(`SELECT id,plan_code AS planCode,order_no AS orderNo,starts_at AS startsAt,
      expires_at AS expiresAt,entitlements FROM entitlement_grants_v4
    WHERE user_id=? AND status='active' AND grant_type='scenario' AND starts_at<=date('now') AND expires_at>=date('now')
    ORDER BY expires_at,id`).all(userId).map(row => ({ ...row, entitlements: parseJson(row.entitlements, {}) }));
}

function mergedEntitlements(base, grants) {
  const result = { ...(base || {}) };
  (grants || []).forEach(grant => Object.entries(grant.entitlements || {}).forEach(([key, value]) => {
    if (typeof value === 'boolean') result[key] = Boolean(result[key]) || value;
    else if (Number(value) < 0 || Number(result[key]) < 0) result[key] = -1;
    else result[key] = Number(result[key] || 0) + Number(value || 0);
  }));
  return result;
}

function activatePurchase(order, product, entitlements, expiresAt) {
  if (!order || !product) throw problem('PURCHASE_CONTEXT_REQUIRED', '缺少订单或商品信息');
  const kind = product.kind || planKind(product.planCode);
  const start = new Date().toISOString().slice(0, 10);
  const expiry = expiresAt || addDays(start, product.days);
  recordLedger({ idempotencyKey: `payment-confirmed:${order.order_no}`, eventType: 'payment_confirmed',
    userId: order.user_id, orderNo: order.order_no, planCode: product.planCode, amountDelta: Number(order.amount) || 0,
    entitlements, metadata: { provider: order.provider || 'unknown', transactionRecorded: true } });
  db.prepare(`INSERT OR IGNORE INTO entitlement_grants_v4
    (user_id,plan_code,order_no,grant_type,status,starts_at,expires_at,entitlements,source)
    VALUES (?,?,?,?, 'active',?,?,?,'payment')`).run(
    order.user_id, product.planCode, order.order_no, kind === 'subscription' ? 'subscription' : 'scenario',
    start, expiry, JSON.stringify(entitlements || {}));
  recordLedger({ idempotencyKey: `entitlement-granted:${order.order_no}`, eventType: 'entitlement_granted',
    userId: order.user_id, orderNo: order.order_no, planCode: product.planCode, entitlements,
    metadata: { grantType: kind, startsAt: start, expiresAt: expiry } });
  if (kind === 'subscription') {
    db.prepare(`INSERT INTO user_subscriptions_v4
      (user_id,plan_code,status,starts_at,expires_at,order_no) SELECT ?,?,'active',?,?,?
      WHERE NOT EXISTS (SELECT 1 FROM user_subscriptions_v4 WHERE order_no=?)`)
      .run(order.user_id, product.planCode, start, expiry, order.order_no, order.order_no);
  }
  return { expiresAt: expiry, grantType: kind };
}

function recordOrderCreated(order, product) {
  return recordLedger({ idempotencyKey: `order-created:${order.order_no}`, eventType: 'order_created',
    userId: order.user_id, orderNo: order.order_no, planCode: product.planCode,
    metadata: { amount: order.amount, provider: order.provider || 'unknown' } });
}

function recordQuotaUse(userId, quotaKey, amount, periodKey, context = {}) {
  const key = clean(context.idempotencyKey, 200) || crypto.randomUUID();
  return recordLedger({ idempotencyKey: `quota-used:${key}`, eventType: 'quota_used', userId,
    quotaKey, quotaDelta: Math.max(1, Number(amount) || 1), metadata: { periodKey, source: clean(context.source || 'service', 120) } });
}

function listLedger(userId, limit = 100) {
  return db.prepare(`SELECT id,event_type AS eventType,order_no AS orderNo,refund_no AS refundNo,
      plan_code AS planCode,amount_delta AS amountDelta,currency,quota_key AS quotaKey,quota_delta AS quotaDelta,
      actor_type AS actorType,created_at AS createdAt FROM commerce_ledger_v4
    WHERE user_id=? ORDER BY id DESC LIMIT ?`).all(userId, Math.min(200, Math.max(1, Number(limit) || 100)));
}

function requestRefund(userId, payload = {}) {
  if (payload.confirmRequest !== true) throw problem('REFUND_CONFIRMATION_REQUIRED', '请确认提交退款申请');
  const orderNo = clean(payload.orderNo, 80);
  const reason = clean(payload.reason, 500);
  if (!reason) throw problem('REFUND_REASON_REQUIRED', '请填写退款原因');
  const order = db.prepare("SELECT * FROM orders WHERE order_no=? AND user_id=? AND status='paid'").get(orderNo, userId);
  if (!order) throw problem('REFUND_ORDER_NOT_FOUND', '仅已支付且未退款的本人订单可以申请退款', 404);
  const existing = db.prepare("SELECT * FROM payment_refunds_v4 WHERE order_no=? AND user_id=? AND status!='rejected' ORDER BY id DESC LIMIT 1").get(orderNo, userId);
  if (existing) throw problem('REFUND_ALREADY_REQUESTED', '该订单已有退款申请', 409);
  const refundNo = `RF${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`.slice(0, 32);
  const transaction = db.transaction(() => {
    db.prepare(`INSERT INTO payment_refunds_v4 (order_no,user_id,refund_no,amount,status,reason)
      VALUES (?,?,?,?, 'requested',?)`).run(orderNo, userId, refundNo, order.amount, reason);
    recordLedger({ idempotencyKey: `refund-requested:${refundNo}`, eventType: 'refund_requested',
      userId, orderNo, refundNo, planCode: productCodeForOrder(order), actorType: 'user', actorId: String(userId),
      metadata: { reason, amount: order.amount } });
  });
  transaction();
  return refundView(db.prepare('SELECT * FROM payment_refunds_v4 WHERE refund_no=?').get(refundNo));
}

function productCodeForOrder(order) {
  const product = productById(order && order.plan_id);
  return product ? product.planCode : '';
}

function refundView(row) {
  return { id: row.id, refundNo: row.refund_no, orderNo: row.order_no, amount: row.amount,
    status: row.status, reason: row.reason || '', createdAt: row.created_at, updatedAt: row.updated_at };
}

function reconcileUserMembership(userId) {
  db.prepare("UPDATE user_subscriptions_v4 SET status='expired',updated_at=datetime('now') WHERE user_id=? AND status='active' AND expires_at<date('now')").run(userId);
  const active = db.prepare("SELECT expires_at FROM user_subscriptions_v4 WHERE user_id=? AND status='active' AND expires_at>=date('now') ORDER BY expires_at DESC LIMIT 1").get(userId);
  db.prepare('UPDATE users SET vip_level=?,vip_expires_at=? WHERE id=?').run(active ? 1 : 0, active ? active.expires_at : '', userId);
  return active ? active.expires_at : '';
}

function decideRefund(refundNo, payload = {}, actorId = '') {
  const refund = db.prepare('SELECT * FROM payment_refunds_v4 WHERE refund_no=?').get(clean(refundNo, 80));
  if (!refund) throw problem('REFUND_NOT_FOUND', '退款申请不存在', 404);
  const status = clean(payload.status, 30);
  if (!['approved', 'rejected', 'completed'].includes(status)) throw problem('INVALID_REFUND_STATUS', '退款状态无效');
  if (refund.status === 'completed') return { already: true, refund: refundView(refund) };
  if (refund.status === status) return { already: true, refund: refundView(refund) };
  const allowedTransitions = { requested: ['approved', 'rejected'], approved: ['completed', 'rejected'], rejected: [] };
  if (!(allowedTransitions[refund.status] || []).includes(status)) {
    throw problem('INVALID_REFUND_TRANSITION', `退款状态不能从 ${refund.status} 变更为 ${status}`, 409);
  }
  if (status === 'completed' && (payload.confirmExternalRefund !== true || !clean(payload.externalReference, 160))) {
    throw problem('EXTERNAL_REFUND_EVIDENCE_REQUIRED', '记录退款完成前必须确认外部退款已执行并填写凭据');
  }
  const order = db.prepare('SELECT * FROM orders WHERE order_no=? AND user_id=?').get(refund.order_no, refund.user_id);
  if (!order) throw problem('REFUND_ORDER_NOT_FOUND', '退款对应订单不存在', 404);
  const orderKind = planKind(productCodeForOrder(order));
  const transaction = db.transaction(() => {
    db.prepare("UPDATE payment_refunds_v4 SET status=?,updated_at=datetime('now') WHERE refund_no=?").run(status, refund.refund_no);
    recordLedger({ idempotencyKey: `refund-${status}:${refund.refund_no}`, eventType: `refund_${status}`,
      userId: refund.user_id, orderNo: refund.order_no, refundNo: refund.refund_no,
      planCode: productCodeForOrder(order), amountDelta: status === 'completed' ? -Number(refund.amount) : 0,
      actorType: 'admin', actorId, metadata: { externalReference: clean(payload.externalReference, 160), note: clean(payload.note, 500) } });
    if (status === 'completed') {
      db.prepare("UPDATE orders SET status='refunded' WHERE order_no=? AND status='paid'").run(refund.order_no);
      db.prepare("UPDATE entitlement_grants_v4 SET status='revoked',revoked_at=datetime('now'),updated_at=datetime('now') WHERE order_no=? AND status='active'").run(refund.order_no);
      db.prepare("UPDATE user_subscriptions_v4 SET status='cancelled',updated_at=datetime('now') WHERE order_no=? AND status='active'").run(refund.order_no);
      recordLedger({ idempotencyKey: `entitlement-revoked:${refund.refund_no}`, eventType: 'entitlement_revoked',
        userId: refund.user_id, orderNo: refund.order_no, refundNo: refund.refund_no,
        planCode: productCodeForOrder(order), actorType: 'admin', actorId,
        metadata: { reason: 'refund_completed', externalReference: clean(payload.externalReference, 160) } });
      if (orderKind === 'subscription') reconcileUserMembership(refund.user_id);
    }
  });
  transaction();
  return { already: false, refund: refundView(db.prepare('SELECT * FROM payment_refunds_v4 WHERE refund_no=?').get(refund.refund_no)) };
}

function upsertAlert(alert) {
  db.prepare(`INSERT INTO commerce_alerts_v4 (fingerprint,category,severity,message,evidence)
    VALUES (?,?,?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET
      status=CASE WHEN commerce_alerts_v4.status='resolved' THEN 'open' ELSE commerce_alerts_v4.status END,
      severity=excluded.severity,
      message=excluded.message,evidence=excluded.evidence,occurrences=occurrences+1,last_seen_at=datetime('now'),resolved_at=''`)
    .run(alert.fingerprint, alert.category, alert.severity, alert.message, JSON.stringify(alert.evidence || {}));
}

function tableExists(name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }

function evaluateAlerts() {
  const findings = [];
  const quickCheck = db.pragma('quick_check', { simple: true });
  if (quickCheck !== 'ok') findings.push({ fingerprint: 'readiness:database', category: 'readiness', severity: 'critical', message: '数据库 readiness 检查失败', evidence: { quickCheck } });
  const fiveXX = Number((db.prepare("SELECT COUNT(*) AS count FROM api_performance_v4 WHERE status_code>=500 AND created_at>=datetime('now','-15 minute')").get() || {}).count || 0);
  if (fiveXX >= 5) findings.push({ fingerprint: 'api:5xx:15m', category: '5xx', severity: 'critical', message: '15 分钟内 5xx 达到告警阈值', evidence: { count: fiveXX, threshold: 5 } });
  const ai = db.prepare(`SELECT COUNT(*) AS calls,SUM(CASE WHEN COALESCE(json_extract(payload,'$.generation.degraded'),0)=1 THEN 1 ELSE 0 END) AS degraded
    FROM analytics_events WHERE source='server' AND created_at>=datetime('now','-15 minute') AND json_extract(payload,'$.generation.source') IN ('live','fallback')`).get() || {};
  const aiCalls = Number(ai.calls || 0); const degraded = Number(ai.degraded || 0);
  if (aiCalls >= 5 && degraded / aiCalls >= 0.3) findings.push({ fingerprint: 'ai:degradation:15m', category: 'ai_degradation', severity: 'warning', message: 'AI 降级率达到告警阈值', evidence: { calls: aiCalls, degraded, thresholdPercent: 30 } });
  if (tableExists('cron_logs')) {
    const cron = db.prepare('SELECT status,ran_at AS ranAt,error_count AS errorCount FROM cron_logs ORDER BY ran_at DESC LIMIT 1').get();
    if (cron && (cron.status !== 'ok' || Number(cron.errorCount) > 0)) findings.push({ fingerprint: 'cron:latest-failed', category: 'cron', severity: 'warning', message: '最近一次聚合任务存在失败', evidence: cron });
  }
  const callbacks = Number((db.prepare("SELECT COUNT(*) AS count FROM commerce_ledger_v4 WHERE event_type='payment_callback_rejected' AND created_at>=datetime('now','-15 minute')").get() || {}).count || 0);
  if (callbacks >= 3) findings.push({ fingerprint: 'payment:callback-rejected:15m', category: 'payment_callback', severity: 'critical', message: '支付回调连续被拒绝', evidence: { count: callbacks, threshold: 3 } });
  const anomalies = Number((db.prepare(`SELECT COUNT(*) AS count FROM orders o WHERE o.status='paid' AND o.paid_at>=datetime('now','-1 day')
    AND (NOT EXISTS (SELECT 1 FROM commerce_ledger_v4 l WHERE l.order_no=o.order_no AND l.event_type='payment_confirmed')
      OR NOT EXISTS (SELECT 1 FROM entitlement_grants_v4 g WHERE g.order_no=o.order_no))`).get() || {}).count || 0);
  if (anomalies > 0) findings.push({ fingerprint: 'entitlement:paid-without-ledger', category: 'entitlement', severity: 'critical', message: '存在已支付但缺少权益账本的订单', evidence: { count: anomalies } });
  const transaction = db.transaction(() => {
    findings.forEach(upsertAlert);
    const activeFingerprints = new Set(findings.map(item => item.fingerprint));
    db.prepare("SELECT fingerprint FROM commerce_alerts_v4 WHERE status!='resolved'").all().forEach(row => {
      if (!activeFingerprints.has(row.fingerprint)) db.prepare("UPDATE commerce_alerts_v4 SET status='resolved',resolved_at=datetime('now') WHERE fingerprint=?").run(row.fingerprint);
    });
  });
  transaction();
  return { checkedAt: new Date().toISOString(), findings, databaseReady: quickCheck === 'ok' };
}

function updateAlert(id, status, actorId) {
  if (!['acknowledged', 'resolved'].includes(status)) throw problem('INVALID_ALERT_STATUS', '告警状态无效');
  const result = db.prepare(`UPDATE commerce_alerts_v4 SET status=?,acknowledged_by=?,
    acknowledged_at=CASE WHEN ?='acknowledged' THEN datetime('now') ELSE acknowledged_at END,
    resolved_at=CASE WHEN ?='resolved' THEN datetime('now') ELSE '' END WHERE id=?`).run(status, clean(actorId, 120), status, status, Number(id));
  if (!result.changes) throw problem('ALERT_NOT_FOUND', '告警不存在', 404);
  return db.prepare('SELECT * FROM commerce_alerts_v4 WHERE id=?').get(Number(id));
}

function overview() {
  const count = (sql, ...params) => Number((db.prepare(sql).get(...params) || {}).count || 0);
  const net = Number((db.prepare("SELECT COALESCE(SUM(amount_delta),0) AS amount FROM commerce_ledger_v4 WHERE event_type IN ('payment_confirmed','refund_completed')").get() || {}).amount || 0);
  return {
    paymentLive: false,
    rollout: db.prepare("SELECT feature,percentage,status,updated_at AS updatedAt FROM rollout_config_v4 WHERE feature='commerce'").get() || { feature: 'commerce', percentage: 0, status: 'paused' },
    totals: { netAmountCents: net, paidOrders: count("SELECT COUNT(*) AS count FROM commerce_ledger_v4 WHERE event_type='payment_confirmed'"),
      refundRequests: count("SELECT COUNT(*) AS count FROM payment_refunds_v4"), activeGrants: count("SELECT COUNT(*) AS count FROM entitlement_grants_v4 WHERE status='active' AND expires_at>=date('now')"),
      quotaEvents: count("SELECT COUNT(*) AS count FROM commerce_ledger_v4 WHERE event_type='quota_used'") },
    alerts: db.prepare("SELECT id,category,severity,status,message,evidence,occurrences,last_seen_at AS lastSeenAt FROM commerce_alerts_v4 WHERE status!='resolved' ORDER BY severity='critical' DESC,last_seen_at DESC LIMIT 50").all().map(row => ({ ...row, evidence: parseJson(row.evidence, {}) })),
    notice: '真实支付和外部退款均未由该面板执行；生产放量必须经过 Human 审批。'
  };
}

module.exports = { parseJson, addDays, recordLedger, recordOrderCreated, recordQuotaUse, activeScenarioGrants,
  mergedEntitlements, activatePurchase, listLedger, requestRefund, decideRefund, reconcileUserMembership,
  evaluateAlerts, updateAlert, overview, refundView };

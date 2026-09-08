'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const db = require('../db/database');
const { ensureV4Schema } = require('../db/v4Schema');
const commerce = require('../services/v4Commerce');
const membership = require('../services/v4Membership');
const { PRODUCTS, productById } = require('../services/v4CommerceCatalog');

ensureV4Schema();

test('Sprint 7 keeps historical plan ids and adds three scenario packs', () => {
  assert.equal(productById(0).planCode, 'pro_month');
  assert.equal(productById(1).planCode, 'pro_quarter');
  assert.equal(productById(1).price, 10000);
  assert.equal(productById(2).planCode, 'pro_year');
  assert.equal(productById(3).planCode, 'pro_trial_7d');
  assert.deepEqual([4, 5, 6].map(id => productById(id).planCode), [
    'jd_resume_pack', 'interview_sprint_7d', 'autumn_recruit_quarter'
  ]);
  assert.ok([4, 5, 6].every(id => PRODUCTS[id].kind === 'scenario'));
});

test('Sprint 7 migration is additive and alert evaluator covers six signal families', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '0005_sprint7_commerce_ledger.sql'), 'utf8');
  assert.doesNotMatch(migration, /^\s*(?:DROP|DELETE|TRUNCATE|ALTER)\b/im);
  assert.match(migration, /commerce_ledger_v4/);
  assert.match(migration, /entitlement_grants_v4/);
  assert.match(migration, /commerce_alerts_v4/);

  const service = fs.readFileSync(path.join(__dirname, '..', 'services', 'v4Commerce.js'), 'utf8');
  ['readiness', "category: '5xx'", 'ai_degradation', "category: 'cron'", 'payment_callback', "category: 'entitlement'"].forEach(signal => {
    assert.match(service, new RegExp(signal));
  });
  assert.equal(commerce.evaluateAlerts().databaseReady, true);
});

test('commerce ledger, scenario grants and refund completion stay idempotent and consistent', () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const openid = `sprint7_${stamp}`;
  const orderNo = `S7${stamp}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  const ledgerKey = `sprint7-idempotent:${stamp}`;
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)').run(openid, 'Sprint 7 Test').lastInsertRowid);
  try {
    db.prepare(`INSERT INTO orders (order_no,user_id,plan_id,plan_name,amount,status,provider,paid_at)
      VALUES (?,?,?,?,?,'paid','mock',datetime('now'))`).run(orderNo, userId, 4, 'JD 简历包', 1990);

    const first = commerce.recordLedger({ idempotencyKey: ledgerKey, eventType: 'test_event', userId });
    const second = commerce.recordLedger({ idempotencyKey: ledgerKey, eventType: 'test_event', userId });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.row.id, second.row.id);

    const product = productById(4);
    const entitlements = { resume_versions: 5, application_assistant: 10 };
    commerce.activatePurchase({ order_no: orderNo, user_id: userId, amount: 1990, provider: 'mock' }, product, entitlements);
    commerce.activatePurchase({ order_no: orderNo, user_id: userId, amount: 1990, provider: 'mock' }, product, entitlements);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM entitlement_grants_v4 WHERE order_no=?').get(orderNo).count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM commerce_ledger_v4 WHERE order_no=? AND event_type='payment_confirmed'").get(orderNo).count, 1);

    const status = membership.getMembership(userId);
    assert.equal(status.isMember, false);
    assert.equal(status.planCode, 'free');
    assert.equal(status.scenarioPacks.length, 1);
    assert.equal(status.entitlements.application_assistant, 10);

    db.prepare("UPDATE users SET vip_level=1,vip_expires_at=date('now','+60 day') WHERE id=?").run(userId);

    assert.throws(() => commerce.requestRefund(userId, { orderNo, reason: 'test' }), error => error.code === 'REFUND_CONFIRMATION_REQUIRED');
    const refund = commerce.requestRefund(userId, { orderNo, reason: '专项测试', confirmRequest: true });
    assert.throws(() => commerce.decideRefund(refund.refundNo, { status: 'completed', confirmExternalRefund: true, externalReference: 'TEST' }, 'tester'),
      error => error.code === 'INVALID_REFUND_TRANSITION');
    commerce.decideRefund(refund.refundNo, { status: 'approved', note: 'approved in test' }, 'tester');
    assert.throws(() => commerce.decideRefund(refund.refundNo, { status: 'completed' }, 'tester'),
      error => error.code === 'EXTERNAL_REFUND_EVIDENCE_REQUIRED');
    commerce.decideRefund(refund.refundNo, {
      status: 'completed', confirmExternalRefund: true, externalReference: `LOCAL-MOCK-${stamp}`
    }, 'tester');

    assert.equal(db.prepare('SELECT status FROM orders WHERE order_no=?').get(orderNo).status, 'refunded');
    assert.equal(db.prepare('SELECT status FROM entitlement_grants_v4 WHERE order_no=?').get(orderNo).status, 'revoked');
    assert.equal(db.prepare("SELECT amount_delta FROM commerce_ledger_v4 WHERE refund_no=? AND event_type='refund_completed'").get(refund.refundNo).amount_delta, -1990);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM commerce_ledger_v4 WHERE refund_no=? AND event_type='entitlement_revoked'").get(refund.refundNo).count, 1);
    assert.equal(membership.getMembership(userId).scenarioPacks.length, 0);
    assert.equal(db.prepare('SELECT vip_level FROM users WHERE id=?').get(userId).vip_level, 1,
      'refunding a scenario pack must not revoke an unrelated legacy membership');
  } finally {
    db.prepare('DELETE FROM payment_refunds_v4 WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM user_subscriptions_v4 WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM entitlement_grants_v4 WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM commerce_ledger_v4 WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM orders WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }
});

test('commerce rollout remains at zero unless Human approval is explicitly present', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'v4-admin.js'), 'utf8');
  assert.match(source, /feature === 'commerce' && percentage > 0/);
  assert.match(source, /COMMERCE_ROLLOUT_APPROVED/);
  assert.match(source, /return fail\(res, '商业化灰度尚未获得 Human 审批，当前只能保持 0%', 403\)/);
});

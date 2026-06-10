// routes/payment.js — 微信支付 JSAPI v2 + Mock 模式
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const https   = require('https');
const { authMiddleware } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimit');
const db = require('../db/database');
const { ok, fail } = require('../utils/response');

// ── 配置 ────────────────────────────────────────────────────────
const MCH_ID     = process.env.WXPAY_MCH_ID     || '';
const API_KEY    = process.env.WXPAY_API_KEY    || '';
const APP_ID     = process.env.WXPAY_APP_ID     || process.env.WX_APP_ID || '';
const NOTIFY_URL = process.env.WXPAY_NOTIFY_URL || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PAYMENT_ENABLED = String(process.env.PAYMENT_ENABLED || 'true').toLowerCase() !== 'false';
const WXPAY_CONFIGURED = !!(MCH_ID && API_KEY && APP_ID && NOTIFY_URL);
const IS_MOCK    = PAYMENT_ENABLED && !WXPAY_CONFIGURED;
const ALLOW_MOCK_PAYMENT = PAYMENT_ENABLED && !IS_PRODUCTION && process.env.ENABLE_MOCK_PAYMENT === 'true';

if (!PAYMENT_ENABLED) {
  console.warn('[Payment] 会员支付入口已关闭');
} else if (IS_MOCK && !ALLOW_MOCK_PAYMENT) {
  console.warn('[Payment] WXPAY 未配置，支付下单已关闭');
} else if (IS_MOCK) {
  console.warn('[Payment] WXPAY 未配置，已启用开发模拟支付');
}

// ── 套餐 ─────────────────────────────────────────────────────────
const PLANS = {
  0: { name: '月卡会员', price: 1990,  days: 30  },   // price 单位：分
  1: { name: '季卡会员', price: 4990,  days: 90  },
  2: { name: '年卡会员', price: 19900, days: 365 }
};

// ── 建表 ─────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no       TEXT    UNIQUE NOT NULL,
    user_id        INTEGER NOT NULL,
    plan_id        INTEGER NOT NULL,
    plan_name      TEXT    NOT NULL,
    amount         INTEGER NOT NULL,
    status         TEXT    DEFAULT 'pending',
    transaction_id TEXT    DEFAULT '',
    prepay_id      TEXT    DEFAULT '',
    created_at     TEXT    DEFAULT (datetime('now')),
    paid_at        TEXT
  )
`);

// ── 工具函数 ──────────────────────────────────────────────────────
function signMD5(params, key) {
  const str = Object.keys(params)
    .filter(k => params[k] !== '' && params[k] !== null && params[k] !== undefined && k !== 'sign')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&') + `&key=${key}`;
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

function genNonce(len = 16) {
  return crypto.randomBytes(len).toString('hex').slice(0, 32);
}

function genOrderNo(userId) {
  const ts   = Date.now().toString();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VIP${userId}_${ts}_${rand}`;
}

function xmlToObj(xml) {
  const obj = {};
  xml.replace(/<(\w+)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/\1>/g, (_, k, v) => { obj[k] = v; });
  return obj;
}

function objToXml(obj) {
  return '<xml>' + Object.keys(obj).map(k => `<${k}><![CDATA[${obj[k]}]]></${k}>`).join('') + '</xml>';
}

function callUnifiedOrder(params) {
  return new Promise((resolve, reject) => {
    const body = objToXml(params);
    const options = {
      hostname: 'api.mch.weixin.qq.com',
      path:     '/pay/unifiedorder',
      method:   'POST',
      headers:  { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(xmlToObj(data)));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('WXPay timeout')); });
    req.write(body);
    req.end();
  });
}

function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim()
    .replace(/^::ffff:/, '') || '127.0.0.1';
}

// ── POST /api/payment/create-order ───────────────────────────────
router.post('/create-order', authMiddleware, paymentLimiter, (req, res) => {
  if (!PAYMENT_ENABLED) {
    return fail(res, '会员开通暂未开放', 503);
  }

  const userId = req.user.userId;
  const openid = req.user.openid;
  const { planId } = req.body;
  const planIdInt = parseInt(planId, 10);

  const plan = PLANS[planIdInt];
  if (!plan) return fail(res, '无效套餐', 400);

  const orderNo = genOrderNo(userId);

  try {
    db.prepare(
      'INSERT INTO orders (order_no, user_id, plan_id, plan_name, amount) VALUES (?, ?, ?, ?, ?)'
    ).run(orderNo, userId, planIdInt, plan.name, plan.price);
  } catch (e) {
    console.error('[Payment] DB insert order:', e);
    return fail(res, '创建订单失败', 500);
  }

  // ── Mock 模式 ────────────────────────────────────────────────
  if (IS_MOCK) {
    if (!ALLOW_MOCK_PAYMENT) {
      return fail(res, '微信支付未完成生产配置，暂无法创建订单', 503);
    }
    return ok(res, { mock: true, orderNo, planName: plan.name, amount: plan.price }, '订单已创建');
  }

  // ── 真实微信支付 ──────────────────────────────────────────────
  const nonce = genNonce();
  const unifiedParams = {
    appid:            APP_ID,
    mch_id:           MCH_ID,
    nonce_str:        nonce,
    body:             `职引-${plan.name}`,
    out_trade_no:     orderNo,
    total_fee:        plan.price,
    spbill_create_ip: getClientIp(req),
    notify_url:       NOTIFY_URL,
    trade_type:       'JSAPI',
    openid
  };
  unifiedParams.sign = signMD5(unifiedParams, API_KEY);

  callUnifiedOrder(unifiedParams)
    .then(result => {
      if (result.return_code !== 'SUCCESS' || result.result_code !== 'SUCCESS') {
        console.error('[WXPay] unifiedorder:', result);
        return fail(res, result.err_code_des || result.return_msg || '创建订单失败', 500);
      }

      db.prepare('UPDATE orders SET prepay_id = ? WHERE order_no = ?').run(result.prepay_id, orderNo);

      // 二次签名（供小程序 wx.requestPayment 使用）
      const ts = Math.floor(Date.now() / 1000).toString();
      const payParams = {
        appId:     APP_ID,
        timeStamp: ts,
        nonceStr:  nonce,
        package:   `prepay_id=${result.prepay_id}`,
        signType:  'MD5'
      };
      payParams.paySign = signMD5(payParams, API_KEY);

      ok(res, { mock: false, orderNo, ...payParams }, '订单已创建');
    })
    .catch(err => {
      console.error('[WXPay] request error:', err);
      fail(res, '支付服务请求失败，请重试', 500);
    });
});

// ── POST /api/payment/notify  (微信异步回调) ─────────────────────
router.post('/notify', express.raw({ type: 'text/xml' }), (req, res) => {
  const xml    = req.body ? req.body.toString() : '';
  const params = xmlToObj(xml);

  // 验签
  const expected = signMD5(params, API_KEY);
  if (params.sign !== expected) {
    console.warn('[WXPay Notify] 签名验证失败');
    return res.send(objToXml({ return_code: 'FAIL', return_msg: '签名验证失败' }));
  }

  if (params.result_code === 'SUCCESS') {
    const orderNo       = params.out_trade_no;
    const transactionId = params.transaction_id;
    const paidAmount    = parseInt(params.total_fee, 10);
    const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);

    if (order && order.status === 'pending') {
      if (paidAmount !== order.amount) {
        console.warn(`[WXPay Notify] 金额不匹配 order=${orderNo}, paid=${paidAmount}, expected=${order.amount}`);
        return res.send(objToXml({ return_code: 'FAIL', return_msg: '金额不匹配' }));
      }

      const plan       = PLANS[order.plan_id];
      const expireDate = new Date();
      expireDate.setDate(expireDate.getDate() + (plan ? plan.days : 30));
      const expireDateStr = expireDate.toISOString().split('T')[0];

      db.prepare("UPDATE orders SET status='paid', transaction_id=?, paid_at=datetime('now') WHERE order_no=?")
        .run(transactionId, orderNo);
      db.prepare('UPDATE users SET vip_level=1, vip_expires_at=? WHERE id=?')
        .run(expireDateStr, order.user_id);

      console.log(`[WXPay] 订单 ${orderNo} 支付成功，用户 ${order.user_id} VIP 至 ${expireDateStr}`);
    }
  }

  res.send(objToXml({ return_code: 'SUCCESS', return_msg: 'OK' }));
});

// ── POST /api/payment/mock-confirm  (仅 Mock 模式) ───────────────
router.post('/mock-confirm', authMiddleware, (req, res) => {
  if (!ALLOW_MOCK_PAYMENT) return fail(res, 'Not found', 404);
  if (!IS_MOCK) return fail(res, '仅在 Mock 模式下可用', 403);

  const { orderNo } = req.body;
  const userId = req.user.userId;

  const order = db.prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ?').get(orderNo, userId);
  if (!order) return fail(res, '订单不存在', 404);
  if (order.status === 'paid') {
    return ok(res, { success: true, already: true, planName: order.plan_name });
  }

  const plan       = PLANS[order.plan_id];
  const expireDate = new Date();
  expireDate.setDate(expireDate.getDate() + (plan ? plan.days : 30));
  const expireDateStr = expireDate.toISOString().split('T')[0];

  db.prepare("UPDATE orders SET status='paid', transaction_id='MOCK_' || order_no, paid_at=datetime('now') WHERE order_no=?")
    .run(orderNo);
  db.prepare('UPDATE users SET vip_level=1, vip_expires_at=? WHERE id=?')
    .run(expireDateStr, userId);

  console.log(`[WXPay Mock] 订单 ${orderNo} 模拟支付成功，用户 ${userId} VIP 至 ${expireDateStr}`);
  ok(res, { success: true, expireDate: expireDateStr, planName: order.plan_name });
});

// ── GET /api/payment/verify/:orderNo ────────────────────────────
router.get('/verify/:orderNo', authMiddleware, (req, res) => {
  const { orderNo } = req.params;
  const userId = req.user.userId;

  const order = db.prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ?').get(orderNo, userId);
  if (!order) return fail(res, '订单不存在', 404);

  // 若已支付，同步 VIP 状态（兜底逻辑）
  if (order.status === 'paid') {
    const user = db.prepare('SELECT vip_expires_at FROM users WHERE id = ?').get(userId);
    return ok(res, { status: 'paid', planName: order.plan_name, expireDate: user && user.vip_expires_at });
  }

  ok(res, { status: order.status, planName: order.plan_name });
});

// ── GET /api/payment/config ──────────────────────────────────────
router.get('/config', (_req, res) => {
  const available = PAYMENT_ENABLED && WXPAY_CONFIGURED;
  ok(res, {
    enabled: PAYMENT_ENABLED,
    configured: PAYMENT_ENABLED && WXPAY_CONFIGURED,
    mock: PAYMENT_ENABLED && IS_MOCK && ALLOW_MOCK_PAYMENT,
    available,
    reason: available
      ? ''
      : (PAYMENT_ENABLED ? '微信支付未完成配置' : '会员支付入口已关闭')
  });
});

// ── GET /api/payment/orders ──────────────────────────────────────
router.get('/orders', authMiddleware, (req, res) => {
  const orders = db.prepare(
    'SELECT order_no, plan_name, amount, status, created_at, paid_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(req.user.userId);
  ok(res, { orders });
});

module.exports = router;

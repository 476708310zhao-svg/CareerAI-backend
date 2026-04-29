// routes/payment.js — 微信支付 JSAPI v2 + Mock 模式
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const https   = require('https');
const { authMiddleware } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimit');
const db = require('../db/database');

// ── 配置 ────────────────────────────────────────────────────────
const MCH_ID     = process.env.WXPAY_MCH_ID     || '';
const API_KEY    = process.env.WXPAY_API_KEY    || '';
const APP_ID     = process.env.WXPAY_APP_ID     || process.env.WX_APP_ID || '';
const NOTIFY_URL = process.env.WXPAY_NOTIFY_URL || '';
const IS_MOCK    = !MCH_ID || !API_KEY || !APP_ID;

if (IS_MOCK) {
  console.warn('[Payment] WXPAY 未配置，将使用 Mock 模式（仅限开发测试）');
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

// ── POST /api/payment/create-order ───────────────────────────────
router.post('/create-order', authMiddleware, paymentLimiter, (req, res) => {
  const userId = req.user.id;
  const openid = req.user.openid;
  const { planId, clientIp } = req.body;
  const planIdInt = parseInt(planId, 10);

  const plan = PLANS[planIdInt];
  if (!plan) return res.status(400).json({ error: '无效套餐' });

  const orderNo = genOrderNo(userId);

  try {
    db.prepare(
      'INSERT INTO orders (order_no, user_id, plan_id, plan_name, amount) VALUES (?, ?, ?, ?, ?)'
    ).run(orderNo, userId, planIdInt, plan.name, plan.price);
  } catch (e) {
    console.error('[Payment] DB insert order:', e);
    return res.status(500).json({ error: '创建订单失败' });
  }

  // ── Mock 模式 ────────────────────────────────────────────────
  if (IS_MOCK) {
    return res.json({ mock: true, orderNo, planName: plan.name, amount: plan.price });
  }

  // ── 真实微信支付 ──────────────────────────────────────────────
  const nonce = genNonce();
  const unifiedParams = {
    appid:            APP_ID,
    mch_id:           MCH_ID,
    nonce_str:        nonce,
    body:             `留学生求职助手-${plan.name}`,
    out_trade_no:     orderNo,
    total_fee:        plan.price,
    spbill_create_ip: clientIp || '127.0.0.1',
    notify_url:       NOTIFY_URL,
    trade_type:       'JSAPI',
    openid
  };
  unifiedParams.sign = signMD5(unifiedParams, API_KEY);

  callUnifiedOrder(unifiedParams)
    .then(result => {
      if (result.return_code !== 'SUCCESS' || result.result_code !== 'SUCCESS') {
        console.error('[WXPay] unifiedorder:', result);
        return res.status(500).json({ error: result.err_code_des || result.return_msg || '创建订单失败' });
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

      res.json({ mock: false, orderNo, ...payParams });
    })
    .catch(err => {
      console.error('[WXPay] request error:', err);
      res.status(500).json({ error: '支付服务请求失败，请重试' });
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
    const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);

    if (order && order.status === 'pending') {
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
  if (!IS_MOCK) return res.status(403).json({ error: '仅在 Mock 模式下可用' });

  const { orderNo } = req.body;
  const userId = req.user.id;

  const order = db.prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ?').get(orderNo, userId);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.status === 'paid') {
    return res.json({ success: true, already: true, planName: order.plan_name });
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
  res.json({ success: true, expireDate: expireDateStr, planName: order.plan_name });
});

// ── GET /api/payment/verify/:orderNo ────────────────────────────
router.get('/verify/:orderNo', authMiddleware, (req, res) => {
  const { orderNo } = req.params;
  const userId = req.user.id;

  const order = db.prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ?').get(orderNo, userId);
  if (!order) return res.status(404).json({ error: '订单不存在' });

  // 若已支付，同步 VIP 状态（兜底逻辑）
  if (order.status === 'paid') {
    const user = db.prepare('SELECT vip_expires_at FROM users WHERE id = ?').get(userId);
    return res.json({ status: 'paid', planName: order.plan_name, expireDate: user && user.vip_expires_at });
  }

  res.json({ status: order.status, planName: order.plan_name });
});

// ── GET /api/payment/config ──────────────────────────────────────
router.get('/config', (_req, res) => {
  res.json({ configured: !IS_MOCK, mock: IS_MOCK });
});

// ── GET /api/payment/orders ──────────────────────────────────────
router.get('/orders', authMiddleware, (req, res) => {
  const orders = db.prepare(
    'SELECT order_no, plan_name, amount, status, created_at, paid_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(req.user.id);
  res.json({ orders });
});

module.exports = router;

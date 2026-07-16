// routes/payment.js — 微信支付 JSAPI / 小程序虚拟支付 + Mock 模式
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const https   = require('https');
const { authMiddleware } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimit');
const db = require('../db/database');
const { ok, fail } = require('../utils/response');
const notify = require('./notify');
const analytics = require('../services/v4Analytics');
const {
  formatWxTime,
  paymentReminderData,
  paymentSuccessData
} = require('../utils/wechatTemplates');

// ── 配置 ────────────────────────────────────────────────────────
const MCH_ID     = process.env.WXPAY_MCH_ID     || '';
const API_KEY    = process.env.WXPAY_API_KEY    || '';
const APP_ID     = process.env.WXPAY_APP_ID     || process.env.WX_APP_ID || '';
const NOTIFY_URL = process.env.WXPAY_NOTIFY_URL || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PAYMENT_ENABLED = String(process.env.PAYMENT_ENABLED || 'true').toLowerCase() !== 'false';
const REAL_PAYMENT_LAUNCH_APPROVED = String(process.env.REAL_PAYMENT_LAUNCH_APPROVED || 'false').toLowerCase() === 'true';
const PAYMENT_PROVIDER = String(process.env.PAYMENT_PROVIDER || process.env.PAYMENT_MODE || 'wxpay').toLowerCase();
const USE_VIRTUAL_PAY = ['virtual', 'virtual-pay', 'wechat-virtual', 'wechat_virtual'].includes(PAYMENT_PROVIDER);

const VIRTUAL_PAY_ENV = String(process.env.VIRTUAL_PAY_ENV || '0') === '1' ? 1 : 0;
const VIRTUAL_PAY_OFFER_ID = process.env.VIRTUAL_PAY_OFFER_ID || '';
const VIRTUAL_PAY_MODE = process.env.VIRTUAL_PAY_MODE || 'short_series_goods';
const VIRTUAL_PAY_CURRENCY = process.env.VIRTUAL_PAY_CURRENCY || 'CNY';
const VIRTUAL_PAY_APP_KEY = VIRTUAL_PAY_ENV === 1
  ? (process.env.VIRTUAL_PAY_SANDBOX_APP_KEY || process.env.VIRTUAL_PAY_APP_KEY || '')
  : (process.env.VIRTUAL_PAY_APP_KEY || '');
const VIRTUAL_PAY_NOTIFY_TOKEN = process.env.VIRTUAL_PAY_NOTIFY_TOKEN || '';

const WXPAY_CONFIGURED = !!(MCH_ID && API_KEY && APP_ID && NOTIFY_URL);
const ALLOW_MOCK_PAYMENT = PAYMENT_ENABLED && !IS_PRODUCTION && process.env.ENABLE_MOCK_PAYMENT === 'true';
const PAYMENT_SUCCESS_TEMPLATE_ID = process.env.WX_TPL_PAYMENT_SUCCESS || '';
const PAYMENT_REMINDER_TEMPLATE_ID = process.env.WX_TPL_PAYMENT_REMINDER || '';

// ── 套餐 ─────────────────────────────────────────────────────────
const PLANS = {
  0: {
    name: '月卡会员',
    price: 4000,
    days: 30,
    productId: process.env.VIRTUAL_PAY_MONTH_PRODUCT_ID || ''
  },
  1: {
    name: '季卡会员',
    price: 10000,
    days: 90,
    productId: process.env.VIRTUAL_PAY_QUARTER_PRODUCT_ID || ''
  },
  2: {
    name: '年卡会员',
    price: 29900,
    days: 365,
    productId: process.env.VIRTUAL_PAY_YEAR_PRODUCT_ID || ''
  },
  3: {
    name: '体验会员',
    price: 1000,
    days: 7,
    productId: process.env.VIRTUAL_PAY_TRIAL_PRODUCT_ID || '',
    optional: true
  }
};

const REQUIRED_VIRTUAL_PLAN_IDS = Object.keys(PLANS).filter(id => !PLANS[id].optional);
const VIRTUAL_PAY_CONFIGURED = !!(
  VIRTUAL_PAY_OFFER_ID &&
  VIRTUAL_PAY_APP_KEY &&
  REQUIRED_VIRTUAL_PLAN_IDS.every(id => PLANS[id].productId)
);
const ACTIVE_PAYMENT_CONFIGURED = REAL_PAYMENT_LAUNCH_APPROVED && (USE_VIRTUAL_PAY ? VIRTUAL_PAY_CONFIGURED : WXPAY_CONFIGURED);
const IS_MOCK = PAYMENT_ENABLED && !ACTIVE_PAYMENT_CONFIGURED;

if (!PAYMENT_ENABLED) {
  console.warn('[Payment] 会员支付入口已关闭');
} else if (IS_MOCK && !ALLOW_MOCK_PAYMENT) {
  console.warn(`[Payment] ${USE_VIRTUAL_PAY ? '虚拟支付' : 'WXPAY'} 未配置，支付下单已关闭`);
} else if (IS_MOCK) {
  console.warn('[Payment] 支付未配置，已启用开发模拟支付');
} else {
  console.log(`[Payment] provider=${USE_VIRTUAL_PAY ? 'virtual' : 'wxpay'}`);
}

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
    paid_at        TEXT,
    provider       TEXT    DEFAULT 'wxpay',
    virtual_mode   TEXT    DEFAULT '',
    virtual_offer_id TEXT  DEFAULT '',
    product_id     TEXT    DEFAULT '',
    sign_data      TEXT    DEFAULT '',
    attach         TEXT    DEFAULT '',
    wx_order_id    TEXT    DEFAULT '',
    raw_notify     TEXT    DEFAULT ''
  )
`);

const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map(col => col.name);
[
  ['provider', 'TEXT DEFAULT "wxpay"'],
  ['virtual_mode', 'TEXT DEFAULT ""'],
  ['virtual_offer_id', 'TEXT DEFAULT ""'],
  ['product_id', 'TEXT DEFAULT ""'],
  ['sign_data', 'TEXT DEFAULT ""'],
  ['attach', 'TEXT DEFAULT ""'],
  ['wx_order_id', 'TEXT DEFAULT ""'],
  ['raw_notify', 'TEXT DEFAULT ""']
].forEach(([name, ddl]) => {
  if (!orderColumns.includes(name)) {
    db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${ddl}`);
  }
});

// ── 工具函数 ──────────────────────────────────────────────────────
function signMD5(params, key) {
  const str = Object.keys(params)
    .filter(k => params[k] !== '' && params[k] !== null && params[k] !== undefined && k !== 'sign')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&') + `&key=${key}`;
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

function hmacSha256Hex(key, value) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function calcVirtualPaySig(signData) {
  return hmacSha256Hex(VIRTUAL_PAY_APP_KEY, `requestVirtualPayment&${signData}`);
}

function calcVirtualSignature(sessionKey, signData) {
  return hmacSha256Hex(sessionKey, signData);
}

function genNonce(len = 16) {
  return crypto.randomBytes(len).toString('hex').slice(0, 32);
}

function genOrderNo(userId) {
  const userPart = Number(userId || 0).toString(36).toUpperCase();
  const tsPart = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `VIP${userPart}${tsPart}${rand}`.slice(0, 32);
}

function xmlToObj(xml) {
  const obj = {};
  String(xml || '').replace(/<(\w+)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/\1>/g, (_, k, v) => {
    obj[k] = v;
  });
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

function getPaymentReason() {
  if (!PAYMENT_ENABLED) return '会员支付入口已关闭';
  if (!REAL_PAYMENT_LAUNCH_APPROVED) return '真实支付等待资质确认';
  if (USE_VIRTUAL_PAY) {
    if (!VIRTUAL_PAY_OFFER_ID) return '虚拟支付 Offer ID 未配置';
    if (!VIRTUAL_PAY_APP_KEY) return '虚拟支付 AppKey 未配置';
    if (!REQUIRED_VIRTUAL_PLAN_IDS.every(id => PLANS[id].productId)) return '虚拟支付道具 Product ID 未配置';
    return '';
  }
  if (!WXPAY_CONFIGURED) return '微信支付未完成配置';
  return '';
}

function getAvailablePlanIds() {
  return Object.keys(PLANS)
    .filter(id => !USE_VIRTUAL_PAY || !!PLANS[id].productId)
    .map(id => parseInt(id, 10));
}

function formatAmount(amount) {
  return `${(Number(amount || 0) / 100).toFixed(2)}元`;
}

function notifyPaymentSuccess(order, expireDate) {
  if (!order || !notify || typeof notify.sendToUser !== 'function') return;
  notify.sendToUser(order.user_id, {
    type: 'payment',
    title: '会员支付成功',
    content: `${order.plan_name}已开通，有效期至 ${expireDate}`,
    templateId: PAYMENT_SUCCESS_TEMPLATE_ID,
    wxData: paymentSuccessData({
      orderNo: order.order_no,
      productName: order.plan_name,
      amount: formatAmount(order.amount),
      expireDate,
      result: '支付成功',
    })
  }).catch(err => {
    console.error('[Payment] 发送支付成功通知失败:', err.message);
  });
}

function notifyPaymentReminder(order, reason) {
  if (!order || !notify || typeof notify.sendToUser !== 'function') return;
  const createdAt = order.created_at
    ? new Date(`${String(order.created_at).replace(' ', 'T')}Z`)
    : new Date();
  const deadline = new Date(createdAt.getTime() + 15 * 60 * 1000);
  notify.sendToUser(order.user_id, {
    type: 'payment',
    title: '会员支付未完成',
    content: reason || `${order.plan_name}订单尚未完成支付，可重新进入会员页开通。`,
    templateId: PAYMENT_REMINDER_TEMPLATE_ID,
    wxData: paymentReminderData({
      orderTime: formatWxTime(createdAt),
      amount: formatAmount(order.amount),
      orderNo: order.order_no,
      deadline,
    })
  }).catch(err => {
    console.error('[Payment] 发送支付提醒失败:', err.message);
  });
}

function insertOrder(orderNo, userId, planId, plan) {
  db.prepare(`
    INSERT INTO orders (order_no, user_id, plan_id, plan_name, amount, provider)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(orderNo, userId, planId, plan.name, plan.price, USE_VIRTUAL_PAY ? 'virtual' : 'wxpay');
}

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayDateOnly() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getVipExpireDate(userId, days) {
  const user = db.prepare('SELECT vip_expires_at FROM users WHERE id = ?').get(userId);
  const today = todayDateOnly();
  const current = parseDateOnly(user && user.vip_expires_at);
  const baseDate = current && current >= today ? current : today;
  baseDate.setDate(baseDate.getDate() + days);
  return formatDateOnly(baseDate);
}

function markOrderPaid(order, transactionId, paidAmount, extra) {
  if (!order) return { ok: false, status: 404, message: '订单不存在' };
  if (order.status === 'paid') {
    const user = db.prepare('SELECT vip_expires_at FROM users WHERE id = ?').get(order.user_id);
    return { ok: true, already: true, expireDate: user && user.vip_expires_at };
  }
  if (Number.isFinite(paidAmount) && paidAmount !== order.amount) {
    return { ok: false, status: 400, message: '金额不匹配' };
  }

  const plan = PLANS[order.plan_id];
  const expireDateStr = getVipExpireDate(order.user_id, plan ? plan.days : 30);
  db.prepare(`
    UPDATE orders
       SET status='paid',
           transaction_id=?,
           paid_at=datetime('now'),
           wx_order_id=COALESCE(?, wx_order_id),
           raw_notify=COALESCE(?, raw_notify)
     WHERE order_no=?
  `).run(transactionId || '', extra && extra.wxOrderId || '', extra && extra.rawNotify || '', order.order_no);
  db.prepare('UPDATE users SET vip_level=1, vip_expires_at=? WHERE id=?')
    .run(expireDateStr, order.user_id);

  console.log(`[Payment] 订单 ${order.order_no} 支付成功，用户 ${order.user_id} VIP 至 ${expireDateStr}`);
  notifyPaymentSuccess(order, expireDateStr);
  return { ok: true, expireDate: expireDateStr };
}

function parseNotifyBody(req) {
  if (req.body && !Buffer.isBuffer(req.body) && typeof req.body === 'object') return req.body;
  const raw = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : (req.rawBody ? req.rawBody.toString('utf8') : '');
  const text = raw.trim();
  if (!text) return {};
  if (text.startsWith('{')) {
    try { return JSON.parse(text); } catch (e) {}
  }
  return xmlToObj(text);
}

function verifyMessageSignature(req) {
  if (!VIRTUAL_PAY_NOTIFY_TOKEN) return true;
  const { signature, timestamp, nonce } = req.query || {};
  if (!signature || !timestamp || !nonce) return false;
  const expected = crypto
    .createHash('sha1')
    .update([VIRTUAL_PAY_NOTIFY_TOKEN, timestamp, nonce].sort().join(''))
    .digest('hex');
  return expected === signature;
}

function handleVirtualVerify(req, res) {
  const echostr = req.query && req.query.echostr;
  if (!echostr) return res.status(400).send('missing echostr');
  if (!verifyMessageSignature(req)) return res.status(403).send('signature invalid');
  return res.type('text/plain').send(String(echostr));
}

function firstInt(params, names) {
  for (const name of names) {
    if (params[name] !== undefined && params[name] !== '') {
      const value = parseInt(params[name], 10);
      if (Number.isFinite(value)) return value;
    }
  }
  return NaN;
}

function firstString(params, names) {
  for (const name of names) {
    if (params && params[name] !== undefined && params[name] !== null && params[name] !== '') {
      return String(params[name]);
    }
  }
  return '';
}

function parseMaybeJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  const text = String(value).trim();
  if (!text || !text.startsWith('{') && !text.startsWith('[')) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    return {};
  }
}

function getVirtualNotifySources(params) {
  const payInfo = parseMaybeJson(firstString(params, [
    'WeChatPayInfo',
    'wechatPayInfo',
    'wechat_pay_info'
  ]));
  const goodsInfo = parseMaybeJson(firstString(params, [
    'GoodsInfo',
    'goodsInfo',
    'goods_info'
  ]));
  const sources = [params, payInfo];
  if (Array.isArray(goodsInfo)) {
    sources.push(...goodsInfo.filter(item => item && typeof item === 'object'));
  } else {
    sources.push(goodsInfo);
  }
  return sources.filter(item => item && typeof item === 'object');
}

function firstStringFromSources(sources, names) {
  for (const source of sources) {
    const value = firstString(source, names);
    if (value) return value;
  }
  return '';
}

function firstIntFromSources(sources, names) {
  for (const source of sources) {
    const value = firstInt(source, names);
    if (Number.isFinite(value)) return value;
  }
  return NaN;
}

function respondVirtualNotify(res, errCode, errMsg) {
  res.json({ ErrCode: errCode, ErrMsg: errMsg || (errCode === 0 ? 'OK' : 'FAIL') });
}

function handleVirtualNotify(req, res, params) {
  if (!verifyMessageSignature(req)) {
    console.warn('[VirtualPay Notify] 消息签名验证失败');
    return respondVirtualNotify(res, 1, 'signature invalid');
  }

  const event = params.Event || params.event || '';
  const notifySources = getVirtualNotifySources(params);
  const orderNo = firstStringFromSources(notifySources, [
    'MchOrderId',
    'mchOrderId',
    'mch_order_id',
    'OutTradeNo',
    'outTradeNo',
    'out_trade_no'
  ]);
  console.log('[VirtualPay Notify] received', JSON.stringify({
    event,
    orderNo,
    keys: Object.keys(params || {}).slice(0, 20)
  }));
  if (event === 'xpay_complaint_notify') {
    console.warn('[VirtualPay Complaint]', params.MchOrderId || '', params.ComplaintId || '');
    return respondVirtualNotify(res, 0, 'OK');
  }
  if (event && event !== 'xpay_goods_deliver_notify') {
    return respondVirtualNotify(res, 0, 'OK');
  }

  if (!orderNo) return respondVirtualNotify(res, 2, 'missing order');

  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
  if (!order) return respondVirtualNotify(res, 3, 'order not found');

  const user = db.prepare('SELECT openid FROM users WHERE id = ?').get(order.user_id);
  if (params.OpenId && user && user.openid && params.OpenId !== user.openid) {
    console.warn('[VirtualPay Notify] openid 不匹配', orderNo);
    return respondVirtualNotify(res, 4, 'openid mismatch');
  }

  const paidAmount = firstIntFromSources(notifySources, [
    'PayAmount',
    'payAmount',
    'pay_amount',
    'Amount',
    'amount',
    'TotalFee',
    'totalFee',
    'total_fee',
    'GoodsPrice',
    'goodsPrice',
    'goods_price'
  ]);
  const transactionId = firstStringFromSources(notifySources, [
    'TransactionId',
    'transactionId',
    'transaction_id',
    'WxOrderId',
    'wxOrderId',
    'wx_order_id'
  ]);
  const wxOrderId = firstStringFromSources(notifySources, [
    'WxOrderId',
    'wxOrderId',
    'wx_order_id',
    'TransactionId',
    'transactionId',
    'transaction_id'
  ]);
  const result = markOrderPaid(order, transactionId, paidAmount, {
    wxOrderId,
    rawNotify: JSON.stringify(params)
  });
  if (!result.ok) return respondVirtualNotify(res, 5, result.message);

  respondVirtualNotify(res, 0, 'OK');
}

function buildVirtualPayParams(orderNo, userId, planId, plan) {
  const user = db.prepare('SELECT wechat_session_key FROM users WHERE id = ?').get(userId);
  const sessionKey = user && user.wechat_session_key;
  if (!sessionKey) {
    const error = new Error('微信登录态已过期，请重新登录后再开通会员');
    error.status = 401;
    throw error;
  }

  const attach = `vip:${userId}:${planId}`;
  const signDataObj = {
    offerId: VIRTUAL_PAY_OFFER_ID,
    buyQuantity: 1,
    env: VIRTUAL_PAY_ENV,
    currencyType: VIRTUAL_PAY_CURRENCY,
    productId: plan.productId,
    goodsPrice: plan.price,
    outTradeNo: orderNo,
    attach
  };
  const signData = JSON.stringify(signDataObj);
  const paySig = calcVirtualPaySig(signData);
  const signature = calcVirtualSignature(sessionKey, signData);

  db.prepare(`
    UPDATE orders
       SET virtual_mode=?,
           virtual_offer_id=?,
           product_id=?,
           sign_data=?,
           attach=?
     WHERE order_no=?
  `).run(VIRTUAL_PAY_MODE, VIRTUAL_PAY_OFFER_ID, plan.productId, signData, attach, orderNo);

  return {
    provider: 'virtual',
    paymentProvider: 'virtual',
    mock: false,
    orderNo,
    planName: plan.name,
    amount: plan.price,
    mode: VIRTUAL_PAY_MODE,
    signData,
    paySig,
    signature,
    virtualPayment: {
      mode: VIRTUAL_PAY_MODE,
      signData,
      paySig,
      signature
    }
  };
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
  if (USE_VIRTUAL_PAY && !plan.productId) {
    return fail(res, `${plan.name}道具尚未完成配置，请稍后再试`, 503);
  }

  const orderNo = genOrderNo(userId);

  try {
    insertOrder(orderNo, userId, planIdInt, plan);
    analytics.track(userId, 'membership_purchase_started', { orderNo, planId: planIdInt, amount: plan.price, provider: IS_MOCK ? 'mock' : PAYMENT_PROVIDER }, '/api/payment/create-order');
  } catch (e) {
    console.error('[Payment] DB insert order:', e);
    return fail(res, '创建订单失败', 500);
  }

  // ── Mock 模式 ────────────────────────────────────────────────
  if (IS_MOCK) {
    if (!ALLOW_MOCK_PAYMENT) {
      return fail(res, `${USE_VIRTUAL_PAY ? '虚拟支付' : '微信支付'}未完成生产配置，暂无法创建订单`, 503);
    }
    return ok(res, { mock: true, provider: 'mock', orderNo, planName: plan.name, amount: plan.price }, '订单已创建');
  }

  if (USE_VIRTUAL_PAY) {
    try {
      return ok(res, buildVirtualPayParams(orderNo, userId, planIdInt, plan), '订单已创建');
    } catch (err) {
      console.error('[VirtualPay] create params:', err.message);
      return fail(res, err.message || '创建虚拟支付订单失败', err.status || 500);
    }
  }

  // ── 真实微信支付 JSAPI ───────────────────────────────────────
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

      const ts = Math.floor(Date.now() / 1000).toString();
      const payParams = {
        appId:     APP_ID,
        timeStamp: ts,
        nonceStr:  nonce,
        package:   `prepay_id=${result.prepay_id}`,
        signType:  'MD5'
      };
      payParams.paySign = signMD5(payParams, API_KEY);

      ok(res, { mock: false, provider: 'wxpay', paymentProvider: 'wxpay', orderNo, ...payParams }, '订单已创建');
    })
    .catch(err => {
      console.error('[WXPay] request error:', err);
      fail(res, '支付服务请求失败，请重试', 500);
    });
});

// ── POST /api/payment/notify  (微信支付或虚拟支付异步回调) ───────────────
router.post('/notify', express.raw({ type: ['text/xml', 'application/xml', 'text/plain', 'application/json'] }), (req, res) => {
  const params = parseNotifyBody(req);
  if ((params.Event || '').startsWith('xpay_') || params.MchOrderId) {
    return handleVirtualNotify(req, res, params);
  }

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

    const result = markOrderPaid(order, transactionId, paidAmount, {
      rawNotify: JSON.stringify(params)
    });
    if (!result.ok) {
      console.warn(`[WXPay Notify] ${result.message} order=${orderNo}`);
      return res.send(objToXml({ return_code: 'FAIL', return_msg: result.message }));
    }
  }

  res.send(objToXml({ return_code: 'SUCCESS', return_msg: 'OK' }));
});

// ── POST /api/payment/virtual-notify  (虚拟支付发货/投诉事件) ─────────────
router.get('/virtual-notify', handleVirtualVerify);

router.post('/virtual-notify', express.raw({ type: ['text/xml', 'application/xml', 'text/plain', 'application/json'] }), (req, res) => {
  handleVirtualNotify(req, res, parseNotifyBody(req));
});

// ── POST /api/payment/mock-confirm  (仅 Mock 模式) ───────────────
router.post('/mock-confirm', authMiddleware, (req, res) => {
  if (!ALLOW_MOCK_PAYMENT) return fail(res, 'Not found', 404);
  if (!IS_MOCK) return fail(res, '仅在 Mock 模式下可用', 403);

  const { orderNo } = req.body;
  const userId = req.user.userId;

  const order = db.prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ?').get(orderNo, userId);
  if (!order) return fail(res, '订单不存在', 404);

  const result = markOrderPaid(order, `MOCK_${orderNo}`, order.amount, {});
  if (!result.ok) return fail(res, result.message, result.status || 500);

  ok(res, { success: true, already: !!result.already, expireDate: result.expireDate, planName: order.plan_name });
});

// ── POST /api/payment/unpaid-reminder  (支付未完成提示/站内消息) ─────────────
router.post('/unpaid-reminder', authMiddleware, (req, res) => {
  const { orderNo, reason } = req.body || {};
  const userId = req.user.userId;
  if (!orderNo) return fail(res, '缺少订单号', 400);

  const order = db.prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ?').get(orderNo, userId);
  if (!order) return fail(res, '订单不存在', 404);
  if (order.status === 'paid') return ok(res, { skipped: true, status: 'paid' });

  notifyPaymentReminder(order, reason);
  ok(res, { sent: true });
});

// ── GET /api/payment/verify/:orderNo ────────────────────────────
router.get('/verify/:orderNo', authMiddleware, (req, res) => {
  const { orderNo } = req.params;
  const userId = req.user.userId;

  const order = db.prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ?').get(orderNo, userId);
  if (!order) return fail(res, '订单不存在', 404);

  if (order.status === 'paid') {
    const user = db.prepare('SELECT vip_expires_at FROM users WHERE id = ?').get(userId);
    return ok(res, {
      status: 'paid',
      provider: order.provider || 'wxpay',
      planName: order.plan_name,
      expireDate: user && user.vip_expires_at
    });
  }

  ok(res, { status: order.status, provider: order.provider || 'wxpay', planName: order.plan_name });
});

// ── GET /api/payment/config ──────────────────────────────────────
router.get('/config', (_req, res) => {
  const available = PAYMENT_ENABLED && ACTIVE_PAYMENT_CONFIGURED;
  ok(res, {
    enabled: PAYMENT_ENABLED,
    provider: USE_VIRTUAL_PAY ? 'virtual' : 'wxpay',
    configured: available,
    wxpayConfigured: PAYMENT_ENABLED && WXPAY_CONFIGURED,
    virtualConfigured: PAYMENT_ENABLED && VIRTUAL_PAY_CONFIGURED,
    mock: PAYMENT_ENABLED && IS_MOCK && ALLOW_MOCK_PAYMENT,
    available,
    availablePlanIds: getAvailablePlanIds(),
    trialConfigured: !USE_VIRTUAL_PAY || !!(PLANS[3] && PLANS[3].productId),
    env: USE_VIRTUAL_PAY ? VIRTUAL_PAY_ENV : undefined,
    reason: available ? '' : getPaymentReason()
  });
});

// ── GET /api/payment/orders ──────────────────────────────────────
router.get('/orders', authMiddleware, (req, res) => {
  const orders = db.prepare(`
    SELECT order_no, plan_name, amount, status, provider, product_id, created_at, paid_at
      FROM orders
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 20
  `).all(req.user.userId);
  ok(res, { orders });
});

module.exports = router;

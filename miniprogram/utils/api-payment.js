// utils/api-payment.js — 微信支付接口
const { post, request } = require('./api-client.js');

/**
 * 创建支付订单
 * @param {number} planId  0=月卡 1=季卡 2=年卡
 * @returns Promise<{ mock, orderNo, planName, amount, ... }>
 */
function createPayOrder(planId) {
  return new Promise((resolve, reject) => {
    post({
      path: '/api/payment/create-order',
      body: { planId, clientIp: '127.0.0.1' }
    }).then(res => {
      if (res.code === 0) resolve(res.data);
      else reject(new Error(res.message || '创建订单失败'));
    }).catch(reject);
  });
}

/**
 * Mock 模式确认支付（仅限开发）
 * @param {string} orderNo
 */
function mockConfirmPay(orderNo) {
  return new Promise((resolve, reject) => {
    post({
      path: '/api/payment/mock-confirm',
      body: { orderNo }
    }).then(res => {
      if (res.code === 0) resolve(res.data);
      else reject(new Error(res.message || '模拟支付失败'));
    }).catch(reject);
  });
}

/**
 * 查询订单状态
 * @param {string} orderNo
 * @returns Promise<{ status, planName, expireDate }>
 */
function verifyOrder(orderNo) {
  return new Promise((resolve, reject) => {
    request({ path: `/api/payment/verify/${orderNo}` })
      .then(res => {
        if (res.code === 0) resolve(res.data);
        else reject(new Error(res.message || '查询订单失败'));
      })
      .catch(reject);
  });
}

/**
 * 获取支付配置（是否 Mock）
 */
function getPayConfig() {
  return new Promise((resolve, reject) => {
    request({ path: '/api/payment/config' })
      .then(res => { if (res.code === 0) resolve(res.data); else reject(); })
      .catch(reject);
  });
}

/**
 * 获取订单历史
 */
function getPayOrders() {
  return new Promise((resolve, reject) => {
    request({ path: '/api/payment/orders' })
      .then(res => { if (res.code === 0) resolve(res.data); else reject(); })
      .catch(reject);
  });
}

module.exports = { createPayOrder, mockConfirmPay, verifyOrder, getPayConfig, getPayOrders };

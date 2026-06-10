// utils/api-payment.js — 微信支付接口
const { post, request } = require('./api-client.js');

function unwrapPaymentResponse(res, fallbackMessage) {
  if (res && res.code === 0) return res.data;
  if (res && (res.orderNo || res.status || res.orders || Object.prototype.hasOwnProperty.call(res, 'configured'))) {
    return res;
  }
  throw new Error((res && (res.message || res.error)) || fallbackMessage);
}

/**
 * 创建支付订单
 * @param {number} planId  0=月卡 1=季卡 2=年卡
 * @returns Promise<{ mock, orderNo, planName, amount, ... }>
 */
function createPayOrder(planId) {
  return new Promise((resolve, reject) => {
    post({
      path: '/api/payment/create-order',
      body: { planId }
    }).then(res => {
      resolve(unwrapPaymentResponse(res, '创建订单失败'));
    }).catch(err => reject(err instanceof Error ? err : new Error(err && err.message || '创建订单失败')));
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
      resolve(unwrapPaymentResponse(res, '支付确认失败'));
    }).catch(err => reject(err instanceof Error ? err : new Error(err && err.message || '支付确认失败')));
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
        resolve(unwrapPaymentResponse(res, '查询订单失败'));
      })
      .catch(err => reject(err instanceof Error ? err : new Error(err && err.message || '查询订单失败')));
  });
}

/**
 * 获取支付配置（是否 Mock）
 */
function getPayConfig() {
  return new Promise((resolve, reject) => {
    request({ path: '/api/payment/config' })
      .then(res => resolve(unwrapPaymentResponse(res, '获取支付配置失败')))
      .catch(err => reject(err instanceof Error ? err : new Error(err && err.message || '获取支付配置失败')));
  });
}

/**
 * 获取订单历史
 */
function getPayOrders() {
  return new Promise((resolve, reject) => {
    request({ path: '/api/payment/orders' })
      .then(res => resolve(unwrapPaymentResponse(res, '获取订单失败')))
      .catch(err => reject(err instanceof Error ? err : new Error(err && err.message || '获取订单失败')));
  });
}

module.exports = { createPayOrder, mockConfirmPay, verifyOrder, getPayConfig, getPayOrders };

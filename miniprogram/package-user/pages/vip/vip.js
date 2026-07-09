const featureFlags = require('../../../utils/feature-flags.js');
const api = require('../../../utils/api.js');

const ALL_PLANS = [
  { id: 3, name: '体验会员', price: '10.00', unit: '7 天', desc: '先试完整权益', tag: '体验' },
  { id: 0, name: '月卡会员', price: '40.00', unit: '30 天', desc: '短期冲刺' },
  { id: 1, name: '季卡会员', price: '100.00', unit: '90 天', desc: '求职季推荐', tag: '推荐' },
  { id: 2, name: '年卡会员', price: '299.00', unit: '365 天', desc: '长期成长' }
];
const DEFAULT_AVAILABLE_PLAN_IDS = ALL_PLANS.filter(item => item.id !== 3).map(item => item.id);

function getPlansByConfig(config) {
  const availableIds = Array.isArray(config && config.availablePlanIds)
    ? config.availablePlanIds.map(id => parseInt(id, 10))
    : DEFAULT_AVAILABLE_PLAN_IDS;
  return ALL_PLANS.map(item => {
    const disabled = !availableIds.includes(item.id);
    return Object.assign({}, item, {
      disabled,
      badgeText: disabled ? '待发布' : (item.tag || ''),
      displayDesc: disabled ? '微信同步中' : item.desc
    });
  });
}

function getPreferredPlan(plans, selectedPlanId) {
  return plans.find(item => item.id === selectedPlanId && !item.disabled)
    || plans.find(item => item.id === 1 && !item.disabled)
    || plans.find(item => item.id === 0 && !item.disabled)
    || plans.find(item => !item.disabled)
    || plans[0];
}

const INITIAL_PLANS = getPlansByConfig(null);
const INITIAL_PLAN = getPreferredPlan(INITIAL_PLANS, 1);
const QUOTA_ORDER = ['assistant', 'chat', 'ats', 'career_plan', 'project_builder', 'networking'];

function compareVersion(v1, v2) {
  const a = String(v1 || '').split('.');
  const b = String(v2 || '').split('.');
  const len = Math.max(a.length, b.length);
  while (a.length < len) a.push('0');
  while (b.length < len) b.push('0');
  for (let i = 0; i < len; i += 1) {
    const n1 = parseInt(a[i], 10) || 0;
    const n2 = parseInt(b[i], 10) || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

function canUseVirtualPayment() {
  try {
    const info = wx.getSystemInfoSync();
    return compareVersion(info.SDKVersion, '2.19.2') >= 0 || wx.canIUse('requestVirtualPayment');
  } catch (e) {
    return !!(wx.canIUse && wx.canIUse('requestVirtualPayment'));
  }
}

function formatQuotaFeatures(status) {
  const list = Array.isArray(status && status.features) ? status.features : [];
  const map = list.reduce((acc, item) => {
    acc[item.feature] = item;
    return acc;
  }, {});
  return QUOTA_ORDER.map(feature => map[feature]).filter(Boolean).map(item => {
    const limit = Number(item.limit || 0);
    const used = Number(item.used || 0);
    const unlimited = !!item.unlimited;
    const percent = unlimited ? 100 : (limit ? Math.min(100, Math.round((used / limit) * 100)) : 0);
    return Object.assign({}, item, {
      percent,
      usedText: unlimited ? `${used} 次已用` : `${used}/${limit}`,
      remainText: unlimited ? '会员不限' : `剩余 ${Math.max(0, limit - used)} 次`,
      exhausted: !unlimited && limit > 0 && used >= limit
    });
  });
}

Page({
  data: {
    membershipEnabled: false,
    plans: INITIAL_PLANS,
    selectedPlanId: INITIAL_PLAN.id,
    selectedPlanName: INITIAL_PLAN.name,
    selectedPlanPrice: INITIAL_PLAN.price,
    paying: false,
    paymentConfig: null,
    paymentAvailable: false,
    paymentReason: '正在检查支付配置',
    quotaLoading: false,
    quotaDate: '',
    quotaIsVip: false,
    quotaFeatures: [],
    quotaMessage: '登录后查看今日 AI 免费额度'
  },

  onLoad() {
    if (!featureFlags.guardMembershipPage()) return;
    this.setData({ membershipEnabled: true });
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#ffffff'
    });
    this.loadPaymentConfig();
    this.loadQuotaStatus();
  },

  onShow() {
    if (this.data.membershipEnabled) this.loadQuotaStatus();
  },

  _onFeatureFlagsChange(flags) {
    const membershipEnabled = !!(flags && flags.membership);
    this.setData({ membershipEnabled });
    if (!membershipEnabled) featureFlags.guardMembershipPage();
  },

  loadPaymentConfig() {
    api.getPayConfig()
      .then(config => {
        const available = !!(config && (config.available || config.mock));
        const plans = getPlansByConfig(config);
        const selectedPlan = getPreferredPlan(plans, this.data.selectedPlanId);
        this.setData({
          plans,
          selectedPlanId: selectedPlan.id,
          selectedPlanName: selectedPlan.name,
          selectedPlanPrice: selectedPlan.price,
          paymentConfig: config || null,
          paymentAvailable: available,
          paymentReason: available ? '' : ((config && config.reason) || '支付暂未开放')
        });
      })
      .catch(err => {
        this.setData({
          paymentConfig: null,
          paymentAvailable: false,
          paymentReason: err && err.message ? err.message : '支付配置获取失败'
        });
      });
  },

  loadQuotaStatus() {
    if (!wx.getStorageSync('token')) {
      this.setData({
        quotaLoading: false,
        quotaDate: '',
        quotaIsVip: false,
        quotaFeatures: [],
        quotaMessage: '登录后查看今日 AI 免费额度'
      });
      return;
    }
    this.setData({ quotaLoading: true });
    api.getAiUsageStatus()
      .then(res => {
        const data = res && res.code === 0 ? res.data : (res || {});
        const quotaFeatures = formatQuotaFeatures(data);
        this.setData({
          quotaLoading: false,
          quotaDate: data.date || '',
          quotaIsVip: !!data.isVip,
          quotaFeatures,
          quotaMessage: quotaFeatures.length ? '' : '今日额度暂未同步'
        });
      })
      .catch(err => {
        this.setData({
          quotaLoading: false,
          quotaMessage: err && err.message ? err.message : '今日额度获取失败'
        });
      });
  },

  selectPlan(e) {
    const planId = parseInt(e.currentTarget.dataset.planId, 10);
    const plan = this.data.plans.find(item => item.id === planId);
    if (!Number.isNaN(planId) && plan) {
      if (plan.disabled) {
        wx.showToast({ title: `${plan.name}微信同步中`, icon: 'none' });
        return;
      }
      this.setData({
        selectedPlanId: planId,
        selectedPlanName: plan.name,
        selectedPlanPrice: plan.price
      });
    }
  },

  scrollToTop() {
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 280
    });
  },

  getSelectedPlan() {
    return this.data.plans.find(item => item.id === this.data.selectedPlanId) || this.data.plans[0];
  },

  ensureLoggedIn(forceRefresh) {
    if (!forceRefresh && wx.getStorageSync('token')) return Promise.resolve();
    const app = getApp();
    const loginTask = app && typeof app._doLogin === 'function'
      ? app._doLogin()
      : api.login();
    return Promise.resolve(loginTask).then(data => {
      if (forceRefresh && !data) throw new Error('微信登录态刷新失败，请稍后重试');
      if (!wx.getStorageSync('token')) throw new Error('请先登录后再开通会员');
    });
  },

  requestVirtualPayment(params) {
    if (!canUseVirtualPayment()) {
      return Promise.reject(new Error('当前微信版本暂不支持虚拟支付，请升级微信后重试'));
    }
    return new Promise((resolve, reject) => {
      wx.requestVirtualPayment(Object.assign({}, params, {
        success: resolve,
        fail: reject
      }));
    });
  },

  requestWxPayment(order) {
    return new Promise((resolve, reject) => {
      wx.requestPayment({
        timeStamp: order.timeStamp,
        nonceStr: order.nonceStr,
        package: order.package,
        signType: order.signType || 'MD5',
        paySign: order.paySign,
        success: resolve,
        fail: reject
      });
    });
  },

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  pollPaid(orderNo, maxAttempts, intervalMs) {
    const attempts = maxAttempts || 8;
    const delay = intervalMs || 1500;
    let index = 0;
    const run = () => api.verifyOrder(orderNo).then(result => {
      if (result && result.status === 'paid') return result;
      index += 1;
      if (index >= attempts) return result;
      return this.wait(delay).then(run);
    });
    return run();
  },

  pollPaidQuietly(orderNo) {
    if (!orderNo) return;
    this.pollPaid(orderNo, 8, 2500)
      .then(result => {
        if (result && result.status === 'paid') {
          this.syncVipState(result);
          wx.showToast({ title: '会员已开通', icon: 'success' });
        }
      })
      .catch(err => {
        console.warn('[VIP] 后台确认权益失败:', err && (err.message || err.errMsg) || err);
      });
  },

  syncVipState(result) {
    const planName = result.planName || this.getSelectedPlan().name;
    const expireDate = result.expireDate || '';
    wx.setStorageSync('vipInfo', {
      isVip: true,
      planName,
      expireDate,
      purchaseDate: new Date().toISOString().slice(0, 10)
    });
    const userInfo = wx.getStorageSync('userInfo') || {};
    wx.setStorageSync('userInfo', Object.assign({}, userInfo, {
      vipLevel: 1,
      vip_level: 1,
      vipExpiresAt: expireDate,
      vip_expires_at: expireDate
    }));
    const app = getApp();
    if (app && typeof app.refreshGlobalData === 'function') app.refreshGlobalData();
  },

  isPaymentCancel(err) {
    const errCode = err && (err.errCode || err.errno);
    const errMsg = (err && (err.errMsg || err.message)) || '';
    return errCode === -2 || /cancel|取消/.test(errMsg);
  },

  getPayFailContent(err) {
    const errMsg = (err && (err.errMsg || err.message)) || '';
    if (/PRODUCT_ID_NOT_PUBLISH/.test(errMsg)) {
      return '该会员道具还没有在微信后台发布，可先选择月卡、季卡或年卡；发布完成后再开通体验会员。';
    }
    if (/COIN_OR_PRODUCT_ID_CREATED_IN_RECENTLY/.test(errMsg)) {
      return '体验会员道具刚发布，微信支付侧还在同步中。可先选择月卡、季卡或年卡，稍后再试体验会员。';
    }
    return errMsg || '支付过程中出现异常，请稍后重试。';
  },

  showPayFail(err) {
    if (this.isPaymentCancel(err)) {
      wx.showToast({ title: '已取消支付', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '支付未完成',
      content: this.getPayFailContent(err),
      confirmText: '知道了',
      showCancel: false
    });
  },

  requestPaymentSubscriptions() {
    if (!wx.requestSubscribeMessage || typeof api.getNotifyTemplates !== 'function') {
      return Promise.resolve();
    }
    return api.getNotifyTemplates()
      .then(res => {
        const templates = res && res.code === 0 ? (res.data || {}) : (res || {});
        const tmplIds = [templates.payment_success, templates.payment_reminder].filter(Boolean);
        if (!tmplIds.length) return null;
        return new Promise(resolve => {
          wx.requestSubscribeMessage({
            tmplIds,
            complete: resolve
          });
        }).then(result => {
          const accepted = tmplIds.filter(id => result && result[id] === 'accept');
          if (accepted.length && typeof api.subscribeNotifyTemplates === 'function') {
            api.subscribeNotifyTemplates(accepted).catch(() => {});
          }
          return result;
        });
      })
      .catch(() => null);
  },

  handlePay() {
    if (this.data.paying) return;
    const plan = this.getSelectedPlan();
    const config = this.data.paymentConfig || {};

    if (plan && plan.disabled) {
      wx.showToast({ title: `${plan.name}微信同步中`, icon: 'none' });
      return;
    }

    if (!this.data.paymentAvailable) {
      wx.showModal({
        title: '支付暂未开放',
        content: this.data.paymentReason || '会员支付配置还未完成，请稍后再试。',
        confirmText: '知道了',
        showCancel: false
      });
      this.loadPaymentConfig();
      return;
    }

    let currentOrder = null;
    this.setData({ paying: true });
    wx.showLoading({ title: '创建订单中', mask: true });

    this.requestPaymentSubscriptions()
      .then(() => this.ensureLoggedIn(config.provider === 'virtual'))
      .then(() => api.createPayOrder(plan.id))
      .then(order => {
        currentOrder = order;
        wx.hideLoading();
        if (order.mock) {
          wx.showLoading({ title: '模拟支付中', mask: true });
          return api.mockConfirmPay(order.orderNo)
            .then(() => this.pollPaid(order.orderNo, 3))
            .then(result => ({ order, result }));
        }

        if (order.provider === 'virtual' || order.paymentProvider === 'virtual') {
          return this.requestVirtualPayment(order.virtualPayment || {
            mode: order.mode,
            signData: order.signData,
            paySig: order.paySig,
            signature: order.signature
          })
            .then(() => {
              wx.showLoading({ title: '确认权益中', mask: true });
              return this.pollPaid(order.orderNo, 3, 1000);
            })
            .then(result => ({ order, result }));
        }

        return this.requestWxPayment(order)
          .then(() => {
            wx.showLoading({ title: '确认权益中', mask: true });
            return this.pollPaid(order.orderNo, 8);
          })
          .then(result => ({ order, result }));
      })
      .then(({ result }) => {
        wx.hideLoading();
        if (result && result.status === 'paid') {
          this.syncVipState(result);
          wx.showToast({ title: '会员已开通', icon: 'success' });
          return;
        }
        if (currentOrder && (currentOrder.provider === 'virtual' || currentOrder.paymentProvider === 'virtual')) {
          wx.showModal({
            title: '支付成功',
            content: '微信支付已完成，权益正在同步中，一般几秒内生效。你可以先继续使用，稍后重新进入会员页查看状态。',
            confirmText: '知道了',
            showCancel: false
          });
          this.pollPaidQuietly(currentOrder.orderNo);
          return;
        }
        wx.showModal({
          title: '支付确认中',
          content: '支付已提交，系统正在等待微信发货通知。稍后可重新进入会员页查看权益状态。',
          confirmText: '知道了',
          showCancel: false
        });
      })
      .catch(err => {
        wx.hideLoading();
        if (currentOrder && currentOrder.orderNo && !this.isPaymentCancel(err) && typeof api.sendPayReminder === 'function') {
          api.sendPayReminder(currentOrder.orderNo, this.getPayFailContent(err)).catch(() => {});
        }
        this.showPayFail(err);
      })
      .finally(() => {
        this.setData({ paying: false });
      });
  }
});

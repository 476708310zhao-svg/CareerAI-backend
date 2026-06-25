// utils/vip.js - unified VIP state and permission helpers
const featureFlags = require('./feature-flags.js');

const STORAGE_KEY = 'vipInfo';
const VIP_URL = '/package-user/pages/vip/vip';

function isDateActive(expireDate) {
  if (!expireDate) return true;
  const today = new Date();
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
  return String(expireDate).slice(0, 10) >= todayStr;
}

function normalizeInfo(info, userInfo) {
  const vipInfo = info || {};
  const profile = userInfo || {};
  const expireDate = vipInfo.expireDate || profile.vipExpiresAt || profile.vip_expires_at || '';
  const localVip = !!vipInfo.isVip && isDateActive(expireDate);
  const userVip = Number(profile.vipLevel || profile.vip_level || 0) > 0 && isDateActive(expireDate);

  if (!localVip && vipInfo.isVip && expireDate && !isDateActive(expireDate)) {
    wx.setStorageSync(STORAGE_KEY, Object.assign({}, vipInfo, { isVip: false }));
  }

  return {
    isVip: localVip || userVip,
    planName: vipInfo.planName || profile.vipPlanName || '',
    expireDate,
    purchaseDate: vipInfo.purchaseDate || ''
  };
}

function getInfo() {
  const vipInfo = wx.getStorageSync(STORAGE_KEY) || {};
  const userInfo = wx.getStorageSync('userInfo') || {};
  return normalizeInfo(vipInfo, userInfo);
}

function isVip() {
  return getInfo().isVip === true;
}

function isMembershipEnabled() {
  return featureFlags.isMembershipEnabled();
}

function goVip() {
  if (!featureFlags.allowNavigation(VIP_URL)) return;
  wx.navigateTo({ url: VIP_URL });
}

function check(featureName, options) {
  if (isVip()) return true;
  if (!isMembershipEnabled()) {
    wx.showToast({ title: '该功能暂未开放', icon: 'none' });
    return false;
  }
  const opts = options || {};
  wx.showModal({
    title: opts.title || '求职会员权益',
    content: opts.content || ((featureName || '该功能') + '属于求职会员权益，可先查看会员能力说明。'),
    confirmText: opts.confirmText || '查看权益',
    cancelText: opts.cancelText || '稍后',
    success: (res) => {
      if (res.confirm) goVip();
    }
  });
  return false;
}

function checkDailyLimit(key, freeLimit, featureName) {
  if (isVip()) return true;
  const today = new Date().toISOString().slice(0, 10);
  const record = wx.getStorageSync('dailyLimit_' + key) || {};
  const count = Number(record.count || 0);

  if (record.date !== today) {
    wx.setStorageSync('dailyLimit_' + key, { date: today, count: 1 });
    return true;
  }

  if (count >= freeLimit) {
    if (!isMembershipEnabled()) {
      wx.showToast({ title: '今日免费次数已用完', icon: 'none' });
      return false;
    }
    wx.showModal({
      title: '已达今日上限',
      content: '免费用户每日可使用 ' + freeLimit + ' 次' + (featureName || '') + '。查看求职会员权益，可了解更多使用额度和进阶能力。',
      confirmText: '查看权益',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) goVip();
      }
    });
    return false;
  }

  record.count = count + 1;
  wx.setStorageSync('dailyLimit_' + key, record);
  return true;
}

module.exports = { getInfo, isVip, isMembershipEnabled, check, checkDailyLimit, goVip };

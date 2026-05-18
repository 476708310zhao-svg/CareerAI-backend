// utils/vip.js - unified VIP state and permission helpers
const STORAGE_KEY = 'vipInfo';
const VIP_URL = '/package-user/pages/vip/vip';

function isDateActive(expireDate) {
  return !expireDate || new Date(expireDate) > new Date();
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

function goVip() {
  wx.navigateTo({ url: VIP_URL });
}

function check(featureName, options) {
  if (isVip()) return true;
  const opts = options || {};
  wx.showModal({
    title: opts.title || 'VIP 专属功能',
    content: opts.content || ((featureName || '该功能') + '需要开通 VIP 会员才能使用'),
    confirmText: opts.confirmText || '去开通',
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

  if (record.date !== today) {
    wx.setStorageSync('dailyLimit_' + key, { date: today, count: 1 });
    return true;
  }

  if (record.count >= freeLimit) {
    wx.showModal({
      title: '已达今日上限',
      content: '免费用户每日可使用 ' + freeLimit + ' 次' + (featureName || '') + '，开通 VIP 无限使用',
      confirmText: '去开通',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) goVip();
      }
    });
    return false;
  }

  record.count++;
  wx.setStorageSync('dailyLimit_' + key, record);
  return true;
}

module.exports = { getInfo, isVip, check, checkDailyLimit, goVip };

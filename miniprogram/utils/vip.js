// utils/vip.js - VIP 权限检查工具
const STORAGE_KEY = 'vipInfo';

// 获取 VIP 信息
function getInfo() {
  const info = wx.getStorageSync(STORAGE_KEY);
  if (!info || !info.isVip) return { isVip: false };
  // 检查是否过期
  if (info.expireDate && new Date(info.expireDate) < new Date()) {
    info.isVip = false;
    wx.setStorageSync(STORAGE_KEY, info);
    return { isVip: false, expired: true };
  }
  return info;
}

// 是否是 VIP
function isVip() {
  return getInfo().isVip === true;
}

// 权限检查 — 未开通 VIP 时弹提示并跳转
function check(featureName) {
  if (isVip()) return true;
  wx.showModal({
    title: 'VIP 专属功能',
    content: (featureName || '该功能') + '需要开通 VIP 会员才能使用',
    confirmText: '去开通',
    success: (res) => {
      if (res.confirm) {
        wx.navigateTo({ url: '/pages/vip/vip' });
      }
    }
  });
  return false;
}

// 每日次数限制检查（非 VIP 限制次数）
function checkDailyLimit(key, freeLimit, featureName) {
  if (isVip()) return true;
  const today = new Date().toISOString().slice(0, 10);
  const record = wx.getStorageSync('dailyLimit_' + key) || {};
  if (record.date !== today) {
    // 新的一天，重置
    wx.setStorageSync('dailyLimit_' + key, { date: today, count: 1 });
    return true;
  }
  if (record.count >= freeLimit) {
    wx.showModal({
      title: '已达今日上限',
      content: '免费用户每日可使用 ' + freeLimit + ' 次' + (featureName || '') + '，开通 VIP 无限使用',
      confirmText: '去开通',
      success: (res) => {
        if (res.confirm) wx.navigateTo({ url: '/pages/vip/vip' });
      }
    });
    return false;
  }
  record.count++;
  wx.setStorageSync('dailyLimit_' + key, record);
  return true;
}

module.exports = { getInfo, isVip, check, checkDailyLimit };

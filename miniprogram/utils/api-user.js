// utils/api-user.js
// 用户认证、个人信息、投递记录模块

const { request, post, put } = require('./api-client.js');

function isVipActive(vipLevel, expireDate) {
  if (Number(vipLevel || 0) <= 0) return false;
  if (!expireDate) return true;
  const today = new Date();
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
  return String(expireDate).slice(0, 10) >= todayStr;
}

function syncVipSession(user) {
  const u = user || {};
  const vipLevel = u.vipLevel || u.vip_level || 0;
  const expireDate = u.vipExpiresAt || u.vip_expires_at || '';
  const current = wx.getStorageSync('vipInfo') || {};

  if (isVipActive(vipLevel, expireDate)) {
    wx.setStorageSync('vipInfo', Object.assign({}, current, {
      isVip: true,
      planName: current.planName || 'VIP',
      expireDate,
      purchaseDate: current.purchaseDate || ''
    }));
  } else if (current.isVip) {
    wx.setStorageSync('vipInfo', Object.assign({}, current, { isVip: false }));
  }
}

function persistUserSession(user) {
  const u = user || {};
  const profile = {
    nickName:  u.nickname  || '微信用户',
    avatarUrl: u.avatar    || '/images/default-avatar.png',
    school:    (u.education && u.education.school) || '',
    major:     (u.education && u.education.major)  || '',
    userId:    u.id,
    openid:    u.openid
  };
  wx.setStorageSync('userProfile', profile);
  wx.setStorageSync('userInfo', Object.assign({}, wx.getStorageSync('userInfo') || {}, u, {
    vipLevel:     u.vipLevel || u.vip_level || 0,
    vip_level:    u.vip_level || u.vipLevel || 0,
    vipExpiresAt: u.vipExpiresAt || u.vip_expires_at || '',
    vip_expires_at: u.vip_expires_at || u.vipExpiresAt || ''
  }));
  syncVipSession(u);
  return profile;
}

/**
 * 微信登录：wx.login → code → 后端 → JWT token
 * 成功后自动将 token 和 userProfile 存入 Storage
 */
function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) return reject(new Error('wx.login 失败'));
        post({
          path: '/api/users/login',
          body: { code: loginRes.code },
          skipAuth: true
        }).then(res => {
          if (res.code === 0 && res.data) {
            wx.setStorageSync('token', res.data.token);
            persistUserSession(res.data.user);
            resolve(res.data);
          } else {
            reject(new Error(res.message || '登录失败'));
          }
        }).catch(reject);
      },
      fail: (err) => reject(new Error('wx.login 调用失败: ' + JSON.stringify(err)))
    });
  });
}

function updateUserProfileRemote(nickname, avatar) {
  return post({ path: '/api/users/update-profile', body: { nickname, avatar } });
}

function getUserProfile() {
  return request({ path: '/api/users/profile', noCache: true });
}

function updateUserDetail(data) {
  return put({ path: '/api/users/profile', body: data });
}

/**
 * 手机号登录
 * phoneCode: from getPhoneNumber button event
 * loginCode: from wx.login(), for openid binding
 */
function phoneLogin(phoneCode, loginCode) {
  return post({
    path: '/api/users/phone-login',
    body: { phoneCode, loginCode },
    skipAuth: true
  }).then(res => {
    if (res.code === 0 && res.data) {
      wx.setStorageSync('token', res.data.token);
      persistUserSession(res.data.user);
      return res.data;
    }
    throw new Error(res.message || '手机号登录失败');
  });
}

function getApplications() {
  return request({ path: '/api/applications' });
}

module.exports = { login, phoneLogin, getUserProfile, updateUserProfileRemote, updateUserDetail, getApplications, persistUserSession };

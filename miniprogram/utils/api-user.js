// utils/api-user.js
// 用户认证、个人信息、投递记录模块

const { request, post, put } = require('./api-client.js');

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
            const u = res.data.user;
            const profile = {
              nickName:  u.nickname  || '微信用户',
              avatarUrl: u.avatar    || '/images/default-avatar.png',
              school:    (u.education && u.education.school) || '',
              major:     (u.education && u.education.major)  || '',
              userId:    u.id,
              openid:    u.openid
            };
            wx.setStorageSync('userProfile', profile);
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
  return request({ path: '/api/users/profile' });
}

function updateUserDetail(data) {
  return put({ path: '/api/users/profile', body: data });
}

function getApplications() {
  return request({ path: '/api/applications' });
}

module.exports = { login, getUserProfile, updateUserProfileRemote, updateUserDetail, getApplications };

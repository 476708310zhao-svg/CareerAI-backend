// pages/auth/auth.js
const api = require('../../utils/api.js');

Page({
  data: {
    agreed: false,
    loadingWechat: false,
    loadingPhone: false,
    shakeCheckbox: false,
    statusBarHeight: 44,
  },

  onLoad(options) {
    // Already logged in — skip auth page
    const token = wx.getStorageSync('token');
    if (token) {
      this._navigateAfterLogin();
      return;
    }
    // Store redirect target if launched from a protected page
    this._redirectUrl = options.redirect || '';

    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 44 });
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  onPrivacyTap() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  // Tapping disabled button area — remind user to agree first
  onUnagreedTap() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议', icon: 'none', duration: 1500 });
      this.setData({ shakeCheckbox: true });
      setTimeout(() => this.setData({ shakeCheckbox: false }), 500);
    }
  },

  // ── 微信一键登录 ─────────────────────────────────────────────────
  async onWechatLogin() {
    if (!this.data.agreed) return;
    if (this.data.loadingWechat || this.data.loadingPhone) return;

    this.setData({ loadingWechat: true });
    try {
      const data = await api.login();
      this._onLoginSuccess(data);
    } catch (err) {
      wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loadingWechat: false });
    }
  },

  // ── 手机号快捷登录 ────────────────────────────────────────────────
  async onGetPhoneNumber(e) {
    // User cancelled or error
    if (!e.detail.code) {
      if (e.detail.errno && e.detail.errno !== 0) {
        wx.showToast({ title: '已取消手机号授权', icon: 'none' });
      }
      return;
    }

    this.setData({ loadingPhone: true });
    try {
      // Get login code for openid binding
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });
      if (!loginRes.code) throw new Error('wx.login 失败');

      const data = await api.phoneLogin(e.detail.code, loginRes.code);
      this._onLoginSuccess(data);
    } catch (err) {
      wx.showToast({ title: err.message || '手机号登录失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loadingPhone: false });
    }
  },

  // ── 登录成功处理 ──────────────────────────────────────────────────
  _onLoginSuccess(data) {
    const app = getApp();
    app.globalData.isLoggedIn = true;
    app.globalData.needsAuth = false;
    app.refreshGlobalData();

    // Fire pending login callbacks registered by other pages
    if (app._loginCallbacks && app._loginCallbacks.length) {
      app._loginCallbacks.forEach(cb => { try { cb(null, data); } catch (e) {} });
      app._loginCallbacks = [];
    }

    wx.showToast({ title: '登录成功', icon: 'success', duration: 800 });
    setTimeout(() => this._navigateAfterLogin(), 600);
  },

  _navigateAfterLogin() {
    if (this._redirectUrl) {
      wx.redirectTo({ url: this._redirectUrl });
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  }
});

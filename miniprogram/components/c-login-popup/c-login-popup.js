// components/c-login-popup/c-login-popup.js
const api = require('../../utils/api.js');

Component({
  properties: {
    show:     { type: Boolean, value: false },
    // 父页面可自定义副标题，例如"投递职位需要先登录"
    subtitle: { type: String, value: '登录后解锁全部求职功能' }
  },

  data: {
    agreed:        false,
    loadingWechat: false,
    loadingPhone:  false,
    wechatPrivacyReady: true,
    privacyContractName: '《职引隐私保护指引》',
  },

  observers: {
    'show': function(val) {
      if (val) {
        this.setData({ loadingWechat: false, loadingPhone: false });
        this.checkWechatPrivacySetting();
      }
    }
  },

  methods: {
    onBackdropTap() {
      this.triggerEvent('close');
    },

    onSheetTap() {},

    toggleAgree() {
      this.setData({ agreed: !this.data.agreed });
    },

    checkWechatPrivacySetting() {
      if (!wx.getPrivacySetting) return;
      wx.getPrivacySetting({
        success: (res) => {
          this.setData({
            wechatPrivacyReady: !res.needAuthorization,
            privacyContractName: res.privacyContractName || '《职引隐私保护指引》'
          });
        }
      });
    },

    onAgreeWechatPrivacy() {
      this.setData({ wechatPrivacyReady: true });
      wx.showToast({ title: '已同意隐私授权', icon: 'none' });
    },

    onOpenWechatPrivacy() {
      if (!wx.openPrivacyContract) return;
      wx.openPrivacyContract({
        fail: () => wx.showToast({ title: '请稍后重试', icon: 'none' })
      });
    },

    onPrivacyTap() {
      wx.navigateTo({ url: '/pages/privacy/privacy' });
    },

    // 未勾选协议时点击按钮区域给出提示
    onUnagreedTap() {
      if (!this.data.agreed) {
        wx.showToast({ title: '请先同意用户协议', icon: 'none', duration: 1500 });
      } else if (!this.data.wechatPrivacyReady) {
        wx.showToast({ title: '请先同意微信隐私授权', icon: 'none', duration: 1500 });
      }
    },

    // ── 微信一键登录 ─────────────────────────────────────────────────
    async onWechatLogin() {
      if (!this.data.agreed || !this.data.wechatPrivacyReady) {
        this.onUnagreedTap();
        return;
      }
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

    // ── 手机号快速验证 ────────────────────────────────────────────────
    // open-type="getPhoneNumber" 触发，e.detail.code 为临时授权码
    // 参考：https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/getPhoneNumber.html
    async onGetPhoneNumber(e) {
      if (!this.data.agreed || !this.data.wechatPrivacyReady) {
        this.onUnagreedTap();
        return;
      }
      if (!e.detail.code) {
        wx.showToast({ title: '已取消手机号授权', icon: 'none' });
        return;
      }

      this.setData({ loadingPhone: true });
      try {
        // 获取 loginCode 用于绑定 openid
        const loginRes = await new Promise((resolve, reject) => {
          wx.login({ success: resolve, fail: reject });
        });
        if (!loginRes.code) throw new Error('wx.login 失败');

        const data = await api.phoneLogin(e.detail.code, loginRes.code);
        this._onLoginSuccess(data);
      } catch (err) {
        wx.showToast({ title: err.message || '验证失败，请重试', icon: 'none' });
      } finally {
        this.setData({ loadingPhone: false });
      }
    },

    // ── 登录成功 ──────────────────────────────────────────────────────
    _onLoginSuccess(data) {
      const app = getApp();
      app.globalData.isLoggedIn = true;
      app.refreshGlobalData();

      if (app._loginCallbacks && app._loginCallbacks.length) {
        app._loginCallbacks.forEach(cb => { try { cb(null, data); } catch (e) {} });
        app._loginCallbacks = [];
      }

      wx.showToast({ title: '登录成功', icon: 'success', duration: 800 });
      const profile = app.globalData.userProfile || {};
      setTimeout(() => {
        this.triggerEvent('success', { profile });
        this.triggerEvent('close');
      }, 600);
    }
  }
});

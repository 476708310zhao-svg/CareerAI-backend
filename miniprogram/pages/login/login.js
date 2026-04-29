const api = require('../../utils/api.js');

Page({
  data: {
    avatarUrl: '/images/default-avatar.png',
    nickname: '',
    loading: false
  },

  onLoad() {
    // 预填已有 profile
    const profile = wx.getStorageSync('userProfile');
    if (profile) {
      this.setData({
        avatarUrl: profile.avatarUrl || '/images/default-avatar.png',
        nickname: profile.nickName && profile.nickName !== '微信用户' ? profile.nickName : ''
      });
    }
    // 确保有 token（app 启动时静默登录已处理，这里兜底）
    if (!wx.getStorageSync('token')) {
      api.login().catch(err => console.warn('[login page] 静默登录失败:', err.message));
    }
  },

  // 用户点击头像按钮 (open-type="chooseAvatar")
  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl });
  },

  // 昵称输入 (type="nickname" 微信原生昵称选择器)
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onNicknameBlur(e) {
    this.setData({ nickname: e.detail.value });
  },

  onConfirm() {
    if (this.data.loading) return;

    const nickname = this.data.nickname.trim();
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    // 检查 token，没有则先登录
    const doSave = () => {
      const existing = wx.getStorageSync('userProfile') || {};
      const profile = Object.assign({}, existing, {
        nickName: nickname,
        avatarUrl: this.data.avatarUrl
      });
      wx.setStorageSync('userProfile', profile);

      // 同步到服务端（后台静默，不阻塞 UI）
      api.updateUserProfileRemote(nickname, this.data.avatarUrl).catch(err => {
        console.warn('[login] 同步头像昵称失败:', err.message);
      });

      getApp().refreshGlobalData();
      this.setData({ loading: false });
      wx.showToast({ title: '登录成功', icon: 'success' });

      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          wx.navigateBack();
        } else {
          wx.switchTab({ url: '/pages/profile/profile' });
        }
      }, 600);
    };

    this.setData({ loading: true });

    const token = wx.getStorageSync('token');
    if (token) {
      doSave();
    } else {
      api.login().then(() => doSave()).catch(err => {
        this.setData({ loading: false });
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
        console.error('[login] 登录失败:', err.message);
      });
    }
  },

  goToPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  }
});

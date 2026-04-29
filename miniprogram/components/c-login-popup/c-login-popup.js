const api = require('../../utils/api.js');

Component({
  properties: {
    show: { type: Boolean, value: false }
  },

  data: {
    avatarUrl: '/images/default-avatar.png',
    nickname: '',
    loading: false
  },

  observers: {
    // 每次弹窗打开时预填已有信息
    'show': function (val) {
      if (!val) return;
      const profile = wx.getStorageSync('userProfile');
      this.setData({
        avatarUrl: (profile && profile.avatarUrl) || '/images/default-avatar.png',
        nickname: (profile && profile.nickName && profile.nickName !== '微信用户')
          ? profile.nickName : ''
      });
      // 确保有 token
      if (!wx.getStorageSync('token')) {
        api.login().catch(err => console.warn('[c-login-popup] 静默登录失败:', err.message));
      }
    }
  },

  methods: {
    onBackdropTap() {
      this.triggerEvent('close');
    },

    // 阻止点击内容区冒泡关闭
    onSheetTap() {},

    onChooseAvatar(e) {
      this.setData({ avatarUrl: e.detail.avatarUrl });
    },

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

      this.setData({ loading: true });

      const doSave = () => {
        const existing = wx.getStorageSync('userProfile') || {};
        const profile = Object.assign({}, existing, {
          nickName: nickname,
          avatarUrl: this.data.avatarUrl
        });
        wx.setStorageSync('userProfile', profile);

        api.updateUserProfileRemote(nickname, this.data.avatarUrl)
          .catch(err => console.warn('[c-login-popup] 同步失败:', err.message));

        getApp().refreshGlobalData();
        this.setData({ loading: false });
        wx.showToast({ title: '登录成功', icon: 'success' });

        setTimeout(() => {
          this.triggerEvent('success', { profile });
          this.triggerEvent('close');
        }, 600);
      };

      const token = wx.getStorageSync('token');
      if (token) {
        doSave();
      } else {
        api.login()
          .then(() => doSave())
          .catch(err => {
            this.setData({ loading: false });
            wx.showToast({ title: '登录失败，请重试', icon: 'none' });
            console.error('[c-login-popup] 登录失败:', err.message);
          });
      }
    }
  }
});

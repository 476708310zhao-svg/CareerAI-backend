const DEFAULT_SUBTITLE = '登录后解锁完整求职功能';

function hasToken() {
  try {
    return !!wx.getStorageSync('token');
  } catch (error) {
    return false;
  }
}

module.exports = Behavior({
  data: {
    authPromptVisible: false,
    authPromptSubtitle: DEFAULT_SUBTITLE
  },

  methods: {
    ensureAuthenticated(subtitle, onSuccess) {
      if (hasToken()) {
        if (typeof onSuccess === 'function') onSuccess.call(this);
        return true;
      }

      this._pendingAuthenticatedAction = typeof onSuccess === 'function' ? onSuccess : null;
      this.setData({
        authPromptVisible: true,
        authPromptSubtitle: subtitle || DEFAULT_SUBTITLE
      });
      return false;
    },

    openAuthPrompt(event) {
      const dataset = event && event.currentTarget && event.currentTarget.dataset;
      this.ensureAuthenticated(dataset && dataset.loginSubtitle);
    },

    closeAuthPrompt() {
      this._pendingAuthenticatedAction = null;
      this.setData({ authPromptVisible: false });
    },

    onAuthPromptSuccess(event) {
      const action = this._pendingAuthenticatedAction;
      this._pendingAuthenticatedAction = null;
      this.setData({ authPromptVisible: false });
      if (typeof action === 'function') {
        setTimeout(() => action.call(this, event), 0);
      }
    }
  }
});

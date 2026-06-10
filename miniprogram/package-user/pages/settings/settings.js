// pages/settings/settings.js
Page({
  data: {
    version: '1.0.0',
    pushEnabled: true,
    darkMode: false,
    cacheSize: '0KB'
  },

  onLoad() {
    this.loadSettings();
  },

  onShow() {
    this.calcCacheSize();
  },

  loadSettings() {
    const settings = wx.getStorageSync('appSettings') || {};
    this.setData({
      pushEnabled: settings.pushEnabled !== false,
      darkMode: settings.darkMode === true
    });
    this.calcCacheSize();
  },

  calcCacheSize() {
    try {
      const info = wx.getStorageInfoSync();
      const sizeKB = info.currentSize || 0;
      this.setData({ cacheSize: sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + 'MB' : sizeKB + 'KB' });
    } catch (e) {
      this.setData({ cacheSize: '未知' });
    }
  },

  togglePush(e) {
    this.setData({ pushEnabled: e.detail.value }, () => {
      this.saveSettings();
      wx.showToast({ title: this.data.pushEnabled ? '已开启推送' : '已关闭推送', icon: 'none' });
    });
  },

  toggleDarkMode(e) {
    this.setData({ darkMode: e.detail.value }, () => {
      this.saveSettings();
      wx.showToast({ title: '将在下次启动时生效', icon: 'none' });
    });
  },

  saveSettings() {
    wx.setStorageSync('appSettings', {
      pushEnabled: this.data.pushEnabled,
      darkMode: this.data.darkMode
    });
  },

  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '将清除搜索历史、浏览记录等缓存数据，不会影响收藏、简历和个人信息。',
      confirmText: '清除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.removeStorageSync('searchHistory');
        wx.removeStorageSync('viewHistory');
        wx.removeStorageSync('recentSearches');
        this.calcCacheSize();
        wx.showToast({ title: '清除成功', icon: 'success' });
      }
    });
  },

  goToFeedback() { wx.navigateTo({ url: '/package-user/pages/feedback/feedback' }); },
  goToAbout() { wx.navigateTo({ url: '/package-user/pages/about/about' }); },
  goToPrivacy() { wx.navigateTo({ url: '/pages/privacy/privacy' }); },

  openWechatPrivacy() {
    if (!wx.openPrivacyContract) {
      wx.showToast({ title: '当前微信版本暂不支持打开隐私指引', icon: 'none' });
      return;
    }
    wx.openPrivacyContract({
      fail: () => wx.showToast({ title: '请稍后重试', icon: 'none' })
    });
  },

  requestDataDeletion() {
    wx.showModal({
      title: '账号与数据处理',
      content: '如需申请账号注销、个人信息删除或导出，请通过意见反馈提交，或发送邮件至 476708310@qq.com。我们会在核验身份后处理。',
      confirmText: '去反馈',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm) this.goToFeedback();
      }
    });
  }
});

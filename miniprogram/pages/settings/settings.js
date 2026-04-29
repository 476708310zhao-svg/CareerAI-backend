// pages/settings/settings.js
const Toast  = require('tdesign-miniprogram/toast/index');
const Dialog = require('tdesign-miniprogram/dialog/index');

Page({
  data: {
    pushEnabled: true,
    darkMode: false,
    cacheSize: '0KB',
    switchColors: ['#2B5CE6', '#E5E7EB']
  },

  onLoad() {
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
    this.setData({ pushEnabled: e.detail.value });
    this.saveSettings();
  },

  toggleDarkMode(e) {
    this.setData({ darkMode: e.detail.value });
    this.saveSettings();
    Toast({ context: this, selector: '#t-toast', message: '将在重启后生效', theme: 'default', direction: 'column' });
  },

  saveSettings() {
    wx.setStorageSync('appSettings', {
      pushEnabled: this.data.pushEnabled,
      darkMode: this.data.darkMode
    });
  },

  clearCache() {
    Dialog.confirm({
      context: this,
      selector: '#t-dialog',
      title: '清除缓存',
      content: '将清除搜索历史、浏览记录等缓存数据，不会影响收藏和个人信息',
      confirmBtn: { content: '清除', theme: 'danger' }
    }).then(() => {
      wx.removeStorageSync('searchHistory');
      wx.removeStorageSync('viewHistory');
      this.calcCacheSize();
      Toast({ context: this, selector: '#t-toast', message: '清除成功', theme: 'success', direction: 'column' });
    }).catch(() => {});
  },

  goToFeedback() { wx.navigateTo({ url: '/pages/feedback/feedback' }); },
  goToAbout()    { wx.navigateTo({ url: '/pages/about/about' }); },
  goToPrivacy()  { wx.navigateTo({ url: '/pages/privacy/privacy' }); }
});

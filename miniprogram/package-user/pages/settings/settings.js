// pages/settings/settings.js
const browseHistory = require('../../../utils/browse-history.js');
const apiClient = require('../../../utils/api-client.js');
const analytics = require('../../../utils/analytics.js');

function removeStorageByPrefix(prefix) {
  try {
    const info = wx.getStorageInfoSync();
    (info.keys || []).forEach(key => {
      if (String(key).indexOf(prefix) === 0) wx.removeStorageSync(key);
    });
  } catch (e) {}
}

function clearLocalCareerData() {
  [
    'localApplications',
    'applicationMaterials',
    'jdMatchReports',
    'interviewHistory',
    'bookmarkedQuestions',
    'lastAiReport',
    'audioReviewHistory',
    'projectReviewHistory',
    'dailyBriefCache',
    'interviewMistakeNotebook',
    'dailyPracticeQuestions'
  ].forEach(key => {
    try { wx.removeStorageSync(key); } catch (e) {}
  });
  removeStorageByPrefix('aiReport_');
}

function clearLocalResumeData() {
  ['onlineResume', 'resumeFiles'].forEach(key => {
    try { wx.removeStorageSync(key); } catch (e) {}
  });
}

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
        wx.removeStorageSync('jobSearchHistory');
        browseHistory.clear();
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
      content: '你可以在本页自助删除 AI记录、语音记录、面试报告、进度、简历和申请材料。交易记录等依法需要留存的信息不会在这里删除。',
      confirmText: '知道了',
      showCancel: false,
    });
  },

  clearAiLocalRecords() {
    wx.showModal({
      title: '删除本机 AI 记录',
      content: '将删除本机 AI 对话缓存、面试历史、面试报告、错题收藏、语音复盘和每日简报缓存，不影响账号登录。',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        clearLocalCareerData();
        this.calcCacheSize();
        analytics.track('privacy_clear_local_ai_records');
        wx.showToast({ title: '已删除本机记录', icon: 'success' });
      }
    });
  },

  deleteServerData() {
    if (!wx.getStorageSync('token')) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '清空服务端数据',
      content: '将删除服务端保存的简历、PDF简历、求职进度、收藏、提醒、申请材料、JD匹配报告、题库错题和站内消息。账号仍会保留。',
      confirmText: '清空',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        apiClient._write({
          method: 'DELETE',
          path: '/api/users/me/data',
          timeout: 20000
        }).then(() => {
          clearLocalCareerData();
          clearLocalResumeData();
          analytics.track('privacy_delete_server_data');
          wx.showToast({ title: '已清空个人数据', icon: 'success' });
          this.calcCacheSize();
        }).catch(err => {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        });
      }
    });
  },

  deleteAccount() {
    if (!wx.getStorageSync('token')) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '注销账号',
      content: '注销后将删除账号和个人业务数据，且无法恢复。确认继续吗？',
      confirmText: '继续注销',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showModal({
          title: '最终确认',
          content: '请再次确认：注销账号后需要重新注册才能使用。',
          confirmText: '确认注销',
          confirmColor: '#ef4444',
          success: (finalRes) => {
            if (!finalRes.confirm) return;
            apiClient._write({
              method: 'DELETE',
              path: '/api/users/me',
              timeout: 20000
            }).then(() => {
              analytics.track('privacy_delete_account');
              clearLocalCareerData();
              clearLocalResumeData();
              wx.removeStorageSync('token');
              wx.removeStorageSync('userProfile');
              wx.showToast({ title: '账号已注销', icon: 'success' });
              setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 800);
            }).catch(err => {
              wx.showToast({ title: err.message || '注销失败', icon: 'none' });
            });
          }
        });
      }
    });
  }
});

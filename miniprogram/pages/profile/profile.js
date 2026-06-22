// pages/profile/profile.js
const favUtil = require('../../utils/favorites.js');
const api     = require('../../utils/api.js');
const browseHistory = require('../../utils/browse-history.js');

Page({
  data: {
    userInfo: {
      nickName: '未登录用户',
      avatarUrl: '/images/default-avatar.png',
      school: '点击登录',
      major: '完善信息获取精准推荐'
    },
    stats: {
      applications: 0,
      favorites: 0,
      interviews: 0,
      viewed: 0
    },
    isLogin: false,
    isVip: false,
    showLoginPopup: false
  },

  onLoad() {
    this.loadUserInfo();
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.syncCustomTabBar === 'function') app.syncCustomTabBar();
    this.loadUserInfo();
    this.updateStats();
    this._syncMessageBadge();
    clearTimeout(this._profileSyncTimer);
    this._profileSyncTimer = setTimeout(() => this._refreshRemoteStats(), 160);
  },

  onUnload() {
    clearTimeout(this._profileSyncTimer);
  },

  _refreshRemoteStats() {
    favUtil.syncFromServer().then(() => {
      this.updateStats();
    });
  },

  // 同步消息未读角标到 TabBar
  _syncMessageBadge() {
    const count = wx.getStorageSync('unreadMessages') || 0;
    getApp().setUnreadCount(count);
  },

  loadUserInfo() {
    const cachedUser = wx.getStorageSync('userProfile');
    const vipInfo = wx.getStorageSync('vipInfo') || {};
    const isVip = !!(vipInfo.isVip && vipInfo.expireDate && new Date(vipInfo.expireDate) > new Date());

    if (cachedUser) {
      this.setData({
        isLogin: true,
        isVip,
        userInfo: cachedUser
      });
    } else {
      this.setData({
        isLogin: false,
        userInfo: {
          nickName: '未登录用户',
          avatarUrl: '/images/default-avatar.png',
          school: '点击登录',
          major: '完善信息获取精准推荐'
        }
      });
    }
  },

  // 动态计算统计数据
  updateStats() {
    const favCount = favUtil.getCount();
    const interviewHistory = wx.getStorageSync('interviewHistory') || [];
    const viewHistory = browseHistory.getList();
    const applications = wx.getStorageSync('localApplications') || [];

    this.setData({
      stats: {
        applications: applications.length,
        favorites: favCount,
        interviews: interviewHistory.length,
        viewed: viewHistory.length
      }
    });
  },

  goToEditProfile() {
    wx.navigateTo({ url: '/package-user/pages/profile-edit/profile-edit' });
  },

  onLogin() {
    this.setData({ showLoginPopup: true });
  },

  onLoginPopupClose() {
    this.setData({ showLoginPopup: false });
  },

  onLoginSuccess(e) {
    const { profile } = e.detail;
    const nickName = profile.nickName || '';
    this.setData({
      isLogin: true,
      userInfo: {
        nickName:  nickName || '微信用户',
        avatarUrl: profile.avatarUrl || '/images/default-avatar.png',
        school:    (profile.education && profile.education.school) || '',
        major:     (profile.education && profile.education.major)  || ''
      }
    });
    this.updateStats();
    favUtil.syncFromServer().then(() => this.updateStats());

    // 昵称是默认值说明是新用户或未完善资料，自动跳转完善页
    const isDefaultNick = !nickName || nickName === '微信用户';
    if (isDefaultNick) {
      setTimeout(() => {
        wx.navigateTo({ url: '/package-user/pages/profile-edit/profile-edit?fromLogin=1' });
      }, 900);
    }
  },

  goToApplications() {
    wx.navigateTo({ url: '/package-user/pages/applications/applications' });
  },

  goToResumes() {
    wx.navigateTo({
      url: '/package-career/pages/resume/resume',
      fail: () => wx.showToast({ title: '请先创建 resume 页面', icon: 'none' })
    });
  },

  goToAIInterview() {
    wx.navigateTo({
      url: '/package-ai/pages/ai-history/ai-history',
      fail: () => wx.showToast({ title: '请先创建 ai-history 页面', icon: 'none' })
    });
  },

  goToMyExperiences() {
    wx.navigateTo({
      url: '/package-user/pages/my-experiences/my-experiences',
      fail: () => wx.showToast({ title: '请先创建 my-experiences 页面', icon: 'none' })
    });
  },

  goToVip() {
    wx.navigateTo({
      url: '/package-user/pages/vip/vip',
      fail: (err) => {
        console.error(err);
        wx.showToast({ title: '页面跳转失败', icon: 'none' });
      }
    });
  },

  goToFavorites() { wx.navigateTo({ url: '/package-user/pages/favorites/favorites' }); },
  goToMessages()  { wx.navigateTo({ url: '/package-user/pages/messages/messages' }); },
  goToInterviews(){ wx.navigateTo({ url: '/package-ai/pages/ai-history/ai-history', fail: () => wx.showToast({ title: '请先创建 ai-history 页面', icon: 'none' }) }); },
  goToSettings()  { wx.navigateTo({ url: '/package-user/pages/settings/settings' }); },
  goToFeedback()  { wx.navigateTo({ url: '/package-user/pages/feedback/feedback' }); },
  goToAbout()     { wx.navigateTo({ url: '/package-user/pages/about/about' }); },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需重新登录才能使用完整功能',
      confirmText: '退出',
      confirmColor: '#EF4444',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        wx.removeStorageSync('token');
        wx.removeStorageSync('userProfile');
        wx.removeStorageSync('vipInfo');
        wx.removeStorageSync('userVipInfo');
        const app = getApp();
        app.globalData.isLoggedIn  = false;
        app.globalData.userProfile = null;
        app.globalData.vipInfo     = null;
        app.refreshGlobalData();
        this.loadUserInfo();
        this.updateStats();
      }
    });
  }
});

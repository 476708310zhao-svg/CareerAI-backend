// pages/profile/profile.js
const favUtil = require('../../utils/favorites.js');
const progress = require('../../utils/job-progress.js');
const appMaterials = require('../../utils/application-materials.js');
const notebook = require('../../utils/interview-notebook.js');
const api     = require('../../utils/api.js');
const browseHistory = require('../../utils/browse-history.js');
const featureFlags = require('../../utils/feature-flags.js');
const vipUtil = require('../../utils/vip.js');
const navigation = require('../../utils/navigation.js');

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
      dueSoon: 0,
      favorites: 0,
      interviews: 0,
      viewed: 0,
      materials: 0,
      notebook: 0
    },
    isLogin: false,
    isVip: false,
    vipInfo: {
      planName: '',
      expireDate: ''
    },
    showLoginPopup: false,
    recruitmentEnabled: true,
    membershipEnabled: false
  },

  onLoad() {
    this._applyFeatureFlags(featureFlags.getCurrentFlags());
    this.loadUserInfo();
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.syncCustomTabBar === 'function') app.syncCustomTabBar();
    this.loadUserInfo();
    this.updateStats();
    this._syncMessageBadge();
    this.refreshUserSession();
    clearTimeout(this._profileSyncTimer);
    this._profileSyncTimer = setTimeout(() => this._refreshRemoteStats(), 160);
    featureFlags.refreshFeatureFlags();
  },

  _applyFeatureFlags(flags) {
    this.setData({
      recruitmentEnabled: !!(flags && flags.recruitment),
      membershipEnabled: !!(flags && flags.membership)
    });
  },

  _onFeatureFlagsChange(flags) {
    this._applyFeatureFlags(flags);
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
    const vipInfo = vipUtil.getInfo();
    const isVip = vipInfo.isVip;

    if (cachedUser) {
      this.setData({
        isLogin: true,
        isVip,
        vipInfo,
        userInfo: cachedUser
      });
    } else {
      this.setData({
        isLogin: false,
        isVip: false,
        vipInfo: {
          planName: '',
          expireDate: ''
        },
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
  refreshUserSession() {
    if (!wx.getStorageSync('token') || typeof api.getUserProfile !== 'function') return;
    api.getUserProfile()
      .then(res => {
        const user = res && res.code === 0 ? res.data : (res && res.id ? res : null);
        if (!user || typeof api.persistUserSession !== 'function') return;
        api.persistUserSession(user);
        const app = getApp();
        if (app && typeof app.refreshGlobalData === 'function') app.refreshGlobalData();
        this.loadUserInfo();
      })
      .catch(() => {});
  },

  updateStats() {
    const favorites = favUtil.getAll();
    const favCount = this.data.recruitmentEnabled
      ? favUtil.getCount()
      : Object.keys(favorites).reduce((sum, key) =>
        key === 'job' ? sum : sum + (favorites[key] || []).length, 0);
    const interviewHistory = wx.getStorageSync('interviewHistory') || [];
    const viewHistory = browseHistory.getList();
    const progressStats = progress.getStats();
    const materialStats = appMaterials.getStats();
    const notebookStats = notebook.getStats();

    this.setData({
      stats: {
        applications: progressStats.total,
        dueSoon: progressStats.dueSoon,
        favorites: favCount,
        interviews: interviewHistory.length,
        viewed: viewHistory.length,
        materials: materialStats.total,
        notebook: notebookStats.total
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
        school:    profile.school || (profile.education && profile.education.school) || '',
        major:     profile.major || (profile.education && profile.education.major)  || ''
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
    if (!featureFlags.allowNavigation('/package-user/pages/applications/applications')) return;
    wx.navigateTo({ url: '/package-user/pages/applications/applications' });
  },

  goToJobProgress() {
    navigation.safeNavigateTo('/package-user/pages/job-progress/job-progress');
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

  goToApplicationMaterials() {
    wx.navigateTo({ url: '/package-ai/pages/application-materials/application-materials' });
  },

  goToInterviewNotebook() {
    wx.navigateTo({ url: '/package-ai/pages/interview-notebook/interview-notebook' });
  },

  goToMyExperiences() {
    wx.navigateTo({
      url: '/package-user/pages/my-experiences/my-experiences',
      fail: () => wx.showToast({ title: '请先创建 my-experiences 页面', icon: 'none' })
    });
  },

  goToVip() {
    if (!featureFlags.allowNavigation('/package-user/pages/vip/vip')) return;
    wx.navigateTo({ url: '/package-user/pages/vip/vip' });
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

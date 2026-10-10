// pages/profile/profile.js
const favUtil = require('../../utils/favorites.js');
const api     = require('../../utils/api.js');
const featureFlags = require('../../utils/feature-flags.js');
const vipUtil = require('../../utils/vip.js');
const ownerStorage = require('../../utils/owner-storage.js');
const unreadMessages = require('../../utils/unread-messages.js');
const reminders = require('../../utils/reminders.js');

Page({
  data: {
    userInfo: {
      nickName: '未登录用户',
      avatarUrl: '/images/default-avatar.png',
      school: '点击登录',
      major: '完善信息获取精准推荐'
    },
    stats: { favorites: 0 },
    unreadCount: 0,
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
    this._profileVisible = true;
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
    this._profileVisible = false;
    this._profileRequestGeneration = (this._profileRequestGeneration || 0) + 1;
    this._statsRequestGeneration = (this._statsRequestGeneration || 0) + 1;
    clearTimeout(this._profileSyncTimer);
  },

  onHide() {
    this._profileVisible = false;
    this._profileRequestGeneration = (this._profileRequestGeneration || 0) + 1;
    this._statsRequestGeneration = (this._statsRequestGeneration || 0) + 1;
    clearTimeout(this._profileSyncTimer);
  },

  _refreshRemoteStats() {
    const requestId = (this._statsRequestGeneration || 0) + 1;
    const owner = ownerStorage.capture();
    this._statsRequestGeneration = requestId;
    return favUtil.syncFromServer().then(() => {
      if (!this._profileVisible || requestId !== this._statsRequestGeneration || !ownerStorage.isCurrent(owner)) return;
      this.updateStats();
    }).catch(() => {});
  },

  // 同步消息未读角标到 TabBar
  _syncMessageBadge() {
    const count = unreadMessages.get();
    this.setData({ unreadCount: count });
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
    const requestId = (this._profileRequestGeneration || 0) + 1;
    const owner = ownerStorage.capture();
    this._profileRequestGeneration = requestId;
    return api.getUserProfile()
      .then(res => {
        if (!this._profileVisible || requestId !== this._profileRequestGeneration || !ownerStorage.isCurrent(owner)) return;
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
    this.setData({ stats: { favorites: favCount } });
  },

  openIdentity() {
    if (this.data.isLogin) this.goToEditProfile();
    else this.onLogin();
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

  goToMyExperiences() {
    wx.navigateTo({
      url: '/package-user/pages/my-experiences/my-experiences',
      fail: () => wx.showToast({ title: '请先创建 my-experiences 页面', icon: 'none' })
    });
  },

  goToResumes() {
    wx.navigateTo({ url: '/package-career/pages/resume-center/resume-center' });
  },

  goToVip() {
    if (!featureFlags.allowNavigation('/package-user/pages/vip/vip')) return;
    wx.navigateTo({ url: '/package-user/pages/vip/vip' });
  },

  goToFavorites() { wx.navigateTo({ url: '/package-user/pages/favorites/favorites' }); },
  goToPurchasedMaterials() { wx.showToast({ title: '资料购买与权益暂未开放', icon: 'none' }); },
  goToMessages()  { wx.navigateTo({ url: '/package-user/pages/messages/messages' }); },
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
        this._profileRequestGeneration = (this._profileRequestGeneration || 0) + 1;
        this._statsRequestGeneration = (this._statsRequestGeneration || 0) + 1;
        favUtil.invalidateOwner();
        reminders.invalidateOperations();
        unreadMessages.clear();
        ['ai_assistant_messages', 'ai_assistant_saved_results', 'aiCareerCompatTasks_v1'].forEach(key => ownerStorage.remove(key));
        wx.removeStorageSync('unreadMessages');
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

// pages/profile/profile.js
const favUtil = require('../../utils/favorites.js');
const api     = require('../../utils/api.js');

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
    this.loadUserInfo();
    this.updateStats();
    this._syncMessageBadge();
  },

  // 同步消息未读角标到 TabBar
  _syncMessageBadge() {
    const count = wx.getStorageSync('unreadMessages') || 0;
    if (count > 0) {
      wx.setTabBarBadge({ index: 4, text: count > 99 ? '99+' : String(count) });
    } else {
      wx.removeTabBarBadge({ index: 4 });
    }
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
    const viewHistory = wx.getStorageSync('viewHistory') || [];
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
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
  },

  onLogin() {
    this.setData({ showLoginPopup: true });
  },

  onLoginPopupClose() {
    this.setData({ showLoginPopup: false });
  },

  onLoginSuccess(e) {
    const { profile } = e.detail;
    this.setData({
      isLogin: true,
      userInfo: {
        nickName:  profile.nickName  || '微信用户',
        avatarUrl: profile.avatarUrl || '/images/default-avatar.png',
        school:    (profile.education && profile.education.school) || '',
        major:     (profile.education && profile.education.major)  || ''
      }
    });
    this.updateStats();
  },

  goToApplications() {
    wx.navigateTo({ url: '/pages/applications/applications' });
  },

  goToResumes() {
    wx.navigateTo({
      url: '/pages/resume/resume',
      fail: () => wx.showToast({ title: '请先创建 resume 页面', icon: 'none' })
    });
  },

  goToAIInterview() {
    wx.navigateTo({
      url: '/pages/ai-history/ai-history',
      fail: () => wx.showToast({ title: '请先创建 ai-history 页面', icon: 'none' })
    });
  },

  goToMyExperiences() {
    wx.navigateTo({
      url: '/pages/my-experiences/my-experiences',
      fail: () => wx.showToast({ title: '请先创建 my-experiences 页面', icon: 'none' })
    });
  },

  goToVip() {
    wx.navigateTo({
      url: '/pages/vip/vip',
      fail: (err) => {
        console.error(err);
        wx.showToast({ title: '页面跳转失败', icon: 'none' });
      }
    });
  },

  goToFavorites() { wx.navigateTo({ url: '/pages/favorites/favorites' }); },
  goToMessages()  { wx.navigateTo({ url: '/pages/messages/messages' }); },
  goToInterviews(){ wx.navigateTo({ url: '/pages/ai-history/ai-history', fail: () => wx.showToast({ title: '请先创建 ai-history 页面', icon: 'none' }) }); },
  goToSettings()  { wx.navigateTo({ url: '/pages/settings/settings' }); },
  goToFeedback()  { wx.navigateTo({ url: '/pages/feedback/feedback' }); },
  goToAbout()     { wx.navigateTo({ url: '/pages/about/about' }); }
});

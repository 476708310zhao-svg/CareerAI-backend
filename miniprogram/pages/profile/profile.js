// pages/profile/profile.js
const favUtil = require('../../utils/favorites.js');
const progress = require('../../utils/job-progress.js');
const jdMatch = require('../../utils/jd-match.js');
const appMaterials = require('../../utils/application-materials.js');
const notebook = require('../../utils/interview-notebook.js');
const api     = require('../../utils/api.js');
const browseHistory = require('../../utils/browse-history.js');
const featureFlags = require('../../utils/feature-flags.js');
const vipUtil = require('../../utils/vip.js');
const navigation = require('../../utils/navigation.js');

function hasToken() {
  try {
    return !!wx.getStorageSync('token');
  } catch (e) {
    return false;
  }
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function readOnlineResume() {
  try {
    return wx.getStorageSync('onlineResume') || {};
  } catch (e) {
    return {};
  }
}

function getResumeDisplayName(resume, fallback) {
  const basic = resume && resume.basicInfo || {};
  return basic.name ? basic.name + '的简历' : (fallback || '我的在线简历');
}

function getResumeScore(resume) {
  return safeNumber(resume && (resume.score || resume.atsScore || resume.resumeScore));
}

function getLatestReport(reports) {
  const list = Array.isArray(reports) ? reports : [];
  return list[0] || null;
}

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
      notebook: 0,
      reports: 0,
      resumes: 0
    },
    assetHealth: {
      percent: 0,
      title: '求职资产待完善',
      desc: '先补齐简历和 JD 匹配报告',
      primaryText: '完善简历',
      primaryUrl: '/package-career/pages/resume/resume'
    },
    assetCards: [],
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
    const tasks = [
      favUtil.syncFromServer().catch(() => null),
      progress.syncFromServer().catch(() => null),
      appMaterials.fetchRemoteMaterials().catch(() => null),
      notebook.fetchRemoteNotebook().catch(() => null),
      notebook.fetchRemoteDailyPractice().catch(() => null),
      jdMatch.fetchRemoteReports().catch(() => null)
    ];
    if (hasToken() && typeof api.getResumes === 'function') {
      tasks.push(api.getResumes().catch(() => null));
    }
    Promise.all(tasks).then(results => {
      const resumeRes = results.find(item => item && item.code === 0 && Array.isArray(item.data));
      this.updateStats(resumeRes && resumeRes.data);
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

  updateStats(remoteResumes) {
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
    const reports = jdMatch.getReports();
    const onlineResume = readOnlineResume();
    const resumeFiles = wx.getStorageSync('resumeFiles') || [];
    const remoteResumeCount = Array.isArray(remoteResumes) ? remoteResumes.length : 0;
    const localResumeCount = onlineResume && onlineResume.basicInfo ? 1 : 0;
    const resumeCount = Math.max(remoteResumeCount, localResumeCount) + (Array.isArray(resumeFiles) ? resumeFiles.length : 0);

    this.setData({
      stats: {
        applications: progressStats.total,
        dueSoon: progressStats.dueSoon,
        favorites: favCount,
        interviews: interviewHistory.length,
        viewed: viewHistory.length,
        materials: materialStats.total,
        notebook: notebookStats.total,
        reports: reports.length,
        resumes: resumeCount
      }
    }, () => this.updateAssetHub(remoteResumes));
  },

  updateAssetHub(remoteResumes) {
    const onlineResume = readOnlineResume();
    const progressStats = progress.getStats();
    const materialStats = appMaterials.getStats();
    const reports = jdMatch.getReports();
    const latestReport = getLatestReport(reports);
    const resumeList = Array.isArray(remoteResumes) ? remoteResumes : [];
    const defaultResume = resumeList.find(item => item.isDefault) || resumeList[0] || null;
    const resumeScore = getResumeScore(onlineResume);
    const hasOnlineResume = !!(onlineResume && onlineResume.basicInfo);
    const resumeName = defaultResume && defaultResume.name
      ? defaultResume.name
      : getResumeDisplayName(onlineResume, hasOnlineResume ? '我的在线简历' : '未创建在线简历');
    const readinessParts = [
      hasOnlineResume || resumeList.length > 0,
      reports.length > 0,
      progressStats.total > 0,
      materialStats.total > 0
    ];
    const percent = Math.round(readinessParts.filter(Boolean).length / readinessParts.length * 100);
    const primaryUrl = !hasOnlineResume && !resumeList.length
      ? '/package-career/pages/resume/resume'
      : (!reports.length ? '/package-ai/pages/jd-match/jd-match'
        : (!progressStats.total ? '/package-user/pages/job-progress/job-progress'
          : '/package-ai/pages/application-materials/application-materials'));
    const primaryText = !hasOnlineResume && !resumeList.length
      ? '完善简历'
      : (!reports.length ? '做 JD 匹配'
        : (!progressStats.total ? '记录投递' : '补申请材料'));
    const latestScore = latestReport ? safeNumber(latestReport.score) : 0;
    const assetCards = [
      {
        key: 'resume',
        title: '简历资产',
        value: resumeScore ? String(resumeScore) : (resumeList.length || hasOnlineResume ? String(resumeList.length || 1) : '0'),
        suffix: resumeScore ? '分' : '份',
        desc: resumeName,
        status: resumeScore >= 80 ? '可投递' : (resumeList.length || hasOnlineResume ? '待优化' : '待完善'),
        tone: resumeScore >= 80 ? 'good' : 'blue',
        url: '/package-career/pages/resume/resume'
      },
      {
        key: 'jd',
        title: 'JD 报告',
        value: reports.length ? String(reports.length) : '0',
        suffix: '份',
        desc: latestReport ? `${latestReport.company || '目标公司'} · ${latestReport.jobTitle || '目标岗位'}` : '暂无历史报告',
        status: latestScore ? latestScore + '分' : '去匹配',
        tone: latestScore >= 80 ? 'good' : (latestScore ? 'warn' : 'muted'),
        url: '/package-ai/pages/jd-match/jd-match'
      },
      {
        key: 'progress',
        title: '投递追踪',
        value: String(progressStats.total || 0),
        suffix: '条',
        desc: progressStats.dueSoon ? `${progressStats.dueSoon} 个即将截止` : '更新状态和下一步',
        status: progressStats.active ? progressStats.active + '进行中' : '待记录',
        tone: progressStats.dueSoon ? 'warn' : 'blue',
        url: '/package-user/pages/job-progress/job-progress'
      },
      {
        key: 'materials',
        title: '申请材料',
        value: String(materialStats.total || 0),
        suffix: '份',
        desc: materialStats.companyCount ? `${materialStats.companyCount} 家公司材料` : '网申回答和题目草稿',
        status: materialStats.total ? '已沉淀' : '待生成',
        tone: materialStats.total ? 'good' : 'muted',
        url: '/package-ai/pages/application-materials/application-materials'
      }
    ];

    this.setData({
      assetHealth: {
        percent,
        title: percent >= 75 ? '求职资产已成型' : (percent >= 50 ? '求职资产正在成型' : '求职资产待完善'),
        desc: percent >= 75 ? '简历、报告和投递记录已形成闭环' : '补齐简历、JD 报告、投递与材料，后续推荐会更准',
        primaryText,
        primaryUrl
      },
      assetCards
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
    if (!featureFlags.allowNavigation('/pages/applications/applications')) return;
    wx.switchTab({ url: '/pages/applications/applications' });
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

  goToAssetAction() {
    const url = this.data.assetHealth && this.data.assetHealth.primaryUrl;
    if (!url) return;
    navigation.safeNavigateTo(url);
  },

  goToAssetCard(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    navigation.safeNavigateTo(url);
  },

  goToDailyBrief() {
    navigation.safeNavigateTo('/package-ai/pages/daily-brief/daily-brief');
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
  goToUsageGuide(){ navigation.safeNavigateTo('/package-user/pages/usage-guide/usage-guide'); },

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

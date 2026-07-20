// pages/index/index.js
const { getAggregatedJobs, getCompanies, getCampusList, normalizeCompanyLogo } = require('../../utils/api.js');
const config = require('../../utils/app-config.js');
const favUtil = require('../../utils/favorites.js');
const progress = require('../../utils/job-progress.js');
const jdMatch = require('../../utils/jd-match.js');
const dailyTasks = require('../../utils/daily-tasks.js');
const demoData = require('../../utils/demo-data.js');
const matcher = require('../../utils/matcher.js');
const { formatSalaryRange } = require('../../utils/util.js');
const { normalizeBannerUrl } = require('../../utils/assets.js');
const browseHistory = require('../../utils/browse-history.js');
const featureFlags = require('../../utils/feature-flags.js');
const navigation = require('../../utils/navigation.js');
const apiV4 = require('../../utils/api-v4.js');
const BANNER_CACHE_KEY = 'cachedBanners_v2';
const HOT_COMPANIES_CACHE_KEY = 'cachedHotCompanies_v3';
const HOME_CAMPUS_CACHE_KEY = 'cachedHomeCampusUpdates_v1';
const HOME_CAMPUS_CACHE_VERSION = 4;
const HOME_CAMPUS_CACHE_TTL = 20 * 60 * 1000;
const HOME_CAMPUS_PREVIEW_LIMIT = 8;
const ALLOW_DEMO_FALLBACK = demoData.enabled();
const HOME_FEATURES = [
  { id: 1, name: 'JD匹配', icon: '/images/icon-ai-assistant.png', url: '/package-ai/pages/jd-match/jd-match', badge: 'P0', isAi: true, bg: 'linear-gradient(145deg,#eef6ff,#f8fbff)' },
  { id: 2, name: '校招日历', icon: '/images/icon-calendar.png', url: '/pages/campus/campus', badge: '今日', bg: 'linear-gradient(145deg,#ecfdf5,#f8fbff)' },
  { id: 3, name: '投递追踪', icon: '/images/icon-apply.png', url: '/package-user/pages/job-progress/job-progress', badge: '', bg: 'linear-gradient(145deg,#fff7ed,#f8fbff)' },
  { id: 4, name: '简历评分', icon: '/images/icon-resume.png', url: '/package-career/pages/ats-optimize/ats-optimize', badge: 'ATS', isAi: true, bg: 'linear-gradient(145deg,#f8fafc,#eef6ff)' },
  { id: 5, name: 'AI面试', icon: '/images/icon-interview.png', url: '/package-ai/pages/interview-setup/interview-setup', badge: '', isAi: true, bg: 'linear-gradient(145deg,#eef2ff,#f8fbff)' },
  { id: 6, name: 'AI助手', icon: '/images/icon-ai-assistant.png', url: '/package-ai/pages/ai-assistant/ai-assistant', badge: 'AI', isAi: true, bg: 'linear-gradient(145deg,#eef6ff,#f8fbff)' },
  { id: 7, name: '面经题库', icon: '/images/experience.png', url: '/pages/experiences/experiences', badge: '', bg: 'linear-gradient(145deg,#eef2ff,#f8fbff)' },
  { id: 8, name: '薪酬查询', icon: '/images/icon-salary.png', url: '/package-career/pages/salary/salary', badge: '', bg: 'linear-gradient(145deg,#ecfdf5,#f8fbff)' },
  { id: 9, name: '机构测评', icon: '/images/assess-active.png', url: '/pages/agencies/agencies', badge: '', bg: 'linear-gradient(145deg,#fff7ed,#f8fbff)' },
  { id: 10, name: '求职规划', icon: '/images/icon-plan.png', url: '/package-career/pages/career-planner/career-planner', badge: '', bg: 'linear-gradient(145deg,#f8fafc,#eef6ff)' }
];
const CORE_TOOLS = [
  { id: 'jd', title: 'JD 岗位匹配', desc: '分析岗位与个人背景匹配度', icon: '/images/icon-ai-assistant.png', url: '/package-ai/pages/jd-match/jd-match', tone: 'blue' },
  { id: 'resume', title: '简历优化', desc: 'ATS 评分与针对性优化', icon: '/images/icon-resume.png', url: '/package-career/pages/ats-optimize/ats-optimize', tone: 'green' },
  { id: 'progress', title: '投递追踪', desc: '管理岗位和申请进度', icon: '/images/icon-apply.png', url: '/package-user/pages/job-progress/job-progress', tone: 'amber' },
  { id: 'interview', title: 'AI 模拟面试', desc: '针对目标岗位进行练习', icon: '/images/icon-interview.png', url: '/package-ai/pages/interview-setup/interview-setup', tone: 'indigo' }
];

// TabBar 页面路径列表，用于判断跳转方式
Page({
  data: {
    // 0. 用户问候
    greeting: '你好，同学',
    avatarUrl: '/images/default-avatar.png',

    // 1. 轮播图（默认空，onLoad 后从 API 拉取，失败则用兜底数据）
    bannerList: [],
    currentBanner: 0,
    apiBase: config.API_BASE_URL,
    skeletonRows: [1, 2, 3],
    recruitmentEnabled: true,
    membershipEnabled: false,

    // 2. 金刚区：保留 4 个非 AI 专题入口，重复的 AI 功能下沉到专题区
    features: HOME_FEATURES,

    aiSpotlight: {
      primary: {
        title: 'AI 求职助手',
        desc: '从问题进入 JD、简历、面试工作流',
        action: '立即使用',
        url: '/package-ai/pages/ai-assistant/ai-assistant'
      },
      tools: [
        { id: 1, title: 'JD 快速匹配', desc: '粘贴岗位，先看适不适合投', icon: '/images/icon-ai-assistant.png', url: '/package-ai/pages/jd-match/jd-match', tone: 'tone-blue' },
        { id: 2, title: 'ATS 简历评分', desc: '检查关键词与格式风险', icon: '/images/icon-resume.png', url: '/package-career/pages/ats-optimize/ats-optimize', tone: 'tone-mint' },
        { id: 3, title: '项目优化', desc: '项目经历重写包装', icon: '/images/icon-project.png', url: '/package-ai/pages/project-review/project-review', tone: 'tone-indigo' }
      ]
    },

    // 3. 热门公司
    hotCompanies: [
      { id:  1, name: 'Google',       description: 'Search · AI',       domain: 'google.com',       initial: 'G', color: '#4285F4' },
      { id:  2, name: 'Apple',        description: 'Hardware · Software',domain: 'apple.com',        initial: 'A', color: '#1C1C1E' },
      { id:  3, name: 'Microsoft',    description: 'Cloud · AI',        domain: 'microsoft.com',    initial: 'M', color: '#0078D4' },
      { id:  4, name: 'Amazon',       description: 'E-Commerce · AWS',  domain: 'amazon.com',       initial: 'A', color: '#FF9900' },
      { id:  5, name: 'Meta',         description: 'Social · VR',       domain: 'meta.com',         initial: 'M', color: '#0866FF' },
      { id:  6, name: 'Netflix',      description: 'Streaming · Content',domain: 'netflix.com',     initial: 'N', color: '#E50914' },
      { id:  7, name: 'Nvidia',       description: 'GPU · AI Chips',    domain: 'nvidia.com',       initial: 'N', color: '#76B900' },
      { id:  8, name: 'Tesla',        description: 'EV · Energy',       domain: 'tesla.com',        initial: 'T', color: '#CC0000' },
      { id:  9, name: 'OpenAI',       description: 'AI · ChatGPT',      domain: 'openai.com',       initial: 'O', color: '#10A37F' },
      { id: 10, name: 'Salesforce',   description: 'CRM · Cloud',       domain: 'salesforce.com',   initial: 'S', color: '#00A1E0' },
      { id: 11, name: 'Adobe',        description: 'Design · Creative', domain: 'adobe.com',        initial: 'A', color: '#FF0000' },
      { id: 12, name: 'Uber',         description: 'Ride-Hailing · Delivery', domain: 'uber.com',  initial: 'U', color: '#000000' },
      { id: 13, name: 'Airbnb',       description: 'Travel · Homestay', domain: 'airbnb.com',       initial: 'A', color: '#FF5A5F' },
      { id: 14, name: 'Stripe',       description: 'Payments · FinTech',domain: 'stripe.com',       initial: 'S', color: '#635BFF' },
      { id: 15, name: 'Spotify',      description: 'Music · Podcast',   domain: 'spotify.com',      initial: 'S', color: '#1DB954' },
      { id: 16, name: 'LinkedIn',     description: 'Professional Network',domain: 'linkedin.com',   initial: 'L', color: '#0A66C2' },
      { id: 17, name: 'PayPal',       description: 'Payments · Finance',domain: 'paypal.com',       initial: 'P', color: '#003087' },
      { id: 18, name: 'Oracle',       description: 'Database · Cloud',  domain: 'oracle.com',       initial: 'O', color: '#F80000' },
      { id: 19, name: 'IBM',          description: 'Enterprise · AI',   domain: 'ibm.com',          initial: 'I', color: '#0043CE' },
      { id: 20, name: 'Intel',        description: 'CPU · Chips',       domain: 'intel.com',        initial: 'I', color: '#0068B5' },
      { id: 21, name: 'Goldman Sachs',description: 'Investment Banking', domain: 'goldmansachs.com', initial: 'G', color: '#1A4784' },
      { id: 22, name: 'JPMorgan',     description: 'Banking · Finance', domain: 'jpmorgan.com',     initial: 'J', color: '#005DA6' },
      { id: 23, name: 'Morgan Stanley',description: 'Wealth · Banking', domain: 'morganstanley.com',initial: 'M', color: '#002D72' },
      { id: 24, name: 'BlackRock',    description: 'Asset Management',  domain: 'blackrock.com',    initial: 'B', color: '#000000' },
      { id: 25, name: 'McKinsey',     description: 'Strategy Consulting',domain: 'mckinsey.com',    initial: 'M', color: '#003277' },
      { id: 26, name: 'BCG',          description: 'Strategy Consulting',domain: 'bcg.com',         initial: 'B', color: '#009A44' },
      { id: 27, name: 'Deloitte',     description: 'Audit · Consulting',domain: 'deloitte.com',     initial: 'D', color: '#86BC25' },
      { id: 28, name: 'Accenture',    description: 'IT · Consulting',   domain: 'accenture.com',    initial: 'A', color: '#A100FF' },
      { id: 29, name: 'Shopify',      description: 'E-Commerce · SaaS', domain: 'shopify.com',      initial: 'S', color: '#96BF48' },
      { id: 30, name: 'Zoom',         description: 'Video · Collaboration',domain: 'zoom.us',       initial: 'Z', color: '#2D8CFF' },
    ],

    // 4. 推荐职位
    recommendJobs: [],
    loadingJobs: true,
    jobsError: false,
    recommendTitle: '为您推荐',
    prefTags: [],
    activePrefTag: '',

    // 5. 资料完整度引导
    profileCompleteness: 0,
    profileHints: [],
    showProfileGuide: false,
    showBackToTop: false, // 控制回到顶部按钮显隐
    workbench: {
      isLoggedIn: false,
      title: '今天先完成一个求职动作',
      subtitle: '先上传/管理简历，再用 JD 匹配校准投递方向。',
      primaryText: '管理简历',
      primaryUrl: '/package-career/pages/resume/resume',
      metrics: [
        { label: '推荐岗位', value: '0', suffix: '个', tone: 'blue', icon: '/images/icon-ai-assistant.png' },
        { label: '待投递', value: '0', suffix: '个', tone: 'muted', icon: '/images/icon-apply.png' },
        { label: '待面试', value: '0', suffix: '个', tone: 'amber', icon: '/images/icon-interview.png' },
        { label: '进行中', value: '0', suffix: '个', tone: 'muted', icon: '/images/icon-plan.png' }
      ],
      suggestionTitle: '先完成求职档案',
      suggestionDesc: '补充简历、目标岗位与求职地区',
      suggestionUrl: '/package-user/pages/profile-edit/profile-edit'
    },
    workbenchActions: CORE_TOOLS,
    progressSummary: {
      total: 0,
      active: 0,
      dueSoon: 0,
      todayInterviews: 0,
      advice: ''
    },
    todayTasks: [],
    todayTaskStats: {
      total: 0,
      done: 0,
      pending: 0,
      percent: 0
    },
    campusFeatured: null,
    campusUpdates: [],
    campusLatestUpdates: [],
    campusUpdateTotal: 0,
    campusUpdateLoading: false,
    campusUpdateReady: false,
    campusUpdateDateLabel: '今日更新'
  },

  onLoad() {
    const flags = featureFlags.getCurrentFlags();
    const recruitmentEnabled = !!flags.recruitment;
    this.applyFeatureState(flags);
    this.normalizeHomeData();
    try {
      this.loadUserProfile();
      this.loadProgressSummary();
      this.loadTodayTasks();
      this.loadWorkbenchSummary();
      this.syncWorkbenchReports();
      const hasCachedCampusUpdates = this.loadCachedCampusUpdates();
      if (!hasCachedCampusUpdates) this.setData({ campusUpdateLoading: true });
    } catch (e) {
      console.warn('[index] 初始化求职计划失败:', e);
    }
    try {
      this.fetchBanners();
    } catch (e) {
      console.warn('[fetchBanners]', e);
    }
    if (recruitmentEnabled) {
      let hasCachedJobs = false;
      try {
        hasCachedJobs = this.loadCachedOrMockJobs();
      } catch(e) { wx.showToast({ title: 'E3:' + e.message, icon: 'none', duration: 5000 }); return; }
      clearTimeout(this._initialRecommendTimer);
      this._initialRecommendTimer = setTimeout(() => {
        try {
          this.fetchRecommendJobs();
        } catch(e) {
          console.warn('[fetchRecommendJobs]', e);
        }
      }, hasCachedJobs ? 240 : 100);
    } else {
      this.setData({ loadingJobs: false, recommendJobs: [] });
    }
    this.scheduleDeferredHomeData();
  },

  applyRecruitmentState(enabled) {
    const recruitmentEnabled = !!enabled;
    this.setData({
      recruitmentEnabled,
      features: HOME_FEATURES
        .filter(item => item.feature !== 'recruitment' || recruitmentEnabled)
        .map(item => Object.assign({}, item, { isAiClass: item.isAi ? 'is-ai' : '' })),
      recommendJobs: recruitmentEnabled ? this.data.recommendJobs : [],
      loadingJobs: recruitmentEnabled ? this.data.loadingJobs : false
    });
  },

  applyFeatureState(flags) {
    const nextFlags = flags || {};
    this.applyRecruitmentState(!!nextFlags.recruitment);
    this.setData({ membershipEnabled: !!nextFlags.membership });
  },

  _onFeatureFlagsChange(flags) {
    const wasEnabled = this.data.recruitmentEnabled;
    this.applyFeatureState(flags);
    if (flags.recruitment && !wasEnabled) {
      this.loadCachedOrMockJobs();
      this.fetchRecommendJobs();
    }
  },

  normalizeHomeData() {
    this.setData({
      features: (this.data.features || []).map(item => Object.assign({}, item, {
        isAiClass: item.isAi ? 'is-ai' : ''
      })),
      hotCompanies: (this.data.hotCompanies || []).map(item => Object.assign({}, item, {
        logoSrc: item.logo || ''
      }))
    });
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.syncCustomTabBar === 'function') app.syncCustomTabBar();
    this.loadUserProfile();
    this.loadProgressSummary();
    this.loadTodayTasks();
    this.loadWorkbenchSummary();
    this.syncWorkbenchReports();
    this.updateMessageBadge();
    this.syncPageChrome();
    featureFlags.refreshFeatureFlags();
  },

  syncPageChrome() {
    try {
      if (wx.setBackgroundColor) {
        wx.setBackgroundColor({
          backgroundColor: '#ffffff',
          backgroundColorTop: '#ffffff',
          backgroundColorBottom: '#ffffff'
        });
      }
      if (wx.setNavigationBarColor) {
        wx.setNavigationBarColor({
          frontColor: '#000000',
          backgroundColor: '#ffffff',
          animation: { duration: 300 }
        });
      }
    } catch (e) {
      console.warn('[index] syncPageChrome failed:', e);
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    clearTimeout(this._initialRecommendTimer);
    this.loadUserProfile();
    this.loadProgressSummary();
    this.loadTodayTasks();
    this.loadWorkbenchSummary();
    this.fetchBanners();
    if (this.data.recruitmentEnabled) this.fetchRecommendJobs({ force: true });
    this.fetchCampusUpdates({ force: true });
    setTimeout(() => wx.stopPullDownRefresh(), 800);
  },

  onUnload() {
    this.clearDeferredHomeTimers();
  },

  clearDeferredHomeTimers() {
    clearTimeout(this._initialRecommendTimer);
    (this._homeTimers || []).forEach(timer => clearTimeout(timer));
    this._homeTimers = [];
  },

  scheduleDeferredHomeData() {
    (this._homeTimers || []).forEach(timer => clearTimeout(timer));
    this._homeTimers = [
      setTimeout(() => {
        try { this.fetchCampusUpdates(); } catch (e) { console.warn('[fetchCampusUpdates]', e); }
      }, 360)
    ];
  },

  // 页面滚动监听：超过一定距离显示“回到顶部”按钮
  onPageScroll(e) {
    const threshold = 600; // 滚动超过 600px 时显示
    if (e.scrollTop > threshold && !this.data.showBackToTop) {
      this.setData({ showBackToTop: true });
    } else if (e.scrollTop <= threshold && this.data.showBackToTop) {
      this.setData({ showBackToTop: false });
    }
  },

  // 回到顶部方法
  scrollToTop() {
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 300 // 300ms 滚动动画
    });
  },

  // 小程序分享给朋友
  onShareAppMessage() {
    return {
      title: '职引 | 留学生AI求职助手',
      path: '/pages/index/index',
      imageUrl: 'https://api.zhiyincareer.com/uploads/banners/banner_1782446347190_ovbr4.png'
    };
  },

  // 小程序分享到朋友圈
  onShareTimeline() {
    return {
      title: '职引 | 留学生AI求职助手',
      imageUrl: 'https://api.zhiyincareer.com/uploads/banners/banner_1782446347190_ovbr4.png'
    };
  },

  normalizeAssetUrl(url) {
    return normalizeBannerUrl(url);
  },

  normalizeBanners(list) {
    const membershipEnabled = this.data ? this.data.membershipEnabled : featureFlags.isMembershipEnabled();
    return (list || [])
      .filter(item => membershipEnabled || !featureFlags.isMembershipUrl(item.url))
      .map(item => Object.assign({}, item, {
      imageUrl: this.normalizeAssetUrl(item.imageUrl || item.image_url)
    }));
  },

  onBannerImageError(e) {
    const index = e.currentTarget.dataset.index;
    if (typeof index !== 'number') return;
    const bannerList = this.data.bannerList.map((item, i) => {
      if (i !== index) return item;
      return Object.assign({}, item, { imageUrl: '' });
    });
    this.setData({ bannerList });
  },

  // ======== Banner 数据 ========
  fetchBanners() {
    const FALLBACK = [
      { id: 1, gradient: 'linear-gradient(135deg,#1769E8 0%,#4C9BFF 100%)', icon: '🚀', title: '2027 Summer Internship 求职季', subtitle: '精选实习岗位 · 简历优化 · 面试冲刺', url: '/pages/jobs/jobs' },
      { id: 2, gradient: 'linear-gradient(135deg,#3156C8 0%,#7B8EFF 100%)', icon: '🏢', title: '今日校招机会更新', subtitle: '新开网申 · 即将截止 · 热门企业', url: '/pages/campus/campus' },
      { id: 3, gradient: 'linear-gradient(135deg,#0AA777 0%,#45C8B0 100%)', icon: '🤖', title: 'AI 模拟面试', subtitle: '针对目标岗位练习并获得反馈', url: '/package-ai/pages/interview-setup/interview-setup' }
    ];

    // 立即显示缓存或兜底，不阻塞页面
    const cached = wx.getStorageSync(BANNER_CACHE_KEY);
    this.setData({ bannerList: (cached && cached.length > 0) ? this.normalizeBanners(cached) : FALLBACK });

    // 后台静默拉取最新数据，5 秒超时
    wx.request({
      url: (config.CONTENT_API_BASE_URL || config.API_BASE_URL) + '/api/banners',
      method: 'GET',
      timeout: 5000,
      success: (res) => {
        const list = res.data && res.data.code === 0 && res.data.data;
        if (list && list.length > 0) {
          const normalized = this.normalizeBanners(list);
          this.setData({ bannerList: normalized });
          wx.setStorageSync(BANNER_CACHE_KEY, normalized);
        }
      },
      fail: () => {}
    });
  },

  // 优先加载缓存；开发兜底只在 ENABLE_DEMO_FALLBACK=true 时启用
  loadCachedOrMockJobs() {
    const cached = wx.getStorageSync('cachedRecommendJobs');
    if (cached && cached.length >= 3) {
      this.setData({
        recommendJobs: this.withCompanyLogos(cached).slice(0, 3),
        loadingJobs: false,
        jobsError: false
      });
      this.loadWorkbenchSummary();
      return true;
    } else if (ALLOW_DEMO_FALLBACK) {
      this.loadMockJobs();
      return true;
    } else {
      this.setData({ loadingJobs: false });
    }
    return false;
  },

  // ======== 用户画像 ========
  loadUserProfile() {
    const profile = wx.getStorageSync('userProfile') || {};

    // 1. 计算时间问候语
    const hour = new Date().getHours();
    const timeGreet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
    const name = profile.nickName || '同学';

    // 2. 资料完整度计算
    const completeness = matcher.getProfileCompleteness(profile);
    const hints = matcher.getMissingHints(profile);

    // 3. 构建带来源标注的推荐关键词列表
    const sourceKws = [];
    matcher.getJobKeywords(profile).forEach(kw => sourceKws.push({ kw, source: '专业' }));
    [...new Set(wx.getStorageSync('jobSearchHistory') || [])].slice(0, 3).forEach(kw => sourceKws.push({ kw, source: '搜索' }));
    browseHistory.getList()
      .map(v => v.title).filter(Boolean).slice(0, 2).forEach(kw => sourceKws.push({ kw, source: '浏览' }));
    favUtil.getList('job').map(f => f.title).filter(Boolean).slice(0, 3).forEach(kw => sourceKws.push({ kw, source: '收藏' }));

    // 关键词去重保留首次出现的来源
    const seen = new Set();
    const uniqueSourceKws = sourceKws.filter(s => seen.has(s.kw) ? false : seen.add(s.kw));

    this.userSourceKws = uniqueSourceKws.length > 0 ? uniqueSourceKws : [{ kw: 'Software Engineer', source: '' }];
    this.userKeywords = this.userSourceKws.map(s => s.kw);

    // 4. 统一执行一次 setData 提升渲染性能
    this.setData({
      greeting: `${timeGreet}，${name}`,
      avatarUrl: profile.avatarUrl || '/images/default-avatar.png',
      profileCompleteness: completeness,
      profileHints: hints,
      showProfileGuide: completeness < 60 && hints.length > 0,
      prefTags: this.userKeywords.slice(0, 6),
      recommendTitle: this.getRecommendTitle(profile)
    });
  },

  goCompleteProfile() {
    wx.navigateTo({ url: '/package-user/pages/profile-edit/profile-edit' });
  },

  getRecommendTitle(profile) {
    if (profile.major) return '基于你的专业推荐';
    const sourceKws = this.userSourceKws || [];
    if (sourceKws.some(s => s.source === '收藏')) return '基于你的收藏推荐';
    if (sourceKws.some(s => s.source === '浏览')) return '基于你的浏览推荐';
    if (sourceKws.some(s => s.source === '搜索')) return '基于你的搜索推荐';
    return '为您推荐';
  },

  updateMessageBadge() {
    const msgs = wx.getStorageSync('unreadMessages');
    const count = typeof msgs === 'number' ? msgs : 3;
    getApp().setUnreadCount(count);
  },

  // ======== 职位数据 ========
  async fetchRecommendJobs(options) {
    const force = !!(options && options.force);
    this.setData({ jobsError: false });
    // 如果已有数据就不显示 loading 骨架屏，静默刷新
    if (this.data.recommendJobs.length === 0) {
      this.setData({ loadingJobs: true });
    }
    const keyword = this.data.activePrefTag || (this.userKeywords && this.userKeywords[0]) || 'Software Engineer';

    try {
      const res = await getAggregatedJobs({ keyword, country: 'us', size: 20, page: 1, noCache: force });
      if (!res.data || res.data.length === 0) throw new Error('API Empty');

      let jobs = this.formatJobData(res.data);
      jobs = this.rankByProfile(jobs);
      jobs = this.withCompanyLogos(jobs);
      jobs = jobs.slice(0, 3);

      this.setData({ recommendJobs: jobs, loadingJobs: false, jobsError: false });
      // 缓存成功结果，下次秒开
      wx.setStorageSync('cachedRecommendJobs', jobs);
      this.loadTodayTasks();
      this.loadWorkbenchSummary();
    } catch (error) {
      console.warn('[fetchRecommendJobs] 获取推荐职位失败:', error);
        // 只有在没有任何数据时才加载 Mock
        if (ALLOW_DEMO_FALLBACK && this.data.recommendJobs.length === 0) {
          this.loadMockJobs();
        } else {
          this.setData({
            loadingJobs: false,
            jobsError: this.data.recommendJobs.length === 0
          });
        }
    }
  },

  // 偏好标签点击
  onPrefTagTap(e) {
    // 增加轻微震动反馈，提升交互的高级感
    wx.vibrateShort({ type: 'light' });

    const tag = e.currentTarget.dataset.tag;
    if (this.data.activePrefTag === tag) {
      this.setData({ activePrefTag: '' });
    } else {
      this.setData({ activePrefTag: tag });
    }
    clearTimeout(this._initialRecommendTimer);
    this.fetchRecommendJobs({ force: true });
  },

  // 换一批推荐
  refreshRecommend() {
    // 增加中等强度的震动反馈，给用户明确的操作确认感
    wx.vibrateShort({ type: 'medium' });

    if (this.userKeywords && this.userKeywords.length > 1) {
      this.userKeywords.push(this.userKeywords.shift());
      this.userSourceKws.push(this.userSourceKws.shift());
    }
    this.setData({ activePrefTag: '' });
    clearTimeout(this._initialRecommendTimer);
    this.fetchRecommendJobs({ force: true });
  },

  // 公司 Logo 加载失败时，自动降级为文字头像
  onCompanyLogoError(e) {
    const idx = e.currentTarget.dataset.idx;
    if (typeof idx !== 'number' || (this.data.hotCompanies[idx] && this.data.hotCompanies[idx].logoFailed)) return;
    this.setData({
      [`hotCompanies[${idx}].logoFailed`]: true,
      [`hotCompanies[${idx}].logoSrc`]: ''
    });
  },

  fetchHotCompanies(options) {
    const force = !!(options && options.force);
    if (!force) {
      const cached = wx.getStorageSync(HOT_COMPANIES_CACHE_KEY);
      if (cached && cached.length) {
        this.setData({ hotCompanies: cached });
      }
    }

    getCompanies({ page: 1, pageSize: 12 }).then(res => {
      const list = res && res.data && Array.isArray(res.data.list) ? res.data.list : [];
      if (!list.length) return;
      const hotCompanies = list.map(company => ({
        id: company.id,
        name: company.name,
        description: company.industryL2 || company.industry || company.officialDomain || '',
        domain: company.officialDomain || '',
        logo: company.logo,
        logoSrc: company.logo || '',
        initial: (company.name || '?').slice(0, 1).toUpperCase(),
        color: company.brandColor || '#2563eb'
      }));
      this.setData({ hotCompanies });
      wx.setStorageSync(HOT_COMPANIES_CACHE_KEY, hotCompanies);
    }).catch(err => {
      console.warn('[fetchHotCompanies] 获取热门公司失败:', err);
    });
  },

  // 职位 Logo 加载失败时，自动降级为文字头像
  onJobLogoError(e) {
    const index = e.currentTarget.dataset.index;
    if (typeof index !== 'number' || (this.data.recommendJobs[index] && this.data.recommendJobs[index].logoFailed)) return;
    this.setData({
      [`recommendJobs[${index}].logoFailed`]: true,
      [`recommendJobs[${index}].logoSrc`]: ''
    });
  },

  buildCompanyLogo(companyName) {
    if (!companyName) return '';
    return normalizeCompanyLogo(`/api/logo?name=${encodeURIComponent(companyName)}`);
  },

  withCompanyLogos(jobs) {
    return (jobs || []).map(job => Object.assign({}, job, {
      logo: this.buildCompanyLogo(job.company) || job.logo || '',
      logoSrc: this.buildCompanyLogo(job.company) || job.logo || '',
      logoFailed: false,
      stateSuffix: job.state ? ', ' + job.state : '',
      companyInitial: (job.company || 'C').slice(0, 1).toUpperCase()
    }));
  },

  rankByProfile(jobs) {
    const sourceKws = this.userSourceKws || [];
    if (sourceKws.length === 0) return jobs;
    return jobs.map(job => {
      let score = 0, reason = '';
      const t = (job.title || '').toLowerCase();
      const c = (job.company || '').toLowerCase();
      sourceKws.forEach(({ kw, source }) => {
        const k = kw.toLowerCase();
        if (t.includes(k)) { score += 3; if (!reason && source) reason = source; }
        if (c.includes(k)) { score += 1; if (!reason && source) reason = source; }
      });
      // 计算具体的匹配百分比（如 75% - 98%），为前端动效“Aha Moment”提供数据支持
      const matchPercentage = score > 0 ? Math.min(98, 75 + Math.floor(score * 4.5)) : 0;
      return { ...job, matchScore: score, matchPercentage, isMatch: score > 0, reason: reason ? '匹配' + reason : '' };
    }).sort((a, b) => b.matchScore - a.matchScore);
  },

  formatJobData(rawList) {
    return rawList.map(job => {
      const salary = formatSalaryRange(job.job_min_salary, job.job_max_salary);
      const desc = job.job_description || '';
      return {
        id: job.job_id,
        title: job.job_title,
        company: job.employer_name,
        salary,
        city: job.job_city || 'Remote',
        state: job.job_state,
        type: job.job_employment_type || 'Full-time',
        logo: job.employer_logo || '',
        logoFailed: false,
        postedAt: this.formatTime(job.job_posted_at_datetime_utc),
        rawDescription: desc,
        applyLink: job.job_apply_link || '',
        optFriendly: /\b(opt|cpt|h[- ]?1b|visa\s+sponsor|will\s+sponsor|work\s+authori)/i.test(desc)
      };
    });
  },

  formatTime(dateStr) {
    if (!dateStr) return '最近发布';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 1) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return days + '天前';
    return Math.floor(days / 7) + '周前';
  },

  loadMockJobs() {
    if (!ALLOW_DEMO_FALLBACK) {
      this.setData({ loadingJobs: false });
      return;
    }
    const RECOMMEND_JOBS = demoData.getList('RECOMMEND_JOBS');
    this.setData({
      loadingJobs: false,
      jobsError: false,
      recommendJobs: this.withCompanyLogos(RECOMMEND_JOBS).slice(0, 3)
    });
    this.loadWorkbenchSummary();
  },

  retryRecommendJobs() {
    this.fetchRecommendJobs({ force: true });
  },

  // ======== 导航跳转 ========
  navigateToPage(e) {
    const url = (e.detail && e.detail.url) || e.currentTarget.dataset.url;
    if (!url) return;
    if (!featureFlags.allowNavigation(url)) return;
    navigation.safeNavigateTo(url);
  },

  openMembershipBenefits() {
    if (this.data.membershipEnabled) {
      navigation.safeNavigateTo('/package-user/pages/vip/vip');
      return;
    }
    wx.showModal({
      title: '求职会员权益',
      content: '会员权益入口已保留，真实微信支付暂未开放。当前免费功能可继续使用。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  loadCachedCampusUpdates() {
    const cached = wx.getStorageSync(HOME_CAMPUS_CACHE_KEY);
    if (!cached || !Array.isArray(cached.items) || cached.items.length === 0) return false;
    if (cached.version !== HOME_CAMPUS_CACHE_VERSION) return false;
    if ((Date.now() - (cached.t || 0)) > HOME_CAMPUS_CACHE_TTL) return false;
    this.applyCampusUpdates(cached.items, cached.total || cached.items.length);
    return true;
  },

  fetchCampusUpdates(options) {
    const force = !!(options && options.force);
    if (!force && this.data.campusFeatured) return;
    if (!this.data.campusFeatured && this.data.campusUpdates.length === 0) {
      this.setData({ campusUpdateLoading: true });
    }

    getCampusList({
      sort: 'latest',
      page: 0,
      pageSize: 50,
      latestDay: '1',
      timeout: 6000
    }).then(res => {
      const payload = res && res.code === 0 && res.data ? res.data : null;
      const list = payload ? (Array.isArray(payload) ? payload : (payload.list || [])) : [];
      if (!list.length) throw new Error('empty campus list');
      const latest = this.pickLatestCampusDay(list);
      const sourceList = latest.items.length ? latest.items : list;
      const formatted = this.rankCampusUpdates(sourceList).slice(0, HOME_CAMPUS_PREVIEW_LIMIT);
      const total = payload.latestDate ? (payload.total || formatted.length) : (latest.total || formatted.length);
      this.applyCampusUpdates(formatted, total);
      wx.setStorageSync(HOME_CAMPUS_CACHE_KEY, {
        version: HOME_CAMPUS_CACHE_VERSION,
        items: formatted,
        total,
        latestDate: payload.latestDate || latest.dateKey || '',
        t: Date.now()
      });
    }).catch(err => {
      console.warn('[fetchCampusUpdates] 获取每日校招失败:', err);
      if (!this.data.campusFeatured && ALLOW_DEMO_FALLBACK) {
        const fallback = this.rankCampusUpdates(demoData.getList('CAMPUS')).slice(0, HOME_CAMPUS_PREVIEW_LIMIT);
        this.applyCampusUpdates(fallback, fallback.length);
      } else {
        this.setData({
          campusUpdateLoading: false,
          campusUpdateReady: true
        });
      }
    });
  },

  applyCampusUpdates(items, total) {
    const list = (items || [])
      .filter(Boolean)
      .map(item => Object.assign({}, item, {
        title: this.buildCampusUpdateTitle(item.company, item.title || item.positionName || item.positionType),
        subtitle: this.normalizeCampusUpdateSubtitle(item)
      }));
    this.setData({
      campusFeatured: list[0] || null,
      campusUpdates: list.slice(1, HOME_CAMPUS_PREVIEW_LIMIT),
      campusLatestUpdates: list.slice(0, HOME_CAMPUS_PREVIEW_LIMIT),
      campusUpdateTotal: total || list.length,
      campusUpdateDateLabel: this.getCampusUpdateDateLabel(list[0]),
      campusUpdateLoading: false,
      campusUpdateReady: true
    });
    this.loadWorkbenchSummary();
  },

  rankCampusUpdates(list) {
    return (list || [])
      .map(item => this.formatCampusUpdateItem(item))
      .filter(Boolean)
      .sort((a, b) => (b.updateTimestamp - a.updateTimestamp) || (b.homeScore - a.homeScore));
  },

  formatCampusUpdateItem(item) {
    if (!item) return null;
    const locations = Array.isArray(item.locations) ? item.locations : [];
    const cityText = locations.length
      ? (locations.length > 2 ? locations.slice(0, 2).join(' / ') + ' +' + (locations.length - 2) : locations.join(' / '))
      : (item.region || '全国');
    const deadline = this.getCampusDeadlineMeta(item.deadlineDate || item.deadlineMonth || '');
    const businessDate = this.getCampusBusinessDateKey(item);
    const updatedText = this.formatCampusBusinessDateText(businessDate);
    const updateTimestamp = Date.parse(item.updatedAt || item.updated_at || item.createdAt || item.created_at || businessDate || '') || 0;
    const recentScore = businessDate ? 40 : 12;
    const hotScore = item.isHot ? 26 : 0;
    const deadlineScore = deadline.isSoon ? 30 : 0;
    const companyName = item.company || '校招机会';
    const positionTitle = item.positionName || item.positionType || '校招岗位';
    const title = this.buildCampusUpdateTitle(companyName, positionTitle);

    return {
      id: item.id,
      title,
      company: companyName,
      companyLogo: item.companyLogo || item.company_logo || this.buildCompanyLogo(companyName),
      companyInitial: String(companyName || '校').slice(0, 1).toUpperCase(),
      industry: item.industry || '',
      recruitType: item.recruitType || item.recruit_type || '',
      locations,
      positionName: item.positionName || item.position_name || '',
      startDate: item.startDate || item.start_date || '',
      deadlineDate: item.deadlineDate || item.deadline_date || '',
      writtenTest: item.writtenTest || item.written_test || '',
      announceUrl: item.announceUrl || item.announce_url || '',
      gradYear: item.gradYear || item.grad_year || '',
      region: item.region || '',
      positionType: item.positionType || item.position_type || '',
      recruitYear: item.recruitYear || item.recruit_year || '',
      isHot: !!item.isHot,
      notes: item.notes || '',
      source: item.source || '',
      isVerified: !!item.isVerified,
      viewCount: item.viewCount || item.view_count || 0,
      createdAt: item.createdAt || item.created_at || '',
      updatedAt: item.updatedAt || item.updated_at || item.createdAt || item.created_at || '',
      updateTimestamp,
      businessDate,
      subtitle: [item.gradYear ? item.gradYear + '届' : '', item.recruitType, cityText].filter(Boolean).join(' · '),
      cityText,
      deadlineText: deadline.text,
      updatedText,
      badgeText: item.isHot ? '热门企业' : (deadline.isSoon ? '即将截止' : '新更新'),
      tagText: item.industry || item.positionType || item.recruitType || '校招',
      applyUrl: item.applyUrl || item.apply_url || '',
      isUrgent: deadline.isSoon,
      homeScore: recentScore + hotScore + deadlineScore + (item.viewCount || 0) / 1000
    };
  },

  buildCampusUpdateTitle(company, position) {
    const companyName = String(company || '').trim();
    const positionTitle = String(position || '').trim() || '校招岗位';
    if (!companyName) return positionTitle;
    const compactCompany = companyName.replace(/\s+/g, '');
    const compactPosition = positionTitle.replace(/\s+/g, '');
    return compactPosition.includes(compactCompany)
      ? positionTitle
      : `${companyName} ${positionTitle}`;
  },

  normalizeCampusUpdateSubtitle(item) {
    const companyName = String((item && item.company) || '').trim();
    const cityText = item && item.cityText ? item.cityText : '';
    const parts = [
      item && item.gradYear ? item.gradYear + '届' : '',
      item && item.recruitType ? item.recruitType : '',
      cityText
    ].filter(Boolean);
    let subtitle = parts.length ? parts.join(' · ') : String((item && item.subtitle) || '').trim();
    if (companyName && subtitle.indexOf(companyName) === 0) {
      subtitle = subtitle.slice(companyName.length).replace(/^[\s·\-\/|]+/, '').trim();
    }
    return subtitle || cityText || '校招信息';
  },

  parseCampusDateKey(value) {
    const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  },

  timestampToShanghaiDateKey(value) {
    const text = String(value || '').trim();
    const match = text.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!match) return '';
    if (!match[4]) return `${match[1]}-${match[2]}-${match[3]}`;
    const utc = Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
    const shanghai = new Date(utc + 8 * 60 * 60 * 1000);
    return [
      shanghai.getUTCFullYear(),
      String(shanghai.getUTCMonth() + 1).padStart(2, '0'),
      String(shanghai.getUTCDate()).padStart(2, '0')
    ].join('-');
  },

  getCampusBusinessDateKey(item) {
    if (!item) return '';
    return this.parseCampusDateKey(item.startDate || item.start_date || item.appOpenMonth)
      || this.timestampToShanghaiDateKey(item.createdAt || item.created_at);
  },

  pickLatestCampusDay(list) {
    const groups = {};
    const hasStartDates = (list || []).some(item => this.parseCampusDateKey(item && (item.startDate || item.start_date || item.appOpenMonth)));
    (list || []).forEach(item => {
      const key = hasStartDates
        ? this.parseCampusDateKey(item && (item.startDate || item.start_date || item.appOpenMonth))
        : this.getCampusBusinessDateKey(item);
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    const dateKey = Object.keys(groups).sort().pop() || '';
    const items = dateKey ? groups[dateKey] : [];
    return { dateKey, items, total: items.length };
  },

  formatCampusBusinessDateText(dateKey) {
    const key = this.parseCampusDateKey(dateKey);
    if (!key) return '近期更新';
    const today = new Date();
    const date = new Date(key.replace(/-/g, '/'));
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const days = Math.round((today.getTime() - date.getTime()) / 86400000);
    if (days === 0) return '今日新开';
    if (days === 1) return '昨日新开';
    if (days > 1 && days <= 7) return days + '天前新开';
    return key.slice(5) + '新开';
  },

  getCampusDeadlineMeta(value) {
    const text = String(value || '').trim();
    if (!text || text === '尽快投递') return { text: text || '尽快投递', isSoon: true };
    const parsed = new Date(text.replace(/-/g, '/'));
    if (Number.isNaN(parsed.getTime())) return { text, isSoon: false };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);
    const days = Math.round((parsed.getTime() - today.getTime()) / 86400000);
    if (days < 0) return { text: '已截止', isSoon: false };
    if (days === 0) return { text: '今日截止', isSoon: true };
    if (days <= 7) return { text: days + '天后截止', isSoon: true };
    return { text: text.slice(5) + '截止', isSoon: false };
  },

  formatCampusUpdatedText(value) {
    const text = String(value || '');
    const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return '近期更新';
    const today = new Date();
    const date = new Date(`${match[1]}/${match[2]}/${match[3]}`);
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const days = Math.round((today.getTime() - date.getTime()) / 86400000);
    if (days <= 0) return '今日更新';
    if (days === 1) return '昨日更新';
    if (days <= 7) return days + '天前更新';
    return match[2] + '-' + match[3] + '更新';
  },

  getCampusUpdateDateLabel(item) {
    if (!item) return '今日更新';
    return item.updatedText || '今日更新';
  },

  loadProgressSummary() {
    const stats = progress.getStats();
    this.setData({
      progressSummary: {
        total: stats.total,
        active: stats.active,
        dueSoon: stats.dueSoon,
        todayInterviews: stats.todayInterviews,
        advice: progress.buildDailyAdvice()
      }
    });
  },

  readLatestAtsScore() {
    try {
      const resume = wx.getStorageSync('onlineResume') || {};
      const reports = wx.getStorageSync('jdMatchReports') || [];
      const resumeScore = Number(resume.atsScore || resume.score || resume.resumeScore || 0);
      const latestReport = Array.isArray(reports) && reports.length ? reports[0] : null;
      const reportScore = latestReport ? Number(latestReport.score || latestReport.atsScore || 0) : 0;
      return Math.max(0, Math.round(resumeScore || reportScore || 0));
    } catch (e) {
      return 0;
    }
  },

  syncWorkbenchReports() {
    if (this._workbenchReportSyncing) return;
    this._workbenchReportSyncing = true;
    jdMatch.fetchRemoteReports()
      .then(() => this.loadWorkbenchSummary())
      .catch(() => {})
      .finally(() => {
        this._workbenchReportSyncing = false;
      });
  },

  getWorkbenchTargetRole(profile) {
    const p = profile || {};
    const direct = p.targetRole || p.target_role || p.jobTitle || p.position || p.intentRole || p.major;
    if (direct) return String(direct).trim();
    const keywords = this.userKeywords || [];
    return keywords[0] || '目标岗位';
  },

  loadWorkbenchSummary() {
    let profile = {};
    try {
      profile = wx.getStorageSync('userProfile') || {};
    } catch (e) {}
    const stats = progress.getStats();
    const atsScore = this.readLatestAtsScore();
    const taskStats = this.data.todayTaskStats || dailyTasks.getStats(this.data.todayTasks || []);
    const recommendationCount = Math.min(3, (this.data.recommendJobs || []).length);
    const pendingApplications = Number((stats.byStatus && stats.byStatus.collected) || 0);
    const nextTask = (this.data.todayTasks || []).find(item => !item.done) || null;
    const hasToken = (() => {
      try { return !!wx.getStorageSync('token'); } catch (e) { return false; }
    })();
    let hasResume = atsScore > 0;
    try {
      const resume = wx.getStorageSync('onlineResume') || {};
      hasResume = hasResume || Object.keys(resume).some(key => !!resume[key]);
    } catch (e) {}
    const isLoggedIn = !!(hasToken || profile.nickName || hasResume || stats.total);
    const role = this.getWorkbenchTargetRole(profile);
    const hasTargetRole = role !== '目标岗位';

    let title = '完成你的求职档案';
    let subtitle = '上传简历、选择目标岗位并设置求职地区后，我们会生成个性化计划。';
    let primaryText = '开始建立档案';
    let primaryUrl = '/package-user/pages/profile-edit/profile-edit';

    if (isLoggedIn && !hasResume) {
      title = '先完善简历，再开始精准匹配';
      subtitle = '完成基础信息、项目经历和技能关键词，系统才能判断岗位匹配度。';
      primaryText = '开始简历优化';
      primaryUrl = '/package-career/pages/ats-optimize/ats-optimize';
    } else if (isLoggedIn && !hasTargetRole) {
      title = '设置目标岗位，刷新今日计划';
      subtitle = '明确岗位方向与求职地区后，推荐和任务排序会更准确。';
      primaryText = '完善求职目标';
      primaryUrl = '/package-user/pages/profile-edit/profile-edit';
    } else if (isLoggedIn && stats.total > 0) {
      title = `今天有 ${Math.max(1, taskStats.pending || stats.active)} 项求职任务`;
      subtitle = stats.todayInterviews
        ? '今天有面试安排，优先完成岗位复盘和 STAR 案例准备。'
        : progress.buildDailyAdvice();
      primaryText = stats.todayInterviews ? '准备今日面试' : '查看今日任务';
      primaryUrl = stats.todayInterviews
        ? '/package-ai/pages/interview-setup/interview-setup'
        : '/package-ai/pages/daily-brief/daily-brief';
    } else if (isLoggedIn) {
      title = recommendationCount
        ? `今天有 ${recommendationCount} 个岗位值得优先推进`
        : '今天从一个目标岗位开始';
      subtitle = atsScore
        ? `最近 ATS 为 ${atsScore} 分，优先查看 ${role} 方向的高匹配机会。`
        : `围绕 ${role} 方向查看推荐，并用 JD 匹配确认是否值得投递。`;
      primaryText = recommendationCount ? '查看推荐岗位' : '搜索目标岗位';
      primaryUrl = '/pages/jobs/jobs';
    }

    this.setData({
      workbench: {
        isLoggedIn,
        title,
        subtitle,
        primaryText,
        primaryUrl,
        metrics: [
          { label: '推荐岗位', value: String(recommendationCount), suffix: '个', tone: recommendationCount ? 'blue' : 'muted', icon: '/images/icon-ai-assistant.png' },
          { label: '待投递', value: String(pendingApplications), suffix: '个', tone: pendingApplications ? 'amber' : 'muted', icon: '/images/icon-apply.png' },
          { label: '待面试', value: String(stats.interviews || 0), suffix: '个', tone: stats.interviews ? 'amber' : 'muted', icon: '/images/icon-interview.png' },
          { label: '进行中', value: String(stats.active || 0), suffix: '个', tone: stats.active ? 'blue' : 'muted', icon: '/images/icon-plan.png' }
        ],
        suggestionTitle: nextTask ? nextTask.title : (isLoggedIn ? '完成一次 JD 岗位匹配' : '先完成求职档案'),
        suggestionDesc: nextTask ? nextTask.desc : (isLoggedIn ? '用真实岗位校准简历关键词和投递优先级' : '补充简历、目标岗位与求职地区'),
        suggestionUrl: nextTask ? nextTask.url : (isLoggedIn ? '/package-ai/pages/jd-match/jd-match' : '/package-user/pages/profile-edit/profile-edit')
      }
    });
  },

  loadTodayTasks() {
    const tasks = dailyTasks.buildTasks();
    this.setData({
      todayTasks: tasks,
      todayTaskStats: dailyTasks.getStats(tasks)
    });
    let token = '';
    try { token = wx.getStorageSync('token') || ''; } catch (e) {}
    if (!token) return Promise.resolve(tasks);
    if (this._todayTaskSyncPromise) return this._todayTaskSyncPromise;

    const requestId = (this._todayTaskRequestId || 0) + 1;
    this._todayTaskRequestId = requestId;
    const payload = tasks.map(task => {
      const state = dailyTasks.readTaskState(task.id);
      return {
        id: task.id,
        type: task.type,
        title: task.title,
        desc: task.desc,
        url: task.url,
        priority: task.priority,
        done: state.done,
        doneKnown: state.pending
      };
    });

    const syncPromise = apiV4.syncTodayTasks({ tasks: payload }).then(response => {
      if (requestId !== this._todayTaskRequestId) return this.data.todayTasks;
      const rows = response && Array.isArray(response.data) ? response.data : [];
      if (!rows.length) return tasks;
      const priorityRank = { high: 0, medium: 1, low: 2 };
      const merged = rows.map(row => {
        const localKey = row.localKey || '';
        const storageKey = localKey || ('remote_' + row.id);
        const state = dailyTasks.readTaskState(storageKey);
        const serverDone = row.completed === true || row.status === 'completed';
        const keepPendingRemote = !localKey && state.pending && Number(state.serverId) === Number(row.id);
        const done = keepPendingRemote ? state.done : serverDone;
        if (!keepPendingRemote) dailyTasks.markTaskSynced(storageKey, serverDone, row.id);
        return {
          id: storageKey,
          serverId: Number(row.id),
          localKey,
          type: row.type || row.sourceType || 'general',
          title: row.title || '',
          desc: row.desc || row.detail || '',
          url: row.url || '',
          priority: row.priority || 'medium',
          done,
          pendingSync: keepPendingRemote,
          sourceType: row.sourceType || ''
        };
      }).sort((left, right) => (left.done - right.done)
        || ((priorityRank[left.priority] === undefined ? 9 : priorityRank[left.priority])
          - (priorityRank[right.priority] === undefined ? 9 : priorityRank[right.priority])))
        .slice(0, 6);
      this.setData({
        todayTasks: merged,
        todayTaskStats: dailyTasks.getStats(merged)
      });
      this.loadWorkbenchSummary();
      this.flushPendingTodayTaskUpdates();
      return merged;
    }).catch(error => {
      console.warn('[index] Today 任务同步失败，继续使用本地任务:', error && error.message || error);
      return tasks;
    });
    this._todayTaskSyncPromise = syncPromise.finally(() => {
      this._todayTaskSyncPromise = null;
    });
    return this._todayTaskSyncPromise;
  },

  flushPendingTodayTaskUpdates() {
    const pending = dailyTasks.getPendingRemoteUpdates();
    pending.forEach(item => {
      apiV4.updateTodayTask(item.serverId, { completed: item.done }).then(response => {
        const data = response && response.data || {};
        dailyTasks.markTaskSynced(item.key, data.completed === undefined ? item.done : data.completed, item.serverId);
        const tasks = (this.data.todayTasks || []).map(task => task.id === item.key
          ? Object.assign({}, task, { done: data.completed === undefined ? item.done : data.completed, pendingSync: false })
          : task);
        this.setData({ todayTasks: tasks, todayTaskStats: dailyTasks.getStats(tasks) });
        this.loadWorkbenchSummary();
      }).catch(error => {
        console.warn('[index] Today 待同步状态补传失败:', error && error.message || error);
      });
    });
  },

  toggleTodayTask(e) {
    const id = e.currentTarget.dataset.id;
    const current = (this.data.todayTasks || []).find(item => String(item.id) === String(id));
    if (current && current.serverId) {
      const done = !current.done;
      dailyTasks.setTaskDone(current.id, done, { pending: true, serverId: current.serverId });
      const tasks = (this.data.todayTasks || []).map(item => String(item.id) === String(id)
        ? Object.assign({}, item, { done, pendingSync: true })
        : item);
      this.setData({ todayTasks: tasks, todayTaskStats: dailyTasks.getStats(tasks) });
      this.loadWorkbenchSummary();
      apiV4.updateTodayTask(current.serverId, { completed: done }).then(response => {
        const data = response && response.data || {};
        const confirmed = data.completed === undefined ? done : data.completed;
        dailyTasks.markTaskSynced(current.id, confirmed, current.serverId);
        const latest = (this.data.todayTasks || []).map(item => String(item.id) === String(id)
          ? Object.assign({}, item, { done: confirmed, pendingSync: false })
          : item);
        this.setData({ todayTasks: latest, todayTaskStats: dailyTasks.getStats(latest) });
        this.loadWorkbenchSummary();
      }).catch(error => {
        console.warn('[index] Today 任务状态将在联网后重试:', error && error.message || error);
        wx.showToast({ title: '已离线保存，联网后同步', icon: 'none' });
      });
      return;
    }
    const result = dailyTasks.toggleTask(id);
    this.setData({
      todayTasks: result.tasks || dailyTasks.buildTasks(),
      todayTaskStats: result.stats || dailyTasks.getStats(result.tasks)
    });
    this.loadWorkbenchSummary();
  },

  openTodayTask(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    if (!featureFlags.allowNavigation(url)) return;
    navigation.safeNavigateTo(url);
  },

  goToJobSearch() {
    if (!featureFlags.allowNavigation('/package-user/pages/search/search')) return;
    wx.navigateTo({ url: '/package-user/pages/search/search' });
  },

  goToCampusList() {
    if (!featureFlags.allowNavigation('/pages/campus/campus')) return;
    navigation.safeNavigateTo('/pages/campus/campus');
  },

  goToCampusUpdateDetail(e) {
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id;
    if (!id) {
      this.goToCampusList();
      return;
    }
    const snapshot = (this.data.campusLatestUpdates || [])
      .filter(Boolean)
      .find(item => String(item.id) === String(id));
    if (snapshot) {
      try { wx.setStorageSync('campusDetailSnapshot_' + String(id), snapshot); } catch (err) {}
    }
    wx.navigateTo({ url: `/package-content/pages/campus-detail/campus-detail?id=${id}` });
  },

  onCampusLogoError(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    const clearLogo = item => item && String(item.id) === String(id)
      ? Object.assign({}, item, { companyLogo: '' })
      : item;
    this.setData({
      campusFeatured: clearLogo(this.data.campusFeatured),
      campusUpdates: (this.data.campusUpdates || []).map(clearLogo),
      campusLatestUpdates: (this.data.campusLatestUpdates || []).map(clearLogo)
    });
  },

  goToJobDetail(e) {
    if (!featureFlags.allowNavigation('/package-user/pages/job-detail/job-detail')) return;
    const detail = e.detail || {};
    const id = detail.id || e.currentTarget.dataset.id;
    const job = (this.data.recommendJobs || []).find(item => String(item.id) === String(id));
    if (job) {
      const snapshot = {
        id: job.id,
        title: job.title,
        company: job.company,
        logo: job.logoSrc || job.logo,
        logoFailed: !!job.logoFailed,
        companyInitial: job.companyInitial,
        city: job.city,
        state: job.state,
        type: job.type,
        salary: job.salary,
        postedAt: job.postedAt,
        optFriendly: job.optFriendly,
        applyLink: job.applyLink,
        description: job.rawDescription || job.description || ''
      };
      wx.setStorageSync('tempJobDetail', snapshot);
      wx.setStorageSync('jobDetailSnapshot_' + String(id), snapshot);
    }
    // 记录浏览历史（供推荐算法使用）
    const title = detail.title || e.currentTarget.dataset.title || '';
    if (title) browseHistory.add({ id, title });
    wx.navigateTo({ url: `/package-user/pages/job-detail/job-detail?id=${id}` });
  },

  goToCompanyDetail(e) {
    if (!featureFlags.allowNavigation('/package-user/pages/company-detail/company-detail')) return;
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({ url: `/package-user/pages/company-detail/company-detail?id=${id}&name=${encodeURIComponent(name)}` });
  },

  viewMoreJobs() {
    if (!featureFlags.allowNavigation('/pages/jobs/jobs')) return;
    navigation.safeNavigateTo('/pages/jobs/jobs');
  },

  viewMoreCompanies() {
    if (!featureFlags.allowNavigation('/package-user/pages/companies/companies')) return;
    wx.navigateTo({ url: '/package-user/pages/companies/companies' });
  },

  onBannerChange(e) {
    this.setData({ currentBanner: e.detail.current });
  },

  onAvatarError() {
    this.setData({ avatarUrl: '/images/default-avatar.png' });
  },

  onLogoError(e) {
    this.onJobLogoError(e);
  }
})

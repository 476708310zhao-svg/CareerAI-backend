// pages/index/index.js
const { getAggregatedJobs, getCompanies, getNews, normalizeCompanyLogo } = require('../../utils/api.js');
const config = require('../../utils/app-config.js');
const favUtil = require('../../utils/favorites.js');
const progress = require('../../utils/job-progress.js');
const demoData = require('../../utils/demo-data.js');
const matcher = require('../../utils/matcher.js');
const { formatSalaryRange } = require('../../utils/util.js');
const { normalizeBannerUrl } = require('../../utils/assets.js');
const browseHistory = require('../../utils/browse-history.js');
const featureFlags = require('../../utils/feature-flags.js');
const navigation = require('../../utils/navigation.js');
const BANNER_CACHE_KEY = 'cachedBanners_v2';
const HOME_NEWS_CACHE_KEY = 'cachedHomeNews_v1';
const HOT_COMPANIES_CACHE_KEY = 'cachedHotCompanies_v1';
const ALLOW_DEMO_FALLBACK = demoData.enabled();
const HOME_FEATURES = [
  { id: 1, name: '求职进度', icon: '/images/icon-apply.png', url: '/package-user/pages/job-progress/job-progress', badge: '2.0', bg: 'linear-gradient(145deg,#eef6ff,#f8fbff)' },
  { id: 2, name: '薪酬查询', icon: '/images/icon-salary.png', url: '/package-career/pages/salary/salary', badge: 'Hot', bg: 'linear-gradient(145deg,#ecfdf5,#f8fbff)' },
  { id: 3, name: '求职规划', icon: '/images/icon-plan.png', url: '/package-career/pages/career-planner/career-planner', badge: 'AI', isAi: true, bg: 'linear-gradient(145deg,#fff7ed,#f8fbff)' },
  { id: 4, name: '机构测评', icon: '/images/assess-active.png', url: '/pages/agencies/agencies', badge: '', bg: 'linear-gradient(145deg,#eef2ff,#f8fbff)' }
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
        desc: '岗位、简历与项目一站式处理',
        action: '立即使用',
        url: '/package-ai/pages/ai-assistant/ai-assistant'
      },
      tools: [
        { id: 1, title: 'AI 模拟面试', desc: '按公司与岗位定制出题', icon: '/images/icon-interview.png', url: '/package-ai/pages/interview-setup/interview-setup', tone: 'tone-blue' },
        { id: 2, title: '简历诊断', desc: '优化亮点与表达方式', icon: '/images/icon-resume.png', url: '/package-career/pages/resume/resume', tone: 'tone-mint' },
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
    recommendTitle: '为您推荐',
    prefTags: [],
    activePrefTag: '',

    // 5. 求职快讯
    newsFeed: [],

    // 6. 资料完整度引导
    profileCompleteness: 0,
    profileHints: [],
    showProfileGuide: false,
    showBackToTop: false, // 控制回到顶部按钮显隐
    progressSummary: {
      total: 0,
      active: 0,
      dueSoon: 0,
      todayInterviews: 0,
      advice: ''
    }
  },

  onLoad() {
    const flags = featureFlags.getCurrentFlags();
    const recruitmentEnabled = !!flags.recruitment;
    this.applyFeatureState(flags);
    this.normalizeHomeData();
    try {
      this.loadUserProfile();
      this.loadProgressSummary();
    } catch(e) { wx.showToast({ title: 'E1:' + e.message, icon: 'none', duration: 5000 }); return; }
    try {
      this.fetchBanners();
    } catch(e) { wx.showToast({ title: 'E2:' + e.message, icon: 'none', duration: 5000 }); return; }
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
    if (this.data.recruitmentEnabled) this.fetchRecommendJobs({ force: true });
    this.fetchHotCompanies({ force: true });
    this.buildNewsFeed({ force: true });
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
    this.clearDeferredHomeTimers();
    this._homeTimers = [
      setTimeout(() => {
        try { this.fetchHotCompanies(); } catch (e) { console.warn('[fetchHotCompanies]', e); }
      }, 360),
      setTimeout(() => {
        try { this.buildNewsFeed(); } catch (e) { console.warn('[buildNewsFeed]', e); }
      }, 760)
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
      { id: 1, gradient: 'linear-gradient(135deg,#1C3578 0%,#2B5CE6 100%)', icon: '🚀', title: '海外留学生求职季开启', subtitle: '2026 春招全面启动', url: '/pages/jobs/jobs' },
      { id: 2, gradient: 'linear-gradient(135deg,#7C3AED 0%,#DB2777 100%)', icon: '🏢', title: '名企校招职位推荐', subtitle: '腾讯 · 字节 · 阿里 热招中', url: '/package-user/pages/search/search' },
      { id: 3, gradient: 'linear-gradient(135deg,#059669 0%,#0EA5E9 100%)', icon: '🤖', title: 'AI 模拟面试上线', subtitle: 'DeepSeek 驱动，智能评分', url: '/package-ai/pages/interview-setup/interview-setup' }
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
      this.setData({ recommendJobs: this.withCompanyLogos(cached).slice(0, 5), loadingJobs: false });
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
      jobs = jobs.slice(0, 5);

      this.setData({ recommendJobs: jobs, loadingJobs: false });
      // 缓存成功结果，下次秒开
      wx.setStorageSync('cachedRecommendJobs', jobs);
    } catch (error) {
      console.warn('[fetchRecommendJobs] 获取推荐职位失败:', error);
        // 只有在没有任何数据时才加载 Mock
        if (ALLOW_DEMO_FALLBACK && this.data.recommendJobs.length === 0) {
          this.loadMockJobs();
        } else {
          this.setData({ loadingJobs: false });
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
    this.setData({ loadingJobs: false, recommendJobs: this.withCompanyLogos(RECOMMEND_JOBS).slice(0, 5) });
  },

  // ======== 动态快讯 ========
  buildNewsFeed(options) {
    const force = !!(options && options.force);
    if (!force) {
      const cached = wx.getStorageSync(HOME_NEWS_CACHE_KEY);
      if (cached && cached.length && this.data.newsFeed.length === 0) {
        this.setNewsFeed(cached);
      }
    }

    getNews({ tab: 'all', lang: 'zh' }).then(res => {
      const articles = res && Array.isArray(res.articles) ? res.articles : [];
      if (!articles.length) {
        if (ALLOW_DEMO_FALLBACK && this.data.newsFeed.length === 0) this.setNewsFeed(this.buildLocalNewsFeed());
        return;
      }
      const remoteFeed = articles.slice(0, 5).map(item => this.normalizeNewsItem(item));
      const feed = remoteFeed.length >= 3 || !ALLOW_DEMO_FALLBACK
        ? remoteFeed
        : [...remoteFeed, ...this.buildLocalNewsFeed()].slice(0, 5);
      this.setNewsFeed(feed);
      wx.setStorageSync(HOME_NEWS_CACHE_KEY, feed);
    }).catch(err => {
      console.warn('[buildNewsFeed] 获取官网资讯失败:', err);
      if (ALLOW_DEMO_FALLBACK && this.data.newsFeed.length === 0) {
        this.setNewsFeed(this.buildLocalNewsFeed());
      }
    });
  },

  buildLocalNewsFeed() {
    const allNews = demoData.getList('NEWS_FEED');
    if (!allNews.length) return [];

    const feed = [];
    const profile = wx.getStorageSync('userProfile') || {};

    // 个性化快讯
    if (profile.major) {
      feed.push({
        id: 'dynamic2', type: 'data', isPersonal: true,
        title: profile.major + ' 专业热门岗位趋势',
        desc: '根据你的专业，为你推荐最匹配的求职方向和技能要求',
        time: '今天'
      });
    }

    // 按日期轮换选取，保证每天看到不同快讯
    const today = new Date();
    const dayIndex = today.getDate() % allNews.length;
    const timeLabels = ['刚刚', '1小时前', '2小时前', '3小时前', '5小时前', '今天', '昨天'];
    const needed = 5 - feed.length;
    for (let i = 0; i < needed; i++) {
      const item = allNews[(dayIndex + i) % allNews.length];
      feed.push({ ...item, id: item.id + '_' + i, time: timeLabels[i + (feed.length > needed ? 1 : 0)] || '昨天' });
    }

    return feed.slice(0, 5);
  },

  normalizeNewsItem(item) {
    return {
      id: item.id,
      type: item.type || 'news',
      title: item.title || '求职快讯',
      desc: item.desc || item.summary || item.description || '',
      content: item.content || item.body || item.desc || '',
      source: item.source || (item.isOfficial ? '职引官网' : '求职助手'),
      time: item.time || '近期',
      url: item.url || '',
      image: item.imageUrl || item.image_url || item.cover || '',
      isOfficial: !!item.isOfficial
    };
  },

  setNewsFeed(feed) {
    const typeLabels = {
      tip: '技巧',
      news: '资讯',
      policy: '政策',
      data: '数据'
    };

    this.setData({
      newsFeed: (feed || []).slice(0, 5).map(item => Object.assign({}, item, {
        categoryLabel: typeLabels[item.type] || '数据',
        sourceText: item.source || '求职助手'
      }))
    });
  },

  // 查看快讯详情
  viewNewsDetail(e) {
    const item = e.currentTarget.dataset.item;
    wx.setStorageSync('currentNewsDetail', item);
    wx.navigateTo({ url: '/package-content/pages/news-detail/news-detail' });
  },

  // 更多快讯
  goToNews() {
    wx.navigateTo({ url: '/package-content/pages/news/news' });
  },

  // ======== 导航跳转 ========
  navigateToPage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    if (!featureFlags.allowNavigation(url)) return;
    navigation.safeNavigateTo(url);
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

  goToJobSearch() {
    if (!featureFlags.allowNavigation('/package-user/pages/search/search')) return;
    wx.navigateTo({ url: '/package-user/pages/search/search' });
  },

  goToJobDetail(e) {
    if (!featureFlags.allowNavigation('/package-user/pages/job-detail/job-detail')) return;
    const id = e.currentTarget.dataset.id;
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
    const title = e.currentTarget.dataset.title || '';
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
    wx.switchTab({ url: '/pages/jobs/jobs' });
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

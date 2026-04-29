// pages/index/index.js
const { getJobs, getCompanies, normalizeCompanyLogo } = require('../../utils/api.js');
const config = require('../../utils/config.js');
const favUtil = require('../../utils/favorites.js');
const { RECOMMEND_JOBS, NEWS_FEED: ALL_NEWS } = require('../../utils/mock-data.js');
const matcher = require('../../utils/matcher.js');
const { formatSalaryRange } = require('../../utils/util.js');

// TabBar 页面路径列表，用于判断跳转方式
const TAB_PAGES = ['/pages/index/index', '/pages/jobs/jobs', '/pages/experiences/experiences', '/pages/agencies/agencies', '/pages/profile/profile'];

Page({
  data: {
    // 0. 用户问候
    greeting: '你好，同学',
    avatarUrl: '/images/default-avatar.png',

    // 1. 轮播图（默认空，onLoad 后从 API 拉取，失败则用兜底数据）
    bannerList: [],
    currentBanner: 0,
    apiBase: config.API_BASE_URL,

    // 2. 金刚区（8 入口，每个配独立背景色）
    features: [
      { id: 1, name: '网申助手', icon: '/images/application.png', url: '/pages/applications/applications', badge: '', bg: '#eef6ff' },
      { id: 2, name: '薪酬查询', icon: '/images/experience.png', url: '/pages/salary/salary', badge: 'Hot', bg: '#fff4e6' },
      { id: 3, name: 'AI面试',   icon: '/images/interview.png',  url: '/pages/interview-setup/interview-setup', badge: 'New', bg: '#f0e6ff' },
      { id: 4, name: '简历诊断', icon: '/images/salary.png',     url: '/pages/resume/resume', badge: 'New', bg: '#e6fff0' },
      { id: 5, name: '求职规划', icon: '/images/application.png', url: '/pages/career-planner/career-planner', badge: 'AI', bg: '#fff0f0' },
      { id: 6, name: 'AI助手', icon: '/images/interview.png', url: '/pages/ai-workflow/ai-workflow', badge: 'AI', bg: '#fffbe6' },
      { id: 7, name: 'AI项目', icon: '/images/experience-active.png', url: '/pages/project-builder/project-builder', badge: 'New', bg: '#f5f3ff' },
      { id: 8, name: '校招日历', icon: '/images/salary.png', url: '/pages/campus/campus', badge: '', bg: '#f0fdf4' }
    ],

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
  },

  onLoad() {
    try {
      this.loadUserProfile();
    } catch(e) { wx.showToast({ title: 'E1:' + e.message, icon: 'none', duration: 5000 }); return; }
    try {
      this.fetchBanners();
    } catch(e) { wx.showToast({ title: 'E2:' + e.message, icon: 'none', duration: 5000 }); return; }
    try {
      this.loadCachedOrMockJobs();
    } catch(e) { wx.showToast({ title: 'E3:' + e.message, icon: 'none', duration: 5000 }); return; }
    try {
      this.fetchRecommendJobs();
    } catch(e) { wx.showToast({ title: 'E4:' + e.message, icon: 'none', duration: 5000 }); return; }
    try {
      this.fetchHotCompanies();
    } catch(e) { console.warn('[fetchHotCompanies]', e); }
    try {
      this.buildNewsFeed();
    } catch(e) { wx.showToast({ title: 'E5:' + e.message, icon: 'none', duration: 5000 }); }
  },

  onShow() {
    this.loadUserProfile();
    this.updateMessageBadge();
    this.buildNewsFeed();
    // 确保当前页面的窗口背景和导航栏背景为纯白色
    wx.setBackgroundColor({
      backgroundColor: '#ffffff', // 设置窗口背景为纯白色
      backgroundColorTop: '#ffffff', // 顶部背景为纯白色（下拉刷新时可见）
      backgroundColorBottom: '#ffffff' // 底部背景为纯白色
    });
    // 同步设置导航栏背景色为纯白色，确保与页面内容无缝衔接
    wx.setNavigationBarColor({
      frontColor: '#000000', // 导航栏文字和图标颜色为黑色
      backgroundColor: '#ffffff', // 导航栏背景为纯白色
      animation: {
        duration: 300 // 动画时长
      }
    });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.fetchRecommendJobs();
    setTimeout(() => wx.stopPullDownRefresh(), 800);
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
      title: '2026春招全面启动，快来看看这些适合你的高薪岗位！',
      path: '/pages/index/index',
      imageUrl: '/images/share-cover.png' // 建议设计一张带有强吸引力（如名企Logo集合）的封面图
    };
  },

  // 小程序分享到朋友圈
  onShareTimeline() {
    return {
      title: '我正在使用这款求职神器，AI模拟面试+名企内推直达！'
    };
  },

  // ======== Banner 数据 ========
  fetchBanners() {
    const FALLBACK = [
      { id: 1, gradient: 'linear-gradient(135deg,#1C3578 0%,#2B5CE6 100%)', icon: '🚀', title: '海外留学生求职季开启', subtitle: '2026 春招全面启动', url: '/pages/jobs/jobs' },
      { id: 2, gradient: 'linear-gradient(135deg,#7C3AED 0%,#DB2777 100%)', icon: '🏢', title: '名企校招职位推荐', subtitle: '腾讯 · 字节 · 阿里 热招中', url: '/pages/search/search' },
      { id: 3, gradient: 'linear-gradient(135deg,#059669 0%,#0EA5E9 100%)', icon: '🤖', title: 'AI 模拟面试上线', subtitle: 'DeepSeek 驱动，智能评分', url: '/pages/interview-setup/interview-setup' }
    ];

    // 立即显示缓存或兜底，不阻塞页面
    const cached = wx.getStorageSync('cachedBanners');
    this.setData({ bannerList: (cached && cached.length > 0) ? cached : FALLBACK });

    // 后台静默拉取最新数据，5 秒超时
    wx.request({
      url: config.API_BASE_URL + '/api/banners',
      method: 'GET',
      timeout: 5000,
      success: (res) => {
        const list = res.data && res.data.code === 0 && res.data.data;
        if (list && list.length > 0) {
          this.setData({ bannerList: list });
          wx.setStorageSync('cachedBanners', list);
        }
      },
      fail: () => {}
    });
  },

  // 优先加载缓存 → 缓存不足3条则显示 Mock，保证页面秒开
  loadCachedOrMockJobs() {
    const cached = wx.getStorageSync('cachedRecommendJobs');
    if (cached && cached.length >= 3) {
      this.setData({ recommendJobs: this.withCompanyLogos(cached).slice(0, 5), loadingJobs: false });
    } else {
      this.loadMockJobs();
    }
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
    [...(wx.getStorageSync('jobBrowseHistory') || []), ...(wx.getStorageSync('viewHistory') || [])]
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
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
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
    // 同步 TabBar "我的" 角标
    if (count > 0) {
      wx.setTabBarBadge({ index: 4, text: count > 99 ? '99+' : String(count) });
    } else {
      wx.removeTabBarBadge({ index: 4 });
    }
  },

  // ======== 职位数据 ========
  async fetchRecommendJobs() {
    // 如果已有数据就不显示 loading 骨架屏，静默刷新
    if (this.data.recommendJobs.length === 0) {
      this.setData({ loadingJobs: true });
    }
    const keyword = this.data.activePrefTag || (this.userKeywords && this.userKeywords[0]) || 'Software Engineer';

    try {
      const res = await getJobs({ keyword, country: 'us', size: 5, page: 1, timeout: 5000 });
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
        if (this.data.recommendJobs.length === 0) {
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
    this.fetchRecommendJobs();
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
    this.fetchRecommendJobs();
  },

  // 公司 Logo 加载失败时，自动降级为文字头像
  onCompanyLogoError(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`hotCompanies[${idx}].logoFailed`]: true });
  },

  fetchHotCompanies() {
    getCompanies({ page: 1, pageSize: 12 }).then(res => {
      const list = res && res.data && Array.isArray(res.data.list) ? res.data.list : [];
      if (!list.length) return;
      this.setData({
        hotCompanies: list.map(company => ({
          id: company.id,
          name: company.name,
          description: company.industryL2 || company.industry || company.officialDomain || '',
          domain: company.officialDomain || '',
          logo: company.logo,
          initial: (company.name || '?').slice(0, 1).toUpperCase(),
          color: company.brandColor || '#2563eb'
        }))
      });
    }).catch(err => {
      console.warn('[fetchHotCompanies] 获取热门公司失败:', err);
    });
  },

  // 职位 Logo 加载失败时，自动降级为文字头像
  onJobLogoError(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`recommendJobs[${index}].logoFailed`]: true });
  },

  buildCompanyLogo(companyName) {
    if (!companyName) return '';
    return normalizeCompanyLogo(`/api/logo?name=${encodeURIComponent(companyName)}`);
  },

  withCompanyLogos(jobs) {
    return (jobs || []).map(job => Object.assign({}, job, {
      logo: this.buildCompanyLogo(job.company) || job.logo || '',
      logoFailed: false,
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
        postedAt: this.formatTime(job.job_posted_at_datetime_utc)
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
    this.setData({ loadingJobs: false, recommendJobs: this.withCompanyLogos(RECOMMEND_JOBS).slice(0, 5) });
  },

  // ======== 动态快讯 ========
  buildNewsFeed() {
    const allNews = ALL_NEWS;

    const feed = [];
    const interviewHistory = wx.getStorageSync('interviewHistory') || [];
    const profile = wx.getStorageSync('userProfile') || {};

    // 个性化快讯
    if (interviewHistory.length > 0) {
      const latest = interviewHistory[0];
      feed.push({
        id: 'dynamic1', type: 'tip', isPersonal: true,
        title: '你的最近面试得分 ' + (latest.score || '--') + ' 分',
        desc: '继续练习可以提升面试表现，试试更高难度的模拟面试',
        time: '刚刚'
      });
    }

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

    this.setData({ newsFeed: feed.slice(0, 5) });
  },

  // 查看快讯详情
  viewNewsDetail(e) {
    const item = e.currentTarget.dataset.item;
    wx.setStorageSync('currentNewsDetail', item);
    wx.navigateTo({ url: '/pages/news-detail/news-detail' });
  },

  // 更多快讯
  goToNews() {
    wx.navigateTo({ url: '/pages/news/news' });
  },

  // ======== 导航跳转 ========
  navigateToPage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    const isTab = TAB_PAGES.some(p => url.includes(p.replace('/pages/', '')));
    if (isTab) {
      wx.switchTab({ url, fail: () => wx.navigateTo({ url }) });
    } else {
      wx.navigateTo({ url });
    }
  },

  goToJobSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  goToJobDetail(e) {
    const id = e.currentTarget.dataset.id;
    // 记录浏览历史（供推荐算法使用）
    const title = e.currentTarget.dataset.title || '';
    if (title) {
      let history = wx.getStorageSync('viewHistory') || [];
      history.unshift({ id, title, time: Date.now() });
      if (history.length > 20) history = history.slice(0, 20);
      wx.setStorageSync('viewHistory', history);
    }
    wx.navigateTo({ url: `/pages/job-detail/job-detail?id=${id}` });
  },

  goToCompanyDetail(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({ url: `/pages/company-detail/company-detail?id=${id}&name=${encodeURIComponent(name)}` });
  },

  viewMoreJobs() {
    wx.switchTab({ url: '/pages/jobs/jobs' });
  },

  viewMoreCompanies() {
    wx.navigateTo({ url: '/pages/companies/companies' });
  },

  onBannerChange(e) {
    this.setData({ currentBanner: e.detail.current });
  },

  onAvatarError() {
    this.setData({ avatarUrl: '/images/default-avatar.png' });
  },

  onLogoError(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx !== undefined) {
      this.setData({ [`recommendJobs[${idx}].logoFailed`]: true });
    }
  }
})

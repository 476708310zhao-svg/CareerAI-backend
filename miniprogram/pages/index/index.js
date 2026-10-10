// pages/index/index.js
const { getAggregatedJobs, normalizeCompanyLogo } = require('../../utils/api.js');
const favUtil = require('../../utils/favorites.js');
const progress = require('../../utils/job-progress.js');
const jdMatch = require('../../utils/jd-match.js');
const dailyTasks = require('../../utils/daily-tasks.js');
const demoData = require('../../utils/demo-data.js');
const matcher = require('../../utils/matcher.js');
const { formatSalaryRange } = require('../../utils/util.js');
const browseHistory = require('../../utils/browse-history.js');
const featureFlags = require('../../utils/feature-flags.js');
const navigation = require('../../utils/navigation.js');
const { markCachedDataMeta } = require('../../utils/data-provenance.js');
const apiV4 = require('../../utils/api-v4.js');
const ownerStorage = require('../../utils/owner-storage.js');
const unreadMessages = require('../../utils/unread-messages.js');
const ALLOW_DEMO_FALLBACK = demoData.enabled();
// TabBar 页面路径列表，用于判断跳转方式
Page({
  data: {
    // 0. 用户问候
    greeting: '你好，同学',
    avatarUrl: '/images/default-avatar.png',

    skeletonRows: [1, 2, 3],
    recruitmentEnabled: true,
    homeRecommendationsEnabled: false,
    membershipEnabled: false,

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
      title: '正在读取今日任务',
      subtitle: '任务加载完成后，这里只显示当前最重要的一步。',
      meta: '尚未读取申请与任务数据',
      primaryText: '查看申请进度',
      primaryUrl: '/pages/applications/applications',
      suggestionTitle: '先完成求职档案',
      suggestionDesc: '补充简历、目标岗位与求职地区',
      suggestionUrl: '/package-user/pages/profile-edit/profile-edit'
    },
    progressSummary: {
      total: 0,
      active: 0,
      dueSoon: 0,
      todayInterviews: 0,
      advice: ''
    },
    todayTasks: [],
    todaySecondaryTasks: [],
    todayTaskStats: {
      total: 0,
      done: 0,
      pending: 0,
      percent: 0
    }
  },

  onLoad() {
    this._unloaded = false;
    this._visible = true;
    this._ownerScope = ownerStorage.capture();
    const flags = featureFlags.getCurrentFlags();
    const recruitmentEnabled = !!flags.recruitment;
    const homeRecommendationsEnabled = recruitmentEnabled && !!flags.home_recommendations;
    this.applyFeatureState(flags);
    try {
      this.loadUserProfile();
      this.loadProgressSummary();
      this.loadTodayTasks();
      this.loadWorkbenchSummary();
      this.syncWorkbenchReports();
    } catch (e) {
      console.warn('[index] 初始化求职计划失败:', e);
    }
    if (homeRecommendationsEnabled) {
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
  },

  applyRecruitmentState(enabled) {
    const recruitmentEnabled = !!enabled;
    this.setData({
      recruitmentEnabled,
      recommendJobs: recruitmentEnabled ? this.data.recommendJobs : [],
      loadingJobs: recruitmentEnabled ? this.data.loadingJobs : false
    });
  },

  applyFeatureState(flags) {
    const nextFlags = flags || {};
    const recruitmentEnabled = !!nextFlags.recruitment;
    const homeRecommendationsEnabled = recruitmentEnabled && !!nextFlags.home_recommendations;
    this.applyRecruitmentState(recruitmentEnabled);
    if (!homeRecommendationsEnabled) clearTimeout(this._initialRecommendTimer);
    this.setData({
      homeRecommendationsEnabled,
      membershipEnabled: !!nextFlags.membership,
      recommendJobs: homeRecommendationsEnabled ? this.data.recommendJobs : [],
      loadingJobs: homeRecommendationsEnabled ? this.data.loadingJobs : false,
      jobsError: homeRecommendationsEnabled ? this.data.jobsError : false
    });
  },

  _onFeatureFlagsChange(flags) {
    const wasRecommendationsEnabled = this.data.homeRecommendationsEnabled;
    this.applyFeatureState(flags);
    this.loadWorkbenchSummary();
    if (this.data.homeRecommendationsEnabled && !wasRecommendationsEnabled) {
      this.loadCachedOrMockJobs();
      this.fetchRecommendJobs();
    }
  },

  onShow() {
    this._unloaded = false;
    this._visible = true;
    const owner = ownerStorage.capture();
    const ownerChanged = owner !== this._ownerScope;
    if (ownerChanged) {
      this._ownerScope = owner;
      this._todayTaskRequestId = (this._todayTaskRequestId || 0) + 1;
      this._workbenchReportRequestId = (this._workbenchReportRequestId || 0) + 1;
      this._recommendRequestId = (this._recommendRequestId || 0) + 1;
      this.setData({ recommendJobs: [], todayTasks: [], todaySecondaryTasks: [], todayTaskStats: dailyTasks.getStats([]) });
    }
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
    if (this.data.homeRecommendationsEnabled
      && (ownerChanged || this.data.loadingJobs || !(this.data.recommendJobs || []).length)) {
      this.loadCachedOrMockJobs();
      this.fetchRecommendJobs({ force: true });
    }
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
    if (this.data.homeRecommendationsEnabled) this.fetchRecommendJobs({ force: true });
    setTimeout(() => wx.stopPullDownRefresh(), 800);
  },

  onUnload() {
    this._unloaded = true;
    this._visible = false;
    this._todayTaskRequestId = (this._todayTaskRequestId || 0) + 1;
    this._workbenchReportRequestId = (this._workbenchReportRequestId || 0) + 1;
    this._recommendRequestId = (this._recommendRequestId || 0) + 1;
    this._todayTaskSyncPromise = null;
    this._todayTaskSyncOwner = '';
    this._workbenchReportSyncing = false;
    this._workbenchReportOwner = '';
    clearTimeout(this._initialRecommendTimer);
  },

  onHide() {
    this._visible = false;
    this._todayTaskRequestId = (this._todayTaskRequestId || 0) + 1;
    this._workbenchReportRequestId = (this._workbenchReportRequestId || 0) + 1;
    this._recommendRequestId = (this._recommendRequestId || 0) + 1;
    this._todayTaskSyncPromise = null;
    this._todayTaskSyncOwner = '';
    this._workbenchReportSyncing = false;
    this._workbenchReportOwner = '';
  },

  isHomeRequestCurrent(owner, requestId, field) {
    return !this._unloaded && this._visible && ownerStorage.isCurrent(owner)
      && requestId === this[field];
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
      imageUrl: '/images/banner1.jpg'
    };
  },

  // 小程序分享到朋友圈
  onShareTimeline() {
    return {
      title: '职引 | 留学生AI求职助手',
      imageUrl: '/images/banner1.jpg'
    };
  },

  // 优先加载缓存；开发兜底只在 ENABLE_DEMO_FALLBACK=true 时启用
  loadCachedOrMockJobs() {
    const cached = ownerStorage.get('cachedRecommendJobs', '', []);
    if (cached && cached.length >= 3) {
      const cachedJobs = cached.map(item => Object.assign({}, item, {
        dataMeta: markCachedDataMeta(item.dataMeta, {
          domain: 'job', source: item.source || item._source, publishedAt: item.postedAtRaw
        })
      }));
      this.setData({
        recommendJobs: this.withCompanyLogos(cachedJobs).slice(0, 3),
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
    const searchHistory = progress.currentOwnerScope()
      ? ownerStorage.get('jobSearchHistory', '', [])
      : [];
    [...new Set(Array.isArray(searchHistory) ? searchHistory : [])].slice(0, 3)
      .forEach(kw => sourceKws.push({ kw, source: '搜索' }));
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
    getApp().setUnreadCount(unreadMessages.get());
  },

  // ======== 职位数据 ========
  async fetchRecommendJobs(options) {
    if (!this.data.homeRecommendationsEnabled) {
      this.setData({ recommendJobs: [], loadingJobs: false, jobsError: false });
      return;
    }
    const force = !!(options && options.force);
    const owner = ownerStorage.capture();
    const requestId = (this._recommendRequestId || 0) + 1;
    this._recommendRequestId = requestId;
    this.setData({ jobsError: false });
    // 如果已有数据就不显示 loading 骨架屏，静默刷新
    if (this.data.recommendJobs.length === 0) {
      this.setData({ loadingJobs: true });
    }
    const keyword = this.data.activePrefTag || (this.userKeywords && this.userKeywords[0]) || 'Software Engineer';

    try {
      const res = await getAggregatedJobs({ keyword, country: 'us', size: 20, page: 1, noCache: force });
      if (!this.isHomeRequestCurrent(owner, requestId, '_recommendRequestId')) return;
      if (!res.data || res.data.length === 0) throw new Error('API Empty');

      let jobs = this.formatJobData(res.data);
      jobs = this.rankByProfile(jobs);
      jobs = this.withCompanyLogos(jobs);
      jobs = jobs.slice(0, 3);

      this.setData({ recommendJobs: jobs, loadingJobs: false, jobsError: false });
      // 缓存成功结果，下次秒开
      ownerStorage.set('cachedRecommendJobs', '', jobs);
      this.loadTodayTasks();
      this.loadWorkbenchSummary();
    } catch (error) {
      if (!this.isHomeRequestCurrent(owner, requestId, '_recommendRequestId')) return;
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
        optFriendly: /\b(opt|cpt|h[- ]?1b|visa\s+sponsor|will\s+sponsor|work\s+authori)/i.test(desc),
        postedAtRaw: job.job_posted_at_datetime_utc || '',
        dataMeta: job.dataMeta,
        source: job._source || ''
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
    if (days === 0) return '今日更新';
    if (days === 1) return '昨日更新';
    if (days > 1 && days <= 7) return days + '天前更新';
    return key.slice(5) + '更新';
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
    const resume = ownerStorage.get('onlineResume', '', {});
    const reports = jdMatch.getReports();
    const resumeScore = Number(resume.atsScore || resume.score || resume.resumeScore || 0);
    const latestReport = Array.isArray(reports) && reports.length ? reports[0] : null;
    const reportScore = latestReport ? Number(latestReport.score || latestReport.atsScore || 0) : 0;
    return Math.max(0, Math.round(resumeScore || reportScore || 0));
  },

  syncWorkbenchReports() {
    const owner = ownerStorage.capture();
    if (this._workbenchReportSyncing && this._workbenchReportOwner === owner) return;
    const requestId = (this._workbenchReportRequestId || 0) + 1;
    this._workbenchReportRequestId = requestId;
    this._workbenchReportSyncing = true;
    this._workbenchReportOwner = owner;
    jdMatch.fetchRemoteReports()
      .then(() => {
        if (this.isHomeRequestCurrent(owner, requestId, '_workbenchReportRequestId')) this.loadWorkbenchSummary();
      })
      .catch(() => {})
      .finally(() => {
        if (this._workbenchReportOwner === owner && requestId === this._workbenchReportRequestId) {
          this._workbenchReportSyncing = false;
          this._workbenchReportOwner = '';
        }
      });
  },

  getWorkbenchTargetRole(profile) {
    const p = profile || {};
    const direct = p.targetRole || p.target_role || p.jobTitle || p.position || p.intentRole || p.major;
    if (direct) return String(direct).trim();
    const keywords = this.userKeywords || [];
    return keywords[0] || '目标岗位';
  },

  buildPrimaryTaskMeta(task, applications) {
    if (!task) return '';
    const rows = Array.isArray(applications) ? applications : [];
    const url = String(task.url || '');
    const applicationIdMatch = url.match(/[?&]applicationId=(\d+)/);
    const taskIdMatch = String(task.id || '').match(/(?:due|interview)_(\d+)/);
    const applicationId = applicationIdMatch ? applicationIdMatch[1] : (taskIdMatch ? taskIdMatch[1] : '');
    const application = applicationId
      ? rows.find(item => String(item.id || item.applicationId || '') === applicationId)
      : null;
    const company = String(task.company || (application && application.company) || '').trim();
    const role = String(task.role || task.position || (application && (application.jobTitle || application.position)) || '').trim();
    const deadline = String(task.deadline || (application && (application.deadline || application.deadlineDate)) || '').trim();
    const priority = String(task.priority || '').toLowerCase();
    const reason = task.selectionReason || task.reason
      || (priority === 'high' ? '任务标记为高优先级' : '今日待办中排序最前');
    return [
      company || role ? [company, role].filter(Boolean).join(' · ') : '',
      deadline ? `截止 ${deadline}` : '',
      `选择依据：${reason}`
    ].filter(Boolean).join(' · ');
  },

  loadWorkbenchSummary() {
    let profile = {};
    try {
      profile = wx.getStorageSync('userProfile') || {};
    } catch (e) {}
    const stats = progress.getStats();
    const atsScore = this.readLatestAtsScore();
    const applications = progress.getList();
    const nextTask = (this.data.todayTasks || []).find(item => !item.done
      && (this.data.recruitmentEnabled || !featureFlags.isRecruitmentUrl(item.url))) || null;
    const hasToken = (() => {
      try { return !!wx.getStorageSync('token'); } catch (e) { return false; }
    })();
    const resume = ownerStorage.get('onlineResume', '', {});
    const hasResume = atsScore > 0 || Object.keys(resume || {}).some(key => !!resume[key]);
    const isLoggedIn = !!(hasToken || profile.nickName || hasResume || stats.total);
    const hasApplications = Number(stats.total || 0) > 0;
    let title;
    let subtitle;
    let meta;
    let primaryText;
    let primaryUrl;
    if (nextTask) {
      title = nextTask.title;
      subtitle = nextTask.desc || '继续推进当前申请的下一步。';
      meta = this.buildPrimaryTaskMeta(nextTask, applications);
      primaryText = nextTask.type === 'interview' ? '准备今日面试' : '开始处理';
      primaryUrl = nextTask.url || '/pages/applications/applications';
    } else if (!hasApplications) {
      if (this.data.recruitmentEnabled) {
        title = '找到第一个目标岗位';
        subtitle = '暂无申请记录，先搜索岗位并加入待投递。';
        meta = '当前申请记录为 0 条';
        primaryText = '去找岗位';
        primaryUrl = '/pages/jobs/jobs';
      } else {
        title = '先准备求职资料';
        subtitle = '岗位服务暂未开放，可以先完善简历并查看求职资源。';
        meta = '当前申请记录为 0 条 · 岗位服务未开放';
        primaryText = '打开资源中心';
        primaryUrl = '/pages/resources/resources';
      }
    } else {
      title = '暂时没有待处理事项';
      subtitle = '回顾申请进度，确认是否有新的截止日或面试节点。';
      meta = `当前有 ${Number(stats.active || 0)} 条申请正在推进`;
      primaryText = '查看申请进度';
      primaryUrl = '/pages/applications/applications';
    }

    const primaryTaskId = nextTask ? String(nextTask.id || '') : '';
    const todaySecondaryTasks = (this.data.todayTasks || [])
      .filter(item => !item.done && String(item.id || '') !== primaryTaskId)
      .slice(0, 2);

    this.setData({
      todaySecondaryTasks,
      workbench: {
        isLoggedIn,
        title,
        subtitle,
        meta,
        primaryText,
        primaryUrl,
        suggestionTitle: nextTask && hasApplications ? nextTask.title : title,
        suggestionDesc: subtitle
      }
    });
  },

  loadTodayTasks() {
    const tasks = dailyTasks.buildTasks().slice(0, 3);
    this.setData({
      todayTasks: tasks,
      todayTaskStats: dailyTasks.getStats(tasks)
    });
    let token = '';
    try { token = wx.getStorageSync('token') || ''; } catch (e) {}
    if (!token) return Promise.resolve(tasks);
    const owner = ownerStorage.capture();
    if (this._todayTaskSyncPromise && this._todayTaskSyncOwner === owner) return this._todayTaskSyncPromise;

    const requestId = (this._todayTaskRequestId || 0) + 1;
    this._todayTaskRequestId = requestId;
    this._todayTaskSyncOwner = owner;
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
        doneKnown: state.pending,
        updatedAt: state.updatedAt
      };
    });

    const syncPromise = apiV4.syncTodayTasks({ tasks: payload }).then(response => {
      if (!this.isHomeRequestCurrent(owner, requestId, '_todayTaskRequestId')) return this.data.todayTasks;
      const rows = response && Array.isArray(response.data) ? response.data : [];
      if (!rows.length) return tasks;
      const priorityRank = { high: 0, medium: 1, low: 2 };
      const merged = rows.map(row => {
        const localKey = row.localKey || '';
        const storageKey = localKey || ('remote_' + row.id);
        const serverDone = row.completed === true || row.status === 'completed';
        const state = dailyTasks.reconcileServerTask(storageKey, row);
        const keepPendingRemote = state.pending === true;
        const done = keepPendingRemote ? state.done : serverDone;
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
        .slice(0, 3);
      this.setData({
        todayTasks: merged,
        todayTaskStats: dailyTasks.getStats(merged)
      });
      this.loadWorkbenchSummary();
      this.flushPendingTodayTaskUpdates(owner);
      return merged;
    }).catch(error => {
      if (ownerStorage.isCurrent(owner)) console.warn('[index] Today 任务同步失败，继续使用本地任务:', error && error.message || error);
      return tasks;
    });
    const trackedPromise = syncPromise.finally(() => {
      if (this._todayTaskSyncPromise === trackedPromise) {
        this._todayTaskSyncPromise = null;
        this._todayTaskSyncOwner = '';
      }
    });
    this._todayTaskSyncPromise = trackedPromise;
    return trackedPromise;
  },

  flushPendingTodayTaskUpdates(ownerScope) {
    const owner = ownerScope || ownerStorage.capture();
    const pending = dailyTasks.getPendingRemoteUpdates();
    pending.forEach(item => {
      apiV4.updateTodayTask(item.serverId, { completed: item.done, updatedAt: item.updatedAt }).then(response => {
        if (this._unloaded || !ownerStorage.isCurrent(owner)) return;
        const data = response && response.data || {};
        const confirmedState = dailyTasks.reconcileServerTask(item.key,
          Object.assign({ id: item.serverId, completed: item.done, updatedAt: item.updatedAt }, data), item.updatedAt);
        const tasks = (this.data.todayTasks || []).map(task => task.id === item.key
          ? Object.assign({}, task, { done: confirmedState.done, pendingSync: confirmedState.pending })
          : task);
        this.setData({ todayTasks: tasks, todayTaskStats: dailyTasks.getStats(tasks) });
        this.loadWorkbenchSummary();
      }).catch(error => {
        if (ownerStorage.isCurrent(owner)) console.warn('[index] Today 待同步状态补传失败:', error && error.message || error);
      });
    });
  },

  toggleTodayTask(e) {
    const id = e.currentTarget.dataset.id;
    const current = (this.data.todayTasks || []).find(item => String(item.id) === String(id));
    if (current && current.serverId) {
      const owner = ownerStorage.capture();
      const mutationKey = String(current.id);
      this._taskMutationGenerations = this._taskMutationGenerations || {};
      const mutationGeneration = (this._taskMutationGenerations[mutationKey] || 0) + 1;
      this._taskMutationGenerations[mutationKey] = mutationGeneration;
      const done = !current.done;
      const pendingState = dailyTasks.setTaskDone(current.id, done, { pending: true, serverId: current.serverId });
      const tasks = (this.data.todayTasks || []).map(item => String(item.id) === String(id)
        ? Object.assign({}, item, { done, pendingSync: true })
        : item);
      this.setData({ todayTasks: tasks, todayTaskStats: dailyTasks.getStats(tasks) });
      this.loadWorkbenchSummary();
      apiV4.updateTodayTask(current.serverId, { completed: done, updatedAt: pendingState.updatedAt }).then(response => {
        if (this._unloaded || !ownerStorage.isCurrent(owner)
          || this._taskMutationGenerations[mutationKey] !== mutationGeneration) return;
        const data = response && response.data || {};
        const confirmedState = dailyTasks.reconcileServerTask(current.id,
          Object.assign({ id: current.serverId, completed: done, updatedAt: pendingState.updatedAt }, data), pendingState.updatedAt);
        const confirmed = confirmedState.done;
        const latest = (this.data.todayTasks || []).map(item => String(item.id) === String(id)
          ? Object.assign({}, item, { done: confirmed, pendingSync: confirmedState.pending })
          : item);
        this.setData({ todayTasks: latest, todayTaskStats: dailyTasks.getStats(latest) });
        this.loadWorkbenchSummary();
      }).catch(error => {
        if (this._unloaded || !ownerStorage.isCurrent(owner)
          || this._taskMutationGenerations[mutationKey] !== mutationGeneration) return;
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

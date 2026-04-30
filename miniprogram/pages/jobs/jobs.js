// pages/jobs/jobs.js
const { getJobs, normalizeCompanyLogo } = require('../../utils/api.js');
const favUtil = require('../../utils/favorites.js');
const { JOBS: MOCK_JOBS } = require('../../utils/mock-data.js');
const { fromNow, formatSalaryRange } = require('../../utils/util.js');
const matcher = require('../../utils/matcher.js');

// ── 城市坐标表（NA + CN 主要科技城市）────────────────────────────────────────
const CITY_COORDS = {
  // 北美
  'San Francisco': { lat: 37.7749, lng: -122.4194 },
  'San Jose':      { lat: 37.3382, lng: -121.8863 },
  'Mountain View': { lat: 37.3861, lng: -122.0839 },
  'Sunnyvale':     { lat: 37.3688, lng: -122.0363 },
  'Palo Alto':     { lat: 37.4419, lng: -122.1430 },
  'Menlo Park':    { lat: 37.4530, lng: -122.1817 },
  'Seattle':       { lat: 47.6062, lng: -122.3321 },
  'Bellevue':      { lat: 47.6101, lng: -122.2015 },
  'New York':      { lat: 40.7128, lng: -74.0060 },
  'New York City': { lat: 40.7128, lng: -74.0060 },
  'NYC':           { lat: 40.7128, lng: -74.0060 },
  'Boston':        { lat: 42.3601, lng: -71.0589 },
  'Austin':        { lat: 30.2672, lng: -97.7431 },
  'Los Angeles':   { lat: 34.0522, lng: -118.2437 },
  'LA':            { lat: 34.0522, lng: -118.2437 },
  'Chicago':       { lat: 41.8781, lng: -87.6298 },
  'Denver':        { lat: 39.7392, lng: -104.9903 },
  'Atlanta':       { lat: 33.7490, lng: -84.3880 },
  'Portland':      { lat: 45.5231, lng: -122.6765 },
  'San Diego':     { lat: 32.7157, lng: -117.1611 },
  'Dallas':        { lat: 32.7767, lng: -96.7970 },
  'Washington':    { lat: 38.9072, lng: -77.0369 },
  'DC':            { lat: 38.9072, lng: -77.0369 },
  'Miami':         { lat: 25.7617, lng: -80.1918 },
  'Phoenix':       { lat: 33.4484, lng: -112.0740 },
  'Minneapolis':   { lat: 44.9778, lng: -93.2650 },
  'Remote':        { lat: 39.5000, lng: -98.3500 },
  // 国内
  '北京':  { lat: 39.9042, lng: 116.4074 },
  '上海':  { lat: 31.2304, lng: 121.4737 },
  '深圳':  { lat: 22.5431, lng: 114.0579 },
  '杭州':  { lat: 30.2741, lng: 120.1551 },
  '成都':  { lat: 30.5728, lng: 104.0668 },
  '广州':  { lat: 23.1291, lng: 113.2644 },
  '南京':  { lat: 32.0603, lng: 118.7969 },
  '武汉':  { lat: 30.5928, lng: 114.3055 },
  '西安':  { lat: 34.3416, lng: 108.9398 },
  '重庆':  { lat: 29.4316, lng: 106.9123 },
  '苏州':  { lat: 31.2989, lng: 120.5853 },
  '天津':  { lat: 39.3434, lng: 117.3616 },
  '长沙':  { lat: 28.2280, lng: 112.9388 },
  '合肥':  { lat: 31.8206, lng: 117.2272 },
  '厦门':  { lat: 24.4798, lng: 118.0894 },
  '郑州':  { lat: 34.7466, lng: 113.6253 },
};

// NA / CN 地图默认中心
const MAP_CENTER_NA = { latitude: 37.8, longitude: -96.9, scale: 4 };
const MAP_CENTER_CN = { latitude: 33.0, longitude: 108.0, scale: 4 };

Page({
  data: {
    jobs: [],
    isMockData: false,
    searchKeyword: '',
    currentPage: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    isRefreshing: false,

    hotPositions: [
      'Software Engineer', 'Data Scientist', 'Product Manager',
      'UX Designer', 'DevOps', 'Frontend', 'Backend', 'ML Engineer', 'Quant'
    ],
    hotCompanies: [
      'Google', 'Amazon', 'Microsoft', 'Meta',
      'Apple', 'Netflix', 'Tesla', 'Salesforce', 'Stripe', 'Uber'
    ],
    activeTag: '',

    // 搜索历史
    searchHistory: [],

    // 筛选面板
    filterVisible: false,
    filterType: '',   // '' | 'FULLTIME' | 'PARTTIME' | 'CONTRACTOR' | 'INTERN'
    filterDate: '',   // '' | 'today' | 'week' | 'month'
    filterActive: false,

    // 地图视图
    viewMode: 'list',   // 'list' | 'map'
    mapCenter: MAP_CENTER_NA,
    mapMarkers: [],
    mapSelectedCity: '',
    mapCityJobs: [],
    mapShowPanel: false,

    // 智能匹配
    matchMode: false,
    matchKeywords: [],
    profileComplete: 0,
    profileMissing: []
  },

  onShow: function() {
    // 从详情页返回时同步最新收藏状态
    if (this.data.jobs.length > 0) {
      const jobs = this.data.jobs.map(j => ({
        ...j,
        isSaved: favUtil.isFavorited('job', String(j.id))
      }));
      this.setData({ jobs });
    }
    // 同步搜索历史（可能从其他页面返回时已更新）
    const searchHistory = wx.getStorageSync('jobSearchHistory') || [];
    this.setData({ searchHistory });
    // 若智能匹配模式开着，刷新画像（用户可能刚完善了资料）
    if (this.data.matchMode) {
      this._refreshMatchProfile();
    }
  },

  onLoad: function(options) {
    // 加载搜索历史
    const searchHistory = wx.getStorageSync('jobSearchHistory') || [];
    this.setData({ searchHistory });

    if (options.keyword) {
      this.setData({
        searchKeyword: options.keyword,
        activeTag: options.keyword
      });
    }
    // 先立即展示缓存/Mock数据，再后台请求API
    this.loadCachedOrMock();
    this.loadJobs(true);
  },

  // 优先加载缓存，保证秒开
  loadCachedOrMock: function() {
    const cached = wx.getStorageSync('cachedJobsList');
    if (cached && cached.length > 0) {
      this.setData({ jobs: this.enrichJobLogos(cached), loading: false });
    } else {
      this.loadMockJobs(true);
    }
  },

  onPullDownRefresh: function() {
    this.setData({ isRefreshing: true });
    this.loadJobs(true);
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ currentPage: this.data.currentPage + 1 });
      this.loadJobs(false);
    }
  },

  // ✅ 新增：点击热门标签快速搜索
  onQuickSearch: function(e) {
    const keyword = e.currentTarget.dataset.value;
    
    // 如果点击已选中的，则取消选中并重置搜索
    if (this.data.activeTag === keyword) {
      this.setData({ 
        searchKeyword: '',
        activeTag: ''
      });
    } else {
      this.setData({ 
        searchKeyword: keyword,
        activeTag: keyword
      });
    }
    
    this.loadJobs(true);
  },

  // 搜索框输入确认
  searchJobs: function(e) {
    const val = (e.detail.value || '').trim();
    this.setData({ searchKeyword: val, activeTag: val });
    if (val) this._saveSearchHistory(val);
    this.loadJobs(true);
  },

  // 点击历史记录快速搜索（同时将其冒泡到历史顶部）
  onHistoryTap: function(e) {
    const kw = e.currentTarget.dataset.kw;
    this.setData({ searchKeyword: kw, activeTag: kw });
    this._saveSearchHistory(kw);
    this.loadJobs(true);
  },

  // 清空搜索框
  clearSearch: function() {
    this.setData({ searchKeyword: '', activeTag: '' });
    this.loadJobs(true);
  },

  // 清空搜索历史
  clearHistory: function() {
    wx.removeStorageSync('jobSearchHistory');
    this.setData({ searchHistory: [] });
  },

  _saveSearchHistory: function(kw) {
    let history = wx.getStorageSync('jobSearchHistory') || [];
    history = history.filter(h => h !== kw);
    history.unshift(kw);
    if (history.length > 5) history = history.slice(0, 5);
    wx.setStorageSync('jobSearchHistory', history);
    this.setData({ searchHistory: history });
  },

  // ── 筛选面板 ──
  openFilter: function() {
    this.setData({ filterVisible: true });
  },

  closeFilter: function() {
    this.setData({ filterVisible: false });
  },

  onFilterTypeSelect: function(e) {
    const val = e.currentTarget.dataset.val;
    this.setData({ filterType: this.data.filterType === val ? '' : val });
  },

  onFilterDateSelect: function(e) {
    const val = e.currentTarget.dataset.val;
    this.setData({ filterDate: this.data.filterDate === val ? '' : val });
  },

  resetFilter: function() {
    this.setData({ filterType: '', filterDate: '', filterActive: false, filterVisible: false });
    this.loadJobs(true);
  },

  applyFilter: function() {
    const active = !!(this.data.filterType || this.data.filterDate);
    this.setData({ filterActive: active, filterVisible: false });
    this.loadJobs(true);
  },

  // 核心：加载职位
  loadJobs: function(reset) {
    if (reset) {
      this.setData({ currentPage: 1, hasMore: true });
    }

    // 已有数据时静默刷新，不显示 loading
    if (this.data.jobs.length === 0) {
      this.setData({ loading: true });
    }

    const query = this.data.searchKeyword || 'Software Engineer jobs';
    const dateMap = { today: 'today', week: '3days', month: 'month' };

    getJobs({
      keyword: query,
      page: this.data.currentPage,
      size: this.data.pageSize,
      country: 'us',
      date_posted: dateMap[this.data.filterDate] || 'all',
      employment_types: this.data.filterType || undefined
    }).then(res => {
      if (!res.data || res.data.length === 0) {
        throw new Error('No data / Quota exceeded');
      }

      let processedJobs = this.formatJobData(res.data);
      if (this.data.matchMode) {
        const profile = wx.getStorageSync('userProfile') || {};
        processedJobs = matcher.matchJobs(profile, processedJobs);
      }

      processedJobs = this.enrichJobLogos(processedJobs);

      this.setData({
        jobs: reset ? processedJobs : [...this.data.jobs, ...processedJobs],
        hasMore: res.data.length >= this.data.pageSize,
        loading: false,
        isRefreshing: false,
        isMockData: false
      });

      // 缓存首页结果，下次秒开
      if (reset) {
        wx.setStorageSync('cachedJobsList', processedJobs);
      }

    }).catch(err => {
      console.warn('API Exception:', err);
      // 只有完全没数据时才用 Mock 兜底
      if (this.data.jobs.length === 0) {
        this.loadMockJobs(reset);
      } else {
        this.setData({ loading: false, isRefreshing: false, hasMore: false });
      }
    }).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 数据格式化
  formatJobData: function(rawList) {
    return rawList.map(job => {
      const salaryDisplay = formatSalaryRange(job.job_min_salary, job.job_max_salary);
      const company = job.employer_name || 'Company';

      const desc = (job.job_description || '') + ' ' + (job.job_highlights ? JSON.stringify(job.job_highlights) : '');
      const optFriendly = /\b(opt|cpt|h[- ]?1b|visa\s+sponsor|will\s+sponsor|work\s+authori)/i.test(desc);

      return {
        id: job.job_id,
        title: job.job_title,
        company,
        salary: salaryDisplay,
        city: job.job_city || 'Remote',
        state: job.job_state,
        type: job.job_employment_type || 'Full-time',
        description: job.job_description ? job.job_description.substring(0, 80).replace(/\n/g, ' ') + '...' : '',
        logo: this.buildCompanyLogo(company) || job.employer_logo || '',
        logoFailed: false,
        companyInitial: this.getCompanyInitial(company),
        postedAt: job.job_posted_at_datetime_utc ? fromNow(job.job_posted_at_datetime_utc) : 'Recently posted',
        isSaved: favUtil.isFavorited('job', String(job.job_id)),
        optFriendly
      };
    });
  },

  // 模拟数据兜底
  buildCompanyLogo: function(companyName) {
    if (!companyName) return '';
    return normalizeCompanyLogo(`/api/logo?name=${encodeURIComponent(companyName)}`);
  },

  getCompanyInitial: function(companyName) {
    const name = String(companyName || 'C').trim();
    return name ? name.slice(0, 1).toUpperCase() : 'C';
  },

  enrichJobLogos: function(list) {
    return (list || []).map(job => {
      const company = job.company || job.employer_name || 'Company';
      return Object.assign({}, job, {
        company,
        logo: this.buildCompanyLogo(company) || job.logo || '',
        logoFailed: false,
        companyInitial: this.getCompanyInitial(company)
      });
    });
  },

  loadMockJobs: function(reset) {
    let mockJobs = MOCK_JOBS;
    if (this.data.matchMode) {
      const profile = wx.getStorageSync('userProfile') || {};
      mockJobs = matcher.matchJobs(profile, MOCK_JOBS);
    }
    mockJobs = this.enrichJobLogos(mockJobs);
    this.setData({
      jobs: reset ? mockJobs : [...this.data.jobs, ...mockJobs],
      hasMore: false,
      loading: false,
      isRefreshing: false,
      isMockData: true
    });
  },


  // 快捷收藏切换
  toggleSave: function(e) {
    const index = e.currentTarget.dataset.index;
    const job = this.data.jobs[index];
    if (!job) return;
    const jobData = {
      targetId: String(job.id),
      title: job.title,
      subtitle: job.company,
      logo: job.logo,
      salary: job.salary,
      type: job.type
    };
    const isSaved = favUtil.toggle('job', jobData);
    const jobs = this.data.jobs.map((j, i) =>
      i === index ? { ...j, isSaved } : j
    );
    this.setData({ jobs });
    wx.showToast({ title: isSaved ? '已收藏' : '已取消', icon: 'none' });
  },

  // ── 智能匹配 ──────────────────────────────────────────────────────────────

  toggleMatchMode: function() {
    const newMode = !this.data.matchMode;
    if (newMode) {
      const profile = wx.getStorageSync('userProfile') || {};
      const keywords = matcher.getJobKeywords(profile);
      const completeness = matcher.getProfileCompleteness(profile);
      const missing = matcher.getMissingHints(profile);

      this.setData({
        matchMode: true,
        matchKeywords: keywords.slice(0, 6),
        profileComplete: completeness,
        profileMissing: missing
      });

      // 用画像主关键词自动搜索（仅当当前无关键词时）
      const primaryKw = (profile.targetRoles && profile.targetRoles[0]) || keywords[0] || '';
      if (!this.data.searchKeyword && primaryKw) {
        this.setData({ searchKeyword: primaryKw, activeTag: primaryKw });
      }

      // 重新排序现有结果；若无数据则发起搜索
      if (this.data.jobs.length > 0) {
        const scored = matcher.matchJobs(profile, this.data.jobs);
        this.setData({ jobs: scored });
      } else {
        this.loadJobs(true);
      }
    } else {
      // 关闭匹配模式：去掉评分字段，恢复原始顺序
      const jobs = this.data.jobs.map(j => ({
        ...j, matchScore: 0, isMatch: false, matchReason: ''
      }));
      this.setData({
        matchMode: false,
        matchKeywords: [],
        profileComplete: 0,
        profileMissing: [],
        jobs
      });
    }
  },

  _refreshMatchProfile: function() {
    const profile = wx.getStorageSync('userProfile') || {};
    const keywords = matcher.getJobKeywords(profile);
    const completeness = matcher.getProfileCompleteness(profile);
    const missing = matcher.getMissingHints(profile);
    this.setData({
      matchKeywords: keywords.slice(0, 6),
      profileComplete: completeness,
      profileMissing: missing
    });
    if (this.data.jobs.length > 0) {
      const scored = matcher.matchJobs(profile, this.data.jobs);
      this.setData({ jobs: scored });
    }
  },

  goToProfile: function() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
  },

  navigateToDetail: function(e) {
    const jobId = e.currentTarget.dataset.id;
    const job = (this.data.jobs || []).find(item => String(item.id) === String(jobId));
    if (job) {
      const snapshot = {
        id: job.id,
        title: job.title,
        company: job.company,
        logo: job.logo,
        logoFailed: !!job.logoFailed,
        companyInitial: job.companyInitial,
        city: job.city,
        state: job.state,
        type: job.type,
        salary: job.salary,
        postedAt: job.postedAt,
        optFriendly: job.optFriendly
      };
      wx.setStorageSync('tempJobDetail', snapshot);
      wx.setStorageSync('jobDetailSnapshot_' + String(jobId), snapshot);
    }
    wx.navigateTo({
      url: `/pages/job-detail/job-detail?id=${encodeURIComponent(jobId)}`
    });
  },

  // ── 地图视图 ──────────────────────────────────────────────────────────────

  switchView: function(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.viewMode) return;
    this.setData({ viewMode: mode, mapShowPanel: false });
    if (mode === 'map') this._buildMapMarkers();
  },

  _buildMapMarkers: function() {
    const jobs = this.data.jobs;
    if (!jobs.length) return;

    // 按城市归组，同步检测是否为国内数据（单次遍历）
    const cityMap = {};
    let isCN = false;
    jobs.forEach(job => {
      const city = job.city || 'Remote';
      if (!cityMap[city]) cityMap[city] = [];
      cityMap[city].push(job);
      if (!isCN && /[一-龥]/.test(city)) isCN = true;
    });
    this._cityJobsMap = cityMap; // 非响应式存储，供 tap 读取

    // 构建 markers
    const markers = [];
    let id = 0;
    Object.keys(cityMap).forEach(city => {
      const coords = CITY_COORDS[city];
      if (!coords) return;
      const count = cityMap[city].length;
      markers.push({
        id: id++,
        latitude:  coords.lat,
        longitude: coords.lng,
        title: city,
        width: 32,
        height: 32,
        callout: {
          content: city + '\n' + count + ' 个职位',
          color: '#1D4ED8',
          fontSize: 12,
          borderRadius: 8,
          bgColor: '#ffffff',
          padding: 8,
          display: 'ALWAYS',
          borderWidth: 1,
          borderColor: '#BFDBFE',
          anchorX: 0,
          anchorY: 0
        }
      });
    });

    const defaultCenter = isCN ? MAP_CENTER_CN : MAP_CENTER_NA;
    this.setData({ mapMarkers: markers, mapCenter: defaultCenter });
  },

  onMarkerTap: function(e) {
    const id = e.markerId;
    const marker = this.data.mapMarkers.find(m => m.id === id);
    if (!marker) return;
    const city = marker.title;
    const cityJobs = (this._cityJobsMap && this._cityJobsMap[city]) || [];
    this.setData({ mapSelectedCity: city, mapCityJobs: cityJobs, mapShowPanel: true });
  },

  closeMapPanel: function() {
    this.setData({ mapShowPanel: false });
  },

  onMapTap: function() {
    if (this.data.mapShowPanel) this.setData({ mapShowPanel: false });
  },

  onLogoError(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx !== undefined) {
      this.setData({ [`jobs[${idx}].logoFailed`]: true });
    }
  }
});

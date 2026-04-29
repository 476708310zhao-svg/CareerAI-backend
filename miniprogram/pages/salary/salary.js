// pages/salary/salary.js
const { getEstimatedSalary, getCompanyJobSalary, fetchUserSalaryStats, submitSalaryReport } = require('../../utils/api.js');
const { SALARY_ROLES, SALARY_COMPANIES, SALARY_CN_MAP, COMPANY_SALARY_BASE } = require('../../utils/mock-data.js');

const REGION_NA = 'NA';
const REGION_CN = 'CN';

const LOADING_TIPS = ['分析中...', 'AI 正在分析，请稍候...', '分析时间较长，请耐心等待...'];

Page({
  data: {
    region: REGION_NA,   // REGION_NA or REGION_CN
    loadingTip: '',
    selectedTab: 0,
    jobTitle: '',
    location: '',
    company: '',
    result: null,
    loading: false,

    presetRoles: SALARY_ROLES,
    hotCompanies: SALARY_COMPANIES,

    // 用户共享数据统计
    userStats: null,

    // 分享薪资弹窗
    shareModalVisible: false,
    shareForm: {
      position: '',
      company: '',
      yearsOfExperience: '',
      baseSalary: '',
      bonus: '',
      stock: ''
    },
    shareLoading: false,

    // VIP 状态
    isVip: false,

    // 历史查询记录
    historyList: [],

    // 公司横向对比
    cmpJobTitle: '',
    cmpCompanyInput: '',
    cmpList: [],          // [{ company, medianStr, minStr, maxStr, median, barW, isTop }]
    cmpLoading: false,
    cmpQuickCompanies: [] // 快捷公司列表（随 region 变化）
  },

  onLoad: function() {
    const vipLevel = (wx.getStorageSync('userInfo') || {}).vipLevel || 0;
    this.setData({ isVip: vipLevel > 0 });
    this._loadHistory();
    this._updateCmpQuick();
  },

  goVip: function() {
    wx.navigateTo({ url: '/pages/vip/vip' });
  },

  _resetForm: function() {
    return { result: null, userStats: null, jobTitle: '', location: '', company: '', cmpList: [], cmpJobTitle: '', cmpCompanyInput: '' };
  },

  setRegion: function(e) {
    const region = e.currentTarget.dataset.region;
    this.setData(Object.assign({ region }, this._resetForm()));
    this._updateCmpQuick(region);
  },

  switchTab: function(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ selectedTab: index, result: null, userStats: null, jobTitle: '', location: '', company: '' });
  },

  onInput: function(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onPresetSelect: function(e) {
    const title = e.currentTarget.dataset.title;
    const defaultLoc = this.data.region === REGION_NA ? 'San Francisco' : '北京';
    this.setData({ jobTitle: title, location: defaultLoc });
    this.handleSearch();
  },

  onQuickSearch: function(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.selectedTab === 0) {
      this.setData({ jobTitle: value });
    } else {
      this.setData({ company: value });
    }
    this.handleSearch();
  },

  handleSearch: function() {
    if (this.data.selectedTab === 0) {
      this.searchGeneralSalary();
    } else {
      this.searchCompanySalary();
    }
  },

  resetSearch: function() {
    this.setData({ result: null, jobTitle: '', company: '', location: '', userStats: null });
  },

  // ── 加载进度提示 ──────────────────────────────────────────────────────────
  _startLoadingTips: function() {
    this._loadingTipIdx = 0;
    this.setData({ loadingTip: LOADING_TIPS[0] });
    this._loadingTimer1 = setTimeout(() => {
      this.setData({ loadingTip: LOADING_TIPS[1] });
    }, 8000);
    this._loadingTimer2 = setTimeout(() => {
      this.setData({ loadingTip: LOADING_TIPS[2] });
    }, 20000);
  },

  _clearLoadingTips: function() {
    clearTimeout(this._loadingTimer1);
    clearTimeout(this._loadingTimer2);
    this.setData({ loadingTip: '' });
  },

  // ── 历史查询记录 ─────────────────────────────────────────────────────────
  _loadHistory: function() {
    try {
      const raw = wx.getStorageSync('salary_history') || [];
      this.setData({ historyList: raw });
    } catch (e) { console.warn('[salary] loadHistory', e); }
  },

  _saveHistory: function(entry) {
    try {
      // 直接用内存中已有列表，避免重复读 Storage
      let list = this.data.historyList.filter(h =>
        !(h.region === entry.region && h.selectedTab === entry.selectedTab &&
          h.jobTitle === entry.jobTitle && h.company === entry.company)
      );
      list = [entry, ...list];
      if (list.length > 15) list = list.slice(0, 15);
      wx.setStorageSync('salary_history', list);
      this.setData({ historyList: list });
    } catch (e) { console.warn('[salary] saveHistory', e); }
  },

  onHistoryTap: function(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      region:      item.region,
      selectedTab: item.selectedTab,
      jobTitle:    item.jobTitle,
      company:     item.company,
      location:    item.location
    });
    this.handleSearch();
  },

  clearHistory: function() {
    wx.removeStorageSync('salary_history');
    this.setData({ historyList: [] });
  },

  // ── 公司横向对比 ─────────────────────────────────────────────────────────
  _updateCmpQuick: function(region) {
    const r = region || this.data.region;
    const quick = r === REGION_CN
      ? ['字节跳动', '腾讯', '阿里巴巴', '美团', '华为', '快手', '京东']
      : ['Google', 'Meta', 'Apple', 'Amazon', 'Microsoft', 'Netflix', 'Stripe'];
    this.setData({ cmpQuickCompanies: quick });
  },

  onCmpInput: function(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  addCmpCompany: function(e) {
    const company = (e && e.currentTarget && e.currentTarget.dataset.company)
      ? e.currentTarget.dataset.company
      : this.data.cmpCompanyInput.trim();

    if (!company) {
      wx.showToast({ title: '请输入公司名称', icon: 'none' }); return;
    }
    if (this.data.cmpList.length >= 5) {
      wx.showToast({ title: '最多对比 5 家公司', icon: 'none' }); return;
    }
    if (this.data.cmpList.some(c => c.company === company)) {
      wx.showToast({ title: '该公司已在对比列表', icon: 'none' }); return;
    }

    const job = this.data.cmpJobTitle.trim() ||
      (this.data.region === REGION_CN ? '软件工程师' : 'Software Engineer');

    this.setData({ cmpLoading: true, cmpCompanyInput: '' });

    // 先查接口，失败时用本地 base 数据
    getCompanyJobSalary(company, job).then(res => {
      const d = (res && res.data && res.data[0]) ? res.data[0] : null;
      if (d && (d.min_salary || d.job_min_salary)) {
        const min    = d.min_salary    || d.job_min_salary || 0;
        const max    = d.max_salary    || d.job_max_salary || min * 2;
        const median = d.median_salary || (min + max) / 2;
        this._appendCmp(company, min, median, max);
      } else {
        this._appendCmpFromBase(company, job);
      }
    }).catch(() => this._appendCmpFromBase(company, job));
  },

  _appendCmpFromBase: function(company, job) {
    const key = `${company}__${job}__${this.data.region}`;
    const base = COMPANY_SALARY_BASE[key];
    if (base) {
      this._appendCmp(company, base.min, base.median, base.max);
    } else {
      // 无精确数据时，用全局 median ± 随机偏移估算（保证可显示）
      const isCN = this.data.region === REGION_CN;
      const seed = company.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const offset = (((seed % 7) - 3) * (isCN ? 20000 : 8000));
      const base2  = isCN ? 380000 : 170000;
      const median = base2 + offset;
      const range  = isCN ? 160000 : 60000;
      this._appendCmp(company, median - range * 0.6, median, median + range * 0.6, true);
    }
  },

  _appendCmp: function(company, min, median, max, isEstimated) {
    const newEntry = { company, min, median, max, isEstimated: !!isEstimated };
    const raw = [...this.data.cmpList, newEntry];
    this._rebuildCmpList(raw);
    this.setData({ cmpLoading: false });
  },

  _rebuildCmpList: function(raw) {
    // 按 median 降序排列
    raw.sort((a, b) => b.median - a.median);
    const topMedian = raw[0].median;
    const list = raw.map((c, i) => ({
      company:    c.company,
      median:     c.median,
      min:        c.min,
      max:        c.max,
      isEstimated: c.isEstimated,
      medianStr:  this.formatCurrency(c.median),
      minStr:     this.formatCurrency(c.min),
      maxStr:     this.formatCurrency(c.max),
      barW:       Math.round((c.median / topMedian) * 100),        // 中位数条宽 %
      rangeL:     Math.round((c.min    / topMedian) * 100),        // range 起点
      rangeW:     Math.round(((c.max - c.min) / topMedian) * 100), // range 宽度
      isTop:      i === 0,
      rank:       i + 1
    }));
    this.setData({ cmpList: list });
  },

  removeCmpCompany: function(e) {
    const company = e.currentTarget.dataset.company;
    const raw = this.data.cmpList.filter(c => c.company !== company);
    if (raw.length > 0) {
      this._rebuildCmpList(raw);
    } else {
      this.setData({ cmpList: [] });
    }
  },

  clearCmpList: function() {
    this.setData({ cmpList: [], cmpJobTitle: '', cmpCompanyInput: '' });
  },

  searchGeneralSalary: function() {
    const job = this.data.jobTitle || (this.data.region === REGION_NA ? 'Software Engineer' : '软件工程师');
    const loc = this.data.location || (this.data.region === REGION_NA ? 'San Francisco' : '北京');

    this._saveHistory({ region: this.data.region, selectedTab: 0, jobTitle: job, company: '', location: loc, time: Date.now() });
    this.setData({ loading: true, result: null, userStats: null });
    this._startLoadingTips();

    getEstimatedSalary(job, loc, null, null, this.data.region)
      .then(res => {
        this._clearLoadingTips();
        if (!res.data || res.data.length === 0) throw new Error('No Data');
        this.processResult(res.data[0], 'general');
        this._loadUserStats(job);
      })
      .catch(e => {
        this._clearLoadingTips();
        console.warn('[salary] searchGeneral', e);
        this.loadMockData('general');
        this._loadUserStats(job);
      });
  },

  searchCompanySalary: function() {
    const company = this.data.company || (this.data.region === REGION_NA ? 'Google' : '字节跳动');
    const job = this.data.jobTitle || (this.data.region === REGION_NA ? 'Software Engineer' : '软件工程师');

    this._saveHistory({ region: this.data.region, selectedTab: 1, jobTitle: job, company, location: '', time: Date.now() });
    this.setData({ loading: true, result: null, userStats: null });
    this._startLoadingTips();

    getCompanyJobSalary(company, job, null, null, this.data.region)
      .then(res => {
        this._clearLoadingTips();
        if (!res.data || res.data.length === 0) throw new Error('No Data');
        this.processResult(res.data[0], 'company');
        this._loadUserStats(job);
      })
      .catch(e => {
        this._clearLoadingTips();
        console.warn('[salary] searchCompany', e);
        this.loadMockData('company');
        this._loadUserStats(job);
      });
  },

  // ── 拉取用户共享薪资统计（T-7修复：从服务端获取真实 P25/P50/P75）───────────
  _loadUserStats: function(position) {
    const pos = position || this.data.jobTitle || (this.data.region === REGION_NA ? 'Software Engineer' : '软件工程师');
    const currency = this.data.region === REGION_NA ? 'USD' : 'CNY';
    fetchUserSalaryStats(pos, currency).then(res => {
      if (res.code === 0 && res.data.count > 0) {
        const d = res.data;
        this.setData({
          userStats: {
            count:   d.count,
            avgStr:  this.formatCurrency(d.avgTotal),
            minStr:  this.formatCurrency(d.minTotal),
            maxStr:  this.formatCurrency(d.maxTotal),
            // 真实分位点（T-7）
            p25Str:  d.p25 ? this.formatCurrency(d.p25) : null,
            p50Str:  d.p50 ? this.formatCurrency(d.p50) : null,
            p75Str:  d.p75 ? this.formatCurrency(d.p75) : null,
            hasPercentile: !!(d.p25 && d.p50 && d.p75)
          }
        });
      } else {
        this.setData({ userStats: null });
      }
    }).catch(e => { console.warn('[salary] userStats', e); });
  },

  processResult: function(data, type) {
    const isCN = this.data.region === REGION_CN;
    let min = data.min_salary || data.job_min_salary || (isCN ? 200000 : 100000);
    let max = data.max_salary || data.job_max_salary || (isCN ? 600000 : 200000);

    if (!isFinite(min) || isNaN(min)) min = isCN ? 200000 : 100000;
    if (!isFinite(max) || isNaN(max)) max = isCN ? 600000 : 200000;
    if (min >= max) max = min * 2;

    const median = data.median_salary || (min + max) / 2;

    const range = max - min;
    let percent = ((median - min) / range) * 100;
    if (!isFinite(percent) || isNaN(percent)) percent = 50;
    if (percent < 10) percent = 10;
    if (percent > 90) percent = 90;

    // 优先使用 AI/真实数据的分位点，降级才用公式估算
    const p10 = min + range * 0.1;
    const p25 = data.p25_salary || (min + range * 0.25);
    const p75 = data.p75_salary || (min + range * 0.75);
    const p90 = min + range * 0.9;

    const barCount = 8;
    const step = range / barCount;
    const distributionBars = [];
    for (let i = 0; i < barCount; i++) {
      const barMin = min + step * i;
      const barMax = barMin + step;
      const barMid = (barMin + barMax) / 2;
      const distFromMedian = Math.abs(barMid - median) / range;
      const height = Math.max(15, Math.round(100 * Math.exp(-4 * distFromMedian * distFromMedian)));
      distributionBars.push({
        label: this.formatCurrency(barMin),
        height,
        isMedian: barMin <= median && barMax >= median
      });
    }

    let tcBreakdown = null;
    if (!isCN) {
      const bd = data.breakdown;
      const baseRatio   = bd ? bd.base_pct   / 100 : 0.65;
      const bonusRatio  = bd ? bd.bonus_pct  / 100 : 0.15;
      const equityRatio = bd ? bd.equity_pct / 100 : 0.20;
      tcBreakdown = {
        basePercent:   Math.round(baseRatio   * 100),
        bonusPercent:  Math.round(bonusRatio  * 100),
        equityPercent: Math.round(equityRatio * 100),
        baseStr:   this.formatCurrency(median * baseRatio),
        bonusStr:  this.formatCurrency(median * bonusRatio),
        equityStr: this.formatCurrency(median * equityRatio)
      };
    }

    // ── 薪资趋势（优先用 AI 返回的真实数据，否则用公式估算）──────────────────
    const curYear = new Date().getFullYear();
    const trendStartYear = curYear - 4;
    let rawPoints = [];

    if (data.trend && Array.isArray(data.trend) && data.trend.length >= 2) {
      // AI 返回了真实趋势数据
      rawPoints = data.trend.slice(-5).map((t, i, arr) => ({
        year: String(t.year || (trendStartYear + i)),
        salary: t.salary,
        yoy: i === 0 ? 0 : (t.salary - arr[i - 1].salary) / arr[i - 1].salary
      }));
    } else {
      // 降级：公式估算
      const yearGrowth = isCN
        ? [0.08, -0.02, 0.03, 0.08]
        : [0.12, -0.03, 0.05, 0.07];
      let cumMul = 1;
      for (const g of yearGrowth) cumMul *= (1 + g);
      let trendVal = median / cumMul;
      for (let i = 0; i < 5; i++) {
        rawPoints.push({ year: String(trendStartYear + i), salary: Math.round(trendVal), yoy: i === 0 ? 0 : yearGrowth[i - 1] });
        if (i < 4) trendVal *= (1 + yearGrowth[i]);
      }
    }

    // 归一化高度 60–160 rpx
    const tMin = Math.min(...rawPoints.map(p => p.salary));
    const tMax = Math.max(...rawPoints.map(p => p.salary));
    const tRange = tMax - tMin || 1;
    const trendPoints = rawPoints.map((p, i) => ({
      year:       p.year,
      salaryStr:  this.formatCurrency(p.salary),
      yoyStr:     i === 0 ? '' : (p.yoy >= 0 ? '+' : '') + Math.round(p.yoy * 100) + '%',
      isUp:       p.yoy >= 0,
      isCurrent:  i === rawPoints.length - 1,
      height:     Math.round(60 + (p.salary - tMin) / tRange * 100)
    }));

    const totalGrowth = (rawPoints[rawPoints.length - 1].salary - rawPoints[0].salary) / rawPoints[0].salary;
    const trendSummary = (totalGrowth >= 0 ? '+' : '') + Math.round(totalGrowth * 100) + '%';

    const formattedResult = {
      title: type === 'general'
        ? (data.job_title || this.data.jobTitle)
        : `${data.job_title || this.data.jobTitle} @ ${data.company_name || this.data.company}`,
      location:   data.location || data.job_city || (isCN ? '北京' : 'San Francisco, CA'),
      minStr:     this.formatCurrency(min),
      maxStr:     this.formatCurrency(max),
      medianStr:  this.formatCurrency(median),
      percent:    percent.toFixed(0) + '%',
      percentiles: {
        p10: this.formatCurrency(p10),
        p25: this.formatCurrency(p25),
        p50: this.formatCurrency(median),
        p75: this.formatCurrency(p75),
        p90: this.formatCurrency(p90)
      },
      distributionBars,
      tcBreakdown,
      marketRange:  this.formatCurrency(p25) + ' – ' + this.formatCurrency(p75),
      trendPoints,
      trendSummary,
      trendStartYear: String(rawPoints[0]?.year || trendStartYear),
      trendEndYear:   String(rawPoints[rawPoints.length - 1]?.year || curYear),
      dataSource: data.data_source || 'api',  // 'community' | 'rapidapi' | 'ai'
      marketNote: data.market_note || '',
      sampleSize: data.sample_size || null,
      isMock: false
    };

    setTimeout(() => {
      this.setData({ result: formattedResult, loading: false });
    }, 500);
  },

  loadMockData: function(type) {
    const isCN = this.data.region === REGION_CN;
    const jobTitle = this.data.jobTitle || (isCN ? '软件工程师' : 'Software Engineer');
    const company  = this.data.company  || (isCN ? '字节跳动' : 'Google');
    const cnMockMap = SALARY_CN_MAP;

    setTimeout(() => {
      let mockRaw;
      if (isCN) {
        const d = cnMockMap[jobTitle] || cnMockMap['default'];
        mockRaw = type === 'general'
          ? { job_title: jobTitle, location: this.data.location || '北京', ...d }
          : { job_title: jobTitle, company_name: company, location: '北京', min_salary: d.min * 1.2, max_salary: d.max * 1.2, median_salary: d.median * 1.2 };
      } else {
        mockRaw = type === 'general'
          ? { job_title: jobTitle, location: this.data.location || 'San Francisco, CA', min_salary: 110000, max_salary: 195000, median_salary: 155000 }
          : { job_title: jobTitle, company_name: company, location: 'Mountain View, CA', min_salary: 160000, max_salary: 240000, median_salary: 210000 };
      }
      this.processResult(mockRaw, type);
      setTimeout(() => {
        if (this.data.result) {
          this.setData({ 'result.isMock': true });
        }
      }, 600);
    }, 600);
  },

  formatCurrency: function(num) {
    const isCN = this.data.region === REGION_CN;
    if (isCN) {
      return Math.round(num / 1000) + 'k';
    }
    return '$' + Math.round(num / 1000) + 'k';
  },

  // ── 分享薪资弹窗 ───────────────────────────────────────────────────────────
  openShareModal: function() {
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.showToast({ title: '请先登录后再分享', icon: 'none' });
      return;
    }
    const defaultPos = this.data.jobTitle || (this.data.region === REGION_NA ? 'Software Engineer' : '软件工程师');
    this.setData({
      shareModalVisible: true,
      'shareForm.position':          defaultPos,
      'shareForm.company':           this.data.company || '',
      'shareForm.yearsOfExperience': '',
      'shareForm.baseSalary':        '',
      'shareForm.bonus':             '',
      'shareForm.stock':             ''
    });
  },

  closeShareModal: function() {
    this.setData({ shareModalVisible: false });
  },

  onShareInput: function(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`shareForm.${field}`]: e.detail.value });
  },

  submitSalaryShare: function() {
    if (this.data.shareLoading) return;
    const form = this.data.shareForm;
    const base = parseFloat(form.baseSalary);
    if (!form.baseSalary || isNaN(base) || base <= 0) {
      wx.showToast({ title: '请填写有效的基础薪资', icon: 'none' });
      return;
    }
    const currency = this.data.region === REGION_NA ? 'USD' : 'CNY';
    this.setData({ shareLoading: true });

    submitSalaryReport({
      position:          form.position || (this.data.region === REGION_NA ? 'Software Engineer' : '软件工程师'),
      company:           form.company  || '匿名公司',
      location:          this.data.location || (this.data.region === REGION_NA ? 'US' : '中国'),
      yearsOfExperience: parseInt(form.yearsOfExperience) || 0,
      baseSalary:        base,
      bonus:             parseFloat(form.bonus) || 0,
      stock:             parseFloat(form.stock) || 0,
      currency
    }).then(res => {
      if (res.code !== 0) throw new Error(res.message);
      this.setData({ shareLoading: false, shareModalVisible: false });
      wx.showToast({ title: '感谢分享！', icon: 'success' });
      this._loadUserStats(form.position);
    }).catch(err => {
      this.setData({ shareLoading: false });
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    });
  }
});

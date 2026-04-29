// pages/search/search.js
const { getJobs, getCompanies } = require('../../utils/api.js');
const { JOBS: MOCK_JOBS, COMPANIES, EXPERIENCES } = require('../../utils/mock-data.js');
const { formatSalaryRange } = require('../../utils/util.js');

Page({
  data: {
    keyword: '',
    currentTab: 0,
    tabs: ['职位', '公司', '面经'],
    hotKeywords: ['产品经理', 'Software Engineer', '前端开发', '数据分析', 'Google', '字节跳动', '算法面试'],
    searchHistory: [],
    hasSearched: false,
    jobResults: [],
    companyResults: [],
    experienceResults: [],
    loading: false,
    loadingMore: false,
    jobPage: 1,
    jobHasMore: false
  },

  onLoad() {
    const history = wx.getStorageSync('searchHistory') || [];
    this.setData({ searchHistory: history });
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
    // 防抖：输入停止 400ms 后自动触发搜索
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      if (this.data.keyword.trim()) this.doSearch();
    }, 400);
  },

  // 执行搜索
  doSearch() {
    const kw = this.data.keyword.trim();
    if (!kw) return;

    // 保存搜索历史
    let history = this.data.searchHistory.filter(h => h !== kw);
    history.unshift(kw);
    if (history.length > 10) history = history.slice(0, 10);
    this.setData({ searchHistory: history });
    wx.setStorageSync('searchHistory', history);

    this.setData({ loading: true, hasSearched: true, jobPage: 1, jobHasMore: false, jobResults: [] });

    // 并行：API 搜职位 + 本地搜公司/面经
    this.searchJobsAPI(kw, 1, false);
    this.searchCompanies(kw);
    this.searchExperiences(kw);
  },

  // 职位搜索 — 接入真实 API
  searchJobsAPI(kw, page, isLoadMore) {
    getJobs({ keyword: kw, country: 'us', size: 10, page })
      .then(res => {
        if (res.data && res.data.length > 0) {
          const newJobs = res.data.map(job => {
            const salary = formatSalaryRange(job.job_min_salary, job.job_max_salary);
            return {
              id: job.job_id,
              title: job.job_title,
              company: job.employer_name,
              salary,
              city: job.job_city || 'Remote',
              state: job.job_state || '',
              type: job.job_employment_type || 'Full-time',
              logo: job.employer_logo || '/images/default-company.png'
            };
          });
          const jobs = isLoadMore ? this.data.jobResults.concat(newJobs) : newJobs;
          this.setData({
            jobResults: jobs,
            loading: false,
            loadingMore: false,
            jobPage: page,
            jobHasMore: res.data.length >= 10
          });
        } else {
          if (!isLoadMore) this.searchJobsLocal(kw);
          this.setData({ loading: false, loadingMore: false, jobHasMore: false });
        }
      })
      .catch(() => {
        if (!isLoadMore) this.searchJobsLocal(kw);
        this.setData({ loading: false, loadingMore: false, jobHasMore: false });
      });
  },

  // 加载更多职位
  loadMoreJobs() {
    if (this.data.loadingMore || !this.data.jobHasMore) return;
    const kw = this.data.keyword.trim();
    if (!kw) return;
    this.setData({ loadingMore: true });
    this.searchJobsAPI(kw, this.data.jobPage + 1, true);
  },

  onReachBottom() {
    if (this.data.currentTab === 0 && this.data.hasSearched) {
      this.loadMoreJobs();
    }
  },

  // 职位本地兜底
  searchJobsLocal(kw) {
    const lower = kw.toLowerCase();
    const results = MOCK_JOBS.filter(j => j.title.toLowerCase().includes(lower) || j.company.toLowerCase().includes(lower));
    this.setData({ jobResults: results, loading: false });
  },

  // 搜索公司（本地数据）
  searchCompanies(kw) {
    getCompanies({ keyword: kw, page: 1, pageSize: 20 })
      .then(res => {
        const list = res && res.data && Array.isArray(res.data.list) ? res.data.list : [];
        if (list.length) {
          this.setData({ companyResults: list });
          return;
        }
        const lower = kw.toLowerCase();
        const results = COMPANIES.filter(c => c.name.toLowerCase().includes(lower) || c.industry.toLowerCase().includes(lower));
        this.setData({ companyResults: results });
      })
      .catch(() => {
        const lower = kw.toLowerCase();
        const results = COMPANIES.filter(c => c.name.toLowerCase().includes(lower) || c.industry.toLowerCase().includes(lower));
        this.setData({ companyResults: results });
      });
  },

  // 搜索面经（本地数据）
  searchExperiences(kw) {
    const lower = kw.toLowerCase();
    const results = EXPERIENCES.filter(e => e.title.toLowerCase().includes(lower) || e.company.toLowerCase().includes(lower));
    this.setData({ experienceResults: results });
  },

  // 快捷/历史搜索
  quickSearch(e) {
    this.setData({ keyword: e.currentTarget.dataset.keyword });
    this.doSearch();
  },

  historySearch(e) {
    this.setData({ keyword: e.currentTarget.dataset.keyword });
    this.doSearch();
  },

  clearHistory() {
    this.setData({ searchHistory: [] });
    wx.removeStorageSync('searchHistory');
  },

  switchTab(e) {
    this.setData({ currentTab: e.currentTarget.dataset.index });
  },

  // 跳转
  goToJobDetail(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title || '';
    // 记录浏览历史
    if (title) {
      let history = wx.getStorageSync('viewHistory') || [];
      history.unshift({ id, title, time: Date.now() });
      if (history.length > 20) history = history.slice(0, 20);
      wx.setStorageSync('viewHistory', history);
    }
    wx.navigateTo({ url: '/pages/job-detail/job-detail?id=' + encodeURIComponent(id) });
  },

  goToCompanyDetail(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '';
    wx.navigateTo({ url: '/pages/company-detail/company-detail?id=' + id + '&name=' + encodeURIComponent(name) });
  },

  goToExperienceDetail(e) {
    wx.navigateTo({ url: '/pages/experience-detail/experience-detail?id=' + encodeURIComponent(e.currentTarget.dataset.id) });
  }
});

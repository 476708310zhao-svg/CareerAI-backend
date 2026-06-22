// pages/bigtech-jobs/bigtech-jobs.js
const { getBigtechJobs, getBigtechStats, refreshBigtechJobs } = require('../../../utils/api-jobs.js');

function extractSourceJobId(source, applyUrl) {
  if (!applyUrl) return '';
  if (source === 'greenhouse') {
    const m = applyUrl.match(/\/jobs\/(\d+)/);
    return m ? m[1] : '';
  }
  if (source === 'lever') {
    const m = applyUrl.match(/lever\.co\/[^/]+\/([^/?#]+)/);
    return m ? m[1] : '';
  }
  return '';
}

const SPONSOR_LABELS = { yes: '可赞助', no: '不赞助', unknown: '未知' };
const SPONSOR_COLORS  = { yes: '#16a34a', no: '#dc2626', unknown: '#9ca3af' };

const COMPANIES = [
  '全部', 'Airbnb', 'Stripe', 'Lyft', 'DoorDash', 'Coinbase', 'Figma',
  'Notion', 'Discord', 'Ramp', 'Brex', 'Scale AI', 'Duolingo', 'Chime',
  'Databricks', 'Airtable', 'Robinhood', 'Flexport', 'Netflix', 'Plaid',
  'Rippling', 'Retool', 'Linear', 'Vercel', 'Hugging Face', 'OpenAI', 'Anthropic',
];

Page({
  data: {
    jobs: [],
    loading: false,
    refreshing: false,
    showInternalRefresh: false,
    hasMore: true,
    page: 1,
    total: 0,

    // 筛选
    filterCompany:     '',
    filterSponsor:     '',   // '' | 'yes' | 'no' | 'unknown'
    filterRemote:      '',   // '' | '1'
    filterKeyword:     '',
    showFilter:        false,
    companyList:       COMPANIES,
    selectedCompanyIdx: 0,

    // 统计
    stats: null,
  },

  onLoad() {
    this.loadJobs(true);
    this._loadStats();
  },

  onPullDownRefresh() {
    this.loadJobs(true, true);
  },

  onReachBottom() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadJobs(false);
    }
  },

  loadJobs(reset, pullRefresh) {
    if (this.data.loading) return;
    const nextPage = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    const { filterCompany, filterSponsor, filterRemote, filterKeyword } = this.data;

    getBigtechJobs({
      company:     filterCompany,
      sponsorship: filterSponsor,
      remote:      filterRemote,
      keyword:     filterKeyword,
      page:        nextPage,
      pageSize:    20,
    }).then(res => {
      const raw    = (res && res.jobs) || [];
      const total  = (res && res.total) || 0;
      const items  = raw.map(j => ({
        ...j,
        sponsorLabel: SPONSOR_LABELS[j.sponsorship] || '未知',
        sponsorColor: SPONSOR_COLORS[j.sponsorship] || '#9ca3af',
        locationShort: (j.location || '').split(',')[0].trim() || '未知地点',
      }));

      const list = reset ? items : this.data.jobs.concat(items);
      this.setData({
        jobs:    list,
        total,
        page:    nextPage,
        hasMore: list.length < total,
        loading: false,
      });
      if (pullRefresh) wx.stopPullDownRefresh();
    }).catch(() => {
      this.setData({ loading: false });
      if (pullRefresh) wx.stopPullDownRefresh();
    });
  },

  _loadStats() {
    getBigtechStats().then(res => {
      if (res && res.ok) {
        this.setData({
          stats: {
            ...res,
            lastFetchText: res.lastFetch ? String(res.lastFetch).slice(0, 16) : '—'
          }
        });
      }
    }).catch(() => {});
  },

  // 鈹€鈹€ 绛涢€?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  toggleFilter() { this.setData({ showFilter: !this.data.showFilter }); },

  selectCompany(e) {
    const idx  = e.currentTarget.dataset.idx;
    const name = this.data.companyList[idx];
    this.setData({
      selectedCompanyIdx: idx,
      filterCompany: name === '全部' ? '' : name,
    });
  },

  selectSponsor(e) { this.setData({ filterSponsor: e.currentTarget.dataset.val }); },
  toggleRemote(e)  { this.setData({ filterRemote: e.detail.value ? '1' : '' }); },

  onKeywordInput(e)  { this.setData({ filterKeyword: e.detail.value }); },

  applyFilter() {
    this.setData({ showFilter: false });
    this.loadJobs(true);
  },

  resetFilter() {
    this.setData({
      filterCompany: '', filterSponsor: '', filterRemote: '', filterKeyword: '',
      selectedCompanyIdx: 0, showFilter: false,
    });
    this.loadJobs(true);
  },

  // 鈹€鈹€ 鎵嬪姩鍒锋柊鎶撳彇 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  triggerRefresh() {
    wx.showModal({
      title: '抓取最新职位',
      content: '将从 Greenhouse / Lever 重新抓取所有公司职位，约需 30-60 秒，继续吗？',
      success: ({ confirm }) => {
        if (!confirm) return;
        this.setData({ refreshing: true });
        wx.showLoading({ title: '抓取中...', mask: true });
        refreshBigtechJobs().then(res => {
          wx.hideLoading();
          this.setData({ refreshing: false });
          wx.showToast({ title: `已更新 ${res.total || 0} 条`, icon: 'success' });
          this.loadJobs(true);
          this._loadStats();
        }).catch(err => {
          wx.hideLoading();
          this.setData({ refreshing: false });
          wx.showToast({ title: '抓取失败，请重试', icon: 'error' });
          console.error('[bigtech refresh]', err);
        });
      }
    });
  },

  // 鈹€鈹€ 璺宠浆 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  goApply(e) {
    const { source, slug, jobid, title, company } = e.currentTarget.dataset;
    if (!source || !slug || !jobid) return;
    wx.navigateTo({
      url: `/package-user/pages/apply-form/apply-form?source=${source}&slug=${slug}&jobId=${jobid}&title=${encodeURIComponent(title || '')}&company=${encodeURIComponent(company || '')}`,
    });
  },

  openJob(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '职位链接已复制',
          content: '请在浏览器中粘贴链接，打开公司官方招聘页查看详情。',
          showCancel: false
        });
      }
    });
  },
});

// pages/companies/companies.js
const { getCompanies } = require('../../utils/api.js');

const TABS = [
  { label: '全部', value: '' },
  { label: '科技', value: 'Technology' },
  { label: '金融', value: 'Finance' },
  { label: '咨询', value: 'Consulting' },
  { label: '汽车', value: 'Automotive' }
];

Page({
  data: {
    tabs: TABS,
    currentTab: '',
    list: [],
    loading: false,
    page: 1,
    hasMore: true
  },

  onLoad() {
    this.loadCompanies(1);
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab, list: [], page: 1, hasMore: true });
    this.loadCompanies(1);
  },

  loadCompanies(page) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    getCompanies({
      industry: this.data.currentTab,
      page,
      pageSize: 20
    }).then(res => {
      const data = res && res.data ? res.data : {};
      const list = (data.list || []).map(company => ({
        id: company.id,
        name: company.name,
        desc: company.industryL2 || company.description || company.officialDomain || '',
        industry: company.industry || '-',
        logo: company.logo,
        initial: (company.name || '?').slice(0, 1).toUpperCase(),
        color: company.brandColor || '#2563eb',
        jobCount: company.jobCount || 0
      }));
      this.setData({
        list: page === 1 ? list : this.data.list.concat(list),
        page,
        hasMore: page < (data.totalPages || 1),
        loading: false
      });
    }).catch(() => {
      this.setData({ loading: false, hasMore: false });
      wx.showToast({ title: '公司列表加载失败', icon: 'none' });
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadCompanies(this.data.page + 1);
    }
  },

  onCompanyTap(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '';
    wx.navigateTo({ url: `/pages/company-detail/company-detail?id=${id}&name=${encodeURIComponent(name)}` });
  },

  onLogoError(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`list[${idx}].logoFailed`]: true });
  }
});

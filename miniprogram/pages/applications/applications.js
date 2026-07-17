const api = require('../../utils/api-v4.js');
const navigation = require('../../utils/navigation.js');

const GROUPS = [
  { key: 'all', label: '全部' },
  { key: 'preparing', label: '准备中' },
  { key: 'applied', label: '已投递' },
  { key: 'interview', label: '面试中' },
  { key: 'offer', label: 'Offer' },
  { key: 'closed', label: '已结束' }
];

Page({
  data: {
    loading: true,
    refreshing: false,
    loginRequired: false,
    error: '',
    activeGroup: 'all',
    filters: GROUPS.map(item => Object.assign({}, item, { count: 0 })),
    applications: [],
    visibleApplications: [],
    statistics: {},
    total: 0
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.syncCustomTabBar === 'function') app.syncCustomTabBar();
    this.loadBoard();
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true });
    this.loadBoard(true).finally(() => wx.stopPullDownRefresh());
  },

  hasToken() {
    try { return !!wx.getStorageSync('token'); } catch (error) { return false; }
  },

  loadBoard(force) {
    if (this._loadingPromise && !force) return this._loadingPromise;
    if (!this.hasToken()) {
      this.setData({
        loading: false,
        refreshing: false,
        loginRequired: true,
        error: '',
        applications: [],
        visibleApplications: [],
        total: 0
      });
      return Promise.resolve();
    }

    this.setData({ loading: true, loginRequired: false, error: '' });
    const request = api.getApplicationBoard().then(response => {
      const data = response && response.code === 0 ? response.data : null;
      if (!data || !data.groups) throw new Error('申请看板数据异常');
      const applications = [];
      Object.keys(data.groups).forEach(group => {
        (data.groups[group] || []).forEach(item => {
          applications.push(Object.assign({}, item, {
            group,
            companyInitial: String(item.company || '职').slice(0, 1)
          }));
        });
      });
      const statistics = data.statistics || {};
      const filters = GROUPS.map(item => Object.assign({}, item, {
        count: item.key === 'all' ? Number(data.total || applications.length) : Number(statistics[item.key] || 0)
      }));
      this.setData({
        loading: false,
        refreshing: false,
        applications,
        statistics,
        total: Number(data.total || applications.length),
        filters
      });
      this.applyFilter(this.data.activeGroup);
    }).catch(error => {
      this.setData({
        loading: false,
        refreshing: false,
        error: error && error.message || '申请看板加载失败'
      });
    }).finally(() => {
      if (this._loadingPromise === request) this._loadingPromise = null;
    });
    this._loadingPromise = request;
    return request;
  },

  applyFilter(group) {
    const activeGroup = group || 'all';
    const visibleApplications = activeGroup === 'all'
      ? this.data.applications
      : this.data.applications.filter(item => item.group === activeGroup);
    this.setData({ activeGroup, visibleApplications });
  },

  changeGroup(e) {
    this.applyFilter(e.currentTarget.dataset.group);
  },

  openApplication(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    navigation.safeNavigateTo('/package-user/pages/application-detail/application-detail?id=' + encodeURIComponent(id));
  },

  goJobs() {
    navigation.safeSwitchTab('/pages/campus/campus');
  },

  goProfile() {
    navigation.safeSwitchTab('/pages/profile/profile');
  },

  retry() {
    this.loadBoard(true);
  }
});

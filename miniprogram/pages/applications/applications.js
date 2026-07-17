const api = require('../../utils/api-v4.js');
const navigation = require('../../utils/navigation.js');
const { buildApplicationWorkbench } = require('../../utils/application-workbench.js');

const GROUPS = [
  { key: 'all', label: '全部' },
  { key: 'preparing', label: '准备中' },
  { key: 'applied', label: '已投递' },
  { key: 'interview', label: '面试中' },
  { key: 'offer', label: 'Offer' },
  { key: 'closed', label: '已结束' }
];

function emptyCreateForm() {
  return { company: '', jobTitle: '', city: '', deadline: '', nextAction: '' };
}

function todayLabel() {
  const now = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${now.getMonth() + 1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`;
}

Page({
  data: {
    todayLabel: todayLabel(),
    loading: true,
    refreshing: false,
    loginRequired: false,
    error: '',
    activeGroup: 'all',
    filters: GROUPS.map(item => Object.assign({}, item, { count: 0 })),
    applications: [],
    visibleApplications: [],
    statistics: {},
    total: 0,
    activeCount: 0,
    highlights: [],
    funnel: [],
    showCreate: false,
    creating: false,
    createForm: emptyCreateForm()
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

  resetBoardState(extra) {
    this.setData(Object.assign({
      loading: false,
      refreshing: false,
      applications: [],
      visibleApplications: [],
      total: 0,
      activeCount: 0,
      statistics: {},
      highlights: [],
      funnel: [],
      filters: GROUPS.map(item => Object.assign({}, item, { count: 0 }))
    }, extra || {}));
  },

  loadBoard(force) {
    if (this._loadingPromise && !force) return this._loadingPromise;
    if (!this.hasToken()) {
      this.resetBoardState({ loginRequired: true, error: '' });
      return Promise.resolve();
    }

    this.setData({ loading: true, loginRequired: false, error: '' });
    const request = api.getApplicationBoard().then(response => {
      const data = response && response.code === 0 ? response.data : null;
      if (!data || !data.groups) throw new Error('申请进度数据异常');
      const applications = [];
      Object.keys(data.groups).forEach(group => {
        (data.groups[group] || []).forEach(item => applications.push(Object.assign({}, item, { group })));
      });

      const dashboard = buildApplicationWorkbench(applications, new Date());
      const filters = GROUPS.map(item => Object.assign({}, item, {
        count: item.key === 'all' ? dashboard.total : Number(dashboard.counts[item.key] || 0)
      }));
      this.setData({
        loading: false,
        refreshing: false,
        applications: dashboard.applications,
        statistics: dashboard.counts,
        total: dashboard.total,
        activeCount: dashboard.activeCount,
        highlights: dashboard.highlights,
        funnel: dashboard.funnel,
        filters
      });
      this.applyFilter(this.data.activeGroup);
    }).catch(error => {
      this.setData({
        loading: false,
        refreshing: false,
        error: error && error.message || '申请进度加载失败'
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

  goResumeCenter() {
    navigation.safeNavigateTo('/package-career/pages/resume-center/resume-center');
  },

  goAiCareer() {
    navigation.safeSwitchTab('/pages/ai-career/ai-career');
  },

  openCreate() {
    if (!this.hasToken()) {
      wx.showToast({ title: '登录后可新增申请', icon: 'none' });
      this.goProfile();
      return;
    }
    this.setData({ showCreate: true, creating: false, createForm: emptyCreateForm() });
  },

  closeCreate() {
    if (this.data.creating) return;
    this.setData({ showCreate: false });
  },

  stopModal() {},

  onCreateInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!Object.prototype.hasOwnProperty.call(this.data.createForm, field)) return;
    this.setData({ ['createForm.' + field]: e.detail.value });
  },

  onDeadlineChange(e) {
    this.setData({ 'createForm.deadline': e.detail.value });
  },

  submitCreate() {
    if (this.data.creating) return;
    const form = this.data.createForm;
    const company = String(form.company || '').trim();
    const jobTitle = String(form.jobTitle || '').trim();
    if (!company || !jobTitle) {
      wx.showToast({ title: '请填写公司和岗位', icon: 'none' });
      return;
    }

    this.setData({ creating: true });
    const jobId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    api.createApplication({
      jobId,
      status: 'preparing',
      sourceType: 'manual_application',
      deadline: form.deadline,
      nextAction: String(form.nextAction || '').trim() || '确认岗位要求并准备申请材料',
      jobSnapshot: {
        id: jobId,
        company,
        title: jobTitle,
        location: String(form.city || '').trim()
      }
    }).then(() => {
      wx.showToast({ title: '已加入求职进度', icon: 'success' });
      this.setData({ showCreate: false, creating: false, activeGroup: 'all', createForm: emptyCreateForm() });
      return this.loadBoard(true);
    }).catch(error => {
      this.setData({ creating: false });
      wx.showToast({ title: error && error.message || '新增失败，请重试', icon: 'none' });
    });
  },

  retry() {
    this.loadBoard(true);
  }
});

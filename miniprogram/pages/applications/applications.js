const api = require('../../utils/api-v4.js');
const navigation = require('../../utils/navigation.js');
const progress = require('../../utils/job-progress.js');
const loginGate = require('../../behaviors/login-gate.js');
const { LABELS } = require('../../utils/application-state.js');
const { readApplication } = require('../../utils/application-queue.js');
const analytics = require('../../utils/analytics.js');
const { shanghaiDayParts } = require('../../utils/date-time.js');
const { getNavigationLayout } = require('../../utils/navigation-layout.js');
const {
  buildApplicationWorkbench,
  extractBoardData,
  mergeApplicationSources
} = require('../../utils/application-workbench.js');

const GROUPS = [
  { key: 'all', label: '全部' },
  { key: 'preparing', label: '待投递' },
  { key: 'applied', label: '已投递' },
  { key: 'oa', label: 'OA' },
  { key: 'interview', label: '面试中' },
  { key: 'offer', label: 'Offer' },
  { key: 'closed', label: '已结束' }
];

function emptyCreateForm() {
  return { company: '', jobTitle: '', city: '', deadline: '', nextAction: '' };
}

function todayLabel() {
  const parts = shanghaiDayParts();
  if (!parts) return '';
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return `${parts.month}月${parts.day}日 · ${weekdays[weekday]}`;
}

Page({
  behaviors: [loginGate],

  data: {
    navTop: 80,
    todayLabel: todayLabel(),
    loading: true,
    refreshing: false,
    loginRequired: false,
    error: '',
    syncNotice: '',
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
    updatingId: '',
    createForm: emptyCreateForm()
  },

  onLoad() {
    if (typeof getNavigationLayout === 'function') this.setData(getNavigationLayout());
  },

  onShow() {
    const ownerScope = progress.currentOwnerScope ? progress.currentOwnerScope() : '';
    if (this._ownerScope !== undefined && this._ownerScope !== ownerScope) {
      this._boardSeq = (this._boardSeq || 0) + 1;
      this._loadingPromise = null;
      this.resetBoardState({ loginRequired: !ownerScope, error: ownerScope ? '账号已变化，正在重新加载' : '' });
    }
    this._ownerScope = ownerScope;
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
      syncNotice: '',
      highlights: [],
      funnel: [],
      filters: GROUPS.map(item => Object.assign({}, item, { count: 0 }))
    }, extra || {}));
  },

  loadBoard(force) {
    const sessionToken = wx.getStorageSync('token');
    const sessionOwner = progress.currentOwnerScope ? progress.currentOwnerScope() : '';
    if (this._loadingPromise && !force && this._boardToken === sessionToken) return this._loadingPromise;
    this._boardToken = sessionToken;
    const requestSeq = this._boardSeq = (this._boardSeq || 0) + 1;
    const isCurrent = () => {
      if (this._boardSeq !== requestSeq) return false;
      if (wx.getStorageSync('token') === sessionToken) return true;
      const currentOwner = progress.currentOwnerScope ? progress.currentOwnerScope() : '';
      if (currentOwner !== sessionOwner) {
        this.resetBoardState({ loginRequired: !currentOwner, error: currentOwner ? '账号已变化，请重新加载' : '' });
      } else {
        this.setData({ loading: false, refreshing: false });
      }
      return false;
    };
    const localApplications = progress.getList();
    if (!this.hasToken()) {
      if (localApplications.length) {
        this.renderApplications(mergeApplicationSources([], localApplications), '未登录，当前显示本机申请记录');
      } else {
        this.resetBoardState({ loginRequired: true, error: '', syncNotice: '' });
      }
      return Promise.resolve();
    }

    this.setData({ loading: true, loginRequired: false, error: '', syncNotice: '' });
    const request = api.getApplicationBoard().then(response => {
      if (!isCurrent()) return;
      const data = extractBoardData(response);
      if (!data) {
        const unauthorized = response && response._source === 'unauthorized' || !this.hasToken();
        if (unauthorized && !localApplications.length) {
          this.resetBoardState({ loginRequired: true, error: '', syncNotice: '' });
          return;
        }
        const notice = unauthorized
          ? '登录已失效，当前显示本机申请记录'
          : '云端进度暂不可用，当前显示本机申请记录';
        if (localApplications.length) this.renderApplications(mergeApplicationSources([], localApplications), notice);
        else this.resetBoardState({ error: '云端进度加载失败，请重新加载', loginRequired: false });
        return;
      }
      const applications = [];
      Object.keys(data.groups).forEach(group => {
        (data.groups[group] || []).forEach(item => applications.push(Object.assign({}, item, { group })));
      });
      const merged = mergeApplicationSources(applications, localApplications);
      progress.mergeRemoteList(applications);
      const localCount = merged.filter(item => item.localOnly).length;
      this.renderApplications(merged, localCount ? `包含 ${localCount} 条本机申请记录` : '');
    }).catch(() => {
      if (!isCurrent()) return;
      if (!localApplications.length) {
        this.resetBoardState({ error: '网络连接失败，请重新加载', loginRequired: false });
        return;
      }
      this.renderApplications(
        mergeApplicationSources([], localApplications),
        '网络连接失败，当前显示本机申请记录'
      );
    }).finally(() => {
      if (this._loadingPromise === request) this._loadingPromise = null;
    });
    this._loadingPromise = request;
    return request;
  },

  renderApplications(applications, syncNotice) {
      const dashboard = buildApplicationWorkbench(applications, new Date());
      const filters = GROUPS.map(item => Object.assign({}, item, {
        count: item.key === 'all' ? dashboard.total : Number(dashboard.counts[item.key] || 0)
      }));
      this.setData({
        loading: false,
        refreshing: false,
        loginRequired: false,
        error: '',
        syncNotice: syncNotice || '',
        applications: dashboard.applications,
        statistics: dashboard.counts,
        total: dashboard.total,
        activeCount: dashboard.activeCount,
        highlights: dashboard.highlights,
        funnel: dashboard.funnel,
        filters
      }, () => this.applyFilter(this.data.activeGroup));
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
    const application = this.data.applications.find(item => String(item.id) === String(id));
    if (application && application.localOnly) {
      navigation.safeNavigateTo('/package-user/pages/job-progress/job-progress?legacy=1&id=' + encodeURIComponent(id));
      return;
    }
    navigation.safeNavigateTo('/package-user/pages/application-detail/application-detail?id=' + encodeURIComponent(id));
  },

  goJobs() {
    // This keeps Checkpoint 5 independent from the later top-level Tab change.
    navigation.safeNavigateTo('/pages/jobs/jobs');
  },

  async quickStatus(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const current = this.data.applications.find(item => String(item.id) === id);
    if (!current || this.data.updatingId) return;
    if (current.localOnly) { this.openApplication(e); return; }
    if (!this.hasToken()) {
      this.ensureAuthenticated('登录后更新求职进度', () => this.loadBoard(true));
      return;
    }
    const token = wx.getStorageSync('token');
    this.setData({ updatingId: id });
    try {
      const response = await api.getApplicationDetail(id);
      const app = readApplication(response);
      if (wx.getStorageSync('token') !== token) return;
      const choices = app.allowedTransitions || response.data.allowedTransitions || [];
      if (!choices.length) {
        wx.showToast({ title: '该申请已结束，可查看详情', icon: 'none' });
        return;
      }
      const picked = await new Promise(resolve => wx.showActionSheet({
        itemList: choices.map(item => LABELS[item.value] || item.label),
        success: result => resolve(choices[result.tapIndex]), fail: () => resolve(null)
      }));
      if (!picked || wx.getStorageSync('token') !== token) return;
      const changed = await api.updateApplicationStatus(id, {
        status: picked.value, note: '小程序进度列表快速更新',
        expectedState: { status: app.status, historyId: app.historyId }
      });
      const result = readApplication(changed);
      if (wx.getStorageSync('token') !== token) return;
      const updated = Object.assign({}, app, result);
      progress.mergeRemoteList([updated]);
      this.renderApplications(this.data.applications.map(item => String(item.id) === id ? updated : item));
      analytics.track('mobile_application_status_updated', { applicationId: id, jobId: app.jobId, status: result.status });
      wx.showToast({ title: '状态已更新', icon: 'success' });
    } catch (error) {
      if (wx.getStorageSync('token') !== token) return;
      wx.showToast({ title: error.statusCode === 409 ? '状态已变化，请刷新后重试' : (error.message || '更新失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ updatingId: '' });
    }
  },

  promptLogin() {
    this.ensureAuthenticated(
      '登录后开启求职进度、状态同步和面试管理',
      () => this.loadBoard(true)
    );
  },

  goResumeCenter() {
    navigation.safeNavigateTo('/package-career/pages/resume-center/resume-center');
  },

  goBack() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    if (pages.length > 1) {
      navigation.safeNavigateBack({ delta: 1 });
      return;
    }
    navigation.safeSwitchTab('/pages/index/index');
  },

  goAiCareer() {
    navigation.openAiTab({ source: 'applications' });
  },

  openCreate() {
    if (!this.hasToken()) {
      this.ensureAuthenticated(
        '登录后新增申请并同步求职进度',
        () => this.openCreate()
      );
      return;
    }
    this._manualJobId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
    const jobId = this._manualJobId || (this._manualJobId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    const payload = {
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
    };
    const token = wx.getStorageSync('token');
    return api.createApplication(payload).then(readApplication).catch(error => {
      const id = error.body && error.body.data && error.body.data.applicationId;
      if (error.statusCode !== 409 || !id) throw error;
      return api.getApplicationDetail(id).then(readApplication);
    }).then(app => {
      if (wx.getStorageSync('token') !== token) throw new Error('登录已变化，请重新登录');
      progress.mergeRemoteList([app]);
      wx.showToast({ title: '已加入求职进度', icon: 'success' });
      this.setData({ showCreate: false, creating: false, activeGroup: 'all', createForm: emptyCreateForm() });
      return this.loadBoard(true);
    }).catch(error => {
      this.setData({ creating: false });
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' });
    });
  },

  retry() {
    this.loadBoard(true);
  }
});

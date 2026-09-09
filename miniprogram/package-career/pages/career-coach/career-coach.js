const api = require('../../../utils/api-v4.js');
const navigation = require('../../../utils/navigation.js');
const loginGate = require('../../../behaviors/login-gate.js');
const { parseDashboardResponse } = require('./career-coach-state.js');

const INPUT_LABELS = {
  jobsViewed: '查看岗位', jobsMatched: '完成匹配', resumesConfirmed: '确认简历',
  applicationsAdded: '加入看板', applicationsSubmitted: '确认投递',
  interviewsReached: '进入面试', offersReceived: '收到 Offer', todayTasksCompleted: '完成任务'
};

Page({
  behaviors: [loginGate],

  data: {
    loading: true,
    loginRequired: false,
    error: '',
    diagnostic: null,
    dimensions: [],
    plan: null,
    horizons: [],
    weekly: null,
    weeklyInput: [],
    conversions: [],
    todayTasks: [],
    scheduledTasks: [],
    operatingTaskId: null
  },

  onShow() {
    this.loadDashboard();
  },

  onPullDownRefresh() {
    this.loadDashboard(true).finally(() => wx.stopPullDownRefresh());
  },

  hasToken() {
    try { return !!wx.getStorageSync('token'); } catch (error) { return false; }
  },

  loadDashboard(force) {
    if (this._loadingPromise && !force) return this._loadingPromise;
    if (!this.hasToken()) {
      this.setData({ loading: false, loginRequired: true, error: '' });
      return Promise.resolve();
    }
    this.setData({ loading: true, loginRequired: false, error: '' });
    const request = api.getCareerCoachDashboard().then(response => {
      const parsed = parseDashboardResponse(response);
      if (parsed.state === 'login') {
        this.setData({
          loading: false,
          loginRequired: true,
          error: '',
          diagnostic: null,
          dimensions: [],
          plan: null,
          horizons: [],
          weekly: null,
          weeklyInput: [],
          conversions: [],
          todayTasks: [],
          scheduledTasks: []
        });
        return;
      }
      if (parsed.state === 'error') {
        this.setData({
          loading: false,
          loginRequired: false,
          error: parsed.message,
          diagnostic: null,
          dimensions: [],
          plan: null,
          horizons: [],
          weekly: null,
          weeklyInput: [],
          conversions: [],
          todayTasks: [],
          scheduledTasks: []
        });
        return;
      }
      const data = parsed.data;
      const diagnostic = data.diagnostic;
      const weekly = data.weeklyReport;
      const today = data.today;
      const weeklyInput = Object.keys(weekly.input || {}).map(key => ({
        key, label: INPUT_LABELS[key] || key, value: weekly.input[key]
      }));
      const conversions = (weekly.conversions || []).map(item => ({
        ...item,
        displayText: item.rate === null || item.rate === undefined
          ? item.display
          : `${item.display} · ${item.rate}%`
      }));
      const todayTasks = (today.tasks || []).filter(item => item.sourceType === 'career_coach').slice(0, 5);
      this.setData({
        loading: false,
        diagnostic,
        dimensions: diagnostic.dimensions,
        plan: data.dynamicPlan,
        horizons: data.dynamicPlan.horizons,
        weekly,
        weeklyInput,
        conversions,
        todayTasks,
        scheduledTasks: today.scheduled || []
      });
    }).catch(error => {
      this.setData({ loading: false, error: error && error.message || '竞争力诊断加载失败' });
    }).finally(() => {
      if (this._loadingPromise === request) this._loadingPromise = null;
    });
    this._loadingPromise = request;
    return request;
  },

  promptLogin() {
    this.ensureAuthenticated('登录后生成竞争力诊断、Today 任务和周复盘', () => this.loadDashboard(true));
  },

  createDimensionTask(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    api.createCareerDiagnosticTasks([key]).then(response => {
      wx.showToast({ title: response.data && response.data.created ? '已加入 Today' : 'Today 已有该任务', icon: 'none' });
      return this.loadDashboard(true);
    }).catch(error => wx.showToast({ title: error.message || '创建失败', icon: 'none' }));
  },

  createPriorityTasks() {
    const keys = (this.data.diagnostic && this.data.diagnostic.priorities) || [];
    api.createCareerDiagnosticTasks(keys).then(response => {
      wx.showToast({ title: response.data && response.data.created ? '补强任务已生成' : '今日任务已就绪', icon: 'none' });
      return this.loadDashboard(true);
    }).catch(error => wx.showToast({ title: error.message || '生成失败', icon: 'none' }));
  },

  completeTask(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.operatingTaskId) return;
    this.setData({ operatingTaskId: id });
    api.updateTodayTask(id, { completed: true }).then(() => this.loadDashboard(true))
      .catch(error => wx.showToast({ title: error.message || '更新失败', icon: 'none' }))
      .finally(() => this.setData({ operatingTaskId: null }));
  },

  deferTask(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.operatingTaskId) return;
    this.setData({ operatingTaskId: id });
    api.deferTodayTask(id, 1).then(() => {
      wx.showToast({ title: '已延期到明天', icon: 'none' });
      return this.loadDashboard(true);
    }).catch(error => wx.showToast({ title: error.message || '延期失败', icon: 'none' }))
      .finally(() => this.setData({ operatingTaskId: null }));
  },

  openTask(e) {
    const url = e.currentTarget.dataset.url;
    if (url) navigation.safeNavigateTo(url);
  },

  retry() {
    this.loadDashboard(true);
  }
});

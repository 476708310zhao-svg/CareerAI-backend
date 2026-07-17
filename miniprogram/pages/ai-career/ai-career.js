const api = require('../../utils/api-v4.js');
const navigation = require('../../utils/navigation.js');

const FALLBACK_AGENTS = [
  { code: 'job_advisor', name: 'AI 岗位顾问', desc: '判断资格、匹配度与投递优先级' },
  { code: 'application_assistant', name: 'AI 申请助手', desc: '准备简历、材料与跟进沟通' },
  { code: 'interview_coach', name: 'AI 面试教练', desc: '训练 STAR、岗位题与表达' },
  { code: 'career_planner', name: 'AI 职业规划师', desc: '拆解目标、差距与行动节奏' }
];

const STATUS_TEXT = {
  queued: '排队中',
  running: '处理中',
  awaiting_confirmation: '待确认',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消'
};

Page({
  data: {
    agents: FALLBACK_AGENTS,
    selectedAgent: 'job_advisor',
    applications: [],
    applicationIndex: 0,
    query: '',
    requestWrite: false,
    tasks: [],
    currentTask: null,
    loading: false,
    pageLoading: true,
    loginRequired: false,
    error: ''
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.syncCustomTabBar === 'function') app.syncCustomTabBar();
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh(true).finally(() => wx.stopPullDownRefresh());
  },

  hasToken() {
    try { return !!wx.getStorageSync('token'); } catch (error) { return false; }
  },

  normalizeTasks(tasks) {
    return (tasks || []).map(item => Object.assign({}, item, {
      statusText: STATUS_TEXT[item.status] || item.status,
      answer: item.output && item.output.message || item.error && item.error.message || ''
    }));
  },

  refresh(force) {
    if (this._refreshPromise && !force) return this._refreshPromise;
    if (!this.hasToken()) {
      this.setData({ loginRequired: true, pageLoading: false, tasks: [], applications: [], error: '' });
      return Promise.resolve();
    }
    this.setData({ loginRequired: false, pageLoading: true, error: '' });
    const request = Promise.all([
      api.getAgents().catch(() => ({ data: FALLBACK_AGENTS })),
      api.getApplicationBoard().catch(() => ({ data: { groups: {} } })),
      api.getAgentTasks().catch(() => ({ data: [] }))
    ]).then(results => {
      const agents = Array.isArray(results[0].data) && results[0].data.length
        ? results[0].data.map(item => Object.assign({}, item, {
          desc: (FALLBACK_AGENTS.find(agent => agent.code === item.code) || {}).desc || ''
        }))
        : FALLBACK_AGENTS;
      const groups = results[1].data && results[1].data.groups || {};
      const applications = Object.keys(groups).reduce((all, key) => all.concat(groups[key] || []), []);
      this.setData({
        agents,
        applications,
        applicationIndex: Math.min(this.data.applicationIndex, Math.max(0, applications.length - 1)),
        tasks: this.normalizeTasks(results[2].data),
        pageLoading: false
      });
    }).catch(error => {
      this.setData({ pageLoading: false, error: error && error.message || 'AI Career 加载失败' });
    }).finally(() => {
      if (this._refreshPromise === request) this._refreshPromise = null;
    });
    this._refreshPromise = request;
    return request;
  },

  loadTasks() {
    if (!this.hasToken()) return Promise.resolve();
    return api.getAgentTasks().then(response => {
      this.setData({ tasks: this.normalizeTasks(response.data) });
    }).catch(() => {});
  },

  selectAgent(e) {
    this.setData({ selectedAgent: e.currentTarget.dataset.code });
  },

  onApplicationChange(e) {
    this.setData({ applicationIndex: Number(e.detail.value) || 0 });
  },

  onQuery(e) {
    this.setData({ query: e.detail.value });
  },

  toggleWrite() {
    this.setData({ requestWrite: !this.data.requestWrite });
  },

  runAgent() {
    if (this.data.loading) return;
    const query = String(this.data.query || '').trim();
    if (!query) {
      wx.showToast({ title: '请先描述需要解决的问题', icon: 'none' });
      return;
    }
    const application = this.data.applications[this.data.applicationIndex];
    this.setData({ loading: true });
    api.createAgentTask({
      agentType: this.data.selectedAgent,
      applicationId: application && application.id,
      input: {
        query,
        requestWrite: this.data.requestWrite,
        writeAction: 'create_today_task',
        taskTitle: '执行 AI Career 建议'
      }
    }).then(response => {
      const task = this.normalizeTasks([response.data])[0];
      this.setData({ currentTask: task, loading: false, query: '' });
      return this.loadTasks();
    }).catch(error => {
      this.setData({ loading: false });
      wx.showToast({ title: error && error.message || '执行失败', icon: 'none' });
    });
  },

  openTask(e) {
    const task = this.data.tasks.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    this.setData({ currentTask: task || null });
  },

  closeTask() {
    this.setData({ currentTask: null });
  },

  confirmWrite() {
    const task = this.data.currentTask;
    if (!task || !task.confirmationToken) return;
    api.confirmAgentTask(task.id, { confirmationToken: task.confirmationToken }).then(response => {
      this.setData({ currentTask: this.normalizeTasks([response.data])[0] });
      this.loadTasks();
    }).catch(error => wx.showToast({ title: error && error.message || '确认失败', icon: 'none' }));
  },

  retryTask() {
    const task = this.data.currentTask;
    if (!task) return;
    api.retryAgentTask(task.id, { timeoutMs: 20000 }).then(response => {
      this.setData({ currentTask: this.normalizeTasks([response.data])[0] });
      this.loadTasks();
    }).catch(error => wx.showToast({ title: error && error.message || '重试失败', icon: 'none' }));
  },

  cancelTask() {
    const task = this.data.currentTask;
    if (!task) return;
    api.cancelAgentTask(task.id).then(() => {
      this.closeTask();
      this.loadTasks();
    }).catch(error => wx.showToast({ title: error && error.message || '取消失败', icon: 'none' }));
  },

  goProfile() {
    navigation.safeSwitchTab('/pages/profile/profile');
  },

  openInterviews() {
    navigation.safeNavigateTo('/package-ai/pages/interview-space/interview-space');
  },

  openMaterials() {
    navigation.safeNavigateTo('/package-ai/pages/application-materials/application-materials');
  },

  openAssistant() {
    navigation.safeNavigateTo('/package-ai/pages/ai-assistant/ai-assistant');
  },

  retryPage() {
    this.refresh(true);
  }
});

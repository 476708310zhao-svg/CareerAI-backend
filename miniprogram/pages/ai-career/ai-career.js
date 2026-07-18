const api = require('../../utils/api-v4.js');
const aiApi = require('../../utils/api-ai.js');
const agentCompat = require('../../utils/agent-compat.js');
const config = require('../../utils/app-config.js');
const navigation = require('../../utils/navigation.js');
const { extractBoardData } = require('../../utils/application-workbench.js');

const LOCAL_COMPAT_TASKS_KEY = 'aiCareerCompatTasks_v1';
const LOCAL_COMPAT_TASK_LIMIT = 20;

const FALLBACK_AGENTS = [
  {
    code: 'job_advisor', name: 'AI 岗位顾问', shortName: '岗位顾问', icon: '岗', tone: 'blue',
    desc: '判断资格、匹配度与投递优先级',
    prompts: ['判断岗位是否值得投', '找出资格硬伤', '给出投递优先级']
  },
  {
    code: 'application_assistant', name: 'AI 申请助手', shortName: '申请助手', icon: '申', tone: 'violet',
    desc: '准备简历、材料与跟进沟通',
    prompts: ['检查申请材料缺口', '生成本周跟进计划', '优化 Recruiter 消息']
  },
  {
    code: 'interview_coach', name: 'AI 面试教练', shortName: '面试教练', icon: '面', tone: 'orange',
    desc: '训练 STAR、岗位题与表达',
    prompts: ['生成岗位面试题', '训练一个 STAR 案例', '找出表达短板']
  },
  {
    code: 'career_planner', name: 'AI 职业规划师', shortName: '职业规划', icon: '规', tone: 'green',
    desc: '拆解目标、差距与行动节奏',
    prompts: ['拆解三个月目标', '分析能力差距', '制定本周行动']
  }
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
    selectedAgentInfo: FALLBACK_AGENTS[0],
    applications: [],
    applicationIndex: 0,
    query: '',
    requestWrite: false,
    tasks: [],
    currentTask: null,
    loading: false,
    pageLoading: true,
    loginRequired: false,
    compatibilityMode: false,
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
      answer: item.output && item.output.message || item.error && item.error.message || '',
      agentMeta: FALLBACK_AGENTS.find(agent => agent.code === item.agentType) || FALLBACK_AGENTS[0]
    }));
  },

  readLocalCompatTasks() {
    try {
      const tasks = wx.getStorageSync(LOCAL_COMPAT_TASKS_KEY);
      return Array.isArray(tasks) ? tasks : [];
    } catch (error) {
      return [];
    }
  },

  saveLocalCompatTask(task) {
    const tasks = agentCompat.mergeTasks([task], this.readLocalCompatTasks()).slice(0, LOCAL_COMPAT_TASK_LIMIT);
    try { wx.setStorageSync(LOCAL_COMPAT_TASKS_KEY, tasks); } catch (error) {}
    return tasks;
  },

  refresh(force) {
    if (this._refreshPromise && !force) return this._refreshPromise;
    if (!this.hasToken()) {
      this.setData({ loginRequired: true, pageLoading: false, tasks: [], applications: [], error: '' });
      return Promise.resolve();
    }
    if (!config.V4_AGENT_API_ENABLED) {
      const tasks = this.normalizeTasks(this.readLocalCompatTasks());
      this.setData({
        agents: FALLBACK_AGENTS,
        selectedAgentInfo: FALLBACK_AGENTS.find(agent => agent.code === this.data.selectedAgent) || FALLBACK_AGENTS[0],
        applications: [],
        tasks,
        compatibilityMode: true,
        requestWrite: false,
        loginRequired: false,
        pageLoading: false,
        error: ''
      });
      return Promise.resolve();
    }
    this.setData({ loginRequired: false, pageLoading: true, error: '' });
    const request = Promise.all([
      api.getAgents().catch(() => ({ data: FALLBACK_AGENTS })),
      api.getApplicationBoard().catch(() => ({ data: { groups: {} } })),
      api.getAgentTasks().catch(() => ({ data: [] }))
    ]).then(results => {
      const agentPayload = Array.isArray(results[0].data) ? results[0].data : (Array.isArray(results[0]) ? results[0] : []);
      const agents = agentPayload.length
        ? agentPayload.map(item => Object.assign({}, FALLBACK_AGENTS.find(agent => agent.code === item.code) || {}, item))
        : FALLBACK_AGENTS;
      const board = extractBoardData(results[1]);
      const groups = board && board.groups || {};
      const applications = Object.keys(groups).reduce((all, key) => all.concat(groups[key] || []), []);
      const selectedAgentInfo = agents.find(agent => agent.code === this.data.selectedAgent) || agents[0] || FALLBACK_AGENTS[0];
      const taskPayload = Array.isArray(results[2].data) ? results[2].data : (Array.isArray(results[2]) ? results[2] : []);
      const compatibilityMode = Number(results[0] && results[0]._status) === 404 || Number(results[2] && results[2]._status) === 404;
      const tasks = agentCompat.mergeTasks(taskPayload, this.readLocalCompatTasks());
      this.setData({
        agents,
        selectedAgentInfo,
        applications,
        applicationIndex: Math.min(this.data.applicationIndex, Math.max(0, applications.length - 1)),
        tasks: this.normalizeTasks(tasks),
        compatibilityMode,
        requestWrite: compatibilityMode ? false : this.data.requestWrite,
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
    if (!config.V4_AGENT_API_ENABLED || this.data.compatibilityMode) {
      this.setData({ tasks: this.normalizeTasks(this.readLocalCompatTasks()) });
      return Promise.resolve();
    }
    return api.getAgentTasks().then(response => {
      const compatibilityMode = Number(response && response._status) === 404;
      const remoteTasks = Array.isArray(response && response.data) ? response.data : [];
      const tasks = agentCompat.mergeTasks(remoteTasks, this.readLocalCompatTasks());
      this.setData({
        tasks: this.normalizeTasks(tasks),
        compatibilityMode: compatibilityMode || this.data.compatibilityMode,
        requestWrite: compatibilityMode ? false : this.data.requestWrite
      });
    }).catch(() => {});
  },

  selectAgent(e) {
    const selectedAgent = e.currentTarget.dataset.code;
    const selectedAgentInfo = this.data.agents.find(agent => agent.code === selectedAgent) || FALLBACK_AGENTS[0];
    this.setData({ selectedAgent, selectedAgentInfo });
  },

  usePrompt(e) {
    this.setData({ query: e.currentTarget.dataset.prompt || '' });
  },

  onApplicationChange(e) {
    this.setData({ applicationIndex: Number(e.detail.value) || 0 });
  },

  onQuery(e) {
    this.setData({ query: e.detail.value });
  },

  toggleWrite() {
    if (this.data.compatibilityMode) {
      wx.showToast({ title: '兼容模式暂不执行写操作', icon: 'none' });
      return;
    }
    this.setData({ requestWrite: !this.data.requestWrite });
  },

  runCompatAgent(payload, application) {
    const context = { agent: this.data.selectedAgentInfo, application };
    const messages = agentCompat.buildLegacyMessages(payload, context);
    return aiApi.sendChatToDeepSeek(messages, 0).then(response => {
      const content = agentCompat.extractChatContent(response);
      if (!content) throw new Error('AI 返回为空，请稍后重试');
      const task = agentCompat.createLocalTask(payload, content, context);
      this.saveLocalCompatTask(task);
      return { code: 0, data: task, _source: 'legacy-ai' };
    });
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
    const payload = {
      agentType: this.data.selectedAgent,
      applicationId: application && application.id,
      input: {
        query,
        requestWrite: this.data.requestWrite,
        writeAction: 'create_today_task',
        taskTitle: '执行 AI Career 建议'
      }
    };
    const run = this.data.compatibilityMode
      ? this.runCompatAgent(payload, application)
      : api.createAgentTask(payload).catch(error => {
        if (!agentCompat.isV4EndpointMissing(error)) throw error;
        this.setData({ compatibilityMode: true, requestWrite: false });
        return this.runCompatAgent(payload, application);
      });
    run.then(response => {
      const task = this.normalizeTasks([response.data])[0];
      const isCompat = !!(response && response._source === 'legacy-ai' || task && task.compatibilityMode);
      const tasks = isCompat
        ? this.normalizeTasks(agentCompat.mergeTasks([response.data], this.data.tasks))
        : this.data.tasks;
      this.setData({ currentTask: task, tasks, loading: false, query: '', compatibilityMode: isCompat || this.data.compatibilityMode });
      if (isCompat) return null;
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

const api = require('../../../utils/api-v4.js');

Page({
  data: { agents: [], selectedAgent: 'job_advisor', applications: [], applicationIndex: 0, query: '', requestWrite: false,
    tasks: [], currentTask: null, loading: false },
  onLoad() { this.refresh(); }, onShow() { this.loadTasks(); },
  refresh() {
    Promise.all([api.getAgents(), api.getApplicationBoard()]).then(([agents, board]) => {
      const groups = board.data && board.data.groups || {};
      this.setData({ agents: agents.data || [], applications: Object.values(groups).reduce((all, list) => all.concat(list || []), []) });
    }); this.loadTasks();
  },
  loadTasks() { api.getAgentTasks().then(res => this.setData({ tasks: res.data || [] })).catch(() => {}); },
  selectAgent(e) { this.setData({ selectedAgent: e.currentTarget.dataset.code }); },
  onApplicationChange(e) { this.setData({ applicationIndex: Number(e.detail.value) || 0 }); },
  onQuery(e) { this.setData({ query: e.detail.value }); },
  toggleWrite() { this.setData({ requestWrite: !this.data.requestWrite }); },
  runAgent() {
    const application = this.data.applications[this.data.applicationIndex]; this.setData({ loading: true });
    api.createAgentTask({ agentType: this.data.selectedAgent, applicationId: application && application.id,
      input: { query: this.data.query, requestWrite: this.data.requestWrite, writeAction: 'create_today_task', taskTitle: '执行 AI Career 建议' } })
      .then(res => { this.setData({ currentTask: res.data, loading: false }); this.loadTasks(); })
      .catch(err => { this.setData({ loading: false }); wx.showToast({ title: err.message || '执行失败', icon: 'none' }); });
  },
  openTask(e) { const task = this.data.tasks.find(item => String(item.id) === String(e.currentTarget.dataset.id)); this.setData({ currentTask: task || null }); },
  closeTask() { this.setData({ currentTask: null }); },
  confirmWrite() { const task = this.data.currentTask; api.confirmAgentTask(task.id, { confirmationToken: task.confirmationToken }).then(res => { this.setData({ currentTask: res.data }); this.loadTasks(); }); },
  retryTask() { const task = this.data.currentTask; api.retryAgentTask(task.id, { timeoutMs: 20000 }).then(res => { this.setData({ currentTask: res.data }); this.loadTasks(); }); },
  cancelTask() { const task = this.data.currentTask; api.cancelAgentTask(task.id).then(() => { this.closeTask(); this.loadTasks(); }); },
  openInterviews() { wx.navigateTo({ url: '/package-ai/pages/interview-space/interview-space' }); }
});

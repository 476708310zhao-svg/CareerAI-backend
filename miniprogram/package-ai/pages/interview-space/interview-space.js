const api = require('../../../utils/api-v4.js');
const ownerStorage = require('../../../utils/owner-storage.js');

Page({
  data: {
    spaces: [], current: null, session: null, question: '请介绍一个最能体现你岗位能力的项目。', answer: '',
    feedback: null, report: null, tasks: [], trends: [], focusDimension: '', applicationId: '',
    starting: false, submitting: false, completing: false
  },
  onLoad(options) {
    this._unloaded = false;
    this._ownerScope = ownerStorage.capture();
    this.setData({ focusDimension: options.focus || '', applicationId: options.applicationId || '' });
    const owner = this._ownerScope;
    Promise.all([api.getInterviewSpaces(), api.getTodayTasks(), api.getInterviewTrends()]).then(([spaces, tasks, trends]) => {
      if (this._unloaded || !ownerStorage.isCurrent(owner)) return;
      const list = spaces.data || [];
      this.setData({ spaces: list, tasks: tasks.data || [], trends: trends.data || [] });
      const target = options.id || ((list.find(item => String(item.applicationId) === String(options.applicationId || '')) || {}).id);
      if (target) return this.openById(target);
      if (options.applicationId) return this.ensureApplicationSpace(options.applicationId);
    }).catch(err => {
      if (!this._unloaded && ownerStorage.isCurrent(owner)) wx.showToast({ title: err.message || '面试空间加载失败', icon: 'none' });
    });
  },
  onUnload() { this._unloaded = true; this._requestGeneration = (this._requestGeneration || 0) + 1; },
  ensureApplicationSpace(applicationId) {
    const owner = this._ownerScope;
    return api.ensureInterviewSpace(applicationId).then(res => {
      if (this._unloaded || !ownerStorage.isCurrent(owner)) return;
      const space = res.data;
      this.setData({ spaces: [space].concat(this.data.spaces.filter(item => String(item.id) !== String(space.id))) });
      return this.openById(space.id);
    });
  },
  openById(id) {
    const owner = this._ownerScope;
    const requestId = this._requestGeneration = (this._requestGeneration || 0) + 1;
    return api.getInterviewSpace(id).then(res => {
      if (this._unloaded || requestId !== this._requestGeneration || !ownerStorage.isCurrent(owner)) return;
      const space = res.data.space;
      this.setData({ current: space, applicationId: space.applicationId || this.data.applicationId });
      ownerStorage.set('interviewContext', '', { applicationId: space.applicationId || this.data.applicationId || '', company: space.company || '', position: space.jobTitle || '' });
    });
  },
  selectSpace(e) { this.openById(e.currentTarget.dataset.id); },
  backList() { this.setData({ current: null, session: null, report: null }); },
  startSession(type, patch) {
    if (!this.data.current || this.data.starting || this.data.session) return;
    const owner = this._ownerScope;
    const requestId = this._requestGeneration = (this._requestGeneration || 0) + 1;
    this.setData({ starting: true });
    api.startInterviewSession(this.data.current.id, { sessionType: type }).then(res => {
      if (this._unloaded || requestId !== this._requestGeneration || !ownerStorage.isCurrent(owner)) return;
      this.setData(Object.assign({ session: res.data, feedback: null, report: null }, patch || {}));
    }).catch(err => {
      if (!this._unloaded && requestId === this._requestGeneration && ownerStorage.isCurrent(owner)) wx.showToast({ title: err.message || '额度不足', icon: 'none' });
    }).finally(() => {
      if (!this._unloaded && requestId === this._requestGeneration && ownerStorage.isCurrent(owner)) this.setData({ starting: false });
    });
  },
  startMock() { this.startSession('mock'); },
  startStar() { this.startSession('star', { question: '请用 STAR 结构讲述一次解决困难问题的经历。' }); },
  startFocusPractice(e) {
    const dimension = e.currentTarget.dataset.dimension || this.data.focusDimension;
    const prompts = { content: '请用具体情境、个人行动和可核验结果完整回答一道岗位题。', structure: '请用 STAR 结构重新回答一个项目案例。', expression: '请在 90 秒内清晰说明项目背景、贡献和结果。', jobMatch: '请选择真实经历，说明它如何证明你能胜任目标岗位。' };
    this.startSession('mock', { focusDimension: dimension, question: prompts[dimension] || prompts.jobMatch });
  },
  onQuestion(e) { this.setData({ question: e.detail.value }); },
  onAnswer(e) { this.setData({ answer: e.detail.value }); },
  submitAnswer() {
    if (!this.data.session || this.data.submitting || this.data.completing) return;
    const owner = this._ownerScope; const sessionId = this.data.session.id;
    this.setData({ submitting: true });
    api.answerInterviewQuestion(sessionId, { question: this.data.question, answer: this.data.answer, questionType: 'role' }).then(res => {
      if (!this._unloaded && ownerStorage.isCurrent(owner) && this.data.session && String(this.data.session.id) === String(sessionId)) this.setData({ feedback: res.data });
    }).catch(err => { if (!this._unloaded && ownerStorage.isCurrent(owner)) wx.showToast({ title: err.message || '提交失败', icon: 'none' }); })
      .finally(() => { if (!this._unloaded && ownerStorage.isCurrent(owner)) this.setData({ submitting: false }); });
  },
  complete() {
    if (!this.data.session || this.data.completing || this.data.submitting) return;
    const owner = this._ownerScope; const sessionId = this.data.session.id;
    this.setData({ completing: true });
    api.completeInterviewSession(sessionId, { confirmEffects: false }).then(res => {
      if (this._unloaded || !ownerStorage.isCurrent(owner) || !this.data.session || String(this.data.session.id) !== String(sessionId)) return;
      const effects = res.data && res.data.effects || [];
      wx.showModal({ title: '确认完成面试训练', content: effects.map((item, i) => `${i + 1}. ${item}`).join('\n'), confirmText: '确认生成', success: result => {
        if (!result.confirm || this._unloaded || !ownerStorage.isCurrent(owner)) return this.setData({ completing: false });
        api.completeInterviewSession(sessionId, { confirmEffects: true }).then(done => {
          if (this._unloaded || !ownerStorage.isCurrent(owner)) return;
          this.setData({ report: done.data, session: null, completing: false });
          api.getTodayTasks().then(tasks => { if (!this._unloaded && ownerStorage.isCurrent(owner)) this.setData({ tasks: tasks.data || [] }); });
        }).catch(err => { if (!this._unloaded && ownerStorage.isCurrent(owner)) { this.setData({ completing: false }); wx.showToast({ title: err.message || '生成报告失败', icon: 'none' }); } });
      } });
    }).catch(err => { if (!this._unloaded && ownerStorage.isCurrent(owner)) { this.setData({ completing: false }); wx.showToast({ title: err.message || '无法完成训练', icon: 'none' }); } });
  },
  cacheReport() {
    if (this._unloaded || !ownerStorage.isCurrent(this._ownerScope)) return null;
    const source = this.data.report; if (!source) return null;
    const id = 'v4_' + String(source.id || Date.now());
    const dimensions = Object.entries(source.dimensions || {}).map(([name, score]) => ({ name, score: Number(score) || 0 }));
    const qaList = (source.questionFeedback || []).map(item => { const values = Object.values(item.scores || {}).map(Number).filter(Number.isFinite); return { q: item.question || '面试问题', a: item.answer || '', feedback: item.feedback || '', score: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0 }; });
    const cached = { id, applicationId: this.data.current && this.data.current.applicationId || this.data.applicationId || '', role: this.data.current && this.data.current.jobTitle || '岗位面试', company: this.data.current && this.data.current.company || '', totalScore: Number(source.overallScore) || 0, dimensions, summary: source.summary || '', strengths: (source.strengths || []).map(item => item.name || item).join('；'), weaknesses: (source.weaknesses || []).map(item => item.name || item).join('；'), suggestion: (source.practicePlan || []).map(item => item.task).join('；'), qaList, actionPlan: (source.practicePlan || []).map(item => ({ title: item.task, detail: '来自岗位面试空间的专项复练', priority: 'high' })), nextPractice: (source.practicePlan || []).map(item => item.task), createTime: source.createdAt || new Date().toLocaleDateString('zh-CN') };
    ownerStorage.set('lastAiReport', '', cached); ownerStorage.set('aiReport', id, cached);
    const history = ownerStorage.get('interviewHistory', '', []);
    history.unshift({ id, applicationId: cached.applicationId, position: cached.role, company: cached.company, score: cached.totalScore, questionCount: qaList.length, timestamp: Date.now(), reportId: id, weakCount: (source.weaknesses || []).length, nextAction: cached.nextPractice[0] || '', tags: [cached.role, '岗位面试空间'] });
    if (history.length > 50) history.splice(50); ownerStorage.set('interviewHistory', '', history); return id;
  },
  openUnifiedReport() { const id = this.cacheReport(); if (id) wx.navigateTo({ url: '/package-ai/pages/ai-report/ai-report?id=' + encodeURIComponent(id) }); },
  toggleTask(e) { api.updateTodayTask(e.currentTarget.dataset.id, { completed: true }).then(() => api.getTodayTasks()).then(res => this.setData({ tasks: res.data || [] })); },
  openApplication() { const id = this.data.current && this.data.current.applicationId || this.data.applicationId; if (id) wx.navigateTo({ url: '/package-user/pages/application-detail/application-detail?id=' + encodeURIComponent(id) }); },
  openReviewCenter() { wx.navigateTo({ url: '/package-ai/pages/ai-history/ai-history' }); }
});

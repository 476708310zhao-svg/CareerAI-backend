// Sprint 6 OA Copilot：所有成绩、耗时与错题都由用户本人记录并确认。
const v4Api = require('../../../utils/api-v4.js');
const loginGate = require('../../../behaviors/login-gate.js');
const practiceBank = require('./oa-practice-bank.js');

const EMPTY_PLAN = { company: '', role: '', targetDate: '', weeklyMinutes: '180', focusTypes: [] };
const EMPTY_RESULT = { totalQuestions: '', correctCount: '', prompt: '', userAnswer: '', correctAnswer: '', notes: '' };

function modal(options) {
  return new Promise(resolve => wx.showModal(Object.assign({}, options, { success: resolve, fail: () => resolve({ confirm: false }) })));
}

Page({
  behaviors: [loginGate],

  data: {
    activeTab: 'practice', selectedType: 'all', selectedTypeLabel: '全部题型',
    practiceCategories: practiceBank.TYPES.map(type => Object.assign({}, type, { count: practiceBank.forType(type.value).length })),
    practiceQuestions: practiceBank.QUESTIONS, practiceCurrent: practiceBank.QUESTIONS[0],
    practiceIndex: 0, practiceSelected: -1, practiceRevealed: false, practiceFinished: false,
    practiceAnswered: 0, practiceCorrect: 0, practiceProgress: 0, practiceResultCorrect: false,
    optionLetters: ['A', 'B', 'C', 'D'],
    loading: false, dashboard: null, plans: [], capabilities: [], mistakes: [], questionTypes: [],
    activeSession: null, elapsedSeconds: 0, elapsedText: '00:00', showPlanForm: false,
    planForm: Object.assign({}, EMPTY_PLAN), showResultForm: false,
    resultForm: Object.assign({}, EMPTY_RESULT), saving: false,
    loadError: '', loadErrorAction: 'retry'
  },

  onLoad(options = {}) {
    this._practiceAnswers = {};
    if (options.tab === 'records') this.openRecordTab();
  },
  onShow() { if (this.data.activeTab === 'records' && this.data.dashboard) this.loadDashboard(); },
  onUnload() { this.stopTimer(); },
  onPullDownRefresh() {
    if (this.data.activeTab === 'records') this.loadDashboard().finally(() => wx.stopPullDownRefresh());
    else wx.stopPullDownRefresh();
  },

  openPracticeTab() { this.setData({ activeTab: 'practice' }); },
  openRecordTab() {
    this.setData({ activeTab: 'records' });
    this.loadOrPromptLogin();
  },
  selectPracticeType(e) {
    const type = e.currentTarget.dataset.type;
    const category = practiceBank.TYPES.find(item => item.value === type);
    if (!category) return;
    const questions = practiceBank.forType(type);
    const firstUnanswered = questions.findIndex(question => !Object.prototype.hasOwnProperty.call(this._practiceAnswers || {}, question.id));
    const index = firstUnanswered < 0 ? 0 : firstUnanswered;
    this.setData({ selectedType: type, selectedTypeLabel: category.label === '全部' ? '全部题型' : category.label,
      practiceQuestions: questions, practiceFinished: firstUnanswered < 0, practiceIndex: index });
    this.showPracticeQuestion(index);
  },
  showPracticeQuestion(index) {
    const questions = this.data.practiceQuestions;
    const question = questions[index];
    const answers = this._practiceAnswers || {};
    const saved = question && answers[question.id];
    const answered = questions.filter(item => Object.prototype.hasOwnProperty.call(answers, item.id));
    const correct = answered.filter(item => practiceBank.isCorrect(item, answers[item.id])).length;
    this.setData({ practiceCurrent: question || null, practiceIndex: index,
      practiceSelected: saved === undefined ? -1 : saved, practiceRevealed: saved !== undefined,
      practiceResultCorrect: saved !== undefined && practiceBank.isCorrect(question, saved),
      practiceAnswered: answered.length, practiceCorrect: correct,
      practiceProgress: questions.length ? Math.round(answered.length / questions.length * 100) : 0 });
  },
  selectPracticeOption(e) {
    if (this.data.practiceRevealed) return;
    const index = Number(e.currentTarget.dataset.index);
    if (index >= 0 && index < this.data.practiceCurrent.choices.length) this.setData({ practiceSelected: index });
  },
  submitPracticeAnswer() {
    const question = this.data.practiceCurrent;
    const selected = this.data.practiceSelected;
    if (!question || selected < 0) { wx.showToast({ title: '请先选择一个答案', icon: 'none' }); return; }
    if (this.data.practiceRevealed) return;
    this._practiceAnswers[question.id] = selected;
    this.showPracticeQuestion(this.data.practiceIndex);
  },
  nextPracticeQuestion() {
    const next = this.data.practiceIndex + 1;
    if (next >= this.data.practiceQuestions.length) { this.setData({ practiceFinished: true }); return; }
    this.showPracticeQuestion(next);
  },
  restartPractice() {
    const questions = this.data.practiceQuestions;
    questions.forEach(question => { delete this._practiceAnswers[question.id]; });
    this.setData({ practiceFinished: false });
    this.showPracticeQuestion(0);
  },

  loadOrPromptLogin() {
    const subtitle = '登录后可创建 OA 训练计划、记录练习结果和同步错题本';
    if (!this.ensureAuthenticated(subtitle, () => this.loadDashboard())) {
      this.setData({ loading: false, loadError: '登录后才能使用 OA 题库', loadErrorAction: 'login' });
      return;
    }
    this.loadDashboard();
  },

  retryDashboard() {
    if (this.data.loadErrorAction === 'login') {
      this.loadOrPromptLogin();
      return;
    }
    this.loadDashboard();
  },

  async loadDashboard() {
    this.setData({ loading: true, loadError: '' });
    try {
      const res = await v4Api.getOaDashboard();
      if (res && res._source === 'unauthorized') {
        this.setData({ loading: false, loadError: '登录状态已失效，请重新登录', loadErrorAction: 'login' });
        this.ensureAuthenticated('登录状态已失效，重新登录后可继续使用 OA 题库', () => this.loadDashboard());
        return;
      }
      if (res && ['networkError', 'timeout', 'rateLimit', 'error'].includes(res._source)) {
        const message = res._source === 'rateLimit'
          ? '请求较多，请稍后重试'
          : (res._status === 404 ? 'OA 服务尚未部署，请更新后端服务' : '暂时无法连接 OA 服务');
        throw new Error(message);
      }
      if (!res || res.code !== 0) throw new Error((res && res.message) || '加载失败');
      const data = res.data || {};
      this.setData({ dashboard: data, plans: data.plans || [], capabilities: data.capabilities || [],
        mistakes: data.mistakes || [],
        questionTypes: (data.questionTypes || []).map(item => Object.assign({}, item, { selected: false })),
        activeSession: data.activeSession || null, loadError: '', loadErrorAction: 'retry' });
      if (data.activeSession) this.startTimer(data.activeSession.startedAt); else this.stopTimer();
    } catch (error) {
      console.warn('[oa-bank] loadDashboard', error);
      this.setData({ loadError: error.message || 'OA 数据加载失败', loadErrorAction: 'retry' });
    }
    finally { this.setData({ loading: false }); }
  },

  startTimer(startedAt) {
    this.stopTimer();
    const text = String(startedAt || '');
    const started = new Date(text.replace(' ', 'T') + (text.includes('Z') ? '' : 'Z')).getTime();
    const refresh = () => {
      const seconds = Number.isFinite(started) ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : 0;
      this.setData({ elapsedSeconds: seconds,
        elapsedText: String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0') });
    };
    refresh();
    this._timer = setInterval(refresh, 1000);
  },
  stopTimer() { if (this._timer) clearInterval(this._timer); this._timer = null; },

  openPlanForm() {
    if (!this.ensureAuthenticated('登录后可创建 OA 训练计划', () => this.openPlanForm())) return;
    this.setData({ showPlanForm: true, planForm: Object.assign({}, EMPTY_PLAN),
      questionTypes: this.data.questionTypes.map(item => Object.assign({}, item, { selected: false })) });
  },
  closePlanForm() { this.setData({ showPlanForm: false }); },
  onPlanInput(e) { this.setData({ ['planForm.' + e.currentTarget.dataset.key]: e.detail.value }); },
  toggleFocusType(e) {
    const value = e.currentTarget.dataset.value;
    const selected = this.data.planForm.focusTypes.slice();
    const index = selected.indexOf(value);
    if (index >= 0) selected.splice(index, 1); else selected.push(value);
    this.setData({ 'planForm.focusTypes': selected,
      questionTypes: this.data.questionTypes.map(item => Object.assign({}, item, { selected: selected.includes(item.value) })) });
  },

  async savePlan() {
    if (this.data.saving) return;
    const form = this.data.planForm;
    if (!form.company.trim() || !form.focusTypes.length) { wx.showToast({ title: '请填写公司并选择题型', icon: 'none' }); return; }
    this.setData({ saving: true });
    try {
      await v4Api.createOaPlan({ company: form.company.trim(), role: form.role.trim(), targetDate: form.targetDate,
        weeklyMinutes: Number(form.weeklyMinutes) || 180, focusTypes: form.focusTypes });
      this.setData({ showPlanForm: false }); await this.loadDashboard(); wx.showToast({ title: '计划已创建', icon: 'success' });
    } catch (error) { wx.showToast({ title: error.message || '创建失败', icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  },

  startPractice(e) {
    if (this.data.activeSession) { wx.showToast({ title: '请先结束当前练习', icon: 'none' }); return; }
    const plan = this.data.plans.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    if (!plan || !plan.focusTypes.length) return;
    const options = plan.focusTypes.map(value => {
      const item = this.data.questionTypes.find(type => type.value === value); return item ? item.label : value;
    });
    wx.showActionSheet({ itemList: options, success: async result => {
      try { await v4Api.startOaSession(plan.id, { questionType: plan.focusTypes[result.tapIndex], plannedMinutes: 30 }); await this.loadDashboard(); }
      catch (error) { wx.showToast({ title: error.message || '开始失败', icon: 'none' }); }
    } });
  },

  openResultForm() { this.setData({ showResultForm: true, resultForm: Object.assign({}, EMPTY_RESULT) }); },
  closeResultForm() { this.setData({ showResultForm: false }); },
  onResultInput(e) { this.setData({ ['resultForm.' + e.currentTarget.dataset.key]: e.detail.value }); },
  async completePractice() {
    const session = this.data.activeSession; const form = this.data.resultForm;
    if (!session || !Number(form.totalQuestions)) { wx.showToast({ title: '请填写练习题数', icon: 'none' }); return; }
    const result = await modal({ title: '确认本人记录', content: '请确认题数、答对数、耗时和错题均来自你本次真实练习。确认后才会计入能力统计。', confirmText: '本人确认' });
    if (!result.confirm) return;
    const wrongItems = form.prompt.trim() ? [{ prompt: form.prompt, userAnswer: form.userAnswer, correctAnswer: form.correctAnswer, notes: form.notes }] : [];
    this.setData({ saving: true });
    try {
      await v4Api.completeOaSession(session.id, { totalQuestions: Number(form.totalQuestions), correctCount: Number(form.correctCount) || 0,
        elapsedSeconds: Math.max(1, this.data.elapsedSeconds), wrongItems, confirmSelfReported: true });
      this.setData({ showResultForm: false }); await this.loadDashboard(); wx.showToast({ title: '练习已记录', icon: 'success' });
    } catch (error) { wx.showToast({ title: error.message || '保存失败', icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  },

  async abandonPractice() {
    const result = await modal({ title: '结束练习', content: '本次记录将不计入能力统计，确定结束吗？' });
    if (!result.confirm || !this.data.activeSession) return;
    try { await v4Api.abandonOaSession(this.data.activeSession.id); await this.loadDashboard(); }
    catch (error) { wx.showToast({ title: error.message || '操作失败', icon: 'none' }); }
  },

  async markMistake(e) {
    const id = e.currentTarget.dataset.id; const status = e.currentTarget.dataset.status; let confirmed = false;
    if (status === 'mastered') {
      const result = await modal({ title: '确认已掌握', content: '请确认你已重新练习并能独立完成该题。', confirmText: '确认掌握' });
      confirmed = result.confirm; if (!confirmed) return;
    }
    try { await v4Api.updateOaMistake(id, { status, confirmReviewed: confirmed }); await this.loadDashboard(); }
    catch (error) { wx.showToast({ title: error.message || '操作失败', icon: 'none' }); }
  }
});

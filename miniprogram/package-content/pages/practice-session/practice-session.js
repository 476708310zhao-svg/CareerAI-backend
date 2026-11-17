'use strict';
const api = require('../../../utils/api-question-bank.js');
const navigation = require('../../../utils/navigation.js');

function positive(value) { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; }
function answerText(value) {
  if (value === true) return '正确';
  if (value === false) return '错误';
  if (value === null) return '未作答';
  return Array.isArray(value) ? value.join('、') : '';
}
function failure(error) { return error && error.message || '操作失败，请重试'; }
function unavailable(error) { return error && (error.statusCode === 403 || error.statusCode === 401 ||
  error.code === 'unauthorized' || error.code === 'authChanged'); }
function sameAnswer(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
const pendingBySession = Object.create(null);
function pendingFor(sessionId, owner) {
  const record = pendingBySession[sessionId];
  if (!record) return null;
  if (!api.current(record.owner) || !api.current(owner) ||
      record.owner.token !== owner.token || record.owner.revision !== owner.revision) {
    delete pendingBySession[sessionId]; return null;
  }
  return record.pending;
}
function remember(sessionId, owner, pending) { pendingBySession[sessionId] = { owner, pending }; }
function forget(sessionId) { delete pendingBySession[sessionId]; }

Page({
  data: { sessionId: null, session: null, items: [], position: null, question: null,
    choices: [], selected: [], booleanChoice: null, submission: null, resultAnswerText: '',
    selectedAnswerText: '', favorite: false, loading: true, submitting: false, finishing: false,
    error: '', submitError: '', unavailable: false, loggedIn: false,
    pendingSubmission: false, hasNext: false, report: null, reportError: '' },
  onLoad(options = {}) {
    this._sessionId = positive(options.sessionId); this._active = true; this._request = 0;
    this._targetPosition = positive(options.position);
    this._pendingSubmission = null;
    this.setData({ sessionId: this._sessionId });
  },
  onShow() {
    this._active = true;
    const owner = api.capture();
    this._pendingSubmission = pendingFor(this._sessionId, owner);
    this._owner = owner;
    this.clearPrivate();
    if (!owner.token) { this.setData({ loggedIn: false, loading: false, error: '登录后才能继续练习' }); return; }
    if (!this._sessionId) { this.setData({ loading: false, error: '练习记录无效，请返回题集页' }); return; }
    this.setData({ loggedIn: true }); return this.load();
  },
  onHide() { this._active = false; this._request++; this.clearPrivate(); },
  onUnload() { this._active = false; this._request++; this._pendingSubmission = null; this.clearPrivate(); },
  clearSensitive() {
    this.setData({ question: null, choices: [], selected: [], booleanChoice: null,
      submission: null, resultAnswerText: '', selectedAnswerText: '', favorite: false,
      submitError: '', submitting: false, pendingSubmission: false, hasNext: false });
  },
  clearPrivate() {
    this.clearSensitive();
    this.setData({ session: null, items: [], position: null, finishing: false, report: null, reportError: '' });
  },
  live(owner, request) { return this._active && request === this._request && api.current(owner); },
  stale(owner, request) {
    if (request !== undefined && (request !== this._request || !this._active)) return false;
    if (!api.current(owner)) {
      this._request++; this._owner = api.capture(); this._pendingSubmission = null; forget(this._sessionId);
      this.clearPrivate(); this.setData({
        loading: false, loggedIn: !!this._owner.token, error: '账号已切换，请重新加载' });
      return true;
    }
    return false;
  },
  blocked(error) {
    this._request++; this._pendingSubmission = null; forget(this._sessionId); this.clearPrivate();
    this.setData({ loading: false, unavailable: true,
      error: failure(error) || '题集已不可用，请返回刷新' });
  },
  async load() {
    const owner = this._owner, request = ++this._request;
    this.clearSensitive(); this.setData({ loading: true, error: '', unavailable: false, report: null, reportError: '' });
    try {
      const data = await api.session(this._sessionId);
      if (!this.live(owner, request)) { this.stale(owner, request); return; }
      const items = Array.isArray(data.items) ? data.items : [];
      const session = data.session;
      if (!session) throw new Error('练习记录不完整，请返回重试');
      this.setData({ session, items });
      const pending = this._pendingSubmission;
      if (pending && pending.position && items.some(item => item.position === pending.position)) {
        const pendingItem = items.find(item => item.position === pending.position);
        if (session.status !== 'active' && !pendingItem.answered) {
          this._pendingSubmission = null; forget(this._sessionId);
          this.setData({ error: '练习已结束，上次提交未记录。' });
          return;
        }
        await this.loadPosition(pending.position, owner, request, pendingItem.answered);
        if (this.live(owner, request) && !pendingItem.answered)
          this.setData({ submitError: '上次提交结果未确认，请使用“重试提交”核对，勿重新选择答案。' });
        return;
      }
      const next = items.find(item => !item.answered);
      const lastAnswered = [...items].reverse().find(item => item.answered);
      const target = this._targetPosition && items.find(item => item.position === this._targetPosition && item.answered);
      if (target) await this.loadPosition(target.position, owner, request, true);
      else if (session.status === 'active' && next) {
        let recovered = false;
        try {
          const result = await api.result(this._sessionId, next.position);
          if (!this.live(owner, request)) { this.stale(owner, request); return; }
          recovered = !!result.submission;
        } catch (error) {
          if (!this.live(owner, request)) { this.stale(owner, request); return; }
          if (error.statusCode !== 409) throw error;
        }
        if (recovered) await this.loadPosition(next.position, owner, request, true);
        else if (lastAnswered) await this.loadPosition(lastAnswered.position, owner, request, true);
        else await this.loadPosition(next.position, owner, request, false);
      }
      else if (lastAnswered) await this.loadPosition(lastAnswered.position, owner, request, true);
      if (this.live(owner, request) && (session.status === 'finished' || session.answered === session.total))
        await this.loadReport(owner, request);
    } catch (error) {
      if (this.live(owner, request)) {
        if (unavailable(error)) this.blocked(error);
        else this.setData({ error: failure(error) });
      } else this.stale(owner, request);
    } finally { if (this.live(owner, request)) this.setData({ loading: false }); }
  },
  async loadReport(owner = this._owner, request = this._request) {
    try {
      const data = await api.report(this._sessionId);
      if (!this.live(owner, request)) { this.stale(owner, request); return; }
      this.setData({ report: data.report || null, reportError: data.report ? '' : '报告暂时无法加载' });
    } catch (error) {
      if (!this.live(owner, request)) { this.stale(owner, request); return; }
      if (unavailable(error)) this.blocked(error);
      else this.setData({ reportError: failure(error) });
    }
  },
  retryReport() { return this.loadReport(); },
  async loadPosition(position, owner = this._owner, request = ++this._request, answeredHint) {
    this.clearSensitive(); this.setData({ position, loading: true, error: '' });
    try {
      const data = await api.question(this._sessionId, position);
      if (!this.live(owner, request)) { this.stale(owner, request); return; }
      const question = data.question;
      if (!question) throw new Error('题目暂时无法加载，请重试');
      const choices = question.type === 'boolean'
        ? [{ id: 'true', text: '正确' }, { id: 'false', text: '错误' }]
        : (Array.isArray(question.options) ? question.options : []);
      const pending = this._pendingSubmission;
      const selected = pending && pending.position === position && Array.isArray(pending.answer) ? pending.answer : [];
      const booleanChoice = pending && pending.position === position && typeof pending.answer === 'boolean' ? pending.answer : null;
      this.setData({ question, choices: choices.map(item => ({ ...item,
        selected: question.type === 'boolean' ? (booleanChoice !== null && String(booleanChoice) === item.id) : selected.includes(item.id) })),
        selected, booleanChoice,
        pendingSubmission: !!(pending && pending.position === position),
        favorite: !!(this.data.items.find(item => item.position === position) || {}).favorite });
      if (answeredHint) {
        const result = await api.result(this._sessionId, position);
        if (!this.live(owner, request)) { this.stale(owner, request); return; }
        this.showSubmission(result.submission);
        this.markAnswered(result.submission);
        if (pending && pending.position === position) { this._pendingSubmission = null; forget(this._sessionId); }
      }
    } catch (error) {
      if (this.live(owner, request)) {
        if (unavailable(error)) this.blocked(error);
        else this.setData({ error: failure(error) });
      } else this.stale(owner, request);
    } finally { if (this.live(owner, request)) this.setData({ loading: false }); }
  },
  showSubmission(submission) {
    if (!submission) return;
    this._pendingSubmission = null; forget(this._sessionId);
    this.setData({ submission, resultAnswerText: answerText(submission.correctAnswer),
      selectedAnswerText: answerText(submission.selectedAnswer), submitError: '',
      pendingSubmission: false,
      hasNext: this.data.items.some(item => !item.answered && item.position !== submission.position) });
  },
  markAnswered(submission) {
    const prior = this.data.items.find(item => item.position === submission.position);
    if (!prior || prior.answered) return;
    this.setData({ items: this.data.items.map(item => item.position === submission.position
      ? { ...item, answered: true, isCorrect: !!submission.isCorrect } : item),
    session: { ...this.data.session, answered: this.data.session.answered + 1,
      correctCount: this.data.session.correctCount + Number(!!submission.isCorrect) } });
  },
  selectChoice(event) {
    if (!this.data.question || this.data.submission || this._pendingSubmission || this.data.submitting) return;
    const id = String(event.currentTarget.dataset.id);
    const type = this.data.question.type;
    if (type === 'boolean') {
      if (!['true','false'].includes(id)) return;
      const value = id === 'true';
      this.setData({ booleanChoice: value, choices: this.data.choices.map(choice => ({ ...choice, selected: choice.id === id })) });
      return;
    }
    if (!this.data.choices.some(choice => choice.id === id)) return;
    const selected = type === 'single' ? [id] : this.data.selected.includes(id)
      ? this.data.selected.filter(choice => choice !== id) : [...this.data.selected, id];
    this.setData({ selected, choices: this.data.choices.map(choice => ({ ...choice, selected: selected.includes(choice.id) })) });
  },
  async submitAnswer(event) {
    const skip = event && event.currentTarget && event.currentTarget.dataset.skip === '1';
    const owner = this._owner, position = this.data.position;
    if (!owner || !api.current(owner)) { this.stale(owner); return; }
    if (!this.data.question || this.data.submission || this.data.submitting || !position) return;
    let answer = skip ? null : this.data.question.type === 'boolean' ? this.data.booleanChoice : [...this.data.selected];
    const prior = this._pendingSubmission;
    if (prior && prior.position === position) answer = prior.answer;
    if (!prior && !skip && (answer === null || Array.isArray(answer) && !answer.length)) {
      this.setData({ submitError: '请先选择答案，或使用“跳过并计错”。' }); return;
    }
    let pending = this._pendingSubmission;
    if (pending && pending.position === position) {
      if (!sameAnswer(pending.answer, answer)) {
        this.setData({ submitError: '上次提交结果未确认，请先重试原答案。' }); return;
      }
    } else {
      pending = { position, answer, requestId: api.key(), owner };
      this._pendingSubmission = pending; remember(this._sessionId, owner, pending);
    }
    const request = this._request;
    this.setData({ submitting: true, submitError: '', pendingSubmission: true });
    try {
      const data = await api.submit(this._sessionId, position, pending.answer, pending.requestId);
      if (!this.live(owner, request)) { this.stale(owner, request); return; }
      if (!data.submission) throw new Error('提交结果缺失，请重试');
      this.showSubmission(data.submission);
      this.markAnswered(data.submission);
      if (this.data.session && this.data.session.answered === this.data.session.total)
        await this.loadReport(owner, request);
    } catch (error) {
      if (!this.live(owner, request)) { this.stale(owner, request); return; }
      if (unavailable(error)) { this.blocked(error); return; }
      if (error.statusCode === 409) {
        try {
          const result = await api.result(this._sessionId, position);
          if (!this.live(owner, request)) { this.stale(owner, request); return; }
          this.showSubmission(result.submission);
          this.markAnswered(result.submission);
          return;
        } catch (reconcileError) {
          if (unavailable(reconcileError)) { this.blocked(reconcileError); return; }
        }
      }
      this.setData({ submitError: `${failure(error)}。请重试提交同一答案。` });
    } finally { if (this.live(owner, request)) this.setData({ submitting: false }); }
  },
  async nextQuestion() {
    const next = this.data.items.find(item => !item.answered);
    if (!next || !this.data.submission) return;
    await this.loadPosition(next.position);
  },
  async toggleFavorite() {
    const owner = this._owner, request = this._request, position = this.data.position;
    if (!this.data.question || !api.current(owner)) { this.stale(owner); return; }
    const enabled = !this.data.favorite;
    try {
      const data = await api.favorite(this._sessionId, position, enabled);
      if (!this.live(owner, request)) { this.stale(owner, request); return; }
      if (data.available === false) { this.blocked(new Error('题目已不可用，请返回刷新')); return; }
      this.setData({ favorite: !!data.favorite, items: this.data.items.map(item => item.position === position
        ? { ...item, favorite: !!data.favorite } : item) });
    } catch (error) {
      if (!this.live(owner, request)) { this.stale(owner, request); return; }
      if (unavailable(error)) this.blocked(error);
      else this.setData({ submitError: failure(error) });
    }
  },
  finish() {
    if (this.data.finishing || this.data.submitting || this._pendingSubmission ||
        !this.data.session || this.data.session.status !== 'active') return;
    wx.showModal({ title: '结束练习', content: '结束后不能再提交本次练习中未答的题目。', confirmText: '结束练习',
      success: response => { if (response.confirm) this.finishConfirmed(); } });
  },
  async finishConfirmed() {
    const owner = this._owner, request = this._request;
    if (!api.current(owner)) { this.stale(owner); return; }
    this.setData({ finishing: true });
    try {
      const data = await api.finish(this._sessionId);
      if (!this.live(owner, request)) { this.stale(owner, request); return; }
      this.clearSensitive(); this._pendingSubmission = null;
      forget(this._sessionId);
      this.setData({ session: data.session, error: '', position: null });
      await this.loadReport(owner, request);
    } catch (error) {
      if (!this.live(owner, request)) { this.stale(owner, request); return; }
      if (unavailable(error)) this.blocked(error);
      else this.setData({ error: failure(error) });
    } finally { if (this.live(owner, request)) this.setData({ finishing: false }); }
  },
  openHome() { navigation.safeNavigateTo(api.homeUrl()); },
  openLogin() { navigation.safeSwitchTab('/pages/profile/profile'); },
  onPullDownRefresh() { return Promise.resolve(this.load()).finally(() => wx.stopPullDownRefresh()); }
});

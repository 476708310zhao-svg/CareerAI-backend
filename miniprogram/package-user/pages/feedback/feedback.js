// pages/feedback/feedback.js
const { submitFeedback: submitFeedbackApi, getMyFeedback } = require('../../../utils/api-feedback.js');
const authSession = require('../../../utils/auth-session.js');

const STATUS_LABELS = { open: '待处理', processing: '处理中', resolved: '已解决', ignored: '已忽略' };

function formatFeedbackTime(value) {
  if (!value) return '';
  const raw = String(value);
  const utc = /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/.test(raw) ? raw.replace(' ', 'T') + 'Z' : raw;
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function presentFeedback(item) {
  return {
    id: item.id,
    type: item.type || '其他',
    content: item.content || '',
    status: STATUS_LABELS[item.status] ? item.status : 'unknown',
    statusLabel: STATUS_LABELS[item.status] || '状态待核实',
    createdAt: formatFeedbackTime(item.createdAt),
    jobId: item.jobFeedback && item.jobFeedback.jobId || ''
  };
}

Page({
  data: {
    types: ['功能建议', 'Bug反馈', '体验问题', '其他'],
    typeOptions: [
      { label: '功能建议', desc: '想要新增或改进的能力', icon: '💡' },
      { label: 'Bug反馈', desc: '页面报错、数据异常、无法使用', icon: '🛠' },
      { label: '体验问题', desc: '流程不顺、样式错位、交互不清晰', icon: '✨' },
      { label: '其他', desc: '合作、内容、账号或其他问题', icon: '💬' }
    ],
    typeIndex: 0,
    content: '',
    contact: '',
    submitting: false,
    submitError: '',
    history: [],
    historyLoading: false,
    historyError: '',
    historyAuthRequired: false,
    nextCursor: null
  },

  onLoad() {
    this._historyGeneration = 0;
    this._historyIdentity = null;
    this.loadHistory(true);
  },

  onShow() {
    const identity = authSession.capture(wx);
    if (!this._historyIdentity || identity.token !== this._historyIdentity.token || identity.revision !== this._historyIdentity.revision) {
      this.loadHistory(true);
    }
  },

  onUnload() {
    this._historyGeneration = (this._historyGeneration || 0) + 1;
  },

  loadHistory(reset) {
    const identity = authSession.capture(wx);
    const identityChanged = this._historyIdentity && (identity.token !== this._historyIdentity.token || identity.revision !== this._historyIdentity.revision);
    this._historyIdentity = identity;
    const generation = this._historyGeneration = (this._historyGeneration || 0) + 1;
    if (!identity.token) {
      this.setData({ history: [], nextCursor: null, historyLoading: false, historyError: '', historyAuthRequired: true });
      return;
    }
    const cursor = reset ? null : this.data.nextCursor;
    if (!reset && !cursor) return;
    this._lastHistoryReset = reset;
    this.setData({
      history: identityChanged ? [] : this.data.history,
      nextCursor: reset ? null : this.data.nextCursor,
      historyLoading: true,
      historyError: '',
      historyAuthRequired: false
    });
    getMyFeedback(cursor).then(res => {
      if (generation !== this._historyGeneration) return;
      if (!authSession.isCurrent(identity, wx)) {
        const unauthorized = res && res._source === 'unauthorized';
        this.setData({ history: [], nextCursor: null, historyLoading: false, historyError: unauthorized ? '登录已失效，请重新登录后查看反馈记录。' : '账号已切换，请刷新反馈记录。', historyAuthRequired: unauthorized });
        return;
      }
      if (!res || res.code !== 0 || !res.data || !Array.isArray(res.data.items)) {
        this.setData({ historyLoading: false, historyError: res && res._source === 'unauthorized' ? '请先登录后查看反馈记录。' : '反馈记录暂时无法加载，请重试。', historyAuthRequired: !!(res && res._source === 'unauthorized') });
        return;
      }
      const items = res.data.items.map(presentFeedback);
      this.setData({
        history: reset ? items : this.data.history.concat(items),
        nextCursor: res.data.nextCursor || null,
        historyLoading: false,
        historyError: ''
      });
    }).catch(() => {
      if (generation !== this._historyGeneration) return;
      if (!authSession.isCurrent(identity, wx)) {
        this.setData({ history: [], nextCursor: null, historyLoading: false, historyError: '账号已切换，请刷新反馈记录。' });
        return;
      }
      this.setData({ historyLoading: false, historyError: '反馈记录暂时无法加载，请重试。' });
    });
  },

  refreshHistory() { this.loadHistory(true); },
  retryHistory() { this.loadHistory(this._lastHistoryReset !== false); },
  loadMoreHistory() { if (!this.data.historyLoading && this.data.nextCursor) this.loadHistory(false); },

  onTypeChange(e) {
    this.setData({ typeIndex: e.detail.value });
  },

  selectType(e) {
    this.setData({ typeIndex: Number(e.currentTarget.dataset.index) });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  submitFeedback() {
    if (!authSession.capture(wx).token) {
      this.setData({ submitError: '请先登录后再提交反馈，当前内容会保留在页面。' });
      return;
    }
    const text = this.data.content.trim();
    if (!text) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' });
      return;
    }
    if (text.length < 10) {
      wx.showToast({ title: '反馈内容至少10个字', icon: 'none' });
      return;
    }
    if (text.length > 500) {
      wx.showToast({ title: '反馈内容不超过500字', icon: 'none' });
      return;
    }

    this.setData({ submitting: true, submitError: '' });

    const payload = {
      type: this.data.types[this.data.typeIndex],
      content: text,
      contact: this.data.contact.trim()
    };

    submitFeedbackApi(payload)
      .then((res) => {
        this.setData({ submitting: false });
        if (res && res.code === 0) {
          wx.showToast({ title: '感谢您的反馈', icon: 'success' });
          this.setData({ content: '', contact: '', submitError: '' });
          this.loadHistory(true);
        } else {
          this.setData({ submitError: (res && res.message) || '提交失败，请检查后重试。' });
        }
      })
      .catch((error) => {
        // 保留当前输入供用户重试，不将未提交的反馈误标为已送达。
        const message = error && error.message === 'unauthorized'
          ? '登录已失效，请重新登录后重试。反馈尚未提交。'
          : error && error.code === 'AUTH_CHANGED'
            ? '账号已切换，请确认当前账号后重试。反馈尚未提交。'
            : '网络异常，反馈尚未提交。请稍后重试。';
        this.setData({ submitting: false, submitError: message });
      });
  }
});

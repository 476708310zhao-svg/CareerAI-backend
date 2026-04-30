// pages/ai-workflow/ai-workflow.js
const { post } = require('../../utils/api-client.js');

const MODULE_ROUTES = {
  resume:       '/pages/resume/resume',
  jobs:         '/pages/jobs/jobs',
  applications: '/pages/applications/applications',
  interview:    '/pages/interview-setup/interview-setup',
  career_plan:  '/pages/career-planner/career-planner',
  agencies:     '/pages/agencies/agencies',
  campus:       '/pages/campus/campus',
  salary:       '/pages/salary/salary',
};
const MODULE_ICONS = {
  resume: '📄', jobs: '💼', applications: '📋',
  interview: '🎤', career_plan: '🗺️', agencies: '🏢',
  campus: '📅', salary: '💰',
};
const TAB_MODULES = new Set(['jobs']);
const CACHE_KEY   = 'ai_workflow_messages';
const SESSION_KEY = 'ai_workflow_sessions';
const ACTIVE_SESSION_KEY = 'ai_workflow_active_session';
const MAX_CACHE   = 20;
const MAX_SESSIONS = 12;
const TIME_GAP_MS = 5 * 60 * 1000; // 超过5分钟才显示时间戳
const MAX_INPUT   = 200;

const ERROR_MAP = {
  'timeout':       'AI 响应超时，请稍后重试',
  'AI响应超时':    'AI 响应超时，请稍后重试',
  'DeepSeek余额不足': '服务暂时不可用，请稍后再试',
  'network':       '网络连接失败，请检查网络后重试',
  'ECONNREFUSED':  '无法连接服务器，请确认后端已启动',
};

function friendlyError(err) {
  const msg = err?.errMsg || err?.message || err?.error || String(err);
  for (const [k, v] of Object.entries(ERROR_MAP)) {
    if (msg.includes(k)) return v;
  }
  return '出错了，请稍后重试';
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 给消息数组标注 showTime 字段：第一条 + 距上一条超5分钟才显示（仅用于初始化恢复）
function markTimestamps(msgs) {
  return msgs.map((m, i) => {
    const show = i === 0 || (m.ts - msgs[i - 1].ts) > TIME_GAP_MS;
    return { ...m, showTime: show };
  });
}

// 增量追加单条消息，仅对新消息计算 showTime，避免 O(n) 全量遍历
function appendWithTimestamp(msgs, newMsg) {
  const prev = msgs[msgs.length - 1];
  const show = !prev || (newMsg.ts - prev.ts) > TIME_GAP_MS;
  return [...msgs, { ...newMsg, showTime: show }];
}

function makeWelcome() {
  const ts = Date.now();
  return {
    id: ts, role: 'ai', type: 'normal', ts,
    text: '你好！我是你的 AI 求职助手 ✨\n\n我可以帮你优化简历、推荐职位、准备面试、制定求职计划……\n\n告诉我你现在最需要什么帮助？',
    actions: [],
    suggestions: ['帮我优化简历', '推荐适合我的职位', '制定求职计划', '准备下周面试'],
    showTime: true,
    timeLabel: fmtTime(ts),
  };
}

Page({
  data: {
    messages: [],
    inputText: '',
    inputLen: 0,
    loading: false,
    scrollId: '',
    latestAiIdx: 0,
    keyboardHeight: 0,
    drawerOpen: false,
    sessions: [],
    filteredSessions: [],
    sessionSearch: '',
    activeSessionId: '',
    quickTools: [
      { module: 'resume', icon: '🧾', title: '优化简历', desc: '润色经历与匹配 ATS' },
      { module: 'jobs', icon: '💼', title: '推荐岗位', desc: '根据目标筛选机会' },
      { module: 'interview', icon: '🎙️', title: '模拟面试', desc: '生成问题并陪练' },
      { module: 'career_plan', icon: '🗺️', title: '求职规划', desc: '拆解阶段路线图' },
      { module: 'salary', icon: '💰', title: '查薪资', desc: '岗位与公司薪酬参考' },
      { module: 'campus', icon: '📅', title: '校招日历', desc: '查看开放与截止' },
    ],
  },

  _history: [],
  _userContext: {},

  onLoad() {
    const sessions = this._loadSessions();
    const activeSessionId = wx.getStorageSync(ACTIVE_SESSION_KEY) || `session_${Date.now()}`;
    this.setData({ sessions, filteredSessions: sessions, activeSessionId });
    // 读用户信息
    try {
      const profile = wx.getStorageSync('userProfile') || {};
      const jobPref = profile.jobPreference || {};
      this._userContext = {
        nickname:  profile.nickname || '',
        targetJob: jobPref.targetPosition || jobPref.targetJob || '',
        location:  jobPref.targetLocation || jobPref.location || '',
        education: profile.education?.degree || '',
        hasResume: !!wx.getStorageSync('resumeId'),
      };
    } catch (e) {}

    // 恢复缓存对话
    try {
      const cached = wx.getStorageSync(CACHE_KEY);
      if (Array.isArray(cached) && cached.length) {
        // 重建对话历史
        this._history = cached
          .filter(m => m.type !== 'error')
          .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));
        // 重新标注时间戳
        const msgs = markTimestamps(cached);
        const latestAiIdx = msgs.reduce((acc, m, i) => m.role === 'ai' ? i : acc, 0);
        this.setData({ messages: msgs, latestAiIdx });
        this._upsertSession(msgs, activeSessionId);
        // 等渲染完成再滚动
        wx.nextTick(() => this._scrollToBottom(msgs.length - 1));
        return;
      }
    } catch (e) {}

    const welcome = makeWelcome();
    this.setData({ messages: [welcome], latestAiIdx: 0 });
    this._saveCache([welcome]);
    this._upsertSession([welcome], activeSessionId);
    wx.nextTick(() => this._scrollToBottom(0));
  },

  onInputChange(e) {
    const v = e.detail.value;
    this.setData({ inputText: v, inputLen: v.length });
  },

  onSuggestionTap(e) {
    if (this.data.loading) return;
    const text = e.currentTarget.dataset.text;
    this.setData({ inputText: text, inputLen: text.length });
    this.sendMessage();
  },

  onKeyboardHeight(e) {
    if (e.detail.height === this.data.keyboardHeight) return;
    this.setData({ keyboardHeight: e.detail.height });
  },

  onSend() { this.sendMessage(); },

  sendMessage() {
    const text = this.data.inputText.trim();
    if (!text || this.data.loading) return;

    const ts = Date.now();
    const userMsg = {
      id: ts, role: 'user', type: 'normal', ts,
      text, actions: [], suggestions: [],
      showTime: false, timeLabel: fmtTime(ts),
    };
    const msgs = appendWithTimestamp(this.data.messages, userMsg);
    this.setData({ messages: msgs, inputText: '', inputLen: 0, loading: true });
    this._saveCache(msgs);
    this._upsertSession(msgs);
    wx.nextTick(() => this._scrollToBottom(msgs.length - 1));

    this._history.push({ role: 'user', content: text });
    if (this._history.length > 16) this._history = this._history.slice(-16);

    post({
      path: '/api/ai/workflow',
      body: { message: text, history: this._history.slice(-8), userContext: this._userContext },
      timeout: 30000
    }).then(res => {
      const aiTs = Date.now();
      const aiMsg = {
        id: aiTs, role: 'ai', type: 'normal', ts: aiTs,
        text: res.reply || '好的，我来帮你处理。',
        actions: (res.actions || []).map(a => ({ ...a, icon: MODULE_ICONS[a.module] || '🔗' })),
        suggestions: res.suggestions || [],
        showTime: false, timeLabel: fmtTime(aiTs),
      };
      this._history.push({ role: 'assistant', content: aiMsg.text });
      if (this._history.length > 16) this._history = this._history.slice(-16);
      const newMsgs = appendWithTimestamp(this.data.messages, aiMsg);
      this._saveCache(newMsgs);
      this._upsertSession(newMsgs);
      const latestAiIdx = newMsgs.length - 1;
      this.setData({ messages: newMsgs, loading: false, latestAiIdx });
      wx.nextTick(() => this._scrollToBottom(newMsgs.length - 1));
    }).catch(err => {
      const aiTs = Date.now();
      const errMsg = {
        id: aiTs, role: 'ai', type: 'error', ts: aiTs,
        text: friendlyError(err), actions: [], suggestions: [],
        showTime: false, timeLabel: fmtTime(aiTs),
      };
      this._history.push({ role: 'assistant', content: '[响应失败]' });
      if (this._history.length > 16) this._history = this._history.slice(-16);
      const newMsgs = appendWithTimestamp(this.data.messages, errMsg);
      this._saveCache(newMsgs);
      this._upsertSession(newMsgs);
      this.setData({ messages: newMsgs, loading: false });
      wx.nextTick(() => this._scrollToBottom(newMsgs.length - 1));
    });
  },

  onActionTap(e) {
    const { module: mod, params } = e.currentTarget.dataset;
    const url = MODULE_ROUTES[mod];
    if (!url) return;
    const query = params && Object.keys(params).length
      ? '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      : '';
    TAB_MODULES.has(mod)
      ? wx.switchTab({ url })
      : wx.navigateTo({ url: url + query });
  },

  onToolTap(e) {
    const mod = e.currentTarget.dataset.module;
    const url = MODULE_ROUTES[mod];
    if (!url) return;
    TAB_MODULES.has(mod)
      ? wx.switchTab({ url })
      : wx.navigateTo({ url });
  },

  toggleDrawer() {
    this.setData({ drawerOpen: !this.data.drawerOpen });
  },

  closeDrawer() {
    this.setData({ drawerOpen: false });
  },

  onSessionSearch(e) {
    const sessionSearch = e.detail.value || '';
    const keyword = sessionSearch.trim().toLowerCase();
    const filteredSessions = keyword
      ? this.data.sessions.filter(item =>
          (item.title || '').toLowerCase().includes(keyword) ||
          (item.preview || '').toLowerCase().includes(keyword)
        )
      : this.data.sessions;
    this.setData({ sessionSearch, filteredSessions });
  },

  clearSessionSearch() {
    this.setData({ sessionSearch: '', filteredSessions: this.data.sessions });
  },

  startNewChat() {
    const id = `session_${Date.now()}`;
    const welcome = makeWelcome();
    this._history = [];
    wx.setStorageSync(ACTIVE_SESSION_KEY, id);
    this.setData({
      activeSessionId: id,
      messages: [welcome],
      latestAiIdx: 0,
      inputText: '',
      inputLen: 0,
      loading: false,
      drawerOpen: false,
    });
    this._saveCache([welcome]);
    this._upsertSession([welcome], id);
    wx.nextTick(() => this._scrollToBottom(0));
  },

  selectSession(e) {
    const id = e.currentTarget.dataset.id;
    const session = this.data.sessions.find(item => item.id === id);
    if (!session || !Array.isArray(session.messages)) return;
    const msgs = markTimestamps(session.messages);
    const latestAiIdx = msgs.reduce((acc, m, i) => m.role === 'ai' ? i : acc, 0);
    this._history = msgs
      .filter(m => m.type !== 'error')
      .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));
    wx.setStorageSync(ACTIVE_SESSION_KEY, id);
    this.setData({
      activeSessionId: id,
      messages: msgs,
      latestAiIdx,
      drawerOpen: false,
      loading: false,
      inputText: '',
      inputLen: 0,
    });
    this._saveCache(msgs);
    wx.nextTick(() => this._scrollToBottom(msgs.length - 1));
  },

  deleteSession(e) {
    const id = e.currentTarget.dataset.id;
    const sessions = this.data.sessions.filter(item => item.id !== id);
    this._setSessions(sessions);
    if (id === this.data.activeSessionId) this.startNewChat();
  },

  onClear() {
    wx.showModal({
      title: '清空对话',
      content: '确定清空所有对话记录吗？',
      success: ({ confirm }) => {
        if (!confirm) return;
        this._history = [];
        try { wx.removeStorageSync(CACHE_KEY); } catch (e) {}
        const welcome = makeWelcome();
        this.setData({ messages: [welcome], latestAiIdx: 0, loading: false, inputText: '', inputLen: 0 });
        this._saveCache([welcome]);
        this._upsertSession([welcome]);
        wx.nextTick(() => this._scrollToBottom(0));
      }
    });
  },

  _scrollToBottom(idx) {
    this.setData({ scrollId: `msg-${idx}` });
  },

  _saveCache(msgs) {
    try { wx.setStorageSync(CACHE_KEY, msgs.slice(-MAX_CACHE)); } catch (e) {}
  },

  _loadSessions() {
    try {
      const sessions = wx.getStorageSync(SESSION_KEY);
      return Array.isArray(sessions) ? sessions : [];
    } catch (e) {
      return [];
    }
  },

  _setSessions(sessions) {
    const keyword = (this.data.sessionSearch || '').trim().toLowerCase();
    const filteredSessions = keyword
      ? sessions.filter(item =>
          (item.title || '').toLowerCase().includes(keyword) ||
          (item.preview || '').toLowerCase().includes(keyword)
        )
      : sessions;
    this.setData({ sessions, filteredSessions });
    try { wx.setStorageSync(SESSION_KEY, sessions); } catch (e) {}
  },

  _upsertSession(msgs, id) {
    const sessionId = id || this.data.activeSessionId || `session_${Date.now()}`;
    const userFirst = msgs.find(m => m.role === 'user' && m.text);
    const last = msgs[msgs.length - 1] || {};
    const title = userFirst ? userFirst.text.slice(0, 18) : '新的求职咨询';
    const preview = (last.text || '准备开始新的求职咨询').replace(/\s+/g, ' ').slice(0, 34);
    const updatedAt = last.ts || Date.now();
    const next = [
      {
        id: sessionId,
        title,
        preview,
        updatedAt,
        timeLabel: fmtDate(updatedAt),
        messages: msgs.slice(-MAX_CACHE),
      },
      ...this.data.sessions.filter(item => item.id !== sessionId),
    ].slice(0, MAX_SESSIONS);
    wx.setStorageSync(ACTIVE_SESSION_KEY, sessionId);
    if (sessionId !== this.data.activeSessionId) {
      this.setData({ activeSessionId: sessionId });
    }
    this._setSessions(next);
  }
});

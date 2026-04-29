// pages/ai-assistant/ai-assistant.js
const config   = require('../../utils/config.js');
const { post } = require('../../utils/api-client.js');

const API_BASE    = config.API_BASE_URL;
const CACHE_KEY   = 'ai_assistant_messages';
const MAX_CACHE   = 30;
const TIME_GAP_MS = 5 * 60 * 1000;
const CURSOR      = '▋';

// ─── Markdown → HTML（用于 rich-text，仅处理 AI 输出）─────────
// 注意：先转义 HTML 实体，防止 AI 输出中的 < > 破坏结构
function mdToHtml(md) {
  if (!md) return '';
  let s = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  s = s.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`\n]+)`/g, '<code style="background:#F4F4F8;padding:2px 5px;border-radius:3px;font-size:13px;">$1</code>');
  s = s.replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>');
  s = s.replace(/^[ \t]*[-•*] (.+)$/gm, '　• $1');
  s = s.replace(/^[ \t]*(\d+)\. (.+)$/gm, '　$1. $2');
  s = s.replace(/\n\n+/g, '<br/><br/>');
  s = s.replace(/\n/g, '<br/>');
  return s;
}

// ─── 工具函数 ────────────────────────────────────────────────

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function appendWithTimestamp(msgs, newMsg) {
  const prev = msgs[msgs.length - 1];
  const showTime = !prev || (newMsg.ts - prev.ts) > TIME_GAP_MS;
  return [...msgs, { ...newMsg, showTime, timeLabel: fmtTime(newMsg.ts) }];
}

// Bug1 fix: 直接写 displayText 字符串，不用 getter（setData 序列化会丢失 getter）
function makeWelcome() {
  const ts   = Date.now();
  const text = '你好！我是你的 AI 求职助手 ✨\n\n我可以帮你优化简历、推荐职位、准备面试、制定求职计划……\n\n告诉我你现在最需要什么帮助？';
  return {
    id: ts, role: 'ai', ts,
    content:     text,
    displayText: text,
    htmlContent: mdToHtml(text),
    isWelcome: true, isError: false, isStreaming: false,
    retryText: '', suggestions: [],
    showTime: true, timeLabel: fmtTime(ts)
  };
}

function friendlyError(err) {
  const msg = String(err && (err.errMsg || err.message || err.error) || err);
  if (/timeout|超时/i.test(msg))       return 'AI 响应超时，请点击下方重试';
  if (/balance|余额不足/i.test(msg))   return '服务暂时不可用，请稍后再试';
  if (/network|fail|连接/i.test(msg))  return '网络连接失败，请检查网络后重试';
  return '出错了，请点击下方重试';
}

// ─── SSE 流式请求 ────────────────────────────────────────────
// wx.request enableChunked（基础库 2.26.0+）
// DeepSeek SSE 格式: data: {"choices":[{"delta":{"content":"…"}}]}
function streamRequest(messages, userContext, onDelta, onDone, onError) {
  let sseBuffer = '';
  const authHeader = {};
  try {
    const token = wx.getStorageSync('token');
    if (token) authHeader['Authorization'] = 'Bearer ' + token;
  } catch (e) {}

  return wx.request({
    url: API_BASE + '/api/ai/assistant',
    method: 'POST',
    data: { messages, userContext },
    header: Object.assign({ 'Content-Type': 'application/json' }, authHeader),
    enableChunked: true,

    onChunkReceived(res) {
      let chunk = '';
      try {
        chunk = new TextDecoder('utf-8').decode(new Uint8Array(res.data));
      } catch (e) {
        const arr = new Uint8Array(res.data);
        for (let i = 0; i < arr.length; i++) chunk += String.fromCharCode(arr[i]);
        try { chunk = decodeURIComponent(escape(chunk)); } catch (_) {}
      }
      sseBuffer += chunk;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          if (json.error) { onError(new Error(json.error)); return; }
          const delta = (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) || '';
          if (delta) onDelta(delta);
        } catch (_) {}
      }
    },
    success() { onDone(); },
    fail(err)  { onError(err); }
  });
}

// ─── Page ────────────────────────────────────────────────────

Page({
  data: {
    messages:    [],
    inputText:   '',
    inputLen:    0,
    loading:     false,   // 等待首个 token
    streaming:   false,   // 正在接收 token
    scrollId:    'scroll-anchor',
    latestAiIdx: 0,
    statusBarHeight: 44,
    safeBottom:  0,
    keyboardHeight: 0,
    quickActions: ['帮我优化简历', '推荐适合我的职位', '制定求职计划', '准备下周面试']
  },

  _history:      [],
  _userContext:  {},
  _currentTask:  null,
  _streamingIdx: -1,
  _pendingDelta: '',
  _flushTimer:   null,
  _lastRawText:  '',   // 保存最近一次发送的原始文本，用于错误重试

  // ── 生命周期 ──────────────────────────────────────────────

  onLoad() {
    const info = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: info.statusBarHeight || 44,
      safeBottom: info.safeAreaInsets ? info.safeAreaInsets.bottom : 0
    });
    this._buildUserContext();
    this._restoreOrInit();
  },

  onUnload() {
    this._abortStream();
  },

  // ── 用户上下文（个性化） ────────────────────────────────────

  _buildUserContext() {
    try {
      const profile = wx.getStorageSync('userProfile') || {};
      const pref    = profile.jobPreference || {};
      const resume  = wx.getStorageSync('onlineResume') || {};
      this._userContext = {
        nickname:  String(profile.nickname || '').slice(0, 20),
        targetJob: String(pref.targetPosition || pref.targetJob || '').slice(0, 50),
        location:  String(pref.targetLocation || pref.location || '').slice(0, 30),
        education: String((profile.education && profile.education.degree) ? profile.education.degree : '').slice(0, 30),
        hasResume: !!(resume.basicInfo && resume.basicInfo.name),
        appCount:  (wx.getStorageSync('localApplications') || []).length
      };
    } catch (e) {}
  },

  // ── 简历摘要注入（检测到简历相关意图时） ──────────────────────

  _buildResumeContext(text) {
    if (!/简历|resume|优化|润色|ats|诊断|改进|经历|经验|描述/i.test(text)) return '';
    try {
      const r = wx.getStorageSync('onlineResume') || {};
      const b = r.basicInfo || {};
      if (!b.name && !b.email) return '';
      const lines = [];
      if (b.name)    lines.push('姓名：' + b.name);
      if (b.title)   lines.push('意向岗位：' + b.title);
      if (b.email)   lines.push('邮箱：' + b.email);
      if (r.summary) lines.push('个人简介：' + String(r.summary).slice(0, 200));
      if (r.skills && r.skills.length) lines.push('技能：' + r.skills.slice(0, 8).join('、'));
      if (r.workExp && r.workExp.length) {
        lines.push('工作经历：');
        r.workExp.slice(0, 3).forEach(w => {
          lines.push('  - ' + [w.company, w.title, w.duration].filter(Boolean).join(' | '));
          if (w.desc) lines.push('    ' + String(w.desc).slice(0, 100));
        });
      }
      if (r.education && r.education.length) {
        const e = r.education[0];
        lines.push('教育背景：' + [e.school, e.degree, e.major].filter(Boolean).join(' '));
      }
      return lines.length ? lines.join('\n') : '';
    } catch (e) { return ''; }
  },

  // ── 恢复 / 初始化 ────────────────────────────────────────

  _restoreOrInit() {
    try {
      const cached = wx.getStorageSync(CACHE_KEY);
      if (Array.isArray(cached) && cached.length) {
        this._history = cached
          .filter(m => !m.isError)
          .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
        const latestAiIdx = cached.reduce((acc, m, i) => m.role === 'ai' ? i : acc, 0);
        this.setData({ messages: cached, latestAiIdx });
        wx.nextTick(() => this._scrollTo());
        return;
      }
    } catch (e) {}
    const welcome = makeWelcome();
    this.setData({ messages: [welcome], latestAiIdx: 0 });
    wx.nextTick(() => this._scrollTo());
  },

  // ── 输入 ──────────────────────────────────────────────────

  onInputChange(e) {
    this.setData({ inputText: e.detail.value, inputLen: e.detail.value.length });
  },

  onKeyboardHeight(e) {
    if (e.detail.height === this.data.keyboardHeight) return;
    this.setData({ keyboardHeight: e.detail.height });
    wx.nextTick(() => this._scrollTo());
  },

  // ── 发送 & 停止 ──────────────────────────────────────────

  onSend()       { this.sendMessage(); },
  onSendOrStop() { this.data.streaming ? this.onStop() : this.sendMessage(); },

  onQuickAction(e) {
    if (this.data.loading || this.data.streaming) return;
    this.setData({ inputText: e.currentTarget.dataset.text });
    this.sendMessage();
  },

  onSuggestion(e) {
    if (this.data.loading || this.data.streaming) return;
    this.setData({ inputText: e.currentTarget.dataset.text });
    this.sendMessage();
  },

  sendMessage() {
    const rawText = this.data.inputText.trim();
    if (!rawText || this.data.loading || this.data.streaming) return;
    this._lastRawText = rawText;

    // 检测简历意图，注入简历摘要到 API 消息（显示侧不带）
    const resumeCtx = this._buildResumeContext(rawText);
    const apiText   = resumeCtx ? rawText + '\n\n[我的简历信息]\n' + resumeCtx : rawText;

    const ts    = Date.now();
    const aiTs  = ts + 1;

    const userMsg = {
      id: ts, role: 'user', ts,
      content: rawText, displayText: rawText, htmlContent: '',
      isWelcome: false, isError: false, isStreaming: false,
      retryText: '', suggestions: [], showTime: false, timeLabel: fmtTime(ts)
    };
    const aiMsg = {
      id: aiTs, role: 'ai', ts: aiTs,
      content: '', displayText: '', htmlContent: '',
      isWelcome: false, isError: false, isStreaming: true,
      retryText: '', suggestions: [], showTime: false, timeLabel: fmtTime(aiTs)
    };

    let msgs = appendWithTimestamp(this.data.messages, userMsg);
    msgs     = appendWithTimestamp(msgs, aiMsg);
    const streamIdx    = msgs.length - 1;
    this._streamingIdx = streamIdx;

    // Bug2 fix: 先 setData 插入占位消息，再发起请求
    this.setData({
      messages: msgs, inputText: '', inputLen: 0,
      loading: true, streaming: false,
      latestAiIdx: streamIdx
    });
    wx.nextTick(() => this._scrollTo());

    // 更新 API 历史（含简历摘要）
    this._history.push({ role: 'user', content: apiText });
    if (this._history.length > 20) this._history = this._history.slice(-20);

    this._currentTask = streamRequest(
      this._history,
      this._userContext,
      (delta) => { this._queueDelta(delta); },
      ()      => { this._flushAndFinalize(); },
      (err)   => { console.error('[ai-assistant]', err); this._flushAndFinalize(friendlyError(err), true); }
    );
  },

  onStop() {
    this._abortStream();
    this._flushAndFinalize();
  },

  // ── Delta 节流批量合并（Perf fix: 50ms 内的 delta 合并为一次 setData）──

  _queueDelta(delta) {
    this._pendingDelta += delta;
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._applyPendingDelta();
    }, 50);
  },

  _applyPendingDelta() {
    const batch = this._pendingDelta;
    this._pendingDelta = '';
    if (!batch) return;
    const idx = this._streamingIdx;
    if (idx < 0) return;
    const cur = this.data.messages[idx];
    if (!cur) return;
    const newContent = (cur.content || '') + batch;
    this.setData({
      [`messages[${idx}].content`]:     newContent,
      [`messages[${idx}].displayText`]: newContent + CURSOR,
      loading: false,
      streaming: true
    });
    this._scrollTo();
  },

  // ── 流式完成 / 错误统一出口 ──────────────────────────────────

  _flushAndFinalize(errorMsg, isError) {
    // 先冲出所有待渲染 delta
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    this._applyPendingDelta();

    const idx = this._streamingIdx;
    if (idx < 0) return;
    this._streamingIdx = -1;

    const cur = this.data.messages[idx];
    if (!cur) return;
    const finalContent = cur.content || '';

    if (isError) {
      this.setData({
        [`messages[${idx}].content`]:    errorMsg,
        [`messages[${idx}].displayText`]: errorMsg,
        [`messages[${idx}].isError`]:    true,
        [`messages[${idx}].isStreaming`]: false,
        [`messages[${idx}].retryText`]:   this._lastRawText,  // 显示给用户的原始文本
        loading: false, streaming: false
      });
      return;
    }

    const suggestions = this._makeSuggestions(finalContent);
    this.setData({
      [`messages[${idx}].displayText`]:  finalContent,
      [`messages[${idx}].htmlContent`]:  mdToHtml(finalContent),   // Markdown 渲染
      [`messages[${idx}].isStreaming`]:  false,
      [`messages[${idx}].suggestions`]:  suggestions,
      loading: false, streaming: false,
      latestAiIdx: idx
    });

    if (finalContent) {
      this._history.push({ role: 'assistant', content: finalContent });
      if (this._history.length > 20) this._history = this._history.slice(-20);
    }
    this._saveCache(this.data.messages);
    wx.nextTick(() => this._scrollTo());
  },

  // ── 错误重试 ─────────────────────────────────────────────────

  onRetry(e) {
    const retryText = e.currentTarget.dataset.text;
    if (!retryText || this.data.loading || this.data.streaming) return;

    // 删除末尾的 error AI 消息和对应的 user 消息（共 2 条）
    const msgs = this.data.messages;
    const newMsgs = msgs.slice(0, -2);

    // 从 _history 删除最后一条 user 消息（error 时 assistant 未被推入）
    if (this._history.length > 0 && this._history[this._history.length - 1].role === 'user') {
      this._history = this._history.slice(0, -1);
    }

    this.setData({ messages: newMsgs, inputText: retryText });
    wx.nextTick(() => this.sendMessage());
  },

  // ── 清空 ──────────────────────────────────────────────────

  onClear() {
    wx.showModal({
      title: '清空对话',
      content: '确定清空所有对话记录吗？',
      success: ({ confirm }) => {
        if (!confirm) return;
        this._abortStream();
        this._history = [];
        this._streamingIdx = -1;
        this._lastRawText  = '';
        try { wx.removeStorageSync(CACHE_KEY); } catch (e) {}
        const welcome = makeWelcome();
        this.setData({
          messages: [welcome], latestAiIdx: 0,
          loading: false, streaming: false,
          inputText: '', inputLen: 0
        });
        wx.nextTick(() => this._scrollTo());
      }
    });
  },

  // ── 后续建议 chip 生成 ────────────────────────────────────────

  _makeSuggestions(content) {
    const lower = (content || '').toLowerCase();
    if (/简历|resume|ats|关键词|润色/.test(lower))           return ['帮我润色这段经历', '检查 ATS 关键词覆盖', '如何量化我的成就'];
    if (/面试|interview|star|行为题|算法/.test(lower))       return ['给我出一道面试题', '完善我的 STAR 回答', '还有哪些常见问题'];
    if (/职位|岗位|推荐|job|公司/.test(lower))               return ['哪些公司适合我', '如何提升竞争力', '怎么找内推机会'];
    if (/计划|规划|路线|时间线|timeline/.test(lower))        return ['制定 3 个月计划', '技能提升优先级', '校招时间节点'];
    return ['继续深入分析', '有什么注意事项', '下一步该怎么做'];
  },

  // ── 内部工具 ─────────────────────────────────────────────────

  _abortStream() {
    if (this._currentTask) {
      try { this._currentTask.abort(); } catch (e) {}
      this._currentTask = null;
    }
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
  },

  // Perf + Bug5 fix: 永远滚到底部锚点，不依赖 msg-${idx}
  _scrollTo() {
    this.setData({ scrollId: 'scroll-anchor' });
  },

  _saveCache(msgs) {
    try {
      const toSave = msgs
        .filter(m => !m.isStreaming)
        .map(m => ({ ...m, displayText: m.content, isStreaming: false }));
      wx.setStorageSync(CACHE_KEY, toSave.slice(-MAX_CACHE));
    } catch (e) {}
  }
});

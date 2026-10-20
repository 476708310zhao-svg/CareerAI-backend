// pages/ai-assistant/ai-assistant.js
const config   = require('../../utils/app-config.js');
const { post } = require('../../utils/api-client.js');
const progress = require('../../utils/job-progress.js');
const appMaterials = require('../../utils/ai-application-materials.js');
const resumeVersions = require('../../utils/ai-resume-versions.js');
const ownerStorage = require('../../utils/owner-storage.js');
const chatSessions = require('../../utils/ai-chat-sessions.js');
const authSession = require('../../utils/auth-session.js');

const API_BASE    = config.API_BASE_URL;
const CACHE_KEY   = 'ai_assistant_messages';
const SAVED_KEY   = 'ai_assistant_saved_results';
const PENDING_TAB_CONTEXT_KEY = 'pending_ai_tab_context';
const cacheKey = () => ownerStorage.key(CACHE_KEY);
const savedKey = () => ownerStorage.key(SAVED_KEY);
const currentPageOwner = () => {
  try { return ownerStorage.capture ? ownerStorage.capture() : ''; } catch (e) { return ''; }
};
const ownedResume = () => {
  try { return ownerStorage.get ? ownerStorage.get('onlineResume', '', {}) || {} : {}; } catch (e) { return {}; }
};
const TIME_GAP_MS = 5 * 60 * 1000;
const CURSOR      = '▋';
const TAB_PAGES   = new Set(['/pages/index/index', '/pages/jobs/jobs', '/pages/ai-career/ai-career', '/pages/resources/resources', '/pages/profile/profile']);
const FALLBACK_SYSTEM = '你是「职引」平台的 AI 求职助手，专注留学生求职。请用中文给出简洁、具体、可执行的建议，控制在 300 字以内，必要时用列表拆解步骤。';

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
  const text = '你好，我是职引 AI。告诉我正在处理的岗位、简历或面试问题，我会结合你的求职进度给出下一步。';
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
  if (/未登录|登录|Token|401/i.test(msg)) return '登录状态已过期，请重新登录后再试';
  if (/timeout|超时/i.test(msg))       return 'AI 响应超时，请点击下方重试';
  if (/balance|余额不足/i.test(msg))   return '服务暂时不可用，请稍后再试';
  if (/network|fail|连接/i.test(msg))  return '网络连接失败，请检查网络后重试';
  return '出错了，请点击下方重试';
}

function isUnauthorizedError(err) {
  const msg = String(err && (err.errMsg || err.message || err.error) || err);
  return err && (err.statusCode === 401 || err.code === 'UNAUTHORIZED') ||
    /unauthorized|未登录|Token|401/i.test(msg);
}

function decodeChunkData(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(new Uint8Array(data));
    }
  } catch (e) {}
  try {
    const arr = new Uint8Array(data);
    let chunk = '';
    for (let i = 0; i < arr.length; i++) chunk += String.fromCharCode(arr[i]);
    try { return decodeURIComponent(escape(chunk)); } catch (_) { return chunk; }
  } catch (e) {
    return '';
  }
}

function getSseLineData(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.charAt(0) === ':') return null;
  const match = trimmed.match(/^data:\s*(.*)$/);
  return match ? match[1].trim() : null;
}

function createSseError(payload) {
  const raw = payload && payload.error;
  const message = typeof raw === 'string'
    ? raw
    : (raw && raw.message) || (payload && payload.message) || 'AI 服务异常，请稍后重试';
  const err = new Error(message);
  if (payload && payload.code) err.code = payload.code;
  if (payload && payload.statusCode) err.statusCode = payload.statusCode;
  return err;
}

function extractChatContent(res) {
  if (!res) return '';

  if (typeof ArrayBuffer !== 'undefined' && res instanceof ArrayBuffer) {
    return extractChatContent(decodeChunkData(res));
  }

  if (typeof res === 'string') {
    const text = res.trim();
    if (!text) return '';

    if (text.indexOf('data:') !== -1) {
      let content = '';
      const lines = text.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          content += extractChatContent(JSON.parse(data));
        } catch (_) {
          content += data;
        }
      }
      return content;
    }

    try {
      return extractChatContent(JSON.parse(text));
    } catch (_) {
      return text;
    }
  }

  if (res.data && res.data !== res) {
    const nested = extractChatContent(res.data);
    if (nested) return nested;
  }

  if (res.result && res.result !== res) {
    const nested = extractChatContent(res.result);
    if (nested) return nested;
  }

  if (typeof res.reply === 'string') return res.reply;
  if (typeof res.content === 'string') return res.content;
  if (typeof res.answer === 'string') return res.answer;
  if (typeof res.message === 'string') return res.message;
  if (res.message && typeof res.message.content === 'string') return res.message.content;

  const choice = res.choices && res.choices[0];
  return (choice && (
    choice.message && choice.message.content ||
    choice.delta && choice.delta.content ||
    choice.text
  )) || '';
}

// ─── SSE 流式请求 ────────────────────────────────────────────
// wx.request enableChunked（基础库 2.26.0+）
// DeepSeek SSE 格式: data: {"choices":[{"delta":{"content":"…"}}]}
function streamRequest(messages, userContext, onDelta, onDone, onError, requestAuth) {
  let sseBuffer = '';
  let hasErrored = false;
  let receivedText = '';
  let utf8Tail = new Uint8Array(0);
  const decodeStreamChunk = (data) => {
    if (typeof data === 'string') return data;
    if (!data) return '';
    const incoming = new Uint8Array(data);
    const bytes = new Uint8Array(utf8Tail.length + incoming.length);
    bytes.set(utf8Tail);
    bytes.set(incoming, utf8Tail.length);
    let cut = bytes.length;
    let lead = cut - 1;
    while (lead >= 0 && (bytes[lead] & 0xc0) === 0x80) lead -= 1;
    if (lead >= 0) {
      const first = bytes[lead];
      const width = first >= 0xf0 ? 4 : first >= 0xe0 ? 3 : first >= 0xc0 ? 2 : 1;
      if (cut - lead < width) cut = lead;
    }
    utf8Tail = bytes.slice(cut);
    return cut ? decodeChunkData(bytes.slice(0, cut).buffer) : '';
  };
  const authHeader = requestAuth && requestAuth.token
    ? { Authorization: 'Bearer ' + requestAuth.token } : {};

  const handleSseData = (data) => {
    if (hasErrored || !data || data === '[DONE]') return;
    try {
      const json = JSON.parse(data);
      if (json.error) {
        hasErrored = true;
        onError(createSseError(json));
        return;
      }
      const delta = extractChatContent(json);
      if (delta) {
        receivedText += delta;
        onDelta(delta);
      }
    } catch (_) {
      receivedText += data;
      onDelta(data);
    }
  };

  const handleSseLine = (line) => {
    const data = getSseLineData(line);
    if (data !== null) handleSseData(data);
  };

  const requestTask = wx.request({
    url: API_BASE + '/api/ai/assistant',
    method: 'POST',
    data: { messages, userContext },
    header: Object.assign({ 'Content-Type': 'application/json' }, authHeader),
    enableChunked: true,
    dataType: 'text',
    success(res) {
      if (hasErrored) return;
      if (res && res.statusCode && res.statusCode >= 400) {
        const msg = res.data && (res.data.message || res.data.error);
        const err = new Error(msg || ('请求失败：' + res.statusCode));
        err.statusCode = res.statusCode;
        if (res.statusCode === 401) err.code = 'UNAUTHORIZED';
        onError(err);
        return;
      }
      if (sseBuffer) {
        handleSseLine(sseBuffer);
        sseBuffer = '';
        if (hasErrored) return;
      }
      if (!receivedText) {
        const responseContent = extractChatContent(res && (res.data || res));
        if (responseContent) {
          receivedText += responseContent;
          onDelta(responseContent);
        }
      }
      if (!receivedText) {
        onDone();
        return;
      }
      onDone();
    },
    fail(err)  { hasErrored = true; onError(err); }
  });
  // 微信把分块监听挂在 RequestTask 上，放进 wx.request 参数不会触发。
  if (requestTask && typeof requestTask.onChunkReceived === 'function') {
    requestTask.onChunkReceived((res) => {
      const chunk = decodeStreamChunk(res.data);
      if (!chunk) return;
      sseBuffer += chunk;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();
      for (const line of lines) {
        handleSseLine(line);
        if (hasErrored) return;
      }
    });
  }
  return requestTask;
}

// ─── Page ────────────────────────────────────────────────────

Page({
  data: {
    messages:    [],
    inputText:   '',
    inputLen:    0,
    loading:     false,   // 等待首个 token
    streaming:   false,   // 正在接收 token
    scrollId:    '',
    latestAiIdx: 0,
    freshChat:   true,
    statusBarHeight: 44,
    drawerTopInset: 92,
    safeBottom:  0,
    tabBarOffset: 78,
    keyboardHeight: 0,
    contextActive: false,
    contextLabel: '',
    contextSource: '',
    contextApplicationId: '',
    composerPlaceholder: '输入求职问题或具体目标',
    sidebarOpen: false,
    toolPanelOpen: false,
    contextInfoOpen: false,
    chatSearch: '',
    showMoreTools: false,
    showLoginPopup: false,
    loginSubtitle: '登录后可使用 AI 求职助手、保存答案和同步求职记录',
    starterPrompts: [
      { title: '安排今天的求职任务', prompt: '请结合我的求职目标，帮我制定今天可以完成的行动清单，并按优先级排序。' },
      { title: '分析目标岗位差距', prompt: '请先询问我的目标岗位和背景，再分析我的优势、差距和下一步。' },
      { title: '准备下一场面试', prompt: '请帮我准备下一场面试，先问我岗位、公司和面试类型，再给出回答框架。' }
    ],
    assistantTools: [
      { iconSrc: '/images/zhiyin-icons/spark.svg', title: '求职问答', desc: '把问题整理成可执行的下一步', prompt: '我现在想做一次求职路径梳理，请先问我 3 个关键信息。' },
      { iconSrc: '/images/zhiyin-icons/company.svg', title: '网申助手', desc: '生成 Why company/role 等草稿', action: 'application' },
      { iconSrc: '/images/zhiyin-icons/document.svg', title: '简历优化', desc: '润色经历与匹配 ATS', url: '/package-career/pages/resume-center/resume-center' },
      { iconSrc: '/images/zhiyin-icons/person.svg', title: '模拟面试', desc: '生成问题、追问和复盘', url: '/package-ai/pages/interview-setup/interview-setup' },
      { iconSrc: '/images/zhiyin-icons/clock.svg', title: '语音复盘', desc: '分析回答结构和表达清晰度', url: '/package-ai/pages/audio-review/audio-review' },
      { iconSrc: '/images/zhiyin-icons/target.svg', title: '项目复盘', desc: '把项目经历打磨成面试素材', url: '/package-ai/pages/project-review/project-review' },
      { iconSrc: '/images/zhiyin-icons/calendar.svg', title: '求职规划', desc: '生成阶段路线图', url: '/package-career/pages/career-planner/career-planner' },
      { iconSrc: '/images/zhiyin-icons/clock.svg', title: '练习记录', desc: '查看面试和语音练习记录', url: '/package-ai/pages/ai-history/ai-history' }
    ],
    recentChats: [],
    showApplicationPanel: false,
    applicationJobs: [],
    applicationQuestionTypes: appMaterials.QUESTION_TYPES,
    selectedApplicationJobId: '',
    selectedQuestionType: 'why_company',
    assistantResume: null,
    assistantResumeName: '',
    hasAssistantResume: false,
    applicationResumeVersions: [],
    applicationResumeVersionLabels: [],
    selectedApplicationResumeId: '',
    selectedApplicationResumeIndex: 0,
    selectedApplicationResumeName: '',
    selectedApplicationResumeTargetRole: '',
    selectedApplicationResume: null,
    hasApplicationResume: false,
    applicationResumeLoading: false,
    applicationDraft: null,
    applicationSavedMaterials: [],
    applicationJdText: '',
    applicationGenerating: false
  },

  _history:      [],
  _userContext:  {},
  _currentTask:  null,
  _streamingIdx: -1,
  _pendingDelta: '',
  _flushTimer:   null,
  _lastRawText:  '',   // 保存最近一次发送的原始文本，用于错误重试

  // ── 生命周期 ──────────────────────────────────────────────

  onLoad(options = {}) {
    this._ensureRuntimeState();
    this._pageOwner = currentPageOwner();
    const info = wx.getSystemInfoSync();
    const safeBottom = info.safeArea && info.screenHeight
      ? Math.max(0, info.screenHeight - info.safeArea.bottom)
      : (info.safeAreaInsets ? info.safeAreaInsets.bottom : 0);
    const menuRect = typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect() : null;
    const statusBarHeight = info.statusBarHeight || 44;
    const drawerTopInset = Math.max(statusBarHeight + 48, menuRect && menuRect.bottom ? menuRect.bottom + 12 : 0);
    this.setData({
      statusBarHeight,
      drawerTopInset,
      safeBottom
    });
    this._buildUserContext();
    this._applyRouteContext(options);
    this._restoreOrInit();
    this.loadAssistantResumeContext();
    if (options.action === 'application') {
      setTimeout(() => this.openApplicationAssistant(), 120);
    }
  },

  onShow() {
    this._ensurePageOwner();
    if (this._streamAuth) this._isActiveStream(this._streamAuth);
    this._consumePendingTabContext();
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tabBar && typeof tabBar.setSelected === 'function') tabBar.setSelected(2);
    this._syncOverlayTabBar();
    this.loadAssistantResumeContext();
  },

  onUnload() {
    this._saveCache(this.data.messages);
    this._abortStream();
  },

  _ensurePageOwner() {
    const owner = currentPageOwner();
    if (this._pageOwner === undefined) { this._pageOwner = owner; return true; }
    if (this._pageOwner === owner) return true;
    this._pageOwner = owner;
    this._abortStream();
    this._history = [];
    this._userContext = {};
    this._streamingIdx = -1;
    this._lastRawText = '';
    this.setData({
      messages: [makeWelcome()], inputText: '', inputLen: 0,
      loading: false, streaming: false, latestAiIdx: 0, freshChat: true,
      scrollId: '', contextActive: false, contextLabel: '', contextSource: '',
      contextApplicationId: '', composerPlaceholder: '输入求职问题或具体目标',
      sidebarOpen: false, showMoreTools: false, showLoginPopup: false,
      toolPanelOpen: false, contextInfoOpen: false, chatSearch: '',
      recentChats: [], showApplicationPanel: false, applicationJobs: [],
      selectedApplicationJobId: '', selectedQuestionType: 'why_company',
      assistantResume: null, assistantResumeName: '', hasAssistantResume: false,
      applicationResumeVersions: [], applicationResumeVersionLabels: [],
      selectedApplicationResumeId: '', selectedApplicationResumeIndex: 0,
      selectedApplicationResumeName: '', selectedApplicationResumeTargetRole: '',
      selectedApplicationResume: null, hasApplicationResume: false,
      applicationResumeLoading: false, applicationDraft: null,
      applicationSavedMaterials: [], applicationJdText: '', applicationGenerating: false
    });
    this._buildUserContext();
    this._restoreOrInit();
    return false;
  },

  loadAssistantResumeContext() {
    const owner = currentPageOwner();
    const session = authSession.capture(wx);
    resumeVersions.fetchResumeVersions().then(selection => {
      if (owner !== currentPageOwner() || !authSession.isCurrent(session, wx)) return;
      this.applyAssistantResumeSelection(selection);
    }).catch(() => {
      if (owner !== currentPageOwner() || !authSession.isCurrent(session, wx)) return;
      this.applyAssistantResumeSelection(resumeVersions.localSelection());
    });
  },

  applyAssistantResumeSelection(selection) {
    const item = selection || resumeVersions.localSelection();
    this._userContext = Object.assign({}, this._userContext || {}, {
      hasResume: !!item.hasResume,
      targetJob: (this.data.contextActive && this._userContext && this._userContext.targetJob) || item.currentTargetRole || (this._userContext && this._userContext.targetJob) || ''
    });
    this.setData({
      assistantResume: item.currentResume || null,
      assistantResumeName: item.currentName || '',
      hasAssistantResume: !!item.hasResume,
      applicationResumeVersions: item.list || this.data.applicationResumeVersions,
      applicationResumeVersionLabels: item.labels || this.data.applicationResumeVersionLabels
    });
    if (this.data.showApplicationPanel && !this.data.selectedApplicationResumeId) {
      this.applyApplicationResumeSelection(item);
    }
  },

  applyApplicationResumeSelection(selection) {
    const item = selection || resumeVersions.localSelection();
    this.setData({
      applicationResumeLoading: false,
      applicationResumeVersions: item.list || [],
      applicationResumeVersionLabels: item.labels || [],
      selectedApplicationResumeId: item.currentId || '',
      selectedApplicationResumeIndex: item.currentIndex || 0,
      selectedApplicationResumeName: item.currentName || '',
      selectedApplicationResumeTargetRole: item.currentTargetRole || '',
      selectedApplicationResume: item.currentResume || null,
      hasApplicationResume: !!item.hasResume,
      applicationDraft: null
    });
  },

  loadApplicationResumeVersions() {
    const owner = currentPageOwner();
    const session = authSession.capture(wx);
    this.setData({ applicationResumeLoading: true });
    resumeVersions.fetchResumeVersions().then(selection => {
      if (owner !== currentPageOwner() || !authSession.isCurrent(session, wx)) return;
      this.applyApplicationResumeSelection(selection);
    }).catch(() => {
      if (owner !== currentPageOwner() || !authSession.isCurrent(session, wx)) return;
      this.applyApplicationResumeSelection(resumeVersions.localSelection());
    });
  },

  // ── 用户上下文（个性化） ────────────────────────────────────

  _buildUserContext() {
    try {
      const profile = wx.getStorageSync('userProfile') || {};
      const pref    = profile.jobPreference || {};
      const resume  = this.data.assistantResume || ownedResume();
      this._userContext = {
        nickname:  String(profile.nickname || '').slice(0, 20),
        targetJob: String(pref.targetPosition || pref.targetJob || '').slice(0, 50),
        location:  String(pref.targetLocation || pref.location || '').slice(0, 30),
        education: String((profile.education && profile.education.degree) ? profile.education.degree : '').slice(0, 30),
        hasResume: !!(resume.basicInfo && resume.basicInfo.name),
        appCount: progress.getList().length
      };
    } catch (e) {}
  },

  _applyRouteContext(options = {}) {
    const read = value => {
      try { return decodeURIComponent(String(value || '')).trim(); } catch (error) { return String(value || '').trim(); }
    };
    const source = read(options.source || '');
    const applicationId = read(options.applicationId || '');
    let company = read(options.company || '');
    let role = read(options.role || '');
    let application = null;
    try {
      const applications = progress.getList ? progress.getList() : [];
      application = applicationId
        ? applications.find(item => String(item.id) === applicationId)
        : (source === 'applications' ? applications.find(item => !['offer', 'rejected', 'withdrawn'].includes(String(item.status || ''))) || applications[0] : null);
    } catch (error) {}

    if (application) {
      const snapshot = application.jobSnapshot || {};
      company = company || application.company || snapshot.company || '';
      role = role || application.jobTitle || application.title || snapshot.title || '';
    }

    const applicationLabel = [company, role].filter(Boolean).join(' · ');
    const sourceLabels = {
      index: '首页 · 今日行动',
      home: '首页 · 今日行动',
      jobs: role ? `找岗位 · ${role}` : '找岗位',
      applications: applicationLabel ? `${applicationLabel}申请` : '申请工作台',
      resources: applicationLabel ? `资源准备 · ${applicationLabel}` : '资源准备',
      profile: '个人求职档案'
    };
    const contextLabel = applicationLabel && source !== 'applications'
      ? applicationLabel
      : (sourceLabels[source] || applicationLabel || '');
    const contextActive = Boolean(source || applicationId || company || role);
    if (!contextActive) return;

    this._userContext = Object.assign({}, this._userContext || {}, {
      currentPage: source,
      applicationId: applicationId || (application && application.id) || '',
      company,
      targetJob: role || (this._userContext && this._userContext.targetJob) || ''
    });
    this.setData({
      contextActive: true,
      contextLabel: contextLabel || '当前求职任务',
      contextSource: source,
      contextApplicationId: applicationId || (application && application.id) || '',
      composerPlaceholder: source === 'applications' || applicationId ? '继续问这条申请…' : '围绕当前页面继续提问…'
    });
  },

  _consumePendingTabContext() {
    let context = null;
    try {
      context = ownerStorage.get(PENDING_TAB_CONTEXT_KEY, '', null);
      if (context) ownerStorage.remove(PENDING_TAB_CONTEXT_KEY, '');
    } catch (error) {}
    if (!context || typeof context !== 'object') return;
    if ((this.data.messages || []).some(message => message.role === 'user')) this._startNewChat();
    this._buildUserContext();
    this._applyRouteContext(context);
    if (context.action === 'application') {
      setTimeout(() => this.openApplicationAssistant(), 120);
    }
  },

  // ── 简历摘要注入（检测到简历相关意图时） ──────────────────────

  _buildResumeContext(text) {
    if (!/简历|resume|优化|润色|ats|诊断|改进|经历|经验|描述/i.test(text)) return '';
    try {
      const r = this.data.assistantResume || ownedResume();
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
    this._history = [];
    this._streamingIdx = -1;
    this._lastRawText = '';
    const routeContextActive = !!this.data.contextActive;
    let stored = routeContextActive ? null : chatSessions.get(chatSessions.activeId());
    if (!stored && !routeContextActive) {
      try {
        const legacy = wx.getStorageSync(cacheKey());
        if (Array.isArray(legacy) && legacy.some(message => message && message.role === 'user')) {
          stored = chatSessions.save(chatSessions.createId(), legacy, {});
          wx.removeStorageSync(cacheKey());
        }
      } catch (error) {}
    }
    if (stored) {
      try { wx.removeStorageSync(cacheKey()); } catch (error) {}
      this._openStoredChat(stored);
      return;
    }
    try { wx.removeStorageSync(cacheKey()); } catch (error) {}
    this._activeSessionId = chatSessions.createId();
    chatSessions.setActive(this._activeSessionId);
    const welcome = makeWelcome();
    this.setData({
      messages: [welcome],
      latestAiIdx: 0,
      freshChat: true,
      scrollId: '',
      loading: false,
      streaming: false,
      inputText: '',
      inputLen: 0
    });
    this._refreshChats();
  },

  _openStoredChat(record) {
    this._activeSessionId = record.id;
    chatSessions.setActive(record.id);
    const messages = (record.messages || []).map(message => ({
      ...message,
      displayText: message.content,
      htmlContent: message.role === 'ai' ? mdToHtml(message.content) : '',
      isStreaming: false
    }));
    const context = record.context || {};
    this._buildUserContext();
    if (context.active) {
      this._userContext = Object.assign({}, this._userContext, {
        currentPage: context.source,
        applicationId: context.applicationId,
        company: context.company,
        targetJob: context.targetJob || this._userContext.targetJob
      });
    }
    this._history = messages.filter(message => !message.isWelcome && !message.isError && message.content)
      .map(message => ({ role: message.role === 'ai' ? 'assistant' : 'user', content: message.content })).slice(-20);
    const latestAiIdx = messages.reduce((found, message, index) => message.role === 'ai' ? index : found, 0);
    this.setData({
      messages: messages.length ? messages : [makeWelcome()], latestAiIdx,
      freshChat: !messages.some(message => message.role === 'user'),
      contextActive: !!context.active, contextLabel: context.label || '',
      contextSource: context.source || '', contextApplicationId: context.applicationId || '',
      composerPlaceholder: context.active ? '围绕当前任务继续提问…' : '输入求职问题或具体目标',
      sidebarOpen: false, toolPanelOpen: false, contextInfoOpen: false, chatSearch: '',
      inputText: '', inputLen: 0, loading: false, streaming: false, scrollId: ''
    });
    this._refreshChats();
    wx.nextTick(() => this._scrollTo());
  },

  _refreshChats() {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let lastGroup = '';
    const recentChats = chatSessions.list(this.data.chatSearch).map(item => {
      const day = new Date(item.updatedAt).toDateString();
      const groupLabel = day === today ? '今天' : day === yesterday ? '昨天' : '更早';
      const showGroup = groupLabel !== lastGroup;
      lastGroup = groupLabel;
      return { ...item, groupLabel, showGroup, active: item.id === this._activeSessionId };
    });
    this.setData({ recentChats });
  },

  // ── 输入 ──────────────────────────────────────────────────

  onInputChange(e) {
    if (!this._ensurePageOwner()) return;
    this.setData({ inputText: e.detail.value, inputLen: e.detail.value.length });
  },

  onKeyboardHeight(e) {
    const height = Math.max(0, Number(e.detail && e.detail.height) || 0);
    if (height === this.data.keyboardHeight) return;
    this.setData({ keyboardHeight: height });
    this._syncOverlayTabBar();
    setTimeout(() => this._scrollTo(), height ? 80 : 0);
  },

  onInputFocus() {
    setTimeout(() => this._scrollTo(), 120);
  },

  onInputBlur() {
    setTimeout(() => this._scrollTo(), 120);
  },

  // ── 发送 & 停止 ──────────────────────────────────────────

  onSend()       { this.sendMessage(); },
  onSendOrStop() { this.data.streaming ? this.onStop() : this.sendMessage(); },

  _getToken() {
    try {
      return wx.getStorageSync('token') || '';
    } catch (e) {
      return '';
    }
  },

  _isActiveStream(requestAuth) {
    if (!requestAuth || this._streamAuth !== requestAuth) return false;
    if (!this._ensurePageOwner()) return false;
    if (authSession.isCurrent(requestAuth, wx)) return true;
    this._finishStoppedStream();
    return false;
  },

  _finishStoppedStream() {
    this._applyPendingDelta();
    const idx = this._streamingIdx;
    const cur = idx >= 0 && this.data.messages[idx];
    const content = cur && String(cur.content || '').trim();
    this._abortStream();
    this._streamingIdx = -1;
    if (!cur) { this.setData({ loading: false, streaming: false }); return; }
    this.setData({
      [`messages[${idx}].content`]: content || '已停止生成',
      [`messages[${idx}].displayText`]: content || '已停止生成',
      [`messages[${idx}].htmlContent`]: content ? mdToHtml(content) : '',
      [`messages[${idx}].isStreaming`]: false,
      loading: false, streaming: false
    });
    this._saveCache(this.data.messages);
  },

  _showLoginRequired(subtitle) {
    this.setData({
      showLoginPopup: true,
      loginSubtitle: subtitle || '登录后可使用 AI 求职助手、保存答案和同步求职记录'
    });
  },

  onLoginPopupClose() {
    this.setData({ showLoginPopup: false });
  },

  onLoginSuccess() {
    this._ensurePageOwner();
    this.setData({ showLoginPopup: false });
    wx.showToast({ title: '已登录，可继续发送', icon: 'none' });
  },

  goBack() {
    this.setData({ sidebarOpen: false });
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  onToolAction(e) {
    if (this.data.loading || this.data.streaming) return;
    const action = e.currentTarget.dataset.action;
    if (action === 'application') {
      this.setData({ toolPanelOpen: false });
      this.openApplicationAssistant();
      return;
    }
    const url = e.currentTarget.dataset.url;
    if (url) {
      this.setData({ sidebarOpen: false, toolPanelOpen: false });
      this._syncOverlayTabBar();
      this._openToolUrl(url);
      return;
    }
    const inputText = e.currentTarget.dataset.text || '';
    this.setData({ sidebarOpen: false, toolPanelOpen: false, inputText, inputLen: inputText.length });
    this._syncOverlayTabBar();
  },

  openApplicationAssistant() {
    this._ensurePageOwner();
    const jobs = progress.getList().slice(0, 12);
    const selected = jobs[0] ? jobs[0].id : '';
    this.setData({
      sidebarOpen: false,
      showApplicationPanel: true,
      applicationJobs: jobs,
      selectedApplicationJobId: selected,
      selectedQuestionType: this.data.selectedQuestionType || 'why_company',
      applicationDraft: null,
      applicationJdText: jobs[0] && (jobs[0].description || jobs[0].notes) ? (jobs[0].description || jobs[0].notes) : '',
      applicationGenerating: false,
      applicationSavedMaterials: appMaterials.readMaterials().slice(0, 3)
    });
    this._syncOverlayTabBar();
    this.loadApplicationResumeVersions();
  },

  closeApplicationAssistant() {
    this.setData({ showApplicationPanel: false });
    this._syncOverlayTabBar();
  },

  selectApplicationJob(e) {
    if (!this._ensurePageOwner()) return;
    const id = e.currentTarget.dataset.id || '';
    const job = this.data.applicationJobs.find(item => String(item.id) === String(id)) || {};
    this.setData({
      selectedApplicationJobId: id,
      applicationDraft: null,
      applicationJdText: job.description || job.notes || this.data.applicationJdText || ''
    });
  },

  selectApplicationQuestion(e) {
    if (!this._ensurePageOwner()) return;
    this.setData({ selectedQuestionType: e.currentTarget.dataset.type || 'why_company', applicationDraft: null });
  },

  onApplicationJdInput(e) {
    if (!this._ensurePageOwner()) return;
    this.setData({ applicationJdText: e.detail.value || '', applicationDraft: null });
  },

  onApplicationResumeChange(e) {
    if (!this._ensurePageOwner()) return;
    const index = Number(e.detail.value || 0);
    const target = (this.data.applicationResumeVersions || [])[index];
    if (!target || String(target.id) === String(this.data.selectedApplicationResumeId)) return;
    this.setData({ applicationResumeLoading: true, applicationDraft: null });
    const owner = currentPageOwner();
    const session = authSession.capture(wx);
    resumeVersions.loadResumeVersion(target.id, this.data.applicationResumeVersions).then(selection => {
      if (owner !== currentPageOwner() || !authSession.isCurrent(session, wx)) return;
      this.applyApplicationResumeSelection(selection);
    }).catch(() => {
      if (owner !== currentPageOwner() || !authSession.isCurrent(session, wx)) return;
      this.setData({ applicationResumeLoading: false });
      wx.showToast({ title: '简历加载失败', icon: 'none' });
    });
  },

  goApplicationResume() {
    this.setData({ showApplicationPanel: false });
    wx.navigateTo({ url: '/package-career/pages/resume-center/resume-center' });
  },

  generateApplicationDraft() {
    if (!this._ensurePageOwner()) return;
    if (!this.data.applicationJobs.length) {
      wx.showToast({ title: '请先添加目标岗位', icon: 'none' });
      return;
    }
    if (!this.data.hasApplicationResume) {
      wx.showToast({ title: '请先完善简历', icon: 'none' });
      return;
    }
    if (this.data.applicationGenerating) return;
    const job = this.data.applicationJobs.find(item => String(item.id) === String(this.data.selectedApplicationJobId)) || this.data.applicationJobs[0] || {};
    const resume = this.data.selectedApplicationResume || this.data.assistantResume || ownedResume();
    const resumeMeta = {
      resumeName: this.data.selectedApplicationResumeName || resumeVersions.getResumeDisplayName(resume, '当前在线简历'),
      resumeVersionId: this.data.selectedApplicationResumeId || ''
    };
    this.setData({ applicationGenerating: true });
    const owner = currentPageOwner();
    const session = authSession.capture(wx);
    appMaterials.generateDraftAi({
      job,
      questionType: this.data.selectedQuestionType,
      resume,
      resumeName: resumeMeta.resumeName,
      resumeVersionId: resumeMeta.resumeVersionId,
      jdText: this.data.applicationJdText
    }).then(material => {
      if (owner !== currentPageOwner() || !authSession.isCurrent(session, wx)) return;
      this.setData({ applicationDraft: Object.assign({}, material, resumeMeta), applicationGenerating: false });
      if (material && material.generationMode === 'template') {
        wx.showToast({ title: 'AI 暂不可用，已生成基础草稿', icon: 'none' });
      }
    }).catch(() => {
      if (owner !== currentPageOwner() || !authSession.isCurrent(session, wx)) return;
      const material = appMaterials.generateDraft({
        job,
        questionType: this.data.selectedQuestionType,
        resume,
        resumeName: resumeMeta.resumeName,
        resumeVersionId: resumeMeta.resumeVersionId
      });
      this.setData({ applicationDraft: Object.assign({}, material, resumeMeta), applicationGenerating: false });
    });
  },

  saveApplicationDraft() {
    if (!this._ensurePageOwner()) return;
    if (!this.data.applicationDraft) return;
    appMaterials.saveMaterial(this.data.applicationDraft);
    this.setData({ applicationSavedMaterials: appMaterials.readMaterials().slice(0, 3) });
    wx.showToast({ title: '已保存到材料库', icon: 'success' });
  },

  copyApplicationDraft() {
    if (!this._ensurePageOwner()) return;
    const draft = this.data.applicationDraft;
    if (!draft || !draft.content) return;
    wx.setClipboardData({
      data: draft.content,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  goApplicationMaterials() {
    this.setData({ showApplicationPanel: false });
    wx.navigateTo({ url: '/package-ai/pages/application-materials/application-materials' });
  },

  _openToolUrl(url) {
    if (TAB_PAGES.has(url)) {
      wx.switchTab({ url });
      return;
    }
    wx.navigateTo({ url });
  },

  _syncOverlayTabBar() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tabBar && typeof tabBar.setHidden === 'function') {
      tabBar.setHidden(!!(this.data.keyboardHeight || this.data.sidebarOpen || this.data.toolPanelOpen || this.data.contextInfoOpen || this.data.showApplicationPanel));
    }
  },

  toggleSidebar() {
    const sidebarOpen = !this.data.sidebarOpen;
    const patch = { sidebarOpen, toolPanelOpen: false, contextInfoOpen: false };
    this.setData(patch);
    this._syncOverlayTabBar();
    if (sidebarOpen && this.data.keyboardHeight > 0 && typeof wx.hideKeyboard === 'function') wx.hideKeyboard();
  },

  toggleToolPanel() {
    if (this.data.loading || this.data.streaming) return;
    this.setData({ toolPanelOpen: !this.data.toolPanelOpen, sidebarOpen: false, contextInfoOpen: false });
    this._syncOverlayTabBar();
    if (this.data.toolPanelOpen && this.data.keyboardHeight > 0 && typeof wx.hideKeyboard === 'function') wx.hideKeyboard();
  },

  toggleContextInfo() {
    this.setData({ contextInfoOpen: !this.data.contextInfoOpen, sidebarOpen: false, toolPanelOpen: false });
    this._syncOverlayTabBar();
  },

  clearChatContext() {
    this._buildUserContext();
    this.setData({ contextActive: false, contextLabel: '', contextSource: '', contextApplicationId: '', contextInfoOpen: false, composerPlaceholder: '输入求职问题或具体目标' });
    this._saveCache(this.data.messages);
    this._syncOverlayTabBar();
  },

  onSearchChats(e) {
    this.setData({ chatSearch: e.detail.value || '' });
    this._refreshChats();
  },

  onSelectChat(e) {
    const record = chatSessions.get(e.currentTarget.dataset.id);
    if (!record) return;
    this._saveCache(this.data.messages);
    this._abortStream();
    this._streamingIdx = -1;
    this._openStoredChat(record);
    this._syncOverlayTabBar();
  },

  onChatOptions(e) {
    const id = e.currentTarget.dataset.id;
    const record = chatSessions.get(id);
    if (!record || typeof wx.showActionSheet !== 'function') return;
    wx.showActionSheet({ itemList: ['重命名', '删除对话'], success: result => {
      if (result.tapIndex === 0 && typeof wx.showModal === 'function') {
        wx.showModal({ title: '重命名对话', editable: true, placeholderText: record.title, success: choice => {
          if (choice.confirm && chatSessions.rename(id, choice.content)) this._refreshChats();
        } });
      }
      if (result.tapIndex === 1 && typeof wx.showModal === 'function') {
        wx.showModal({ title: '删除对话？', content: '删除后无法恢复。', confirmColor: '#d94e45', success: choice => {
          if (!choice.confirm) return;
          chatSessions.remove(id);
          if (id === this._activeSessionId) this._startNewChat(true);
          else this._refreshChats();
        } });
      }
    } });
  },

  toggleMoreTools() {
    this.setData({ showMoreTools: !this.data.showMoreTools });
  },

  onNewChat() {
    this._startNewChat();
  },

  _startNewChat(skipSave) {
    if (!skipSave) this._saveCache(this.data.messages);
    this._abortStream();
    this._history = [];
    this._streamingIdx = -1;
    this._lastRawText = '';
    this._activeSessionId = chatSessions.createId();
    chatSessions.setActive(this._activeSessionId);
    this._buildUserContext();
    const welcome = makeWelcome();
    this.setData({
      sidebarOpen: false, toolPanelOpen: false, contextInfoOpen: false, chatSearch: '',
      messages: [welcome],
      latestAiIdx: 0,
      freshChat: true,
      scrollId: '',
      loading: false,
      streaming: false,
      inputText: '',
      inputLen: 0,
      contextActive: false, contextLabel: '', contextSource: '', contextApplicationId: '',
      composerPlaceholder: '输入求职问题或具体目标'
    });
    this._refreshChats();
    this._syncOverlayTabBar();
  },

  onSuggestion(e) {
    if (this.data.loading || this.data.streaming) return;
    this.setData({ inputText: e.currentTarget.dataset.text });
    this.sendMessage();
  },

  onCopyAnswer(e) {
    const msg = this.data.messages[e.currentTarget.dataset.index];
    const content = msg && (msg.content || msg.displayText);
    if (!content) return;
    wx.setClipboardData({
      data: content,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  onRegenerateAnswer(e) {
    if (this.data.loading || this.data.streaming) return;
    const answerIndex = Number(e.currentTarget.dataset.index);
    if (answerIndex !== this.data.latestAiIdx) return;
    const messages = this.data.messages || [];
    let userIndex = answerIndex - 1;
    while (userIndex >= 0 && messages[userIndex].role !== 'user') userIndex -= 1;
    if (userIndex < 0) return;
    const question = String(messages[userIndex].content || '').trim();
    if (!question) return;
    const remaining = messages.slice(0, userIndex);
    this._history = remaining.filter(message => !message.isWelcome && !message.isError && message.content)
      .map(message => ({ role: message.role === 'ai' ? 'assistant' : 'user', content: message.content })).slice(-20);
    this.setData({ messages: remaining, inputText: question, inputLen: question.length, latestAiIdx: remaining.length - 1 });
    this.sendMessage();
  },

  onSaveAnswer(e) {
    const msg = this.data.messages[e.currentTarget.dataset.index];
    const content = msg && (msg.content || msg.displayText);
    if (!content) return;
    const saved = wx.getStorageSync(savedKey()) || [];
    const item = {
      id: Date.now(),
      title: this._buildSavedTitle(content),
      content,
      createdAt: fmtTime(Date.now())
    };
    wx.setStorageSync(savedKey(), [item].concat(saved).slice(0, 30));
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onContinueAsk(e) {
    if (this.data.loading || this.data.streaming) return;
    const type = e.currentTarget.dataset.type;
    const text = type === 'plan'
      ? '请把上面的建议拆成可执行清单，按今天、本周、本月分组，并标出优先级。'
      : '请基于上面的回答继续追问我 3 个关键信息，然后给出更精准的下一步建议。';
    this.setData({ inputText: text });
    wx.nextTick(() => this.sendMessage());
  },

  sendMessage() {
    if (!this._ensurePageOwner()) return;
    this._ensureRuntimeState();
    const rawText = this.data.inputText.trim();
    if (!rawText || this.data.loading || this.data.streaming) return;
    if (!this._getToken()) {
      this._showLoginRequired('使用 AI 求职助手需要先登录');
      return;
    }
    const requestAuth = authSession.capture(wx);
    this._streamAuth = requestAuth;
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
      freshChat: false,
      loading: true, streaming: false,
      latestAiIdx: streamIdx
    });
    this._saveCache(msgs);
    wx.nextTick(() => this._scrollTo());

    // 更新 API 历史（含简历摘要）
    this._history.push({ role: 'user', content: apiText });
    if (this._history.length > 20) this._history = this._history.slice(-20);

    this._currentTask = streamRequest(
      this._history,
      this._userContext,
      (delta) => { if (this._isActiveStream(requestAuth)) this._queueDelta(delta); },
      ()      => { if (this._isActiveStream(requestAuth)) this._flushAndFinalize(); },
      (err)   => {
        if (!this._isActiveStream(requestAuth)) return;
        if (isUnauthorizedError(err)) {
          console.warn('[ai-assistant] login required:', err.message || err);
          this._handleAuthExpired();
          return;
        }
        if (err && err.message === 'AI 返回为空') {
          console.warn('[ai-assistant] stream returned empty, switching to fallback chat');
        } else {
          console.error('[ai-assistant]', err);
        }
        this._fallbackToChat(err);
      },
      requestAuth
    );
  },

  onStop() {
    if (!this._ensurePageOwner()) return;
    if (this._streamAuth && !authSession.isCurrent(this._streamAuth, wx)) {
      this._finishStoppedStream();
      return;
    }
    this._finishStoppedStream();
  },

  // ── Delta 节流批量合并（Perf fix: 50ms 内的 delta 合并为一次 setData）──

  _queueDelta(delta) {
    this._pendingDelta += delta;
    if (this._flushTimer) return;
    const requestAuth = this._streamAuth;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      if (!this._isActiveStream(requestAuth)) {
        if (this._streamAuth === requestAuth) this._pendingDelta = '';
        return;
      }
      this._applyPendingDelta();
    }, 50);
  },

  _applyPendingDelta() {
    if (this._streamAuth && !authSession.isCurrent(this._streamAuth, wx)) {
      this._pendingDelta = '';
      return;
    }
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

    const cur = this.data.messages[idx];
    if (!cur) return;
    const finalContent = (cur.content || '').trim();

    if (!isError && !finalContent) {
      this._fallbackToChat(new Error('AI 返回为空'));
      return;
    }

    this._streamingIdx = -1;

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

  _fallbackToChat(err) {
    const requestAuth = this._streamAuth;
    if (!this._isActiveStream(requestAuth)) return;
    const idx = this._streamingIdx;
    const cur = idx >= 0 ? this.data.messages[idx] : null;

    if (cur && cur.content) {
      this._flushAndFinalize();
      return;
    }

    if (idx >= 0) {
      this.setData({
        [`messages[${idx}].displayText`]: '正在切换备用通道...',
        loading: true,
        streaming: false
      });
    }

    const messages = [
      { role: 'system', content: this._buildFallbackSystemPrompt() },
      ...this._history.slice(-16)
    ];

    post({
      path: '/api/ai/chat',
      body: { messages, temperature: 0.7 },
      timeout: 65000
    }).then((res) => {
      if (!this._isActiveStream(requestAuth)) return;
      const content = extractChatContent(res).trim();
      if (!content) throw new Error(res && (res.message || res.error) || 'AI 返回为空');
      this._finishWithFallbackContent(content);
    }).catch((fallbackErr) => {
      if (!this._isActiveStream(requestAuth)) return;
      console.error('[ai-assistant:fallback]', fallbackErr);
      this._flushAndFinalize(friendlyError(fallbackErr || err), true);
    });
  },

  _handleAuthExpired() {
    if (!this._isActiveStream(this._streamAuth)) return;
    try {
      authSession.clearToken(wx);
      wx.removeStorageSync('userProfile');
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.isLoggedIn = false;
        if (typeof app.refreshGlobalData === 'function') app.refreshGlobalData();
      }
    } catch (e) {}
    this._streamAuth = null;
    this._flushAndFinalize('登录状态已过期，请重新登录后点击「重新发送」。', true);
    this._showLoginRequired('登录状态已过期，请重新登录后继续使用 AI 求职助手');
  },

  _buildFallbackSystemPrompt() {
    const ctx = this._userContext || {};
    const parts = [];
    if (ctx.targetJob) parts.push('目标岗位：' + ctx.targetJob);
    if (ctx.location) parts.push('目标地区：' + ctx.location);
    if (ctx.education) parts.push('学历背景：' + ctx.education);
    if (ctx.hasResume) parts.push('用户已完善简历信息');
    if (ctx.company) parts.push('当前公司：' + ctx.company);
    if (ctx.applicationId) parts.push('当前申请 ID：' + ctx.applicationId);
    if (ctx.currentPage) parts.push('当前页面：' + ctx.currentPage);
    return parts.length ? FALLBACK_SYSTEM + '\n\n用户信息：\n' + parts.join('\n') : FALLBACK_SYSTEM;
  },

  _finishWithFallbackContent(content) {
    const idx = this._streamingIdx;
    if (idx < 0) return;
    this._streamingIdx = -1;
    const suggestions = this._makeSuggestions(content);
    this.setData({
      [`messages[${idx}].content`]: content,
      [`messages[${idx}].displayText`]: content,
      [`messages[${idx}].htmlContent`]: mdToHtml(content),
      [`messages[${idx}].isError`]: false,
      [`messages[${idx}].isStreaming`]: false,
      [`messages[${idx}].retryText`]: '',
      [`messages[${idx}].suggestions`]: suggestions,
      loading: false,
      streaming: false,
      latestAiIdx: idx
    });
    this._history.push({ role: 'assistant', content });
    if (this._history.length > 20) this._history = this._history.slice(-20);
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
      title: '删除当前对话？',
      content: '删除后无法恢复。',
      success: ({ confirm }) => {
        if (!confirm) return;
        chatSessions.remove(this._activeSessionId);
        this._startNewChat(true);
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

  _buildSavedTitle(content) {
    const firstLine = String(content || '').replace(/\s+/g, ' ').slice(0, 24);
    return firstLine || 'AI 求职建议';
  },

  // ── 内部工具 ─────────────────────────────────────────────────

  _abortStream() {
    this._ensureRuntimeState();
    const task = this._currentTask;
    this._currentTask = null;
    this._streamAuth = null;
    if (task) { try { task.abort(); } catch (e) {} }
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    this._pendingDelta = '';
  },

  openAiCareer() {
    this.toggleSidebar();
  },

  // Perf + Bug5 fix: 永远滚到底部锚点，不依赖 msg-${idx}
  _scrollTo() {
    this.setData({ scrollId: 'scroll-anchor' });
  },

  _ensureRuntimeState() {
    if (!Array.isArray(this._history)) this._history = [];
    if (!this._userContext || typeof this._userContext !== 'object') this._userContext = {};
    if (typeof this._streamingIdx !== 'number') this._streamingIdx = -1;
    if (typeof this._pendingDelta !== 'string') this._pendingDelta = '';
    if (typeof this._lastRawText !== 'string') this._lastRawText = '';
  },

  _saveCache(msgs) {
    if (!this._activeSessionId || this._pageOwner !== currentPageOwner()) return;
    try {
      chatSessions.save(this._activeSessionId, msgs, {
        active: this.data.contextActive, label: this.data.contextLabel,
        source: this.data.contextSource, applicationId: this.data.contextApplicationId,
        company: this._userContext && this._userContext.company,
        targetJob: this._userContext && this._userContext.targetJob
      });
      this._refreshChats();
    } catch (error) {}
  }
});

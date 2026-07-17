// pages/ai-assistant/ai-assistant.js
const config   = require('../../../utils/app-config.js');
const { post } = require('../../../utils/api-client.js');
const progress = require('../../../utils/job-progress.js');
const appMaterials = require('../../../utils/application-materials.js');
const resumeVersions = require('../../../utils/resume-versions.js');

const API_BASE    = config.API_BASE_URL;
const CACHE_KEY   = 'ai_assistant_messages';
const SAVED_KEY   = 'ai_assistant_saved_results';
const MAX_CACHE   = 30;
const TIME_GAP_MS = 5 * 60 * 1000;
const CURSOR      = '▋';
const TAB_PAGES   = new Set(['/pages/index/index', '/pages/campus/campus', '/pages/applications/applications', '/pages/ai-career/ai-career', '/pages/profile/profile']);
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
  const text = '你好，我是 AI 求职助手。\n\n直接告诉我：简历、岗位、面试或求职规划，你想先处理哪一项？';
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
function streamRequest(messages, userContext, onDelta, onDone, onError) {
  let sseBuffer = '';
  let hasErrored = false;
  let receivedText = '';
  const authHeader = {};
  try {
    const token = wx.getStorageSync('token');
    if (token) authHeader['Authorization'] = 'Bearer ' + token;
  } catch (e) {}

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

  return wx.request({
    url: API_BASE + '/api/ai/assistant',
    method: 'POST',
    data: { messages, userContext },
    header: Object.assign({ 'Content-Type': 'application/json' }, authHeader),
    enableChunked: true,

    onChunkReceived(res) {
      const chunk = decodeChunkData(res.data);
      if (!chunk) return;
      sseBuffer += chunk;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();
      for (const line of lines) {
        handleSseLine(line);
        if (hasErrored) return;
      }
    },
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
    sidebarOpen: false,
    showMoreTools: false,
    showLoginPopup: false,
    loginSubtitle: '登录后可使用 AI 求职助手、保存答案和同步求职记录',
    aiSuites: [
      { icon: '网', title: '网申助手', desc: '生成申请问题草稿', action: 'application' },
      { icon: 'MI', title: '模拟面试', desc: '设定岗位开始训练', url: '/package-ai/pages/interview-setup/interview-setup' },
      { icon: 'AR', title: '语音复盘', desc: '上传录音生成建议', url: '/package-ai/pages/audio-review/audio-review' },
      { icon: 'PR', title: '项目复盘', desc: '用 STAR 打磨亮点', url: '/package-ai/pages/project-review/project-review' },
      { icon: 'CV', title: '简历优化', desc: '经历、关键词、ATS', url: '/package-career/pages/resume/resume' }
    ],
    assistantTools: [
      { icon: 'AI', title: '求职问答', desc: '简历、岗位、面试都可以直接问', prompt: '我现在想做一次求职路径梳理，请先问我 3 个关键信息。' },
      { icon: '网', title: '网申助手', desc: '生成 Why company/role 等草稿', action: 'application' },
      { icon: 'MI', title: '模拟面试', desc: '生成问题、追问和复盘', url: '/package-ai/pages/interview-setup/interview-setup' },
      { icon: 'AR', title: '语音复盘', desc: '分析回答结构和表达清晰度', url: '/package-ai/pages/audio-review/audio-review' },
      { icon: 'PR', title: '项目复盘', desc: '把项目经历打磨成面试素材', url: '/package-ai/pages/project-review/project-review' },
      { icon: 'CV', title: '简历优化', desc: '润色经历与匹配 ATS', url: '/package-career/pages/resume/resume' },
      { icon: '路', title: '求职规划', desc: '生成阶段路线图', url: '/package-career/pages/career-planner/career-planner' },
      { icon: '历', title: 'AI 历史', desc: '查看历史对话和报告', url: '/package-ai/pages/ai-history/ai-history' }
    ],
    recentChats: [
      { id: 1, title: '新的求职咨询', preview: '你好！我是你的 AI 求职助手...', time: '刚刚' },
      { id: 2, title: '简历优化思路', preview: '项目经历需要突出影响力', time: '昨天' },
      { id: 3, title: '岗位匹配建议', preview: '优先申请 SWE / Data 方向', time: '本周' }
    ],
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
    const info = wx.getSystemInfoSync();
    const safeBottom = info.safeArea && info.screenHeight
      ? Math.max(0, info.screenHeight - info.safeArea.bottom)
      : (info.safeAreaInsets ? info.safeAreaInsets.bottom : 0);
    this.setData({
      statusBarHeight: info.statusBarHeight || 44,
      safeBottom
    });
    this._buildUserContext();
    this._restoreOrInit();
    this.loadAssistantResumeContext();
    if (options.action === 'application') {
      setTimeout(() => this.openApplicationAssistant(), 120);
    }
  },

  onShow() {
    this.loadAssistantResumeContext();
  },

  onUnload() {
    this._abortStream();
  },

  loadAssistantResumeContext() {
    resumeVersions.fetchResumeVersions().then(selection => {
      this.applyAssistantResumeSelection(selection);
    }).catch(() => {
      this.applyAssistantResumeSelection(resumeVersions.localSelection());
    });
  },

  applyAssistantResumeSelection(selection) {
    const item = selection || resumeVersions.localSelection();
    this._userContext = Object.assign({}, this._userContext || {}, {
      hasResume: !!item.hasResume,
      targetJob: item.currentTargetRole || (this._userContext && this._userContext.targetJob) || ''
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
    this.setData({ applicationResumeLoading: true });
    resumeVersions.fetchResumeVersions().then(selection => {
      this.applyApplicationResumeSelection(selection);
    }).catch(() => {
      this.applyApplicationResumeSelection(resumeVersions.localSelection());
    });
  },

  // ── 用户上下文（个性化） ────────────────────────────────────

  _buildUserContext() {
    try {
      const profile = wx.getStorageSync('userProfile') || {};
      const pref    = profile.jobPreference || {};
      const resume  = this.data.assistantResume || wx.getStorageSync('onlineResume') || {};
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
      const r = this.data.assistantResume || wx.getStorageSync('onlineResume') || {};
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
    try { wx.removeStorageSync(CACHE_KEY); } catch (e) {}
    const welcome = makeWelcome();
    this.setData({
      messages: [welcome],
      latestAiIdx: 0,
      loading: false,
      streaming: false,
      inputText: '',
      inputLen: 0
    });
    wx.nextTick(() => this._scrollTo());
  },

  // ── 输入 ──────────────────────────────────────────────────

  onInputChange(e) {
    this.setData({ inputText: e.detail.value, inputLen: e.detail.value.length });
  },

  onKeyboardHeight(e) {
    const height = Math.max(0, Number(e.detail && e.detail.height) || 0);
    if (height === this.data.keyboardHeight) return;
    this.setData({ keyboardHeight: height });
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
      this.openApplicationAssistant();
      return;
    }
    const url = e.currentTarget.dataset.url;
    if (url) {
      this.setData({ sidebarOpen: false });
      this._openToolUrl(url);
      return;
    }
    this.setData({ sidebarOpen: false, inputText: e.currentTarget.dataset.text || '' });
    wx.nextTick(() => this.sendMessage());
  },

  openApplicationAssistant() {
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
    this.loadApplicationResumeVersions();
  },

  closeApplicationAssistant() {
    this.setData({ showApplicationPanel: false });
  },

  selectApplicationJob(e) {
    const id = e.currentTarget.dataset.id || '';
    const job = this.data.applicationJobs.find(item => String(item.id) === String(id)) || {};
    this.setData({
      selectedApplicationJobId: id,
      applicationDraft: null,
      applicationJdText: job.description || job.notes || this.data.applicationJdText || ''
    });
  },

  selectApplicationQuestion(e) {
    this.setData({ selectedQuestionType: e.currentTarget.dataset.type || 'why_company', applicationDraft: null });
  },

  onApplicationJdInput(e) {
    this.setData({ applicationJdText: e.detail.value || '', applicationDraft: null });
  },

  onApplicationResumeChange(e) {
    const index = Number(e.detail.value || 0);
    const target = (this.data.applicationResumeVersions || [])[index];
    if (!target || String(target.id) === String(this.data.selectedApplicationResumeId)) return;
    this.setData({ applicationResumeLoading: true, applicationDraft: null });
    resumeVersions.loadResumeVersion(target.id, this.data.applicationResumeVersions).then(selection => {
      this.applyApplicationResumeSelection(selection);
    }).catch(() => {
      this.setData({ applicationResumeLoading: false });
      wx.showToast({ title: '简历加载失败', icon: 'none' });
    });
  },

  goApplicationResume() {
    this.setData({ showApplicationPanel: false });
    wx.navigateTo({ url: '/package-career/pages/resume/resume' });
  },

  generateApplicationDraft() {
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
    const resume = this.data.selectedApplicationResume || this.data.assistantResume || wx.getStorageSync('onlineResume') || {};
    const resumeMeta = {
      resumeName: this.data.selectedApplicationResumeName || resumeVersions.getResumeDisplayName(resume, '当前在线简历'),
      resumeVersionId: this.data.selectedApplicationResumeId || ''
    };
    this.setData({ applicationGenerating: true });
    appMaterials.generateDraftAi({
      job,
      questionType: this.data.selectedQuestionType,
      resume,
      resumeName: resumeMeta.resumeName,
      resumeVersionId: resumeMeta.resumeVersionId,
      jdText: this.data.applicationJdText
    }).then(material => {
      this.setData({ applicationDraft: Object.assign({}, material, resumeMeta), applicationGenerating: false });
      if (material && material.generationMode === 'template') {
        wx.showToast({ title: 'AI 暂不可用，已生成基础草稿', icon: 'none' });
      }
    }).catch(() => {
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
    if (!this.data.applicationDraft) return;
    appMaterials.saveMaterial(this.data.applicationDraft);
    this.setData({ applicationSavedMaterials: appMaterials.readMaterials().slice(0, 3) });
    wx.showToast({ title: '已保存到材料库', icon: 'success' });
  },

  copyApplicationDraft() {
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

  toggleSidebar() {
    const sidebarOpen = !this.data.sidebarOpen;
    const patch = { sidebarOpen };
    if (sidebarOpen) patch.showMoreTools = false;
    this.setData(patch);
  },

  toggleMoreTools() {
    this.setData({ showMoreTools: !this.data.showMoreTools });
  },

  onNewChat() {
    this._abortStream();
    this._history = [];
    this._streamingIdx = -1;
    this._lastRawText = '';
    try { wx.removeStorageSync(CACHE_KEY); } catch (e) {}
    const welcome = makeWelcome();
    this.setData({
      sidebarOpen: false,
      messages: [welcome],
      latestAiIdx: 0,
      loading: false,
      streaming: false,
      inputText: '',
      inputLen: 0
    });
    wx.nextTick(() => this._scrollTo());
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

  onSaveAnswer(e) {
    const msg = this.data.messages[e.currentTarget.dataset.index];
    const content = msg && (msg.content || msg.displayText);
    if (!content) return;
    const saved = wx.getStorageSync(SAVED_KEY) || [];
    const item = {
      id: Date.now(),
      title: this._buildSavedTitle(content),
      content,
      createdAt: fmtTime(Date.now())
    };
    wx.setStorageSync(SAVED_KEY, [item].concat(saved).slice(0, 30));
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
    this._ensureRuntimeState();
    const rawText = this.data.inputText.trim();
    if (!rawText || this.data.loading || this.data.streaming) return;
    if (!this._getToken()) {
      this._showLoginRequired('使用 AI 求职助手需要先登录');
      return;
    }
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
      (err)   => {
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
      }
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
      const content = extractChatContent(res).trim();
      if (!content) throw new Error(res && (res.message || res.error) || 'AI 返回为空');
      this._finishWithFallbackContent(content);
    }).catch((fallbackErr) => {
      console.error('[ai-assistant:fallback]', fallbackErr);
      this._flushAndFinalize(friendlyError(fallbackErr || err), true);
    });
  },

  _handleAuthExpired() {
    try {
      wx.removeStorageSync('token');
      wx.removeStorageSync('userProfile');
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.isLoggedIn = false;
        if (typeof app.refreshGlobalData === 'function') app.refreshGlobalData();
      }
    } catch (e) {}
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

  _buildSavedTitle(content) {
    const firstLine = String(content || '').replace(/\s+/g, ' ').slice(0, 24);
    return firstLine || 'AI 求职建议';
  },

  // ── 内部工具 ─────────────────────────────────────────────────

  _abortStream() {
    this._ensureRuntimeState();
    if (this._currentTask) {
      try { this._currentTask.abort(); } catch (e) {}
      this._currentTask = null;
    }
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
  },

  openAiCareer() {
    wx.switchTab({ url: '/pages/ai-career/ai-career' });
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
    try {
      const toSave = msgs
        .filter(m => !m.isStreaming)
        .map(m => ({ ...m, displayText: m.content, isStreaming: false }));
      wx.setStorageSync(CACHE_KEY, toSave.slice(-MAX_CACHE));
    } catch (e) {}
  }
});

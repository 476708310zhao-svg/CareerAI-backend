// pages/interview-dialog/interview-dialog.js

// 1. 引入模块
const api = require('../../utils/api.js');
const safePage = require('../../behaviors/safe-page');
const sendChatToDeepSeek = api.sendChatToDeepSeek;
const vipUtil  = require('../../utils/vip.js');
const config   = require('../../utils/config.js');
const API_BASE = config.API_BASE_URL;

// 录音管理器（全局单例）
let recorderMgr = null;

// 2. 常量配置
const MAX_QUESTIONS = 5;  // 面试问题数量 (你可以改为 5 或 10)
const SEPARATOR = "|||";  // 分隔符 (用于区分 点评 和 新问题)

Page({
  behaviors: [safePage],
  data: {
    // 基础参数
    jobId: '',
    userId: '',
    autoQuestion: '',
    interviewType: '',
    company: '',
    position: '',
    difficulty: '',

    // UI 数据
    chatList: [],
    userAnswer: '',
    loading: false,
    toView: '',

    // 状态控制
    isFinished: false,
    showReport: false,
    questionCount: 0,
    maxQDisplay: 5,

    // 报告得分
    reportScore: 0,
    scoreStars: [false, false, false, false, false],

    // 核心逻辑记录
    messageHistory: [],
    interviewRecords: [],
    finalSummary: '',
    currentLastQuestion: '面试开场',

    // 语音输入
    isRecording:    false,
    voiceLoading:   false,   // ASR 识别中
    voiceSupported: true,    // 设备是否支持录音
  },

  // --- 页面卸载：清理录音等资源 ---
  onUnload: function() {
    if (recorderMgr && this.data.isRecording) {
      try { recorderMgr.stop(); } catch (_) {}
    }
    if (this._recTimer) clearTimeout(this._recTimer);
  },

  // --- 页面加载 ---
  onLoad: function(options) {
    // 获取场景参数
    const interviewType = options.type ? decodeURIComponent(options.type) : '';
    const company = options.company ? decodeURIComponent(options.company) : '';
    const position = options.position ? decodeURIComponent(options.position) : '';
    const difficulty = options.difficulty ? decodeURIComponent(options.difficulty) : '';
    const questionCount = options.questionCount ? parseInt(options.questionCount) : MAX_QUESTIONS;
    const autoQuestion = options.autoQuestion ? decodeURIComponent(options.autoQuestion) : '';

    this.setData({
      jobId: options.jobId || 'test-job',
      userId: options.userId || 'test-user',
      interviewType,
      company,
      position,
      difficulty,
      autoQuestion
    });

    // 动态设置题目数量
    if (questionCount && questionCount > 0) {
      this.maxQuestions = questionCount;
    } else {
      this.maxQuestions = MAX_QUESTIONS;
    }
    this.setData({ maxQDisplay: this.maxQuestions });

    // VIP 权限检查：免费用户每日限 2 次
    if (!vipUtil.checkDailyLimit('ai_interview', 2, 'AI面试')) {
      setTimeout(() => wx.navigateBack(), 100);
      return;
    }

    setTimeout(() => {
      this.initInterview();
    }, 100);
  },

  // --- 1. 初始化面试 ---
  initInterview: function() {
    // 重置所有状态
    this.setData({
      chatList: [],
      messageHistory: [],
      interviewRecords: [],
      finalSummary: '',
      isFinished: false,
      questionCount: 0,
      showReport: false,
      loading: true,
      userAnswer: ''
    });

    const maxQ = this.maxQuestions || MAX_QUESTIONS;

    // 构建场景化提示词
    let sceneDesc = '';
    if (this.data.company && this.data.company !== '未指定公司') {
      sceneDesc += `目标公司：${this.data.company}。`;
    }
    if (this.data.position) {
      sceneDesc += `目标岗位：${this.data.position}。`;
    }

    // 面试类型映射
    const typeMap = {
      'behavior': '行为面试（重点考察STAR法则、团队协作、领导力等软技能）',
      'technical': '技术面试（重点考察编程能力、算法、系统设计等硬技能）',
      'case': '案例面试（重点考察分析能力、商业思维、解决问题的方法论）',
      'product': '产品面试（重点考察产品思维、用户洞察、需求分析）'
    };
    if (this.data.interviewType && typeMap[this.data.interviewType]) {
      sceneDesc += `面试类型：${typeMap[this.data.interviewType]}。`;
    }

    const diffMap = { 'easy': '入门级（适合应届生）', 'medium': '中级（1-3年经验）', 'hard': '高级（3年以上经验）' };
    if (this.data.difficulty && diffMap[this.data.difficulty]) {
      sceneDesc += `难度级别：${diffMap[this.data.difficulty]}。`;
    }

    // 构建第一条指令
    let firstInstruction = '1. 首先自我介绍并提出第1个问题。';
    if (this.data.autoQuestion) {
      firstInstruction = `1. 请直接向候选人提出这个问题："${this.data.autoQuestion}"，不要废话。`;
    }

    // 构造系统提示词 — 使用 JSON 格式要求，彻底解决分隔符解析脆弱问题
    const systemPrompt = `你是一位专业的面试官。${sceneDesc ? '\n面试场景：' + sceneDesc : ''}
本次面试共${maxQ}个问题。请按以下规则与候选人对话：
${firstInstruction}
2. 当用户回答后，你必须严格按照以下JSON格式输出（不要输出任何JSON之外的内容）：
{"feedback":"针对刚才回答的专业点评(指出优缺点)","question":"下一个面试问题"}
3. 不要在JSON外面加任何Markdown标记如\`\`\`json等。
4. 每次只问一个问题。
5. 如果收到【生成总结】指令，请忽略JSON格式，直接输出纯文本的综合评分（0-100分）、各维度得分（语言表达、内容逻辑、专业知识、应变能力、沟通表达各多少分）、优势、不足和录用建议。`;

    const history = [{ role: 'system', content: systemPrompt }];
    this.setData({ messageHistory: history });

    // 发起开场请求
    this.callAI(history, 'init');
  },

  // --- 2. 提交回答 ---
  submitAnswer: function() {
    const text = this.data.userAnswer.trim();
    if (!text || this.data.loading) return;

    // A. 上屏用户消息
    const newChat = [...this.data.chatList, { type: 'user', content: text }];
    const newHistory = [...this.data.messageHistory, { role: 'user', content: text }];

    // B. 预存记录 (先占位)
    const currentRec = {
      question: this.data.currentLastQuestion,
      answer: text,
      feedback: 'AI 正在生成点评...'
    };
    const newRecords = [...this.data.interviewRecords, currentRec];

    this.setData({
      chatList: newChat,
      messageHistory: newHistory,
      interviewRecords: newRecords,
      userAnswer: '',
      loading: true,
      toView: `msg-${newChat.length - 1}`
    });

    // C. 判断流程
    const maxQ = this.maxQuestions || MAX_QUESTIONS;
    if (this.data.questionCount >= maxQ) {
      // 最后一次回答：输出结构化 JSON 总结报告
      const endPrompt = `这是用户的最后一个回答，请严格按以下JSON格式输出本次面试总结（不要输出任何JSON之外的内容，不要加markdown代码块）：
{"totalScore":85,"dimensions":[{"name":"语言表达","score":82},{"name":"内容逻辑","score":88},{"name":"专业知识","score":85},{"name":"应变能力","score":80},{"name":"沟通表达","score":83}],"strengths":"候选人的主要优势","weaknesses":"候选人的主要不足","suggestion":"录用建议","summary":"完整的面试综合总结正文，包含整体表现评价和改进方向"}
所有分数为0-100整数，summary字段为面向候选人展示的完整总结文字。`;

      const endHistory = [...newHistory, { role: 'system', content: endPrompt }];
      this.callAI(endHistory, 'summary');
    } else {
      // 继续下一题
      this.callAI(newHistory, 'continue');
    }
  },

  // --- 3. 统一 API 调用中心 ---
  callAI: function(history, mode) {
    if (!sendChatToDeepSeek) {
      console.error('API函数未找到，请检查utils/api.js');
      this.setData({ loading: false });
      return;
    }

    sendChatToDeepSeek(history).then(res => {
      // 容错处理：确保 content 存在
      const content = res.choices?.[0]?.message?.content || 'AI 暂时无法响应，请重试。';

      if (mode === 'summary') {
        this.handleSummary(content);
      } else {
        this.handleResponse(content, mode);
      }

    }).catch(err => {
      console.error('AI请求失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '网络请求超时', icon: 'none' });
    });
  },

  // --- 4. 处理常规回复（多策略解析：JSON → 分隔符 → 智能切割 → 兜底）---
  handleResponse: function(content, mode) {
    let feedback = '';
    let nextQuestion = content;

    const records = [...this.data.interviewRecords];
    const lastIndex = records.length - 1;

    if (mode !== 'init' && lastIndex >= 0) {
      // 策略1：尝试 JSON 解析
      const parsed = this._tryParseJSON(content);
      if (parsed) {
        feedback = parsed.feedback || '';
        nextQuestion = parsed.question || parsed.next_question || '';
      }
      // 策略2：旧版分隔符兜底
      else if (content.includes(SEPARATOR)) {
        const parts = content.split(SEPARATOR);
        feedback = parts[0].trim();
        nextQuestion = parts[1].trim();
      }
      // 策略3：智能切割 — 按最后一个问号+换行拆分
      else {
        const qMatch = content.match(/([\s\S]+[。.]\s*)\n+([\s\S]*\?|[\s\S]*？)$/);
        if (qMatch) {
          feedback = qMatch[1].trim();
          nextQuestion = qMatch[2].trim();
        } else {
          feedback = '（AI未按格式输出，完整回复已显示在对话中）';
        }
      }

      // 清理 Markdown 标记
      feedback = feedback.replace(/\*\*/g, '').replace(/^点评[:：]\s*/, '').trim();
      nextQuestion = nextQuestion.replace(/\*\*/g, '').trim();

      records[lastIndex].feedback = feedback || '暂无详细点评';
      this.setData({ interviewRecords: records });
    } else if (mode === 'init') {
      // 开场回复也可能是 JSON 格式
      const parsed = this._tryParseJSON(content);
      if (parsed && parsed.question) {
        nextQuestion = parsed.question;
      }
    }

    // 更新聊天界面
    const newChat = [...this.data.chatList];

    if (feedback && !feedback.startsWith('（')) {
      newChat.push({ type: 'feedback', content: feedback });
    }

    newChat.push({ type: 'ai', content: nextQuestion });

    const newHistory = [...this.data.messageHistory, { role: 'assistant', content: content }];

    this.setData({
      loading: false,
      chatList: newChat,
      messageHistory: newHistory,
      questionCount: this.data.questionCount + 1,
      currentLastQuestion: nextQuestion,
      toView: `msg-${newChat.length - 1}`
    });
  },

  // JSON 解析工具 — 容忍 ```json 包裹和不完整格式
  _tryParseJSON: function(text) {
    try {
      // 去除可能的 markdown 代码块包裹
      let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      // 尝试提取第一个 { ... } 块
      const braceMatch = cleaned.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        const obj = JSON.parse(braceMatch[0]);
        if (obj.feedback || obj.question || obj.next_question) return obj;
      }
    } catch (e) { /* ignore */ }
    return null;
  },

  // --- 5. 处理总结回复 ---
  handleSummary: function(content) {
    const records = [...this.data.interviewRecords];
    if (records.length > 0) {
      records[records.length - 1].feedback = '（详情见综合总结）';
    }

    // 策略1：优先解析结构化 JSON（新格式，评分精确）
    let finalReport = content.replace(/\*\*/g, '').trim();
    let reportData;
    const jsonData = this._tryParseJSON(content);
    if (jsonData && typeof jsonData.totalScore === 'number') {
      finalReport = (jsonData.summary || content).replace(/\*\*/g, '').trim();
      reportData = {
        totalScore: Math.min(100, Math.max(0, jsonData.totalScore)),
        dimensions: Array.isArray(jsonData.dimensions) ? jsonData.dimensions : [],
        strengths: jsonData.strengths || '',
        weaknesses: jsonData.weaknesses || '',
        suggestion: jsonData.suggestion || '',
        qaScores: records.map(() => Math.min(100, Math.max(40, jsonData.totalScore + Math.floor(Math.random() * 20) - 10)))
      };
    } else {
      // 策略2：Regex 兜底（兼容旧格式）
      reportData = this.parseReportScores(finalReport, records);
    }

    const newChat = [...this.data.chatList];
    newChat.push({ type: 'summary', content: finalReport });

    const scoreStars = [1, 2, 3, 4, 5].map(s => reportData.totalScore >= s * 20);

    this.setData({
      loading: false,
      isFinished: true,
      chatList: newChat,
      interviewRecords: records,
      finalSummary: finalReport,
      reportScore: reportData.totalScore,
      scoreStars,
      toView: `msg-${newChat.length - 1}`,
      showReport: false
    });

    // 将结构化报告存入缓存，供 ai-report 页面读取
    const reportCache = {
      id: Date.now().toString(),
      role: this.data.position || '综合面试',
      company: this.data.company || '',
      type: this.data.interviewType || '',
      totalScore: reportData.totalScore,
      dimensions: reportData.dimensions,
      summary: finalReport,
      qaList: records.map((r, i) => ({
        q: r.question,
        a: r.answer,
        feedback: r.feedback,
        score: reportData.qaScores[i] || 70
      })),
      strengths: reportData.strengths,
      weaknesses: reportData.weaknesses,
      suggestion: reportData.suggestion,
      createTime: new Date().toLocaleDateString('zh-CN')
    };

    // 存储报告：唯一 key + 向后兼容的 lastAiReport
    wx.setStorageSync('lastAiReport', reportCache);
    wx.setStorageSync('aiReport_' + reportCache.id, reportCache);

    // 同步写入面试历史列表，供 ai-history 页面读取
    const historyList = wx.getStorageSync('interviewHistory') || [];
    historyList.unshift({
      id: reportCache.id,
      position: this.data.position || '综合面试',
      company: this.data.company || '',
      interviewType: this.data.interviewType || '',
      difficulty: this.data.difficulty || '',
      score: reportData.totalScore,
      questionCount: records.length,
      timestamp: Date.now(),
      reportKey: 'aiReport_' + reportCache.id,
      tags: [
        this.data.position || '面试',
        this.data.interviewType === 'technical' ? '技术面' : (this.data.interviewType === 'behavior' ? '行为面' : (this.data.interviewType || '综合'))
      ].filter(Boolean)
    });
    // 最多保留50条
    if (historyList.length > 50) historyList.splice(50);
    wx.setStorageSync('interviewHistory', historyList);

    // 延迟跳转到报告页
    setTimeout(() => {
      wx.navigateTo({ url: '/pages/ai-report/ai-report' });
    }, 600);
  },

  // --- 5.1 解析AI报告中的评分数据 ---
  parseReportScores: function(reportText, records) {
    // 尝试从文本中提取分数（如"综合评分：85分"）
    let totalScore = 75;
    const scoreMatch = reportText.match(/综合[评得打]?分[：:]\s*(\d+)/);
    if (scoreMatch) totalScore = parseInt(scoreMatch[1]);

    // 提取各维度分数
    const dimPatterns = [
      { name: '语言表达', pattern: /语言表达[：:]\s*(\d+)/ },
      { name: '内容逻辑', pattern: /内容逻辑[：:]\s*(\d+)|逻辑[思维能力]*[：:]\s*(\d+)/ },
      { name: '专业知识', pattern: /专业[知识技能]*[：:]\s*(\d+)/ },
      { name: '应变能力', pattern: /应变[能力]*[：:]\s*(\d+)/ },
      { name: '沟通表达', pattern: /沟通[表达能力]*[：:]\s*(\d+)/ }
    ];

    const dimensions = dimPatterns.map(d => {
      const m = reportText.match(d.pattern);
      const score = m ? parseInt(m[1] || m[2]) : (totalScore + Math.floor(Math.random() * 16) - 8);
      return { name: d.name, score: Math.min(100, Math.max(30, score)) };
    });

    // 提取优势和不足
    let strengths = '', weaknesses = '', suggestion = '';
    const strMatch = reportText.match(/优[势点势][：:]([\s\S]*?)(?=不足|劣势|建议|改进|$)/);
    if (strMatch) strengths = strMatch[1].trim().substring(0, 200);
    const weakMatch = reportText.match(/(?:不足|劣势|改进)[：:]([\s\S]*?)(?=建议|录用|$)/);
    if (weakMatch) weaknesses = weakMatch[1].trim().substring(0, 200);
    const sugMatch = reportText.match(/(?:建议|录用建议)[：:]([\s\S]*?)$/);
    if (sugMatch) suggestion = sugMatch[1].trim().substring(0, 200);

    // 每题评分（基于总分浮动）
    const qaScores = records.map(() => {
      return Math.min(100, Math.max(40, totalScore + Math.floor(Math.random() * 20) - 10));
    });

    return { totalScore, dimensions, strengths, weaknesses, suggestion, qaScores };
  },

  // --- 6. 交互辅助 ---
  onAnswerInput: function(e) {
    this.setData({ userAnswer: e.detail.value });
  },

  // --- 7. 语音输入 ---
  _initRecorder: function() {
    if (recorderMgr) return;
    recorderMgr = wx.getRecorderManager();

    recorderMgr.onStop((res) => {
      if (this._unmounted) return;
      if (!res.tempFilePath) {
        this.setData({ isRecording: false, voiceLoading: false });
        return;
      }
      this.setData({ isRecording: false, voiceLoading: true });
      this._uploadASR(res.tempFilePath);
    });

    recorderMgr.onError((err) => {
      console.error('[ASR] recorder error', err);
      this.setData({ isRecording: false, voiceLoading: false });
      wx.showToast({ title: '录音失败，请重试', icon: 'none' });
    });
  },

  toggleVoice: function() {
    if (this.data.voiceLoading) return; // 识别中禁止操作

    if (this.data.isRecording) {
      // 停止录音 → 触发 onStop 上传
      recorderMgr && recorderMgr.stop();
    } else {
      // 申请麦克风权限并开始录音
      wx.getSetting({
        success: (res) => {
          const canRecord = res.authSetting['scope.record'];
          if (canRecord === false) {
            wx.openSetting({ success: () => {} });
            return;
          }
          this._startRecord();
        }
      });
    }
  },

  _startRecord: function() {
    this._initRecorder();
    recorderMgr.start({
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3',
    });
    this.setData({ isRecording: true });
    // 自动最长60秒停止
    this._recTimer = setTimeout(() => {
      if (this.data.isRecording) {
        recorderMgr && recorderMgr.stop();
      }
    }, 58000);
  },

  _uploadASR: function(filePath) {
    const token = wx.getStorageSync('token') || '';
    wx.uploadFile({
      url: API_BASE + '/api/asr/transcribe',
      filePath,
      name: 'audio',
      formData: { engModel: '16k_zh' },
      header: token ? { Authorization: 'Bearer ' + token } : {},
      success: (res) => {
        if (this._unmounted) return;
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (data.text && !data.mock) {
            // Append recognised text to existing input
            const cur = this.data.userAnswer;
            this.setData({ userAnswer: (cur ? cur + ' ' : '') + data.text.trim() });
          } else if (data.mock) {
            wx.showToast({ title: 'ASR未配置，请文字输入', icon: 'none', duration: 2500 });
          } else {
            wx.showToast({ title: '识别失败，请重试', icon: 'none' });
          }
        } catch (_) {
          wx.showToast({ title: '识别解析失败', icon: 'none' });
        }
        this.setData({ voiceLoading: false });
      },
      fail: () => {
        if (!this._unmounted) {
          this.setData({ voiceLoading: false });
          wx.showToast({ title: '上传失败，请检查网络', icon: 'none' });
        }
      }
    });
  },

  // 重新面试：返回设置页
  restartInterview: function() {
    wx.navigateBack();
  },

  openReport: function() {
    wx.navigateTo({ url: '/pages/ai-report/ai-report' });
  },

  closeReport: function() {
    this.setData({ showReport: false });
  }
});

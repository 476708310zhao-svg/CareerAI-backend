// pages/audio-review/audio-review.js
const api = require('../../utils/api.js');
const sendChatToDeepSeek = api.sendChatToDeepSeek;
const config   = require('../../utils/config.js');
const API_BASE = config.API_BASE_URL;

let recorderMgr = null;
let audioCtx    = null;

Page({
  data: {
    // State machine: 'idle' | 'recording' | 'recorded' | 'transcribing' | 'analysing' | 'done'
    phase: 'idle',

    // Recording
    recordSeconds:  0,
    maxSeconds:     120,
    tempFilePath:   '',
    audioProgress:  0,    // 0-100 for timer bar

    // Transcript + analysis
    transcript:   '',
    question:     '',     // user's optional context question
    analysis:     null,   // { fluency, content, confidence, tips[] }

    // Session history
    history:      [],
    showHistory:  false,
  },

  onLoad() {
    const history = wx.getStorageSync('audioReviewHistory') || [];
    this.setData({ history });
  },

  onUnload() {
    this._stopTimer();
    if (recorderMgr && this.data.phase === 'recording') {
      try { recorderMgr.stop(); } catch (_) {}
    }
    if (audioCtx) {
      try { audioCtx.stop(); } catch (_) {}
    }
  },

  /* ──────────────────────────────────────────
     Recording
  ────────────────────────────────────────── */
  startRecord() {
    if (this.data.phase !== 'idle' && this.data.phase !== 'recorded') return;

    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record'] === false) {
          wx.openSetting();
          return;
        }
        this._doStartRecord();
      }
    });
  },

  _doStartRecord() {
    if (!recorderMgr) {
      recorderMgr = wx.getRecorderManager();

      recorderMgr.onStop((res) => {
        this._stopTimer();
        if (!res.tempFilePath) {
          this.setData({ phase: 'idle' });
          return;
        }
        this.setData({ phase: 'recorded', tempFilePath: res.tempFilePath, audioProgress: 100 });
      });

      recorderMgr.onError(() => {
        this._stopTimer();
        this.setData({ phase: 'idle' });
        wx.showToast({ title: '录音出错，请重试', icon: 'none' });
      });
    }

    recorderMgr.start({
      duration: this.data.maxSeconds * 1000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3',
    });

    this.setData({ phase: 'recording', recordSeconds: 0, tempFilePath: '', audioProgress: 0 });
    this._startTimer();
  },

  stopRecord() {
    if (this.data.phase !== 'recording') return;
    recorderMgr && recorderMgr.stop();
    this._stopTimer();
  },

  _startTimer() {
    this._stopTimer();
    this._timer = setInterval(() => {
      const s = this.data.recordSeconds + 1;
      const pct = Math.round((s / this.data.maxSeconds) * 100);
      this.setData({ recordSeconds: s, audioProgress: pct });
      if (s >= this.data.maxSeconds) {
        this.stopRecord();
      }
    }, 1000);
  },
  _stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  /* ──────────────────────────────────────────
     Play back
  ────────────────────────────────────────── */
  playback() {
    if (!this.data.tempFilePath) return;
    if (!audioCtx) audioCtx = wx.createInnerAudioContext();
    audioCtx.src = this.data.tempFilePath;
    audioCtx.play();
    wx.showToast({ title: '播放中', icon: 'none', duration: 1500 });
  },

  discard() {
    wx.showModal({
      title: '丢弃录音',
      content: '确定放弃本次录音重新开始？',
      success: (res) => {
        if (res.confirm) this.setData({ phase: 'idle', tempFilePath: '', recordSeconds: 0, audioProgress: 0, transcript: '', analysis: null });
      }
    });
  },

  /* ──────────────────────────────────────────
     ASR Transcription
  ────────────────────────────────────────── */
  transcribeAudio() {
    if (!this.data.tempFilePath) return;
    this.setData({ phase: 'transcribing' });

    const token = wx.getStorageSync('token') || '';
    wx.uploadFile({
      url: API_BASE + '/api/asr/transcribe',
      filePath: this.data.tempFilePath,
      name: 'audio',
      formData: { engModel: '16k_zh' },
      header: token ? { Authorization: 'Bearer ' + token } : {},
      success: (res) => {
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (data.text) {
            this.setData({ transcript: data.text });
            if (data.mock) {
              wx.showToast({ title: 'ASR未配置，请手动填写文字', icon: 'none', duration: 3000 });
              this.setData({ phase: 'recorded' });
            } else {
              this.setData({ phase: 'analysing' });
              this._analyseTranscript(data.text);
            }
          } else {
            this.setData({ phase: 'recorded' });
            wx.showToast({ title: '识别失败，请重试', icon: 'none' });
          }
        } catch (_) {
          this.setData({ phase: 'recorded' });
          wx.showToast({ title: '识别解析失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ phase: 'recorded' });
        wx.showToast({ title: '上传失败，请检查网络', icon: 'none' });
      }
    });
  },

  onTranscriptInput(e) {
    this.setData({ transcript: e.detail.value });
  },

  onQuestionInput(e) {
    this.setData({ question: e.detail.value });
  },

  // Manual: skip ASR and directly analyse typed/pasted text
  analyseManual() {
    const t = this.data.transcript.trim();
    if (!t) { wx.showToast({ title: '请先输入或录音转文字', icon: 'none' }); return; }
    this.setData({ phase: 'analysing' });
    this._analyseTranscript(t);
  },

  /* ──────────────────────────────────────────
     AI Analysis
  ────────────────────────────────────────── */
  _analyseTranscript(text) {
    const question = this.data.question.trim();
    const context  = question ? `面试题目："${question}"\n\n` : '';
    const prompt   = `${context}候选人的面试回答转录文字：\n"${text}"\n\n请从以下维度分析这段面试回答，并严格输出以下JSON格式（不要加代码块标记）：
{"fluency":{"score":85,"comment":"..."},"content":{"score":80,"comment":"..."},"confidence":{"score":78,"comment":"..."},"overall":88,"tips":["改进建议1","改进建议2","改进建议3"],"summary":"一句话总体评价"}
- fluency: 表达流畅度（语速、停顿、口头禅）
- content: 内容质量（逻辑、结构、具体性）
- confidence: 自信度（语气、确定性）
- overall: 综合评分 0-100
- tips: 3条具体改进建议
- summary: 简短总体评价`;

    sendChatToDeepSeek([
      { role: 'system', content: '你是一位专业面试教练，擅长通过分析面试者的语言表达给出精准反馈。' },
      { role: 'user',   content: prompt }
    ]).then(res => {
      const raw = res.choices?.[0]?.message?.content || '';
      let analysis = null;
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) analysis = JSON.parse(match[0]);
      } catch (_) {}

      if (!analysis) {
        analysis = {
          fluency:    { score: 75, comment: '无法解析结构化数据' },
          content:    { score: 75, comment: '' },
          confidence: { score: 75, comment: '' },
          overall:    75,
          tips:       ['请重试或手动输入文字后再分析'],
          summary:    raw.slice(0, 100),
        };
      }

      // Save to history
      const entry = {
        id:         'ar_' + Date.now(),
        question:   this.data.question,
        transcript: this.data.transcript,
        analysis,
        date:       new Date().toLocaleDateString('zh-CN'),
        duration:   this.data.recordSeconds,
      };
      const history = [entry, ...(wx.getStorageSync('audioReviewHistory') || [])].slice(0, 30);
      wx.setStorageSync('audioReviewHistory', history);

      this.setData({ analysis, phase: 'done', history });
    }).catch(() => {
      this.setData({ phase: 'recorded' });
      wx.showToast({ title: 'AI 分析失败，请重试', icon: 'none' });
    });
  },

  /* ──────────────────────────────────────────
     UI helpers
  ────────────────────────────────────────── */
  restart() {
    this.setData({ phase: 'idle', tempFilePath: '', recordSeconds: 0, audioProgress: 0, transcript: '', analysis: null, question: '' });
  },

  copyTranscript() {
    if (!this.data.transcript) return;
    wx.setClipboardData({ data: this.data.transcript, success: () => wx.showToast({ title: '已复制转录文字', icon: 'success' }) });
  },

  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory });
  },

  formatDur(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  },
});

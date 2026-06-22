// pages/project-review/project-review.js
const api = require('../../../utils/api.js');
const sendChatToDeepSeek = api.sendChatToDeepSeek;
const safePage = require('../../behaviors/safe-page');
const vip = require('../../../utils/vip.js');

const HISTORY_KEY = 'projectReviewHistory';

Page({
  behaviors: [safePage],
  data: {
    step: 'input',   // 'input' | 'loading' | 'result'

    // Form
    raw:         '',    // user's original project text
    targetRole:  '',    // optional: target job role
    highlights:  '',    // optional: specific aspects to focus on
    rolePresets: ['产品经理', 'Data Analyst', '软件工程师', '咨询分析师'],
    focusPresets: ['量化结果', '技术栈表达', '领导力贡献', '业务影响'],

    // Loading
    loadingTip:  '读取项目经历与关键信息',
    loadingStep: 0,

    // Result
    result: null,
    /*  result shape:
        {
          score: 72,
          scoreComment: '...',
          strengths: ['...'],
          weaknesses: ['...'],
          star: { situation: '', task: '', action: '', result: '' },
          rewrite: '...',   // full improved version
          bullets: ['...'], // 3 resume bullet points
          metrics: ['...'], // suggested quantification
        }
    */

    // History
    history: [],
    showHistory: false,
    activeHistIdx: -1,
  },

  onLoad(options) {
    const history = wx.getStorageSync(HISTORY_KEY) || [];
    this.setData({ history });

    // Prefill from resume page if raw text passed
    if (options.raw) {
      this.setData({ raw: decodeURIComponent(options.raw) });
    }
  },

  onUnload() {
    this._clearTimer();
  },

  /* ──────────────────────────────────────────
     Input handlers
  ────────────────────────────────────────── */
  onRawInput(e)        { this.setData({ raw: e.detail.value }); },
  onRoleInput(e)       { this.setData({ targetRole: e.detail.value }); },
  onHighlightsInput(e) { this.setData({ highlights: e.detail.value }); },

  useRolePreset(e) {
    const value = e.currentTarget.dataset.value || '';
    this.setData({ targetRole: value });
  },

  appendHighlightPreset(e) {
    const value = e.currentTarget.dataset.value || '';
    if (!value) return;
    const parts = (this.data.highlights || '')
      .split(/[、,，]/)
      .map(item => item.trim())
      .filter(Boolean);
    if (!parts.includes(value)) parts.push(value);
    this.setData({ highlights: parts.join('、') });
  },

  /* ──────────────────────────────────────────
     Generate
  ────────────────────────────────────────── */
  onGenerate() {
    if (!vip.checkDailyLimit('project_review', 1, '项目经历优化')) return;
    const raw = this.data.raw.trim();
    if (raw.length < 30) {
      wx.showToast({ title: '请输入至少30字的项目描述', icon: 'none' }); return;
    }
    this._startGenerate(raw);
  },

  _startGenerate(raw) {
    this._safe({ step: 'loading', loadingStep: 0, loadingTip: '读取项目经历与关键信息' });
    this._startLoadingAnim();

    const role       = this.data.targetRole.trim();
    const highlights = this.data.highlights.trim();

    const roleCtx    = role       ? `目标岗位：${role}。` : '';
    const hlCtx      = highlights ? `用户希望重点优化：${highlights}。` : '';

    const prompt = `请分析以下简历项目描述，并严格按JSON格式输出优化报告（不要加代码块标记）：

原始项目描述：
"${raw}"

${roleCtx}${hlCtx}

输出格式（所有字段必填，arrays至少3项）：
{"score":72,"scoreComment":"一句话说明当前分数的原因","strengths":["优点1","优点2","优点3"],"weaknesses":["不足1","不足2","不足3"],"star":{"situation":"补全的情境背景","task":"目标与任务","action":"具体行动，至少3个动词","result":"可量化的结果"},"rewrite":"完整的优化版项目描述（150-250字，包含背景/目标/行动/结果，结果必须有数字）","bullets":["简历bullet point 1（以动词开头，含数据）","简历bullet point 2","简历bullet point 3"],"metrics":["建议量化指标1：如提升XX%","建议量化指标2","建议量化指标3"]}

评分标准（0-100）：
- 结构清晰（STAR）: 25分
- 量化结果: 25分
- 动词力度: 25分
- 与${role || '目标岗位'}的相关性: 25分`;

    sendChatToDeepSeek([
      { role: 'system', content: '你是一位顶级简历优化顾问，专注帮助留学生将简历项目经历改写为具有冲击力的版本。直接输出JSON，不要输出任何JSON以外的文字。' },
      { role: 'user',   content: prompt }
    ]).then(res => {
      this._clearTimer();
      const text = res.choices?.[0]?.message?.content || '';
      let result = null;
      try {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) result = JSON.parse(m[0]);
      } catch (_) {}

      if (!result) {
        result = {
          score: 60,
          scoreComment: 'AI 返回格式异常，以下为原始建议',
          strengths:  ['请重试'],
          weaknesses: ['解析失败'],
          star: { situation: '', task: '', action: '', result: '' },
          rewrite: text.slice(0, 500),
          bullets: [],
          metrics: [],
        };
      }

      // Save to history
      const entry = {
        id:        'pr_' + Date.now(),
        raw:       raw.slice(0, 80),
        role:      this.data.targetRole,
        score:     result.score,
        result,
        date:      new Date().toLocaleDateString('zh-CN'),
      };
      const history = [entry, ...(wx.getStorageSync(HISTORY_KEY) || [])].slice(0, 20);
      wx.setStorageSync(HISTORY_KEY, history);

      this._safe({ step: 'result', result, history });
    }).catch(() => {
      this._clearTimer();
      this._safe({ step: 'input' });
      wx.showToast({ title: 'AI 生成失败，请重试', icon: 'none' });
    });
  },

  _startLoadingAnim() {
    this._clearTimer();
    const tips = [
      '读取项目经历与关键信息',
      '梳理 STAR 结构与表达逻辑',
      '提炼成果数据与业务影响',
      '生成简历级优化版本'
    ];
    let step = 0;
    this._loadTimer = setInterval(() => {
      if (step >= tips.length - 1) return;
      step += 1;
      if (!this._unmounted) this.setData({ loadingStep: step, loadingTip: tips[step] });
    }, 2200);
  },
  _clearTimer() { if (this._loadTimer) { clearInterval(this._loadTimer); this._loadTimer = null; } },

  /* ──────────────────────────────────────────
     Result actions
  ────────────────────────────────────────── */
  copyRewrite() {
    const txt = this.data.result?.rewrite;
    if (!txt) return;
    wx.setClipboardData({ data: txt, success: () => wx.showToast({ title: '已复制优化版本', icon: 'success' }) });
  },

  copyBullets() {
    const bullets = this.data.result?.bullets || [];
    if (!bullets.length) return;
    wx.setClipboardData({ data: bullets.map((b, i) => `• ${b}`).join('\n'), success: () => wx.showToast({ title: '已复制 Bullet Points', icon: 'success' }) });
  },

  restart() {
    this._safe({ step: 'input', result: null });
  },

  optimiseAgain() {
    // Use rewrite as new raw for a second-pass optimisation
    const rewrite = this.data.result?.rewrite;
    if (rewrite) {
      this._safe({ raw: rewrite, result: null });
      this._startGenerate(rewrite);
    }
  },

  /* ──────────────────────────────────────────
     History
  ────────────────────────────────────────── */
  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory });
  },

  loadHistory(e) {
    const idx = e.currentTarget.dataset.idx;
    const entry = this.data.history[idx];
    if (!entry) return;
    this.setData({ raw: entry.raw, result: entry.result, step: 'result', showHistory: false });
  },
});

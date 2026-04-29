// pages/skill-pathways/skill-pathways.js
const api = require('../../utils/api.js');
const sendChatToDeepSeek = api.sendChatToDeepSeek;
const safePage = require('../../behaviors/safe-page');

const HISTORY_KEY = 'skillPathwaysHistory';

const ROLES = [
  { id: 'da',         label: 'Data Analyst',    icon: '📊', color: '#3B82F6', bg: '#EFF6FF', desc: '数据分析 · BI · SQL' },
  { id: 'ds',         label: 'Data Scientist',   icon: '🔬', color: '#8B5CF6', bg: '#F5F3FF', desc: '机器学习 · Python · 建模' },
  { id: 'pm',         label: '产品经理 PM',       icon: '🎯', color: '#EC4899', bg: '#FDF2F8', desc: '产品设计 · 需求分析 · 增长' },
  { id: 'swe',        label: 'Software Engineer', icon: '💻', color: '#059669', bg: '#ECFDF5', desc: '全栈开发 · 系统设计 · 算法' },
  { id: 'consulting', label: '管理咨询',           icon: '📋', color: '#D97706', bg: '#FFFBEB', desc: '案例面试 · 战略分析 · PPT' },
  { id: 'finance',    label: '金融 / IB',          icon: '💰', color: '#EF4444', bg: '#FEF2F2', desc: '建模 · 估值 · CFA · SA' },
  { id: 'ops',        label: '运营增长',            icon: '🚀', color: '#6366F1', bg: '#EEF2FF', desc: '用户增长 · 内容运营 · 数据' },
  { id: 'ux',         label: 'UX / 设计',          icon: '🎨', color: '#F59E0B', bg: '#FFFBEB', desc: '用户研究 · 原型 · Figma' },
];

const LEVELS = [
  { id: 'zero',    label: '零基础',    desc: '完全新手，刚刚入门' },
  { id: 'student', label: '在校生',    desc: '有课程学习，缺实践经验' },
  { id: 'intern',  label: '有实习',    desc: '有1-2段相关实习经验' },
  { id: 'working', label: '转行者',    desc: '有工作经验，想转到此方向' },
];

const TIMELINES = [
  { id: '3m',  label: '3个月',  desc: '快速入门冲刺' },
  { id: '6m',  label: '6个月',  desc: '系统学习准备' },
  { id: '12m', label: '12个月', desc: '深度规划发展' },
];

Page({
  behaviors: [safePage],
  data: {
    step: 'input',   // 'input' | 'loading' | 'result'

    roles:     ROLES,
    levels:    LEVELS,
    timelines: TIMELINES,

    selectedRole:     '',
    selectedLevel:    'student',
    selectedTimeline: '6m',
    background:       '',    // optional: user's current skills/education

    loadingTip:  '正在分析岗位要求...',
    loadingStep: 0,

    result: null,
    /*  result shape:
        {
          summary: '...',
          coreSkills: [{ name, priority: 'must'|'good'|'nice', desc, resources: [] }],
          monthPlan: [{ month: '第1-2个月', title: '...', tasks: [], milestone: '...' }],
          projects:  [{ title, desc, outcome }],
          certs:     [{ name, why, link: '' }],
          tips:      ['...'],
        }
    */

    history: [],
    showHistory: false,
  },

  onLoad(options) {
    const history = wx.getStorageSync(HISTORY_KEY) || [];
    this.setData({ history });

    // Prefill from URL (e.g. from career-planner)
    if (options.role) {
      const r = ROLES.find(x => x.id === options.role);
      if (r) this.setData({ selectedRole: options.role });
    }

    // Prefill background from user profile
    const profile = wx.getStorageSync('userProfile') || {};
    const parts = [];
    if (profile.school)  parts.push(profile.school);
    if (profile.major)   parts.push(profile.major + '专业');
    if ((profile.skills || []).length) parts.push('已有技能：' + profile.skills.slice(0, 5).join('、'));
    if (parts.length) this.setData({ background: parts.join('，') });
  },

  onUnload() {
    this._clearTimer();
  },

  /* ── Form interactions ── */
  selectRole(e)     { this.setData({ selectedRole: e.currentTarget.dataset.id }); },
  selectLevel(e)    { this.setData({ selectedLevel: e.currentTarget.dataset.id }); },
  selectTimeline(e) { this.setData({ selectedTimeline: e.currentTarget.dataset.id }); },
  onBgInput(e)      { this.setData({ background: e.detail.value }); },

  /* ── Generate ── */
  onGenerate() {
    if (!this.data.selectedRole) {
      wx.showToast({ title: '请选择目标方向', icon: 'none' }); return;
    }
    this._startGenerate();
  },

  _startGenerate() {
    this._safe({ step: 'loading', loadingStep: 0, loadingTip: '正在分析岗位要求...' });
    this._startLoadingAnim();

    const role     = ROLES.find(r => r.id === this.data.selectedRole);
    const level    = LEVELS.find(l => l.id === this.data.selectedLevel);
    const timeline = TIMELINES.find(t => t.id === this.data.selectedTimeline);
    const bg       = this.data.background.trim();

    const prompt = `请为以下求职者生成「${role.label}」的完整技能成长路径，严格输出以下JSON格式（不加代码块）：

求职目标：${role.label}（${role.desc}）
当前状态：${level.label}（${level.desc}）
规划周期：${timeline.label}
${bg ? '背景信息：' + bg : ''}

输出JSON（所有字段必填）：
{"summary":"两句话总结此方向的求职现状和学习要点","coreSkills":[{"name":"技能名称","priority":"must","desc":"为什么学，怎么用","resources":["推荐资源1","推荐资源2"]},...],"monthPlan":[{"month":"第1-2个月","title":"阶段名","tasks":["具体任务1","具体任务2","具体任务3"],"milestone":"可衡量里程碑"},...],"projects":[{"title":"推荐项目名","desc":"项目内容简介","outcome":"预期可写入简历的成果"},...],"certs":[{"name":"证书/认证","why":"为什么值得考"}],"tips":["求职技巧1","求职技巧2","求职技巧3"]}

要求：
- coreSkills: 6-8个，按must/good/nice分优先级
- monthPlan: 按${timeline.label}拆解为3-4个阶段
- projects: 3-4个真实可操作的项目
- certs: 2-3个最值得的认证
- tips: 3-4条针对留学生的实用求职技巧
- 所有内容必须实用、具体，避免泛泛而谈`;

    sendChatToDeepSeek([
      { role: 'system', content: '你是一位专注于留学生求职的职业发展顾问，拥有丰富的北美/英国/亚太求职辅导经验。请直接输出JSON，不要输出任何JSON以外的文字。' },
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
          summary: text.slice(0, 200),
          coreSkills: [], monthPlan: [], projects: [], certs: [], tips: [],
        };
      }

      // Attach role meta for display
      result._role  = role;
      result._level = level;
      result._time  = timeline;

      // Save to history
      const entry = {
        id:     'sp_' + Date.now(),
        role:   role.label,
        level:  level.label,
        timeline: timeline.label,
        result,
        date:   new Date().toLocaleDateString('zh-CN'),
      };
      const history = [entry, ...(wx.getStorageSync(HISTORY_KEY) || [])].slice(0, 15);
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
    const tips = ['正在分析岗位要求...', '匹配学习资源...', '规划月度计划...', '生成项目建议...'];
    let step = 0;
    this._loadTimer = setInterval(() => {
      step = (step + 1) % tips.length;
      if (!this._unmounted) this.setData({ loadingStep: step, loadingTip: tips[step] });
    }, 2000);
  },
  _clearTimer() { if (this._loadTimer) { clearInterval(this._loadTimer); this._loadTimer = null; } },

  /* ── Result actions ── */
  copyPlan() {
    const r = this.data.result;
    if (!r) return;
    let text = `【${r._role.label} 技能成长路径 · ${r._time.label}】\n\n`;
    text += `📌 概述：${r.summary}\n\n`;
    text += `🎯 核心技能：\n` + (r.coreSkills || []).map(s => `- [${s.priority === 'must' ? '必须' : s.priority === 'good' ? '重要' : '加分'}] ${s.name}：${s.desc}`).join('\n') + '\n\n';
    text += `📅 月度计划：\n` + (r.monthPlan || []).map(p => `${p.month} · ${p.title}\n  ${(p.tasks || []).join(' | ')}\n  ✓ ${p.milestone}`).join('\n\n') + '\n\n';
    text += `💡 求职建议：\n` + (r.tips || []).map(t => `- ${t}`).join('\n');
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制完整路径', icon: 'success' }) });
  },

  restart() { this._safe({ step: 'input', result: null }); },

  toggleHistory() { this.setData({ showHistory: !this.data.showHistory }); },

  loadHistory(e) {
    const entry = this.data.history[e.currentTarget.dataset.idx];
    if (!entry) return;
    this.setData({ result: entry.result, step: 'result', showHistory: false });
  },
});

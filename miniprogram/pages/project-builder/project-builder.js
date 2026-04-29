// pages/project-builder/project-builder.js
const { generateProject } = require('../../utils/api.js');
const safePage = require('../../behaviors/safe-page');

const HISTORY_KEY = 'savedProjects';
const MAX_HISTORY  = 10;

const TRACKS = [
  { id: 'data',       label: 'Data',       icon: '📊', color: '#3B82F6', bg: '#EFF6FF', desc: '数据分析 / BI / ML' },
  { id: 'pm',         label: 'PM',         icon: '🎯', color: '#8B5CF6', bg: '#F5F3FF', desc: '产品经理 / 产品运营' },
  { id: 'tech',       label: 'Tech',       icon: '💻', color: '#059669', bg: '#ECFDF5', desc: '前端 / 后端 / 全栈' },
  { id: 'consulting', label: 'Consulting', icon: '📋', color: '#D97706', bg: '#FFFBEB', desc: '战略 / 管理咨询' },
  { id: 'marketing',  label: 'Marketing',  icon: '📣', color: '#DB2777', bg: '#FDF2F8', desc: '市场营销 / 增长运营' },
  { id: 'ops',        label: 'Ops',        icon: '⚙️', color: '#6366F1', bg: '#EEF2FF', desc: '运营 / 项目管理' },
];

const SENIORITIES = ['实习', '应届', '工作1-3年'];

Page({
  behaviors: [safePage],
  data: {
    step: 'input',   // 'input' | 'loading' | 'result'

    // 表单
    tracks: TRACKS,
    seniorities: SENIORITIES,
    selectedTrack:    '',
    selectedSeniority: '应届',
    role:       '',
    background: '',

    // 是否来自画像预填
    profileFilled: false,

    // 加载提示
    loadingTip:  '正在理解岗位需求...',
    loadingStep: 0,
    _loadingTimer: null,

    // 结果
    project: null,
    currentTrackIcon:  '',
    currentTrackColor: '#6D28D9',
    currentTrackLabel: '',

    // 历史
    savedProjects: [],
    showHistory:   false,
  },

  onLoad(options) {
    // URL 参数（来自其他页面预填方向）
    const trackParam = options.track || '';
    const profile = wx.getStorageSync('userProfile') || {};

    // 自动选择方向：URL > 画像推断
    let selectedTrack = TRACKS.find(t => t.id === trackParam) ? trackParam : '';
    if (!selectedTrack && profile.targetRoles && profile.targetRoles[0]) {
      selectedTrack = this._inferTrack(profile.targetRoles[0]);
    }

    // 预填岗位
    let role = options.role ? decodeURIComponent(options.role) : '';
    if (!role && profile.targetRoles && profile.targetRoles[0]) {
      role = profile.targetRoles[0];
    }

    // 预填背景
    let background = '';
    const parts = [];
    if (profile.school)   parts.push(profile.school);
    if (profile.major)    parts.push(profile.major + '专业');
    if (profile.gradYear) parts.push(profile.gradYear + '年毕业');
    if ((profile.skills || []).length) parts.push('技能：' + profile.skills.slice(0, 4).join('、'));
    if (parts.length) background = parts.join('，');

    // 预填级别
    const statusMap = { student: '实习', fresh: '应届', working: '工作1-3年' };
    const selectedSeniority = statusMap[profile.status] || '应届';

    const profileFilled = !!(selectedTrack || role || background);
    const savedProjects = wx.getStorageSync(HISTORY_KEY) || [];

    this._safeSetData({
      selectedTrack, role, background, selectedSeniority, profileFilled, savedProjects
    });
  },

  onUnload() {
    this._clearLoadingTimer();
  },

  _clearLoadingTimer() {
    if (this.data._loadingTimer) {
      clearInterval(this.data._loadingTimer);
      this.setData({ _loadingTimer: null });
    }
  },

  // 根据目标岗位关键词推断方向
  _inferTrack(role) {
    const r = role.toLowerCase();
    if (/data|analyst|数据|bi|machine|ml|ai/.test(r))             return 'data';
    if (/pm|product|产品/.test(r))                                 return 'pm';
    if (/engineer|developer|swe|backend|frontend|全栈|开发/.test(r)) return 'tech';
    if (/consult|咨询|strategy|战略/.test(r))                      return 'consulting';
    if (/market|营销|growth|品牌/.test(r))                         return 'marketing';
    if (/ops|运营|operation|supply|供应/.test(r))                  return 'ops';
    return '';
  },

  // ── 表单交互 ─────────────────────────────────────────────────────────────
  selectTrack(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedTrack: this.data.selectedTrack === id ? '' : id });
  },

  selectSeniority(e) {
    this.setData({ selectedSeniority: e.currentTarget.dataset.val });
  },

  onRoleInput(e)       { this.setData({ role: e.detail.value }); },
  onBackgroundInput(e) { this.setData({ background: e.detail.value }); },

  // ── 生成 ─────────────────────────────────────────────────────────────────
  onGenerate() {
    if (!this.data.selectedTrack) {
      wx.showToast({ title: '请选择项目方向', icon: 'none' }); return;
    }
    this._startGenerate();
  },

  _startGenerate() {
    const tips = [
      '正在理解岗位需求...',
      '构思项目场景中...',
      '设计项目方法论...',
      '生成量化成果中...',
      '润色项目描述...',
      '即将完成...',
    ];
    let idx = 0;
    this._safeSetData({ step: 'loading', loadingTip: tips[0], loadingStep: 0 });

    const timer = setInterval(() => {
      idx = Math.min(idx + 1, tips.length - 1);
      this._safeSetData({ loadingTip: tips[idx], loadingStep: idx });
    }, 3000);
    this._safeSetData({ _loadingTimer: timer });

    const { selectedTrack, role, background, selectedSeniority } = this.data;
    generateProject(selectedTrack, role.trim(), background.trim(), selectedSeniority)
      .then(res => {
        this._clearLoadingTimer();
        if (res && res.project) {
          this._saveToHistory(res.project);
          const track = TRACKS.find(t => t.id === selectedTrack) || {};
          this._safeSetData({
            step: 'result',
            project: res.project,
            currentTrackIcon:  track.icon  || '🚀',
            currentTrackColor: track.color || '#6D28D9',
            currentTrackLabel: track.label || '',
          });
        } else {
          if (!this._unmounted) wx.showToast({ title: res.error || 'AI返回异常，请重试', icon: 'none' });
          this._safeSetData({ step: 'input' });
        }
      })
      .catch(err => {
        this._clearLoadingTimer();
        if (!this._unmounted) {
          const msg = err.message || '网络错误，请重试';
          wx.showToast({ title: msg.includes('timeout') ? 'AI响应超时，请重试' : msg, icon: 'none' });
        }
        this._safeSetData({ step: 'input' });
      });
  },

  // ── 结果操作 ──────────────────────────────────────────────────────────────
  copyAll() {
    const p = this.data.project;
    if (!p) return;
    const lines = [
      '【' + p.title + '】',
      '',
      '📌 项目背景',
      p.background,
      '',
      '🔍 研究方法',
      p.methodology,
      '',
      '📊 数据来源',
      (p.data_sources || []).join(' / '),
      '',
      '🛠 技术栈',
      (p.tech_stack || []).join(' · '),
      '',
      '🎯 关键成果',
      ...(p.key_results || []).map(r => '· ' + r),
      '',
      '📝 简历一行版',
      p.resume_bullet,
    ];
    wx.setClipboardData({
      data: lines.join('\n'),
      success: () => wx.showToast({ title: '已复制全文', icon: 'success' })
    });
  },

  copyBullet() {
    const p = this.data.project;
    if (!p || !p.resume_bullet) return;
    wx.setClipboardData({
      data: p.resume_bullet,
      success: () => wx.showToast({ title: '已复制简历版', icon: 'success' })
    });
  },

  addToResume() {
    const p = this.data.project;
    if (!p) return;
    const resume = wx.getStorageSync('onlineResume') || {};
    const projects = (resume.projects || []).slice();

    // 检查是否已存在同名项目
    if (projects.some(proj => proj.name === p.title)) {
      wx.showToast({ title: '该项目已在简历中', icon: 'none' }); return;
    }

    // 拼装描述
    const descParts = [];
    if (p.background)   descParts.push('背景：' + p.background);
    if (p.methodology)  descParts.push('方法：' + p.methodology);
    if ((p.key_results || []).length) {
      descParts.push('成果：' + p.key_results.join('；'));
    }

    projects.unshift({
      id:   Date.now(),
      name: p.title,
      role: this._getTrackRole(),
      time: p.duration || '',
      desc: descParts.join('\n')
    });

    resume.projects = projects;
    wx.setStorageSync('onlineResume', resume);
    wx.showToast({ title: '已加入简历', icon: 'success' });
  },

  _getTrackRole() {
    const track = TRACKS.find(t => t.id === this.data.selectedTrack);
    return track ? track.label + ' 项目' : '项目成员';
  },

  onRegenerate() {
    this.setData({ step: 'input', project: null });
  },

  // ── 历史记录 ──────────────────────────────────────────────────────────────
  _saveToHistory(project) {
    try {
      const track = TRACKS.find(t => t.id === this.data.selectedTrack);
      const list = wx.getStorageSync(HISTORY_KEY) || [];
      list.unshift({
        id:        Date.now(),
        title:     project.title,
        track:     this.data.selectedTrack,
        trackLabel: track ? track.label : '',
        trackIcon:  track ? track.icon  : '',
        seniority: this.data.selectedSeniority,
        createdAt: new Date().toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
        project
      });
      if (list.length > MAX_HISTORY) list.splice(MAX_HISTORY);
      wx.setStorageSync(HISTORY_KEY, list);
      this._safeSetData({ savedProjects: list });
    } catch (e) {}
  },

  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory });
  },

  onHistoryTap(e) {
    const record = this.data.savedProjects[e.currentTarget.dataset.idx];
    if (!record || !record.project) return;
    const track = TRACKS.find(t => t.id === record.track) || {};
    this.setData({
      step: 'result',
      project: record.project,
      selectedTrack:     record.track,
      selectedSeniority: record.seniority || '应届',
      currentTrackIcon:  track.icon  || '🚀',
      currentTrackColor: track.color || '#6D28D9',
      currentTrackLabel: track.label || '',
    });
  },

  clearHistory() {
    wx.showModal({
      title: '清空历史',
      content: '确定清空所有生成记录？',
      success: res => {
        if (res.confirm) {
          wx.removeStorageSync(HISTORY_KEY);
          this.setData({ savedProjects: [], showHistory: false });
        }
      }
    });
  },
});

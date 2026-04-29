// pages/career-planner/career-planner.js
const { generateCareerPlan } = require('../../utils/api.js');
const safePage = require('../../behaviors/safe-page');

const HISTORY_KEY = 'savedCareerPlans';
const MAX_HISTORY  = 5;

Page({
  behaviors: [safePage],
  data: {
    // 步骤：'input' | 'loading' | 'result'
    step: 'input',

    // 表单
    location:   '',
    position:   '',
    background: '',

    // 是否从画像自动填充 / 从岗位详情跳入
    profileFilled: false,
    fromJobDetail: false,

    // 加载状态
    loadingTip:  '正在分析岗位需求...',
    loadingStep: 0,

    // 结果数据
    plan:            null,
    activePhaseIdx:  0,
    activeMilestones: false,

    // 历史记录
    savedPlans:  [],
    showHistory: false,

    // 加载提示轮换（非响应式，放 data 里方便 _clearLoadingTimer 读取）
    _loadingTimer: null,
  },

  onLoad(options) {
    // 1. 从 URL 参数读取（job-detail 跳转传入）
    let position = options.position ? decodeURIComponent(options.position) : '';
    let company  = options.company  ? decodeURIComponent(options.company)  : '';
    let location = options.location ? decodeURIComponent(options.location) : '';
    const fromJobDetail = !!(position || company);

    // 2. 读取用户画像
    const profile = wx.getStorageSync('userProfile') || {};

    // 岗位：URL 优先 → 画像 targetRoles[0]
    if (!position && profile.targetRoles && profile.targetRoles[0]) {
      position = profile.targetRoles[0];
    }

    // 地区：URL 优先 → 画像 targetLocation[0]
    if (!location && profile.targetLocation && profile.targetLocation[0]) {
      location = profile.targetLocation[0];
    }

    // 背景：从画像拼装
    let background = '';
    const parts = [];
    if (profile.school)    parts.push(profile.school);
    if (profile.major)     parts.push(profile.major + '专业');
    if (profile.gradYear)  parts.push(profile.gradYear + '年毕业');
    const statusMap = { student: '在读学生', fresh: '应届毕业生', working: '在职人士' };
    if (profile.status && statusMap[profile.status]) parts.push(statusMap[profile.status]);
    if ((profile.skills || []).length)               parts.push('技能：' + profile.skills.slice(0, 5).join('、'));
    if (company)  parts.push('目标公司：' + company);
    if (parts.length) background = parts.join('，');

    const profileFilled = !!(position || background);

    // 3. 读取历史记录
    const savedPlans = wx.getStorageSync(HISTORY_KEY) || [];

    this._safeSetData({ position, location, background, profileFilled, fromJobDetail, savedPlans });
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

  // ── 表单输入 ──────────────────────────────────────────────────────────────
  onLocationInput(e)   { this.setData({ location:   e.detail.value }); },
  onPositionInput(e)   { this.setData({ position:   e.detail.value }); },
  onBackgroundInput(e) { this.setData({ background: e.detail.value }); },

  // ── 生成 ──────────────────────────────────────────────────────────────────
  onGenerate() {
    const { position, background } = this.data;
    if (!position.trim()) {
      wx.showToast({ title: '请输入目标岗位', icon: 'none' }); return;
    }
    if (!background.trim()) {
      wx.showToast({ title: '请填写个人背景', icon: 'none' }); return;
    }
    this._startGenerate();
  },

  _startGenerate() {
    const tips = [
      '正在分析岗位需求...',
      '评估能力差距中...',
      '规划3个月路线...',
      '规划6个月路线...',
      '规划12个月路线...',
      '整理学习资源...',
      '生成专属方案中...'
    ];
    let idx = 0;
    this._safeSetData({ step: 'loading', loadingTip: tips[0], loadingStep: 0 });

    const timer = setInterval(() => {
      idx = Math.min(idx + 1, tips.length - 1);
      this._safeSetData({ loadingTip: tips[idx], loadingStep: idx });
    }, 3500);
    this._safeSetData({ _loadingTimer: timer });

    const { location, position, background } = this.data;
    generateCareerPlan(location.trim(), position.trim(), background.trim())
      .then(res => {
        this._clearLoadingTimer();
        if (res && res.plan) {
          // 保存到历史
          this._savePlanToHistory(res.plan, position, location);
          this._safeSetData({
            step: 'result',
            plan: res.plan,
            activePhaseIdx: 0,
            activeMilestones: false
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

  // ── 历史记录 ───────────────────────────────────────────────────────────────
  _savePlanToHistory(plan, position, location) {
    try {
      const list = wx.getStorageSync(HISTORY_KEY) || [];
      list.unshift({
        id:        Date.now(),
        position:  position || '',
        location:  location || '',
        createdAt: new Date().toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
        plan
      });
      if (list.length > MAX_HISTORY) list.splice(MAX_HISTORY);
      wx.setStorageSync(HISTORY_KEY, list);
      this._safeSetData({ savedPlans: list });
    } catch (e) {}
  },

  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory });
  },

  onHistoryTap(e) {
    const idx = e.currentTarget.dataset.idx;
    const record = this.data.savedPlans[idx];
    if (!record || !record.plan) return;
    this.setData({
      step: 'result',
      plan: record.plan,
      position: record.position,
      location: record.location,
      activePhaseIdx: 0,
      activeMilestones: false
    });
  },

  clearHistory() {
    wx.showModal({
      title: '清空历史',
      content: '确定清空所有历史规划？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync(HISTORY_KEY);
          this.setData({ savedPlans: [], showHistory: false });
        }
      }
    });
  },

  // ── 结果页 Tab ────────────────────────────────────────────────────────────
  onPhaseTab(e) {
    this.setData({ activePhaseIdx: +e.currentTarget.dataset.idx, activeMilestones: false });
  },

  onMilestonesTab() {
    this.setData({ activeMilestones: true, activePhaseIdx: -1 });
  },

  onRegenerate() {
    this.setData({ step: 'input', plan: null, activePhaseIdx: 0, activeMilestones: false });
  },

  onCopyResource(e) {
    const text = e.currentTarget.dataset.text;
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
  }
});

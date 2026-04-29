// pages/job-insights/job-insights.js
const { sendChatToDeepSeek } = require('../../utils/api.js');

const PERIODS = [
  { id: 'week',    label: '本周',  desc: '过去7天' },
  { id: 'month',   label: '本月',  desc: '过去30天' },
  { id: 'quarter', label: '近三月', desc: '过去90天' }
];

const LOADING_TIPS = [
  '正在分析招聘市场动态...',
  '汇总热门岗位薪资数据...',
  '评估面试难度趋势...',
  '生成求职洞察报告...'
];

Page({
  data: {
    phase: 'idle',   // idle | loading | done
    period: 'week',
    periods: PERIODS,
    loadingTip: LOADING_TIPS[0],
    result: null,
    history: [],
    tipIdx: 0
  },

  _tipTimer: null,

  onLoad() {
    const history = wx.getStorageSync('jobInsightsHistory') || [];
    this.setData({ history });
    // Auto-load last cached if fresh (<7 days)
    if (history.length > 0) {
      const last = history[0];
      const age = Date.now() - last.ts;
      if (age < 7 * 24 * 60 * 60 * 1000) {
        this.setData({ result: last.result, period: last.period, phase: 'done' });
      }
    }
  },

  onUnload() {
    if (this._tipTimer) clearInterval(this._tipTimer);
  },

  selectPeriod(e) {
    this.setData({ period: e.currentTarget.dataset.id, result: null, phase: 'idle' });
  },

  generate() {
    if (this.data.phase === 'loading') return;
    const periodLabel = PERIODS.find(p => p.id === this.data.period)?.label || '本周';
    this.setData({ phase: 'loading', loadingTip: LOADING_TIPS[0], tipIdx: 0 });

    let idx = 0;
    this._tipTimer = setInterval(() => {
      idx = (idx + 1) % LOADING_TIPS.length;
      this.setData({ loadingTip: LOADING_TIPS[idx] });
    }, 2200);

    const prompt = `你是一名专业的留学生求职顾问，精通北美、英国、新加坡、澳洲及国内求职市场。
请基于${periodLabel}的市场动态，生成一份求职趋势洞察报告（JSON格式，不加markdown代码块）。

格式要求：
{
  "period": "${periodLabel}",
  "summary": "50字以内总结市场整体趋势",
  "hotJobs": [
    { "title": "岗位名称", "growth": "+12%", "avgSalary": "25-35万", "highlight": "核心亮点一句话", "companies": ["公司A","公司B","公司C"] }
  ],
  "hotCompanies": [
    { "name": "公司名", "icon": "emoji", "openRoles": 50, "trend": "热招中", "note": "值得关注的一点" }
  ],
  "difficultyTrend": {
    "overall": "整体描述",
    "items": [
      { "type": "算法题", "level": "较难", "change": "↑ 略有上升", "tip": "应对建议" }
    ]
  },
  "salaryTrend": {
    "overall": "整体薪资趋势描述",
    "items": [
      { "role": "数据分析师", "range": "20-30万", "yoy": "+8%", "note": "补充说明" }
    ]
  },
  "tips": ["求职小贴士1", "求职小贴士2", "求职小贴士3"]
}

要求：hotJobs 4-5条，hotCompanies 4-5条，difficultyTrend.items 3-4条，salaryTrend.items 4-5条，tips 3条。
内容要贴近真实市场情况，对留学生有实际指导意义。`;

    sendChatToDeepSeek([{ role: 'user', content: prompt }])
      .then(text => {
        clearInterval(this._tipTimer);
        let result = null;
        try {
          const m = text.match(/\{[\s\S]*\}/);
          if (m) result = JSON.parse(m[0]);
        } catch (err) {}
        if (!result) {
          wx.showToast({ title: '解析失败，请重试', icon: 'none' });
          this.setData({ phase: 'idle' });
          return;
        }
        const entry = { period: this.data.period, result, ts: Date.now() };
        const history = [entry, ...this.data.history].slice(0, 10);
        wx.setStorageSync('jobInsightsHistory', history);
        this.setData({ result, phase: 'done', history });
      })
      .catch(() => {
        clearInterval(this._tipTimer);
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
        this.setData({ phase: 'idle' });
      });
  },

  refresh() {
    this.setData({ result: null, phase: 'idle' });
    setTimeout(() => this.generate(), 100);
  },

  loadHistoryItem(e) {
    const item = this.data.history[e.currentTarget.dataset.idx];
    this.setData({ result: item.result, period: item.period, phase: 'done' });
  }
});

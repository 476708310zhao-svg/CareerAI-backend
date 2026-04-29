// pages/offer-compare/offer-compare.js
const { sendChatToDeepSeek } = require('../../utils/api.js');
const safePage = require('../../behaviors/safe-page');

const EMPTY_OFFER = () => ({
  company: '', city: '', base: '', bonus: '', rsu: '',
  visa: '', growth: '', stability: ''
});

Page({
  behaviors: [safePage],
  data: {
    step: 'input',   // 'input' | 'loading' | 'result'
    offerA: EMPTY_OFFER(),
    offerB: EMPTY_OFFER(),
    activeOffer: 'A',   // which offer panel is expanded
    loadingTip: '正在分析 Offer...',
    loadingStep: 0,
    result: null,
    _timer: null,

    // 从 applications 页面预填的 offers
    savedOffers: [],
  },

  onLoad() {
    // 从 localApplications 读取已有 offer 记录
    const apps = wx.getStorageSync('localApplications') || [];
    const offerApps = apps.filter(a => a.status === 'offer' && a.offer);
    const savedOffers = offerApps.map(a => ({
      label: a.company + ' · ' + a.job_title,
      company: a.company,
      city:    a.city || '',
      base:    a.offer.offerBase  || '',
      bonus:   a.offer.offerBonus || '',
      rsu:     a.offer.offerRsu   || '',
      visa:    '',
      growth:  '',
      stability: ''
    }));
    this.setData({ savedOffers });
  },

  onUnload() {
    if (this.data._timer) clearInterval(this.data._timer);
  },

  // 切换当前编辑的 offer
  switchOffer(e) {
    this.setData({ activeOffer: e.currentTarget.dataset.which });
  },

  // 从已保存 offer 预填
  prefillFromSaved(e) {
    const idx = e.currentTarget.dataset.idx;
    const which = e.currentTarget.dataset.which;
    const s = this.data.savedOffers[idx];
    if (!s) return;
    const key = 'offer' + which;
    this.setData({ [key]: { ...s } });
    wx.showToast({ title: '已预填 Offer ' + which, icon: 'none' });
  },

  onInput(e) {
    const { which, field } = e.currentTarget.dataset;
    const key = 'offer' + which;
    const offer = { ...this.data['offer' + which], [field]: e.detail.value };
    this.setData({ [key]: offer });
  },

  // 开始 AI 对比
  onCompare() {
    const { offerA, offerB } = this.data;
    if (!offerA.company.trim() || !offerB.company.trim()) {
      wx.showToast({ title: '请填写两家公司名称', icon: 'none' }); return;
    }

    const tips = ['正在分析 Offer...', '对比薪酬结构...', '评估城市成本...', '分析职业发展...', '生成建议中...'];
    let idx = 0;
    this._safe({ step: 'loading', loadingTip: tips[0], loadingStep: 0 });
    const timer = setInterval(() => {
      idx = Math.min(idx + 1, tips.length - 1);
      this._safe({ loadingTip: tips[idx], loadingStep: idx });
    }, 3000);
    this._safe({ _timer: timer });

    const prompt = this._buildPrompt(offerA, offerB);
    sendChatToDeepSeek([
      { role: 'system', content: '你是一位专业的求职顾问，熟悉国内外薪酬结构、城市生活成本和职业发展规划。请严格按JSON格式输出，不要输出任何JSON之外的内容。' },
      { role: 'user', content: prompt }
    ]).then(res => {
      clearInterval(this.data._timer);
      const content = (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
      try {
        const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          const result = JSON.parse(match[0]);
          this._safe({ step: 'result', result, _timer: null });
          return;
        }
      } catch (e) {}
      if (!this._unmounted) wx.showToast({ title: 'AI 解析失败，请重试', icon: 'none' });
      this._safe({ step: 'input', _timer: null });
    }).catch(err => {
      clearInterval(this.data._timer);
      if (!this._unmounted) wx.showToast({ title: err.message || '网络错误', icon: 'none' });
      this._safe({ step: 'input', _timer: null });
    });
  },

  _buildPrompt(A, B) {
    const fmt = (o) => [
      `公司：${o.company}`, o.city && `城市：${o.city}`,
      o.base && `Base：${o.base}`, o.bonus && `Bonus：${o.bonus}`,
      o.rsu && `RSU：${o.rsu}`, o.visa && `签证支持：${o.visa}`,
      o.growth && `发展路径：${o.growth}`, o.stability && `公司稳定性：${o.stability}`
    ].filter(Boolean).join('，');

    return `请对以下两份 Offer 进行全面对比分析：

Offer A：${fmt(A)}
Offer B：${fmt(B)}

请从以下维度对比，并给出最终推荐建议。严格按以下JSON格式输出：
{
  "summary": "两份Offer总体概述（80字以内）",
  "dimensions": [
    {"name": "薪酬总包(TC)", "a": "评价A", "b": "评价B", "winner": "A/B/平手"},
    {"name": "城市生活成本", "a": "评价A", "b": "评价B", "winner": "A/B/平手"},
    {"name": "签证与工作授权", "a": "评价A", "b": "评价B", "winner": "A/B/平手"},
    {"name": "职业发展路径", "a": "评价A", "b": "评价B", "winner": "A/B/平手"},
    {"name": "公司稳定性", "a": "评价A", "b": "评价B", "winner": "A/B/平手"}
  ],
  "scoreA": 75,
  "scoreB": 68,
  "recommendation": "最终建议选择Offer X，原因是...（100字以内）",
  "tips": ["谈判建议1", "谈判建议2", "注意事项1"]
}`;
  },

  onRestart() {
    this.setData({ step: 'input', result: null });
  },

  copyRecommendation() {
    const r = this.data.result;
    if (!r) return;
    const lines = [
      `Offer 对比：${this.data.offerA.company} vs ${this.data.offerB.company}`,
      '',
      r.summary,
      '',
      '各维度对比：',
      ...(r.dimensions || []).map(d => `· ${d.name}：A→${d.a} / B→${d.b}（胜：${d.winner}）`),
      '',
      '最终建议：' + r.recommendation,
      '',
      '谈判提示：',
      ...(r.tips || []).map(t => '· ' + t),
    ];
    wx.setClipboardData({
      data: lines.join('\n'),
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  }
});

/**
 * resume-ai.js — AI 相关方法（从 resume.js 拆分）
 * 用法：Object.assign 混入 Page 配置
 */
const { sendChatToDeepSeek } = require('../../utils/api.js');

module.exports = {
  // ── AI 简历审核 ─────────────────────────────────────────────
  handleAiReview() {
    wx.showLoading({ title: 'AI 正在诊断...', mask: true });

    const resumeStr = JSON.stringify(this.data.onlineResume);
    const messages = [
      { role: 'system', content: '你是一位拥有10年经验的资深技术猎头。请根据求职者的简历数据，输出一份简短的诊断报告。' },
      { role: 'user', content: '请分析以下简历数据：\n' + resumeStr + '\n\n请按以下格式输出：\n【综合评分】(0-100分)\n【亮点分析】(1-2条)\n【修改建议】(3条具体建议)' }
    ];

    sendChatToDeepSeek(messages).then(res => {
      const content = res.choices[0].message.content;
      this._showResult('AI 诊断报告', content, false);
    }).catch(() => {
      if (!this._unmounted) wx.showToast({ title: 'AI 请求失败', icon: 'none' });
    }).finally(() => wx.hideLoading());
  },

  // ── AI 润色个人优势 ─────────────────────────────────────────
  handleAiPolish() {
    const currentSummary = this.data.onlineResume.summary;
    if (!currentSummary) {
      wx.showToast({ title: '请先填写个人优势', icon: 'none' });
      return;
    }
    wx.showLoading({ title: 'AI 正在润色...', mask: true });

    const messages = [
      { role: 'system', content: '你是一位专业的简历优化师。请将用户的"个人优势"修改得更加专业、有吸引力，突出核心竞争力，使用STAR法则或量化数据风格。请直接输出润色后的内容，不要包含其他废话。' },
      { role: 'user', content: '原文：' + currentSummary }
    ];

    const polishTarget = 'summary';
    sendChatToDeepSeek(messages).then(res => {
      this._pendingPolish = { target: polishTarget };
      this._showResult('AI 润色结果', res.choices[0].message.content, true);
    }).catch(() => {
      if (!this._unmounted) wx.showToast({ title: '请求失败', icon: 'none' });
    }).finally(() => wx.hideLoading());
  },

  // ── AI 岗位匹配分析 ────────────────────────────────────────
  handleAiMatch() {
    wx.showLoading({ title: 'AI 正在匹配分析...', mask: true });

    const resumeStr = JSON.stringify(this.data.onlineResume);
    const targetJob = this.data.targetJobInput || 'Software Engineer';

    const messages = [
      { role: 'system', content: '你是一位资深HR。请根据候选人简历和目标岗位，给出匹配度分析。' },
      { role: 'user', content: '简历数据：\n' + resumeStr + '\n\n目标岗位：' + targetJob + '\n\n请输出：\n【匹配度】(0-100%)\n【匹配亮点】(2-3条)\n【差距分析】(2-3条)\n【提升建议】(3条)' }
    ];

    sendChatToDeepSeek(messages).then(res => {
      this._showResult('岗位匹配分析', res.choices[0].message.content, false);
    }).catch(() => {
      if (!this._unmounted) wx.showToast({ title: 'AI 请求失败', icon: 'none' });
    }).finally(() => wx.hideLoading());
  },

  // ── AI 工作经历润色 ────────────────────────────────────────
  handleAiPolishWork(e) {
    const index = e.currentTarget.dataset.index;
    const workItem = this.data.onlineResume.workExp[index];
    if (!workItem) return;

    wx.showLoading({ title: 'AI 正在润色...', mask: true });

    const messages = [
      { role: 'system', content: '你是一位专业的简历优化师。请将用户的工作经历描述优化得更加专业，使用STAR法则，加入量化数据和具体成果。请直接输出润色后的描述文字，不要包含其他废话。' },
      { role: 'user', content: '公司：' + workItem.company + '\n职位：' + workItem.role + '\n原始描述：' + workItem.desc }
    ];

    sendChatToDeepSeek(messages).then(res => {
      this._pendingPolish = { target: 'work', workIndex: index };
      this._showResult('工作经历润色', res.choices[0].message.content, true);
    }).catch(() => {
      if (!this._unmounted) wx.showToast({ title: '请求失败', icon: 'none' });
    }).finally(() => wx.hideLoading());
  },

  // ── AI 弹窗逻辑 ────────────────────────────────────────────
  _showResult(title, content, isPolish) {
    this._safeSetData({
      showAiResult: true,
      _modalStyle: 'height: 60vh; background: #fff; border-radius: 24rpx 24rpx 0 0;',
      aiResultTitle: title,
      aiResultContent: content,
      isPolishMode: isPolish
    });
  },

  closeAiResult() {
    this.setData({ showAiResult: false });
  },

  applyPolish() {
    const pending = this._pendingPolish || {};
    if (pending.target === 'work' && pending.workIndex !== undefined) {
      this.setData({
        ['onlineResume.workExp[' + pending.workIndex + '].desc']: this.data.aiResultContent,
        showAiResult: false
      });
      this._saveResume();
      wx.showToast({ title: '已更新工作经历', icon: 'success' });
    } else {
      this.setData({
        'onlineResume.summary': this.data.aiResultContent,
        showAiResult: false
      });
      this._saveResume();
      wx.showToast({ title: '已更新个人优势', icon: 'success' });
    }
    this._pendingPolish = null;
  },

  onTargetJobInput(e) {
    this.setData({ targetJobInput: e.detail.value });
  },

  // ── NLP 智能优化建议 ───────────────────────────────────────
  handleNlpOptimize() {
    const r = this.data.onlineResume;
    const b = r.basicInfo || {};
    if (!b.name && (!r.workExp || !r.workExp.length)) {
      wx.showToast({ title: '请先完善简历内容', icon: 'none' });
      return;
    }
    const targetJob = this.data.targetJobInput || (b.title || '软件工程师');
    this.setData({ nlpLoading: true });
    wx.showLoading({ title: 'NLP 深度分析中...', mask: true });

    const messages = [
      {
        role: 'system',
        content: `你是一位专业的简历优化顾问和ATS系统专家。请对简历进行深度NLP分析，输出以下格式（使用中文，每项简洁明了）：

【ATS评分】XX/100（一个数字，评估简历对ATS系统的友好程度）

【关键词诊断】
✅ 已有：（3-5个简历中已有的核心关键词）
❌ 缺失：（3-5个针对目标岗位应该补充的关键词）

【动词升级建议】
（列出2-4条，格式："原词" → "推荐词" — 原因）

【优先改进项】
1. [板块名] 具体建议（30字以内）
2. [板块名] 具体建议
3. [板块名] 具体建议

【一句话总结】（20字以内的最重要改进行动）

只输出以上格式，不要额外说明。`
      },
      {
        role: 'user',
        content: '目标岗位：' + targetJob + '\n\n简历数据：' + JSON.stringify({
          basicInfo: r.basicInfo,
          summary: r.summary,
          workExp: (r.workExp || []).map(w => ({ company: w.company, role: w.role, desc: (w.desc || '').slice(0, 200) })),
          education: r.education,
          skills: r.skills
        })
      }
    ];

    sendChatToDeepSeek(messages)
      .then(res => {
        const content = res.choices[0].message.content;
        const scoreMatch = content.match(/【ATS评分】\s*(\d+)/);
        const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
        this.setData({ nlpResult: content, nlpAtsScore: score, showNlpPanel: true });
      })
      .catch(() => {
        wx.showToast({ title: 'AI 分析失败，请重试', icon: 'none' });
      })
      .finally(() => {
        this.setData({ nlpLoading: false });
        wx.hideLoading();
      });
  },

  closeNlpPanel() {
    this.setData({ showNlpPanel: false });
  }
};

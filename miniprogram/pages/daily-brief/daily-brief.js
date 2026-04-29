// pages/daily-brief/daily-brief.js
const { sendChatToDeepSeek } = require('../../utils/api.js');

const LOADING_TIPS = [
  '正在整理今日求职数据...',
  'AI 分析你的求职进展...',
  '生成明日行动建议...',
  '完善个性化日报内容...'
];

Page({
  data: {
    phase: 'idle',   // idle | loading | done
    result: null,
    stats: null,
    loadingTip: LOADING_TIPS[0],
    todayStr: '',
    greeting: ''
  },

  _tipTimer: null,

  onLoad() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekDays = ['日','一','二','三','四','五','六'];
    const dow = weekDays[now.getDay()];
    const todayStr = `${month}月${day}日 周${dow}`;
    const hour = now.getHours();
    let greeting = '早上好';
    if (hour >= 11 && hour < 14) greeting = '中午好';
    else if (hour >= 14 && hour < 18) greeting = '下午好';
    else if (hour >= 18) greeting = '晚上好';
    this.setData({ todayStr, greeting });

    // Check if today's brief already exists
    const cached = wx.getStorageSync('dailyBriefCache');
    if (cached) {
      const cacheDate = new Date(cached.ts);
      const isToday = cacheDate.getFullYear() === now.getFullYear() &&
                      cacheDate.getMonth() === now.getMonth() &&
                      cacheDate.getDate() === now.getDate();
      if (isToday) {
        this.setData({ result: cached.result, stats: cached.stats, phase: 'done' });
        return;
      }
    }
    this._collectStats();
  },

  onUnload() {
    if (this._tipTimer) clearInterval(this._tipTimer);
  },

  // Collect activity data from localStorage
  _collectStats() {
    // Applications
    let apps = [];
    try { apps = JSON.parse(wx.getStorageSync('localApplications') || '[]'); } catch (e) {}
    const totalApps = apps.length;
    const pendingApps = apps.filter(a => a.status === 'applied' || a.status === 'screening').length;
    const interviewApps = apps.filter(a => a.status === 'interview').length;
    const offerApps = apps.filter(a => a.status === 'offer').length;

    // Recent jobs viewed (from job view history)
    let jobHistory = [];
    try { jobHistory = JSON.parse(wx.getStorageSync('jobViewHistory') || '[]'); } catch (e) {}
    const todayTs = new Date().setHours(0, 0, 0, 0);
    const todayJobs = jobHistory.filter(j => j.ts && j.ts >= todayTs);

    // Recent interview sessions
    let interviewHistory = [];
    try { interviewHistory = JSON.parse(wx.getStorageSync('interviewHistory') || '[]'); } catch (e) {}
    const recentInterviews = interviewHistory.slice(0, 3).map(h => ({
      company: h.company || '练习',
      role: h.role || '未知岗位',
      score: h.score || 0
    }));

    // Profile completeness
    let profile = null;
    try { profile = wx.getStorageSync('userProfile'); } catch (e) {}
    const profileFilled = !!(profile && profile.name && profile.targetRole);

    const stats = {
      totalApps,
      pendingApps,
      interviewApps,
      offerApps,
      todayJobsViewed: todayJobs.length,
      recentInterviews,
      profileFilled
    };
    this.setData({ stats });
    this._generate(stats);
  },

  _generate(stats) {
    this.setData({ phase: 'loading', loadingTip: LOADING_TIPS[0] });

    let idx = 0;
    this._tipTimer = setInterval(() => {
      idx = (idx + 1) % LOADING_TIPS.length;
      this.setData({ loadingTip: LOADING_TIPS[idx] });
    }, 2000);

    const profile = wx.getStorageSync('userProfile') || {};
    const profileDesc = profile.targetRole ? `目标岗位：${profile.targetRole}，` : '';

    const prompt = `你是一名专业的留学生求职导师。以下是用户今天的求职数据：

${profileDesc}
- 总投递数：${stats.totalApps} 份
- 待回复投递：${stats.pendingApps} 份
- 进入面试阶段：${stats.interviewApps} 份
- 收到 Offer：${stats.offerApps} 份
- 今日浏览职位：${stats.todayJobsViewed} 个
- 近期面试练习：${stats.recentInterviews.length > 0 ? stats.recentInterviews.map(i => `${i.company}(${i.role},得分${i.score})`).join('、') : '暂无记录'}
- 个人档案：${stats.profileFilled ? '已完善' : '未完善'}

今天是${this.data.todayStr}。

请生成今日求职日报（JSON格式，不加markdown代码块）：
{
  "todaySummary": "对今日求职状态的简短总结（2-3句话）",
  "highlights": [
    { "icon": "emoji", "label": "亮点1标题", "value": "具体内容" }
  ],
  "focusArea": "今天最需要关注的一件事（具体、可执行）",
  "tomorrowPlan": [
    { "time": "上午", "task": "具体任务描述", "priority": "high" },
    { "time": "下午", "task": "具体任务描述", "priority": "medium" },
    { "time": "晚上", "task": "具体任务描述", "priority": "low" }
  ],
  "aiAdvice": "给用户的一段个性化建议（3-4句话，真诚、专业、有温度）",
  "motivation": "一句简短的激励语"
}

要求：highlights 2-3条，tomorrowPlan 3条，内容要基于数据给出真实有用的建议，不要泛泛而谈。`;

    sendChatToDeepSeek([{ role: 'user', content: prompt }])
      .then(text => {
        clearInterval(this._tipTimer);
        let result = null;
        try {
          const m = text.match(/\{[\s\S]*\}/);
          if (m) result = JSON.parse(m[0]);
        } catch (e) {}
        if (!result) {
          wx.showToast({ title: '解析失败，请重试', icon: 'none' });
          this.setData({ phase: 'idle' });
          return;
        }
        wx.setStorageSync('dailyBriefCache', { result, stats, ts: Date.now() });
        this.setData({ result, phase: 'done' });
      })
      .catch(() => {
        clearInterval(this._tipTimer);
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
        this.setData({ phase: 'idle' });
      });
  },

  refresh() {
    this.setData({ phase: 'idle', result: null });
    wx.removeStorageSync('dailyBriefCache');
    setTimeout(() => this._generate(this.data.stats), 100);
  },

  retryGenerate() {
    this._collectStats();
  }
});

// pages/daily-brief/daily-brief.js
const { sendChatToDeepSeek } = require('../../../utils/api.js');
const progress = require('../../../utils/job-progress.js');
const favUtil = require('../../../utils/favorites.js');
const demoData = require('../../../utils/demo-data.js');
const notebook = require('../../../utils/interview-notebook.js');
const navigation = require('../../../utils/navigation.js');

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
    greeting: '',
    brief: null
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
      if (isToday && cached.brief) {
        this.setData({ result: cached.result, stats: cached.stats, brief: cached.brief, phase: 'done' });
        return;
      }
    }
    notebook.fetchRemoteDailyPractice().finally(() => this._collectStats());
  },

  onUnload() {
    if (this._tipTimer) clearInterval(this._tipTimer);
  },

  // Collect activity data from localStorage
  _collectStats() {
    const progressStats = progress.getStats();
    const apps = progress.getList();
    const totalApps = progressStats.total;
    const pendingApps = (progressStats.byStatus.applied || 0) + (progressStats.byStatus.online_apply || 0) + (progressStats.byStatus.oa || 0);
    const interviewApps = progressStats.interviews;
    const offerApps = progressStats.offer;

    // Recent jobs viewed (from job view history)
    let jobHistory = wx.getStorageSync('jobViewHistory') || [];
    if (!Array.isArray(jobHistory)) jobHistory = [];
    const todayTs = new Date().setHours(0, 0, 0, 0);
    const todayJobs = jobHistory.filter(j => j.ts && j.ts >= todayTs);

    // Recent interview sessions
    let interviewHistory = wx.getStorageSync('interviewHistory') || [];
    if (!Array.isArray(interviewHistory)) interviewHistory = [];
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
      profileFilled,
      dueSoon: progressStats.dueSoon,
      todayInterviews: progressStats.todayInterviews
    };
    const brief = this._buildBrief(stats, apps);
    const fallbackResult = this._buildFallbackResult(stats, brief);
    wx.setStorageSync('dailyBriefCache', { result: fallbackResult, stats, brief, ts: Date.now() });
    this.setData({ stats, brief, result: fallbackResult, phase: 'done' });
    this._generate(stats, brief, true);
  },

  _buildBrief(stats, apps) {
    const cachedJobs = wx.getStorageSync('cachedRecommendJobs') || [];
    const demoJobs = demoData.enabled() ? demoData.getList('RECOMMEND_JOBS') : [];
    const recommendedJobs = (Array.isArray(cachedJobs) && cachedJobs.length ? cachedJobs : demoJobs)
      .slice(0, 3)
      .map(item => ({
        id: item.id || item.job_id || '',
        title: item.title || item.job_title || '推荐岗位',
        company: item.company || item.employer_name || '',
        city: item.city || item.job_city || '',
        salary: item.salary || ''
      }));
    const deadlines = progress.getUpcomingDeadlines(7).slice(0, 4);
    const todayInterviews = progress.getTodayInterviews().slice(0, 4);
    const favorites = favUtil.getList('job').slice(0, 3);
    const newsSource = wx.getStorageSync('cachedHomeNews_v1') || (demoData.enabled() ? demoData.getList('NEWS_FEED') : []);
    const news = (newsSource || [])
      .slice(0, 3)
      .map(item => ({
        id: item.id,
        title: item.title || item.desc || '求职快讯',
        time: item.time || '今天'
      }));
    const notebookQuestions = notebook.getDailyPractice()
      .slice(0, 3)
      .map(item => item.title || item.question)
      .filter(Boolean);
    const fallbackQuestions = [
      '请用 STAR 结构讲一次你推动项目落地的经历。',
      'Why this role? 请结合岗位 JD 回答。',
      '介绍一个你用数据影响决策的项目。'
    ];
    const dailyQuestions = notebookQuestions.length
      ? notebookQuestions.concat(fallbackQuestions).slice(0, 3)
      : fallbackQuestions;
    return {
      recommendedJobs,
      deadlines,
      todayInterviews,
      favorites,
      news,
      dailyQuestions,
      progressList: (apps || []).slice(0, 4),
      aiAdvice: progress.buildDailyAdvice()
    };
  },

  _buildFallbackResult(stats, brief) {
    const summary = stats.totalApps
      ? `你当前有 ${stats.totalApps} 条求职记录，其中 ${stats.dueSoon} 个机会近期截止，${stats.todayInterviews} 个面试安排在今天。`
      : '今天可以先从收藏和记录目标岗位开始，建立你的第一条求职进度。';
    return {
      todaySummary: summary,
      highlights: [
        { icon: '进', label: '推进中', value: String(progress.getStats().active) },
        { icon: '截', label: '即将截止', value: String(stats.dueSoon) },
        { icon: '面', label: '今日面试', value: String(stats.todayInterviews) }
      ],
      focusArea: brief.aiAdvice,
      tomorrowPlan: [
        { time: '上午', task: stats.dueSoon ? '处理最近截止岗位的投递材料' : '筛选并收藏 2 个目标岗位', priority: 'high' },
        { time: '下午', task: '更新求职进度状态和备注', priority: 'medium' },
        { time: '晚上', task: '练习 1 道行为面试题并复盘答案', priority: 'low' }
      ],
      aiAdvice: brief.aiAdvice,
      motivation: '把求职拆成今天能完成的一小步，就已经在往前走。'
    };
  },

  _generate(stats, brief, silent) {
    if (!silent) this.setData({ phase: 'loading', loadingTip: LOADING_TIPS[0] });

    let idx = 0;
    if (!silent) {
      this._tipTimer = setInterval(() => {
        idx = (idx + 1) % LOADING_TIPS.length;
        this.setData({ loadingTip: LOADING_TIPS[idx] });
      }, 2000);
    }

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
        wx.setStorageSync('dailyBriefCache', { result, stats, brief, ts: Date.now() });
        this.setData({ result, phase: 'done' });
      })
      .catch(() => {
        clearInterval(this._tipTimer);
        if (!silent) {
          wx.showToast({ title: '网络错误，请重试', icon: 'none' });
          this.setData({ phase: 'idle' });
        }
      });
  },

  refresh() {
    this.setData({ phase: 'idle', result: null });
    wx.removeStorageSync('dailyBriefCache');
    setTimeout(() => this._collectStats(), 100);
  },

  retryGenerate() {
    this._collectStats();
  },

  goProgress() {
    navigation.safeNavigateTo('/package-user/pages/job-progress/job-progress');
  },

  goJobs() {
    wx.switchTab({ url: '/pages/jobs/jobs' });
  },

  goJobDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) {
      this.goJobs();
      return;
    }
    wx.navigateTo({ url: '/package-user/pages/job-detail/job-detail?id=' + encodeURIComponent(id) });
  },

  goInterview(e) {
    const question = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.question
      : '';
    if (question) {
      wx.navigateTo({
        url: '/package-ai/pages/interview-dialog/interview-dialog?autoQuestion=' + encodeURIComponent(question)
      });
      return;
    }
    wx.navigateTo({ url: '/package-ai/pages/interview-setup/interview-setup' });
  },

  goNotebook() {
    wx.navigateTo({ url: '/package-ai/pages/interview-notebook/interview-notebook?tab=daily' });
  }
});

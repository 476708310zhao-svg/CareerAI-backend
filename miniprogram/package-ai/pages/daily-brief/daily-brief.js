// pages/daily-brief/daily-brief.js
const { sendChatToDeepSeek } = require('../../../utils/api.js');
const progress = require('../../../utils/job-progress.js');
const favUtil = require('../../../utils/favorites.js');
const demoData = require('../../../utils/demo-data.js');
const notebook = require('../../../utils/interview-notebook.js');
const navigation = require('../../../utils/navigation.js');
const apiClient = require('../../../utils/api-client.js');
const dailyTasks = require('../../../utils/daily-tasks.js');

const LOADING_TIPS = [
  '正在整理今日求职数据...',
  'AI 分析你的求职进展...',
  '生成明日行动建议...',
  '完善个性化日报内容...'
];

function isDailyBriefResult(value) {
  return !!(value && typeof value === 'object' && (
    value.todaySummary || value.focusArea || value.tomorrowPlan || value.aiAdvice
  ));
}

function extractAiContent(response) {
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object') return '';

  const direct = response.data && isDailyBriefResult(response.data) ? response.data : null;
  if (direct) return JSON.stringify(direct);
  if (isDailyBriefResult(response)) return JSON.stringify(response);

  const choices = response.choices || (response.data && response.data.choices);
  const first = Array.isArray(choices) && choices.length ? choices[0] : null;
  const fromChoice = first && first.message && first.message.content;
  if (typeof fromChoice === 'string') return fromChoice;
  if (first && typeof first.text === 'string') return first.text;

  const candidates = [
    response.content,
    response.reply,
    response.message,
    response.data && response.data.content,
    response.data && response.data.reply,
    response.data && response.data.message
  ];
  return candidates.find(item => typeof item === 'string') || '';
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return '';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return text.slice(start, i + 1);
  }

  const end = text.lastIndexOf('}');
  return end > start ? text.slice(start, end + 1) : '';
}

function parseDailyBriefResult(response) {
  if (isDailyBriefResult(response)) return response;
  if (response && response.data && isDailyBriefResult(response.data)) return response.data;

  const content = extractAiContent(response);
  if (!content) return null;

  const cleaned = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const jsonText = extractJsonObject(cleaned);
  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText);
  } catch (e) {
    console.warn('每日简报 JSON 解析失败:', e, content.slice(0, 200));
    return null;
  }
}

function safeText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeHighlights(highlights, fallback) {
  const source = Array.isArray(highlights) && highlights.length ? highlights : fallback;
  return (Array.isArray(source) ? source : [])
    .filter(Boolean)
    .slice(0, 3)
    .map(item => ({
      icon: safeText(item.icon, '•'),
      label: safeText(item.label, '数据'),
      value: safeText(item.value, '')
    }));
}

function normalizeTomorrowPlan(plan, fallback) {
  const source = Array.isArray(plan) && plan.length ? plan : fallback;
  return (Array.isArray(source) ? source : [])
    .filter(Boolean)
    .slice(0, 3)
    .map(item => ({
      time: safeText(item.time, '待定'),
      task: safeText(item.task, '补充下一步求职行动'),
      priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium'
    }));
}

function normalizeDailyBriefResult(result, fallback) {
  if (!isDailyBriefResult(result)) return null;
  return {
    todaySummary: safeText(result.todaySummary, fallback.todaySummary),
    highlights: normalizeHighlights(result.highlights, fallback.highlights),
    focusArea: safeText(result.focusArea, fallback.focusArea),
    tomorrowPlan: normalizeTomorrowPlan(result.tomorrowPlan, fallback.tomorrowPlan),
    aiAdvice: safeText(result.aiAdvice, fallback.aiAdvice),
    motivation: safeText(result.motivation, fallback.motivation)
  };
}

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
        this._fetchRemoteBrief(true);
        return;
      }
    }
    this._fetchRemoteBrief(true).then(found => {
      if (found) return;
      notebook.fetchRemoteDailyPractice().finally(() => this._collectStats());
    });
  },

  onUnload() {
    this._clearTipTimer();
  },

  _clearTipTimer() {
    if (this._tipTimer) {
      clearInterval(this._tipTimer);
      this._tipTimer = null;
    }
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
      todayInterviews: progressStats.todayInterviews,
      tasks: dailyTasks.buildTasks()
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
    const newsSource = wx.getStorageSync('cachedHomeNews_v2') || (demoData.enabled() ? demoData.getList('NEWS_FEED') : []);
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
      tasks: stats.tasks || [],
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

  _saveDailyBriefResult(result, stats, brief) {
    wx.setStorageSync('dailyBriefCache', { result, stats, brief, ts: Date.now() });
    this.setData({ result, stats, brief, phase: 'done' });
    this._syncRemoteBrief(result, stats, brief).catch(() => {});
  },

  _fetchRemoteBrief(silent) {
    return apiClient.request({
      path: '/api/career-assets/daily-brief',
      params: { date: dailyTasks.todayKey() },
      noCache: true,
      timeout: 12000
    }).then(res => {
      if (!res || res.code !== 0 || !res.data || !res.data.result) return false;
      const payload = res.data;
      wx.setStorageSync('dailyBriefCache', {
        result: payload.result,
        stats: payload.stats,
        brief: payload.brief,
        ts: Date.now()
      });
      this.setData({
        result: payload.result,
        stats: payload.stats,
        brief: payload.brief,
        phase: 'done'
      });
      return true;
    }).catch(err => {
      if (!silent) console.warn('daily brief remote fetch failed:', err);
      return false;
    });
  },

  _syncRemoteBrief(result, stats, brief) {
    return apiClient.post({
      path: '/api/career-assets/daily-brief',
      body: {
        date: dailyTasks.todayKey(),
        result,
        stats,
        brief,
        tasks: (stats && stats.tasks) || (brief && brief.tasks) || []
      },
      timeout: 15000
    });
  },

  _useFallbackResult(stats, brief, silent, toastTitle) {
    const result = this.data.result || this._buildFallbackResult(stats, brief);
    this._saveDailyBriefResult(result, stats, brief);
    if (!silent && toastTitle) {
      wx.showToast({ title: toastTitle, icon: 'none' });
    }
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
      .then(response => {
        this._clearTipTimer();
        const fallback = this._buildFallbackResult(stats, brief);
        const result = normalizeDailyBriefResult(parseDailyBriefResult(response), fallback);
        if (!result) {
          console.warn('每日简报 AI 内容不可用，已保留基础日报');
          this._useFallbackResult(stats, brief, silent, '已生成基础日报');
          return;
        }
        this._saveDailyBriefResult(result, stats, brief);
      })
      .catch(err => {
        this._clearTipTimer();
        console.warn('每日简报 AI 请求失败，已保留基础日报:', err);
        this._useFallbackResult(stats, brief, silent, '已生成基础日报');
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

  goDailyTask(e) {
    const url = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.url
      : '';
    if (url) navigation.safeNavigateTo(url);
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

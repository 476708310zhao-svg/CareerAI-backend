const progress = require('./job-progress.js');
const notebook = require('./interview-notebook.js');

const DONE_KEY = 'dailyTaskDoneMap';

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readDoneMap() {
  try {
    const all = wx.getStorageSync(DONE_KEY) || {};
    return all[todayKey()] || {};
  } catch (e) {
    return {};
  }
}

function writeDoneMap(map) {
  try {
    const all = wx.getStorageSync(DONE_KEY) || {};
    all[todayKey()] = map || {};
    wx.setStorageSync(DONE_KEY, all);
  } catch (e) {}
}

function isSameDay(ts) {
  if (!ts) return false;
  const target = new Date(ts);
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  return target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate();
}

function getResumeScore() {
  try {
    const resume = wx.getStorageSync('onlineResume') || {};
    return Number(resume.score || 0);
  } catch (e) {
    return 0;
  }
}

function getRecommendedJobCount() {
  try {
    const cached = wx.getStorageSync('cachedRecommendJobs') || [];
    return Array.isArray(cached) ? cached.length : 0;
  } catch (e) {
    return 0;
  }
}

function normalizeTask(task, doneMap) {
  return Object.assign({
    id: '',
    type: 'general',
    title: '',
    desc: '',
    url: '',
    priority: 'medium'
  }, task, {
    done: !!doneMap[task.id]
  });
}

function buildTasks() {
  const doneMap = readDoneMap();
  const tasks = [];
  const stats = progress.getStats();
  const list = progress.getList();
  const dueSoon = progress.getUpcomingDeadlines(3);
  const todayInterviews = progress.getTodayInterviews();
  const dailyPractice = notebook.getDailyPractice();
  const resumeScore = getResumeScore();
  const recommendedCount = getRecommendedJobCount();
  const updatedToday = list.filter(item => isSameDay(item.updatedAt || item.updated_at)).length;

  if (dueSoon.length) {
    tasks.push({
      id: 'due_' + (dueSoon[0].id || dueSoon[0].sourceJobId || 'soon'),
      type: 'deadline',
      title: '处理即将截止岗位',
      desc: `${dueSoon.length} 个机会 3 天内截止，优先补材料和投递`,
      url: '/package-user/pages/job-progress/job-progress',
      priority: 'high'
    });
  }

  if (todayInterviews.length) {
    tasks.push({
      id: 'interview_' + (todayInterviews[0].id || 'today'),
      type: 'interview',
      title: '完成今日面试准备',
      desc: `${todayInterviews.length} 场面试待准备，先复盘 JD 和常见问题`,
      url: '/package-ai/pages/interview-setup/interview-setup',
      priority: 'high'
    });
  }

  if (stats.active > 0 && updatedToday === 0) {
    tasks.push({
      id: 'progress_update',
      type: 'progress',
      title: '更新求职进度',
      desc: `还有 ${stats.active} 个活跃机会，补充状态、备注或下一步`,
      url: '/package-user/pages/job-progress/job-progress',
      priority: 'medium'
    });
  }

  if (dailyPractice.length) {
    tasks.push({
      id: 'practice_' + (dailyPractice[0].id || 'daily'),
      type: 'practice',
      title: '完成 1 道今日必练',
      desc: dailyPractice[0].title || '复习错题本里的高频题',
      url: '/package-ai/pages/interview-notebook/interview-notebook?tab=daily',
      priority: 'medium'
    });
  } else {
    tasks.push({
      id: 'practice_seed',
      type: 'practice',
      title: '加入今日必练题',
      desc: '从面试题库或报告里挑 1 道薄弱题复习',
      url: '/pages/experiences/experiences',
      priority: 'low'
    });
  }

  if (resumeScore < 80) {
    tasks.push({
      id: 'resume_polish',
      type: 'resume',
      title: '优化默认简历',
      desc: resumeScore ? `当前完整度约 ${resumeScore}%，补齐项目亮点` : '先完善基础信息、项目和技能关键词',
      url: '/package-career/pages/resume/resume',
      priority: 'medium'
    });
  }

  if (recommendedCount > 0) {
    tasks.push({
      id: 'review_recommendations',
      type: 'jobs',
      title: '查看今日推荐岗位',
      desc: `${recommendedCount} 个推荐机会，收藏或加入进度`,
      url: '/pages/jobs/jobs',
      priority: 'low'
    });
  } else {
    tasks.push({
      id: 'search_jobs',
      type: 'jobs',
      title: '搜索 2 个目标岗位',
      desc: '用目标公司、城市或岗位关键词刷新推荐池',
      url: '/pages/jobs/jobs',
      priority: 'low'
    });
  }

  const priorityRank = { high: 0, medium: 1, low: 2 };
  return tasks
    .map(task => normalizeTask(task, doneMap))
    .sort((a, b) => (a.done - b.done) || ((priorityRank[a.priority] || 9) - (priorityRank[b.priority] || 9)))
    .slice(0, 6);
}

function getStats(tasks) {
  const list = Array.isArray(tasks) ? tasks : buildTasks();
  const done = list.filter(item => item.done).length;
  return {
    total: list.length,
    done,
    pending: Math.max(0, list.length - done),
    percent: list.length ? Math.round((done / list.length) * 100) : 0
  };
}

function toggleTask(id) {
  const taskId = String(id || '');
  if (!taskId) return getStats();
  const map = readDoneMap();
  map[taskId] = !map[taskId];
  writeDoneMap(map);
  const tasks = buildTasks();
  return { tasks, stats: getStats(tasks) };
}

module.exports = {
  todayKey,
  readDoneMap,
  buildTasks,
  getStats,
  toggleTask
};

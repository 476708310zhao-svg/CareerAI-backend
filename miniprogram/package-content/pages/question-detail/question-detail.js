// pages/question-detail/question-detail.js
const { QUESTIONS } = require('../../../utils/question-bank.js');
const api = require('../../../utils/api.js');
const notebook = require('../../../utils/interview-notebook.js');

const sendChatToDeepSeek = api.sendChatToDeepSeek;
const AI_CACHE_KEY = 'questionAiTrainingResults';

const CAT_NAMES = {
  java: 'Java', frontend: '前端', algorithm: '算法',
  system: '系统设计', behavior: '行为面试', python: 'Python', database: '数据库'
};

// 按分类预设的面试要点
const TIPS_MAP = {
  java: ['答题时先说结论，再展开原理，最后结合实际项目经验', '注重对比（如 synchronized vs Lock），面试官喜欢听取舍判断', '能提到版本差异（JDK8 vs 17）会加分'],
  frontend: ['结合浏览器渲染流程、性能指标来展开回答', '可以举项目中的真实场景，比用抽象定义更有说服力', '尝试用图示口头描述（如"我可以画一下"）展示思维清晰度'],
  algorithm: ['先说思路再写代码，边界条件和复杂度分析要主动说', '如遇到不熟悉的题，可以先暴力再优化，展示思考过程', '沟通很重要，遇到不清楚的地方直接问面试官'],
  system: ['遵循 Clarify → High-level design → Deep dive → Trade-off 步骤', '主动提数量级（DAU、QPS）来驱动技术选型', '提到可扩展性（Scale）、可用性（Availability）会加分'],
  behavior: ['使用 STAR 法则：情境→任务→行动→结果', '结果要量化（提升30%、节省X小时），有说服力', '准备 3-5 个万能故事，可套用到不同问题'],
  python: ['提到 CPython 和其他实现的区别，展示深度', '结合 asyncio 谈异步，面试官喜欢看到你理解 event loop', '举出项目中的实际用法比背知识点更有力'],
  database: ['说清楚"为什么"：为什么选这个方案、有什么代价', 'EXPLAIN 执行计划和索引失效场景务必了解', '分布式数据库话题（一致性、CAP）是高频加分项']
};

function extractAiContent(res) {
  return res && res.choices && res.choices[0] && res.choices[0].message
    ? String(res.choices[0].message.content || '').trim()
    : '';
}

function readAiCache() {
  try {
    const cache = wx.getStorageSync(AI_CACHE_KEY);
    return cache && typeof cache === 'object' ? cache : {};
  } catch (e) {
    return {};
  }
}

function writeAiCache(cache) {
  try {
    wx.setStorageSync(AI_CACHE_KEY, cache || {});
  } catch (e) {}
}

function getResumeContext() {
  try {
    const resume = wx.getStorageSync('onlineResume') || {};
    const basic = resume.basicInfo || {};
    return [
      basic.title ? `目标方向：${basic.title}` : '',
      resume.summary ? `个人优势：${String(resume.summary).slice(0, 180)}` : '',
      Array.isArray(resume.skills) && resume.skills.length ? `技能：${resume.skills.slice(0, 10).join('、')}` : '',
      Array.isArray(resume.projects) && resume.projects.length ? `项目：${resume.projects.slice(0, 2).map(item => item.name || item.desc || '').filter(Boolean).join('；')}` : ''
    ].filter(Boolean).join('\n') || '用户暂未完善在线简历。';
  } catch (e) {
    return '用户暂未完善在线简历。';
  }
}

function fallbackAnswer(q, tips) {
  const title = q.title || q.question || '这道题';
  const isBehavior = q.category === 'behavior';
  if (isBehavior) {
    return [
      `建议回答框架：围绕「${title}」准备一个真实经历。`,
      '',
      '1. 先用一句话给出结论：我遇到过类似场景，并且通过主动拆解问题推动了结果。',
      '2. 说明背景和你的角色，避免把团队成果说成个人全部贡献。',
      '3. 展开 2-3 个关键行动，突出你的判断、沟通和执行。',
      '4. 用数字或具体结果收尾，再补一句复盘：下次我会如何做得更好。',
      '',
      `可结合要点：${(tips || []).slice(0, 2).join('；')}`
    ].join('\n');
  }
  return [
    `建议回答框架：先回答「${title}」的核心结论，再展开原理和场景。`,
    '',
    '1. 结论：用 1-2 句话说明核心概念或解法。',
    '2. 原理：拆成定义、关键机制、常见边界。',
    '3. 对比：补充与相近方案的差异和取舍。',
    '4. 项目化：结合你做过的项目说明何时用、怎么用、踩过什么坑。',
    '5. 收尾：主动说复杂度、风险或后续优化方向。'
  ].join('\n');
}

function fallbackStar(q) {
  const title = q.title || q.question || '行为面试题';
  return [
    `S（情境）：在一次与「${title}」相关的项目或团队协作中，背景是目标明确但资源、时间或沟通存在限制。`,
    'T（任务）：我需要在有限条件下拆解问题、推动关键成员对齐，并保证结果按期交付。',
    'A（行动）：我先梳理现状和关键约束，明确优先级；随后制定行动清单，和相关同学/同事同步责任分工；执行过程中定期复盘数据和反馈，及时调整方案。',
    'R（结果）：最终项目按计划推进，问题得到解决，并沉淀出可复用的方法。建议把这里替换成你的真实数字，例如效率提升、错误率下降、用户增长或交付周期缩短。'
  ].join('\n\n');
}

function fallbackFollowups(q) {
  const title = q.title || q.question || '这道题';
  return [
    `1. 你刚才对「${title}」的回答里，最关键的判断依据是什么？`,
    '答题提示：补充你为什么选这个方案，而不是只复述做了什么。',
    '',
    '2. 如果资源减少一半，你会如何调整优先级？',
    '答题提示：体现 trade-off、风险控制和沟通方式。',
    '',
    '3. 这个经历里你犯过什么错误？后来如何修正？',
    '答题提示：用复盘展示成长，不要只说客观困难。',
    '',
    '4. 如果面试官继续深挖数据，你能给出哪些量化结果？',
    '答题提示：提前准备 2-3 个具体数字或指标。'
  ].join('\n');
}

function fallbackByMode(mode, q, tips) {
  if (mode === 'star') return fallbackStar(q);
  if (mode === 'followup') return fallbackFollowups(q);
  return fallbackAnswer(q, tips);
}

function modeTitle(mode) {
  if (mode === 'star') return 'STAR 答案';
  if (mode === 'followup') return '模拟追问';
  return 'AI 标准回答';
}

function modeDesc(mode) {
  if (mode === 'star') return '按情境、任务、行动、结果组织，可直接改成你的真实故事。';
  if (mode === 'followup') return '模拟面试官继续深挖，提前准备二轮回答。';
  return '适合开口练习的结构化回答，包含结论、展开和收尾。';
}

function buildPrompt(mode, q, tips) {
  const title = q.title || q.question || '';
  const reference = q.answer || '';
  const resumeContext = getResumeContext();
  const base = [
    `题目：${title}`,
    `分类：${q.categoryName || q.category || '面试题'}`,
    `难度：${q.difficulty || '中等'}`,
    reference ? `参考答案：${reference}` : '',
    tips && tips.length ? `页面面试要点：${tips.join('；')}` : '',
    `候选人背景：\n${resumeContext}`
  ].filter(Boolean).join('\n\n');

  if (mode === 'star') {
    return `${base}\n\n请围绕这道题生成一个 STAR 结构的中文面试回答。要求：\n1. 用 S/T/A/R 四段输出。\n2. 更像真实候选人口述，不要太模板化。\n3. 结果部分必须提示可以替换成真实数字。\n4. 不要输出说明文字。`;
  }
  if (mode === 'followup') {
    return `${base}\n\n请模拟面试官基于这道题继续追问，输出 5 个追问，每个追问后给一个简短答题提示。要求：问题要有深挖感，覆盖项目细节、取舍、量化结果、复盘和风险。`;
  }
  return `${base}\n\n请生成一份适合候选人口述的中文标准回答。要求：\n1. 先给 1 句话结论。\n2. 再分 3-4 点展开核心思路。\n3. 如果是技术题，要补充原理、边界、项目应用和常见坑。\n4. 如果是行为题，要自然融入 STAR。\n5. 结尾给一句面试收尾表达。\n6. 不要输出寒暄。`;
}

Page({
  data: {
    q: {},
    tips: [],
    isCollected: false,
    isDone: false,
    notebookStatus: '',
    inDailyPractice: false,
    aiTraining: {
      mode: '',
      title: 'AI 训练稿',
      desc: '选择一种训练方式，生成可开口练习的回答。',
      result: '',
      loading: false,
      updatedAt: ''
    }
  },

  onLoad(options) {
    wx.hideLoading();
    const q = this.resolveQuestion(options);
    const catName = CAT_NAMES[q.category] || q.category || '';
    const tips = TIPS_MAP[q.category] || ['先理解题目本质，再组织语言', '答题结构清晰：定义→原理→应用→对比', '结合实际项目案例能显著加分'];

    // 收藏状态
    const collected = wx.getStorageSync('collectedQuestions') || [];
    const isCollected = collected.some(id => id === q.id);

    // 已做状态
    const done = wx.getStorageSync('doneQuestions') || [];
    const isDone = done.some(id => id === q.id);
    const note = notebook.getItem(q.id);
    const daily = notebook.getDailyPractice();
    const inDailyPractice = daily.some(item => String(item.id) === String(q.id));

    this.setData({
      q: { ...q, categoryName: catName },
      tips,
      isCollected,
      isDone,
      notebookStatus: note ? note.status : '',
      inDailyPractice,
      aiTraining: this.readCachedAiTraining(q.id)
    });

    // 设置标题
    if (q.title) {
      wx.setNavigationBarTitle({ title: q.title.length > 12 ? q.title.slice(0, 12) + '…' : q.title });
    }
  },

  onShow() {
    wx.hideLoading();
  },

  readCachedAiTraining(id) {
    const cache = readAiCache();
    const item = cache[String(id || '')];
    if (item && item.result) {
      return Object.assign({
        mode: 'answer',
        title: modeTitle(item.mode || 'answer'),
        desc: modeDesc(item.mode || 'answer'),
        loading: false,
        updatedAt: ''
      }, item, { loading: false });
    }
    return {
      mode: '',
      title: 'AI 训练稿',
      desc: '选择一种训练方式，生成可开口练习的回答。',
      result: '',
      loading: false,
      updatedAt: ''
    };
  },

  resolveQuestion(options) {
    const stored = wx.getStorageSync('currentQuestion') || {};
    const id = options && options.id ? decodeURIComponent(options.id) : '';
    if (stored && stored.title && (!id || String(stored.id) === String(id))) return stored;

    const source = QUESTIONS || [];
    const found = id ? source.find(item => String(item.id) === String(id)) : null;
    if (found) {
      const q = {
        id: found.id,
        qid: String(found.id),
        title: found.title || found.question || '',
        question: found.title || found.question || '',
        answer: found.answer || '',
        category: found.category || 'behavior',
        difficulty: found.difficulty || '中等',
        views: found.views || 0
      };
      wx.setStorageSync('currentQuestion', q);
      return q;
    }

    return {
      id: id || 'unknown',
      title: '题目加载失败',
      answer: '未找到该题目内容，请返回题库重新打开。',
      category: 'behavior',
      difficulty: '中等'
    };
  },

  // AI 模拟面试此题
  startAiInterview() {
    const q = this.data.q;
    if (!q || !q.title || q.title === '题目加载失败') {
      wx.showToast({ title: '题目未加载完成', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/package-ai/pages/interview-dialog/interview-dialog?autoQuestion=${encodeURIComponent(q.title)}`
    });
  },

  // 已做 / 取消已做
  toggleDone() {
    const q = this.data.q;
    let done = wx.getStorageSync('doneQuestions') || [];
    let isDone;

    if (done.some(id => id === q.id)) {
      done = done.filter(id => id !== q.id);
      isDone = false;
      wx.showToast({ title: '已取消完成标记', icon: 'none' });
    } else {
      done.unshift(q.id);
      isDone = true;
      wx.showToast({ title: '已标记为完成', icon: 'success' });
    }

    wx.setStorageSync('doneQuestions', done);
    this.setData({ isDone });
  },

  // 收藏 / 取消收藏
  toggleCollect() {
    const q = this.data.q;
    let collected = wx.getStorageSync('collectedQuestions') || [];
    let isCollected;

    if (collected.some(id => id === q.id)) {
      collected = collected.filter(id => id !== q.id);
      isCollected = false;
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    } else {
      collected.unshift(q.id);
      isCollected = true;
      wx.showToast({ title: '收藏成功', icon: 'success' });
    }

    wx.setStorageSync('collectedQuestions', collected);
    this.setData({ isCollected });
  },

  markUnknown() {
    const q = this.data.q;
    if (!q || !q.id) return;
    const item = notebook.mark(q, 'unknown');
    this.setData({ notebookStatus: item.status });
    wx.showToast({ title: '已加入错题本', icon: 'success' });
  },

  markMastered() {
    const q = this.data.q;
    if (!q || !q.id) return;
    const item = notebook.mark(q, 'mastered');
    let done = wx.getStorageSync('doneQuestions') || [];
    if (!done.some(id => String(id) === String(q.id))) {
      done.unshift(q.id);
      wx.setStorageSync('doneQuestions', done);
    }
    this.setData({ notebookStatus: item.status, isDone: true });
    wx.showToast({ title: '已标记掌握', icon: 'success' });
  },

  addDailyPractice() {
    const q = this.data.q;
    if (!q || !q.id) return;
    notebook.addDailyPractice(q);
    this.setData({ inDailyPractice: true });
    wx.showToast({ title: '已加入每日练习', icon: 'success' });
  },

  generateAiTraining(e) {
    const mode = e.currentTarget.dataset.mode || 'answer';
    const q = this.data.q;
    if (!q || !q.title || q.title === '题目加载失败') {
      wx.showToast({ title: '题目未加载完成', icon: 'none' });
      return;
    }
    if (this.data.aiTraining.loading) return;

    this.setData({
      aiTraining: {
        mode,
        title: modeTitle(mode),
        desc: modeDesc(mode),
        result: '',
        loading: true,
        updatedAt: ''
      }
    });

    const finish = (content, fromFallback) => {
      const item = {
        mode,
        title: modeTitle(mode),
        desc: modeDesc(mode),
        result: content || fallbackByMode(mode, q, this.data.tips),
        loading: false,
        updatedAt: '刚刚生成'
      };
      const cache = readAiCache();
      cache[String(q.id)] = item;
      writeAiCache(cache);
      this.setData({ aiTraining: item });
      if (fromFallback) wx.showToast({ title: '已生成本地训练稿', icon: 'none' });
    };

    if (typeof sendChatToDeepSeek !== 'function') {
      finish(fallbackByMode(mode, q, this.data.tips), true);
      return;
    }

    sendChatToDeepSeek([
      {
        role: 'system',
        content: '你是一位资深面试教练，擅长把面试题转成可直接口述的高质量中文回答。输出要具体、结构清晰、避免空话。'
      },
      {
        role: 'user',
        content: buildPrompt(mode, q, this.data.tips)
      }
    ]).then(res => {
      const content = extractAiContent(res);
      finish(content, !content);
    }).catch(() => {
      finish(fallbackByMode(mode, q, this.data.tips), true);
    });
  },

  copyAiTraining() {
    const result = this.data.aiTraining && this.data.aiTraining.result;
    if (!result) {
      wx.showToast({ title: '请先生成训练稿', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: result,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  saveAiTrainingToNotebook() {
    const q = this.data.q;
    const result = this.data.aiTraining && this.data.aiTraining.result;
    if (!q || !q.id || !result) {
      wx.showToast({ title: '请先生成训练稿', icon: 'none' });
      return;
    }
    const item = notebook.upsert(q, {
      answer: result,
      status: 'unknown',
      aiMode: this.data.aiTraining.mode || 'answer'
    });
    this.setData({ notebookStatus: item.status });
    wx.showToast({ title: '已保存到错题本', icon: 'success' });
  }
});

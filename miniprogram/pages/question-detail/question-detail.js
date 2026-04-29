// pages/question-detail/question-detail.js

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

Page({
  data: {
    q: {},
    tips: [],
    isCollected: false,
    isDone: false
  },

  onLoad() {
    const q = wx.getStorageSync('currentQuestion') || {};
    const catName = CAT_NAMES[q.category] || q.category || '';
    const tips = TIPS_MAP[q.category] || ['先理解题目本质，再组织语言', '答题结构清晰：定义→原理→应用→对比', '结合实际项目案例能显著加分'];

    // 收藏状态
    const collected = wx.getStorageSync('collectedQuestions') || [];
    const isCollected = collected.some(id => id === q.id);

    // 已做状态
    const done = wx.getStorageSync('doneQuestions') || [];
    const isDone = done.some(id => id === q.id);

    this.setData({ q: { ...q, categoryName: catName }, tips, isCollected, isDone });

    // 设置标题
    if (q.title) {
      wx.setNavigationBarTitle({ title: q.title.length > 12 ? q.title.slice(0, 12) + '…' : q.title });
    }
  },

  // AI 模拟面试此题
  startAiInterview() {
    const q = this.data.q;
    wx.navigateTo({
      url: `/pages/interview-dialog/interview-dialog?autoQuestion=${encodeURIComponent(q.title)}`
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
  }
});

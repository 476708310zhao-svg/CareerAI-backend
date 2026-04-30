// pages/interview-bank/interview-bank.js
const { QUESTIONS } = require('../../utils/mock-data.js');

const CATEGORY_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'java', label: 'Java' },
  { key: 'frontend', label: '前端' },
  { key: 'algorithm', label: '算法' },
  { key: 'system', label: '系统设计' },
  { key: 'behavior', label: '行为面试' },
  { key: 'python', label: 'Python' },
  { key: 'database', label: '数据库' }
];

const DIFFICULTY_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: '简单', label: '简单' },
  { key: '中等', label: '中等' },
  { key: '困难', label: '困难' }
];

const QUALITY_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'featured', label: '精华' },
  { key: 'hot', label: '高频' }
];

const MODE_OPTIONS = [
  { key: 'featured', label: '精选题库', badge: '100' },
  { key: 'leetcode', label: 'LeetCode', badge: '4303+' },
  { key: 'topics', label: '话题', badge: '8' },
  { key: 'elite', label: '精华区', badge: 'hot' }
];

const CATEGORY_LABELS = CATEGORY_OPTIONS.reduce((map, item) => {
  map[item.key] = item.label;
  return map;
}, {});

const DIFFICULTY_TONE = {
  '简单': 'easy',
  '中等': 'medium',
  '困难': 'hard'
};

Page({
  data: {
    modes: MODE_OPTIONS,
    categories: CATEGORY_OPTIONS,
    difficulties: DIFFICULTY_OPTIONS,
    qualities: QUALITY_OPTIONS,
    allQuestions: [],
    filtered: [],
    activeMode: 'featured',
    activeCategory: 'all',
    activeDifficulty: 'all',
    activeQuality: 'all',
    searchKey: '',
    totalCount: 0,
    doneCount: 0,
    collectedCount: 0
  },

  onLoad() {
    this.loadQuestions();
  },

  onShow() {
    this.refreshQuestionState();
  },

  loadQuestions() {
    const allQuestions = (QUESTIONS || []).map((item, index) => this.normalizeQuestion(item, index));
    this.setData({
      allQuestions,
      totalCount: allQuestions.length
    }, () => this.refreshQuestionState());
  },

  normalizeQuestion(item, index) {
    const difficulty = item.difficulty || '中等';
    const category = item.category || 'behavior';
    return {
      id: item.id || index + 1,
      qid: String(item.id || index + 1),
      title: item.title || item.question || '',
      question: item.title || item.question || '',
      answer: item.answer || '',
      category,
      categoryName: CATEGORY_LABELS[category] || '综合',
      difficulty,
      difficultyTone: DIFFICULTY_TONE[difficulty] || 'medium',
      views: item.views || 0,
      isFeatured: index < 16 || item.views >= 1800,
      isHot: item.views >= 1800,
      isCollected: false,
      isDone: false
    };
  },

  refreshQuestionState() {
    const collected = wx.getStorageSync('collectedQuestions') || [];
    const done = wx.getStorageSync('doneQuestions') || [];
    const collectedSet = new Set(collected.map(String));
    const doneSet = new Set(done.map(String));
    const allQuestions = this.data.allQuestions.map(item => ({
      ...item,
      isCollected: collectedSet.has(String(item.id)),
      isDone: doneSet.has(String(item.id))
    }));

    this.setData({
      allQuestions,
      collectedCount: collectedSet.size,
      doneCount: doneSet.size
    }, () => this.applyFilter());
  },

  applyFilter() {
    const {
      allQuestions,
      activeMode,
      activeCategory,
      activeDifficulty,
      activeQuality,
      searchKey
    } = this.data;

    let list = allQuestions.slice();

    if (activeMode === 'leetcode') {
      list = list.filter(item => ['algorithm', 'java', 'frontend', 'python', 'database'].includes(item.category));
    } else if (activeMode === 'topics') {
      list = list.filter(item => ['system', 'behavior', 'product'].includes(item.category) || item.category === 'behavior');
    } else if (activeMode === 'elite') {
      list = list.filter(item => item.isFeatured || item.isHot);
    }

    if (activeCategory !== 'all') {
      list = list.filter(item => item.category === activeCategory);
    }

    if (activeDifficulty !== 'all') {
      list = list.filter(item => item.difficulty === activeDifficulty);
    }

    if (activeQuality === 'featured') {
      list = list.filter(item => item.isFeatured);
    } else if (activeQuality === 'hot') {
      list = list.filter(item => item.isHot);
    }

    const keyword = searchKey.trim().toLowerCase();
    if (keyword) {
      list = list.filter(item => {
        const haystack = `${item.title} ${item.answer} ${item.categoryName}`.toLowerCase();
        return haystack.indexOf(keyword) >= 0;
      });
    }

    this.setData({ filtered: list });
  },

  switchMode(e) {
    this.setData({
      activeMode: e.currentTarget.dataset.key,
      activeCategory: 'all'
    }, () => this.applyFilter());
  },

  selectCategory(e) {
    this.setData({ activeCategory: e.currentTarget.dataset.key }, () => this.applyFilter());
  },

  selectDifficulty(e) {
    this.setData({ activeDifficulty: e.currentTarget.dataset.key }, () => this.applyFilter());
  },

  selectQuality(e) {
    this.setData({ activeQuality: e.currentTarget.dataset.key }, () => this.applyFilter());
  },

  onSearch(e) {
    this.setData({ searchKey: e.detail.value || '' }, () => this.applyFilter());
  },

  clearSearch() {
    this.setData({ searchKey: '' }, () => this.applyFilter());
  },

  resetFilters() {
    this.setData({
      activeCategory: 'all',
      activeDifficulty: 'all',
      activeQuality: 'all',
      searchKey: ''
    }, () => this.applyFilter());
  },

  openQuestion(e) {
    const q = this.findQuestion(e.currentTarget.dataset.id);
    if (!q) return;
    wx.setStorageSync('currentQuestion', q);
    wx.navigateTo({ url: '/pages/question-detail/question-detail' });
  },

  practiceQuestion(e) {
    const q = this.findQuestion(e.currentTarget.dataset.id);
    if (!q) return;
    wx.navigateTo({
      url: `/pages/interview-dialog/interview-dialog?autoQuestion=${encodeURIComponent(q.title)}`
    });
  },

  toggleCollect(e) {
    const id = String(e.currentTarget.dataset.id);
    let collected = wx.getStorageSync('collectedQuestions') || [];
    const exists = collected.map(String).includes(id);
    collected = exists ? collected.filter(item => String(item) !== id) : [id, ...collected];
    wx.setStorageSync('collectedQuestions', collected);
    wx.showToast({ title: exists ? '已取消收藏' : '已加入收藏', icon: 'none' });
    this.refreshQuestionState();
  },

  markDone(e) {
    const id = String(e.currentTarget.dataset.id);
    let done = wx.getStorageSync('doneQuestions') || [];
    if (!done.map(String).includes(id)) {
      done = [id, ...done];
      wx.setStorageSync('doneQuestions', done);
      wx.showToast({ title: '已标记练习', icon: 'success' });
      this.refreshQuestionState();
    }
  },

  generateAiQuestions() {
    wx.navigateTo({ url: '/pages/interview-setup/interview-setup' });
  },

  findQuestion(id) {
    return this.data.allQuestions.find(item => String(item.id) === String(id));
  }
});

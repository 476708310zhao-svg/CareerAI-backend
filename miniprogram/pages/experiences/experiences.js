// pages/experiences/experiences.js
const {
  generateQuestions,
  fetchLeetCodeProblems,
  fetchLeetCodeStats
} = require('../../utils/api.js');
const { QUESTIONS } = require('../../utils/mock-data.js');
const matcher = require('../../utils/matcher.js');

Page({
  data: {
    aiLoading: false,
    lcLoading: false,

    // 搜索
    searchKeyword: '',
    _searchTimer: null,

    // 难度筛选
    currentDiff: '', // '' | 'EASY' | 'MEDIUM' | 'HARD'

    // LeetCode 统计
    lcStats: null,
    lcDisplayCount: '',   // Tab 上展示的题目数量文字（随难度筛选变化）

    // 数据来源
    sourceTab: 'local',

    // 分类
    categories: [
      { id: 'all', name: '全部' },
      { id: 'java', name: 'Java' },
      { id: 'frontend', name: '前端' },
      { id: 'algorithm', name: '算法' },
      { id: 'system', name: '系统设计' },
      { id: 'behavior', name: '行为面试' },
      { id: 'python', name: 'Python' },
      { id: 'database', name: '数据库' }
    ],
    currentCat: 'all',

    // 本地精选题库（从 mock-data.js 加载）
    allQuestions: QUESTIONS,

    // LeetCode 在线题目
    leetcodeList: [],
    lcPage: 0,
    lcPageSize: 50,
    lcHasMore: true,

    // 实际展示的列表
    displayList: [],

    // fixed-header 占位高度（px，由 JS 动态测量后设置）
    spacerHeight: 160,

    // 精华区筛选
    featuredFilter: '', // '' | 'featured' | 'hot'

    // 精华区子 Tab
    picksTab: 'hot',   // 'hot' | 'editor' | 'trending'
    trendingCompanies: [
      { id: 'tiktok',    name: 'TikTok / ByteDance', icon: '🎵', tags: ['algorithm', 'behavior', 'system'], heat: '🔥🔥🔥', badge: '超热', cats: ['algorithm', 'behavior', 'system'] },
      { id: 'goldman',   name: 'Goldman Sachs',       icon: '💰', tags: ['algorithm', 'finance'],           heat: '🔥🔥',   badge: '金融',  cats: ['algorithm'] },
      { id: 'google',    name: 'Google / Alphabet',   icon: '🔍', tags: ['algorithm', 'system'],            heat: '🔥🔥🔥', badge: 'FLAG',   cats: ['algorithm', 'system'] },
      { id: 'meta',      name: 'Meta / Facebook',     icon: '📘', tags: ['algorithm', 'behavior'],          heat: '🔥🔥🔥', badge: 'FLAG',   cats: ['algorithm', 'behavior'] },
      { id: 'amazon',    name: 'Amazon',              icon: '📦', tags: ['behavior', 'system'],             heat: '🔥🔥',   badge: 'FAANG',  cats: ['behavior', 'system'] },
      { id: 'mckinsey',  name: 'McKinsey / BCG',      icon: '📋', tags: ['behavior'],                      heat: '🔥🔥',   badge: 'MBB',    cats: ['behavior'] },
      { id: 'jpmorgan',  name: 'J.P. Morgan',         icon: '🏦', tags: ['algorithm', 'finance'],           heat: '🔥🔥',   badge: '金融',   cats: ['algorithm'] },
      { id: 'microsoft', name: 'Microsoft',           icon: '🪟', tags: ['algorithm', 'system', 'behavior'],heat: '🔥🔥',   badge: 'FLAG',   cats: ['algorithm', 'system', 'behavior'] },
    ],
    selectedTrendingCompany: null,

    // 话题讨论
    currentTopic: null,
    topics: [
      { id: 't1', title: 'FLAG 面试攻略', icon: '🏆', desc: '谷歌、Meta、亚马逊、苹果面试全攻略', cats: ['algorithm', 'behavior', 'system'] },
      { id: 't2', title: '前端全栈备战', icon: '💻', desc: 'React / Vue / Node.js 全栈技术面试题精选', cats: ['frontend'] },
      { id: 't3', title: '算法刷题计划', icon: '📊', desc: '从入门到精通的算法面试准备路线', cats: ['algorithm'] },
      { id: 't4', title: 'Java 后端专题', icon: '☕', desc: 'Spring Boot / 微服务 / JVM 面试核心题型', cats: ['java'] },
      { id: 't5', title: '系统设计入门', icon: '🏗', desc: '大规模分布式系统设计面试必备知识', cats: ['system'] },
      { id: 't6', title: '数据库深度解析', icon: '🗄', desc: 'SQL 优化 / 索引 / 事务 / 分布式数据库', cats: ['database'] },
      { id: 't7', title: '行为面试宝典', icon: '💬', desc: 'STAR 法则 / 领导力 / 团队协作经典题型', cats: ['behavior'] },
      { id: 't8', title: 'Python 数据科学', icon: '🐍', desc: 'Python / ML / 数据分析面试准备', cats: ['python'] }
    ]
  },

  onLoad() {
    // 根据 profile 自动切换到相关分类
    const profile = wx.getStorageSync('userProfile');
    let initialCat = 'all';
    if (profile) {
      const recommended = matcher.getRecommendedCategories(profile);
      // 找第一个题库中存在的分类
      const validIds = this.data.categories.map(c => c.id);
      const match = recommended.find(c => validIds.includes(c));
      if (match && match !== 'all') initialCat = match;
    }
    // Enrich questions with isFeatured + likes for featured filter
    const enriched = this.data.allQuestions.map((q, i) => ({
      ...q,
      isFeatured: !!(i % 4 === 0 || (q.views && q.views > 120)),
      likes: q.views ? Math.floor(q.views * 0.6) : (20 + i * 8)
    }));
    const filtered = initialCat === 'all'
      ? enriched
      : enriched.filter(q => q.category === initialCat);
    this.setData({ currentCat: initialCat, allQuestions: enriched, displayList: filtered });
    this.loadLeetCodeStats();
    // 初次测量 fixed-header 高度，需等渲染完成
    setTimeout(() => this._updateSpacerHeight(), 100);
  },

  // 测量 fixed-header 实际高度并更新 spacer
  _updateSpacerHeight() {
    wx.createSelectorQuery()
      .select('.fixed-header')
      .boundingClientRect(rect => {
        if (rect && rect.height) {
          this.setData({ spacerHeight: rect.height + 4 });
        }
      })
      .exec();
  },

  // ======== 搜索 ========
  onSearchInput(e) {
    const val = e.detail.value.trim();
    this.setData({ searchKeyword: val });

    // 防抖 400ms
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.doSearch();
    }, 400);
  },

  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this.doSearch();
  },

  clearSearch() {
    this.setData({ searchKeyword: '' });
    if (this.data.sourceTab === 'leetcode') {
      // 清除搜索后恢复已加载的 LeetCode 列表
      this.applyFilters();
    } else {
      this.applyFilters();
    }
  },

  doSearch() {
    const keyword = this.data.searchKeyword;
    if (!keyword) {
      this.applyFilters();
      return;
    }

    if (this.data.sourceTab === 'leetcode') {
      // LeetCode 搜索：先在已加载列表中搜索，如果是题号则精确匹配
      const isNum = /^\d+$/.test(keyword);
      let results;
      if (isNum) {
        results = this.data.leetcodeList.filter(q => q.lcId === keyword);
      } else {
        const kw = keyword.toLowerCase();
        results = this.data.leetcodeList.filter(q =>
          (q.title && q.title.toLowerCase().includes(kw)) ||
          (q.titleEn && q.titleEn.toLowerCase().includes(kw)) ||
          (q.tags && q.tags.some(t => t.toLowerCase().includes(kw)))
        );
      }
      // 如果没找到且已加载题目不多，提示加载更多后再搜索
      if (results.length === 0 && this.data.lcHasMore) {
        this.setData({ displayList: results });
      } else {
        this.setData({ displayList: results });
      }
    } else {
      // 本地搜索
      const kw = keyword.toLowerCase();
      const catId = this.data.currentCat;
      const diffMap = { 'EASY': '简单', 'MEDIUM': '中等', 'HARD': '困难' };
      const diffCn = diffMap[this.data.currentDiff];
      let filtered = this.data.allQuestions.filter(q => {
        if (catId !== 'all' && q.category !== catId) return false;
        if (diffCn && q.difficulty !== diffCn) return false;
        return q.title.toLowerCase().includes(kw) ||
               (q.answer && q.answer.toLowerCase().includes(kw));
      });
      this.setData({ displayList: filtered });
    }
  },

  // ======== 难度筛选 ========
  switchDifficulty(e) {
    const diff = e.currentTarget.dataset.diff;
    if (diff === this.data.currentDiff) return;

    this.setData({ currentDiff: diff });
    this._updateLcDisplayCount(this.data.lcStats, diff);
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });

    if (this.data.sourceTab === 'leetcode') {
      this.setData({ leetcodeList: [], lcPage: 0, lcHasMore: true });
      this.loadLeetCode();
    } else {
      this.applyFilters();
    }
  },

  // ======== 统一筛选方法 ========
  applyFilters() {
    if (this.data.sourceTab === 'leetcode') {
      // LeetCode 模式下搜索+难度在已加载数据中过滤
      const keyword = this.data.searchKeyword.toLowerCase();
      let list = this.data.leetcodeList;
      if (keyword) {
        const isNum = /^\d+$/.test(keyword);
        if (isNum) {
          list = list.filter(q => q.lcId === keyword);
        } else {
          list = list.filter(q =>
            (q.title && q.title.toLowerCase().includes(keyword)) ||
            (q.titleEn && q.titleEn.toLowerCase().includes(keyword)) ||
            (q.tags && q.tags.some(t => t.toLowerCase().includes(keyword)))
          );
        }
      }
      this.setData({ displayList: list });
    } else {
      this.filterLocal();
    }
  },

  // ======== LeetCode 统计 ========
  loadLeetCodeStats() {
    fetchLeetCodeStats().then(stats => {
      this.setData({ lcStats: stats });
      this._updateLcDisplayCount(stats, this.data.currentDiff);
    });
  },

  // 根据当前难度筛选，计算 Tab 上显示的题目数
  _updateLcDisplayCount(stats, diff) {
    if (!stats) return;
    let count = '';
    if (!diff) {
      count = stats.total + '+';
    } else if (diff === 'EASY') {
      count = '~' + stats.easy;
    } else if (diff === 'MEDIUM') {
      count = '~' + stats.medium;
    } else if (diff === 'HARD') {
      count = '~' + stats.hard;
    }
    this.setData({ lcDisplayCount: count });
  },

  // ======== 精华区子 Tab ========
  switchPicksTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ picksTab: tab, selectedTrendingCompany: null });
    if (tab === 'hot') {
      const sorted = this.data.allQuestions.slice().sort((a, b) => (b.likes || 0) - (a.likes || 0));
      this.setData({ displayList: sorted.slice(0, 30) });
    } else if (tab === 'editor') {
      const picks = this.data.allQuestions.filter(q => q.isFeatured);
      this.setData({ displayList: picks });
    } else {
      this.setData({ displayList: [] });
    }
  },

  selectTrendingCompany(e) {
    const co = this.data.trendingCompanies[e.currentTarget.dataset.idx];
    this.setData({ selectedTrendingCompany: co });
    let filtered = this.data.allQuestions;
    if (co.cats && co.cats.length) {
      filtered = filtered.filter(q => co.cats.includes(q.category));
    }
    this.setData({ displayList: filtered });
  },

  clearTrendingCompany() {
    this.setData({ selectedTrendingCompany: null, displayList: [] });
  },

  // ======== 切换数据来源 ========
  switchSource(e) {
    const source = e.currentTarget.dataset.source;
    if (source === this.data.sourceTab) return;

    this.setData({ sourceTab: source, searchKeyword: '', currentDiff: '', featuredFilter: '', selectedTrendingCompany: null });
    this._updateLcDisplayCount(this.data.lcStats, '');
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    setTimeout(() => this._updateSpacerHeight(), 80);

    if (source === 'leetcode') {
      if (this.data.leetcodeList.length === 0) {
        this.loadLeetCode();
      } else {
        this.applyFilters();
      }
    } else if (source === 'topics') {
      this.setData({ currentTopic: null, displayList: [] });
    } else if (source === 'picks') {
      // Default: hot tab
      this.setData({ picksTab: 'hot' });
      const sorted = this.data.allQuestions.slice().sort((a, b) => (b.likes || 0) - (a.likes || 0));
      this.setData({ displayList: sorted.slice(0, 30) });
    } else {
      this.filterLocal();
    }
  },

  // ======== 切换分类 ========
  switchCategory(e) {
    const catId = e.currentTarget.dataset.id;
    this.setData({ currentCat: catId });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    setTimeout(() => this._updateSpacerHeight(), 80);

    if (this.data.sourceTab === 'leetcode') {
      this.setData({ leetcodeList: [], lcPage: 0, lcHasMore: true });
      this.loadLeetCode();
    } else {
      this.applyFilters();
    }
  },

  // ======== 本地题库过滤（分类 + 难度 + 搜索） ========
  filterLocal() {
    const catId = this.data.currentCat;
    const diffMap = { 'EASY': '简单', 'MEDIUM': '中等', 'HARD': '困难' };
    const diffCn = diffMap[this.data.currentDiff];
    const keyword = this.data.searchKeyword.toLowerCase();

    let filtered = this.data.allQuestions;

    // 分类
    if (catId !== 'all') {
      filtered = filtered.filter(q => q.category === catId);
    }
    // 难度
    if (diffCn) {
      filtered = filtered.filter(q => q.difficulty === diffCn);
    }
    // 搜索
    if (keyword) {
      filtered = filtered.filter(q =>
        q.title.toLowerCase().includes(keyword) ||
        (q.answer && q.answer.toLowerCase().includes(keyword))
      );
    }

    // 精华区筛选
    if (this.data.featuredFilter === 'featured') {
      filtered = filtered.filter(q => q.isFeatured);
    } else if (this.data.featuredFilter === 'hot') {
      filtered = filtered.slice().sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }

    this.setData({ displayList: filtered });
  },

  // ======== LeetCode 在线加载 ========
  loadLeetCode() {
    if (this.data.lcLoading) return;
    this.setData({ lcLoading: true });

    const catId = this.data.currentCat;
    const diff = this.data.currentDiff; // 传给 API 做服务端过滤
    const pageSize = this.data.lcPageSize;
    const skip = this.data.lcPage * pageSize;

    fetchLeetCodeProblems(catId, diff, pageSize, skip).then(list => {
      if (!list || list.length === 0) {
        this.setData({ lcLoading: false, lcHasMore: false });
        if (this.data.leetcodeList.length === 0) {
          this.setData({ displayList: [] });
        }
        return;
      }

      const merged = this.data.leetcodeList.concat(list);
      this.setData({
        leetcodeList: merged,
        lcLoading: false,
        lcPage: this.data.lcPage + 1,
        lcHasMore: list.length >= pageSize
      });

      // 应用搜索过滤（如果有搜索词）
      this.applyFilters();
    }).catch(() => {
      this.setData({ lcLoading: false });
      wx.showToast({ title: 'LeetCode 加载失败', icon: 'none' });
    });
  },

  // ======== 加载更多 LeetCode ========
  loadMoreLeetCode() {
    if (this.data.sourceTab !== 'leetcode') return;
    if (!this.data.lcHasMore || this.data.lcLoading) return;
    this.loadLeetCode();
  },

  onReachBottom() {
    this.loadMoreLeetCode();
  },

  // ======== AI 智能出题 ========
  aiGenerateQuestions() {
    const catId = this.data.currentCat;
    if (catId === 'all') {
      wx.showToast({ title: '请先选择一个分类', icon: 'none' });
      return;
    }

    const catName = this.data.categories.find(c => c.id === catId);
    if (!catName) return;

    this.setData({ aiLoading: true });

    generateQuestions(catName.name, 5).then(questions => {
      if (!questions || questions.length === 0) {
        wx.showToast({ title: 'AI出题失败，请重试', icon: 'none' });
        this.setData({ aiLoading: false });
        return;
      }

      const maxId = Math.max(...this.data.allQuestions.map(q => typeof q.id === 'number' ? q.id : 0), 100);
      const newQuestions = questions.map((q, i) => ({
        id: maxId + i + 1,
        title: q.title,
        category: catId,
        difficulty: q.difficulty || '中等',
        views: 0,
        answer: q.answer || '暂无参考答案',
        isAI: true
      }));

      const allQuestions = this.data.allQuestions.concat(newQuestions);
      this.setData({ allQuestions, aiLoading: false });
      this.applyFilters();
      wx.showToast({ title: '已生成' + newQuestions.length + '道新题', icon: 'success' });
    }).catch(() => {
      this.setData({ aiLoading: false });
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    });
  },

  // ======== 精华筛选 ========
  switchFeatured(e) {
    const val = e.currentTarget.dataset.val;
    const cur = this.data.featuredFilter;
    this.setData({ featuredFilter: cur === val ? '' : val });
    this.applyFilters();
  },

  // ======== 话题讨论 ========
  selectTopic(e) {
    const idx = e.currentTarget.dataset.idx;
    const topic = this.data.topics[idx];
    this.setData({ currentTopic: topic });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    this._filterByTopic(topic);
    setTimeout(() => this._updateSpacerHeight(), 80);
  },

  clearTopic() {
    this.setData({ currentTopic: null, displayList: [] });
    setTimeout(() => this._updateSpacerHeight(), 80);
  },

  _filterByTopic(topic) {
    let filtered = this.data.allQuestions;
    if (topic.cats && topic.cats.length > 0) {
      filtered = filtered.filter(q => topic.cats.includes(q.category));
    }
    this.setData({ displayList: filtered });
  },

  // ======== 题目交互 ========
  goToDetail(e) {
    const item = e.currentTarget.dataset.item;
    wx.setStorageSync('currentQuestion', item);
    wx.navigateTo({ url: '/pages/question-detail/question-detail' });
  }
});

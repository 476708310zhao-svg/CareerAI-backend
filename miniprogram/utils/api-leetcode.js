// utils/api-leetcode.js
// LeetCode 题库模块（直连 leetcode.cn GraphQL）

const config = require('./app-config.js');
const LEETCODE_API_URL = config.LEETCODE_API_URL;
const LC_CACHE_PREFIX = 'lc_cache_';
const LC_LIST_TTL = 30 * 60 * 1000;
const LC_STATS_TTL = 6 * 60 * 60 * 1000;
const _pending = {};

const CATEGORY_TO_LEETCODE_TAGS = {
  java:      [],
  frontend:  ['javascript'],
  algorithm: [],
  system:    ['design'],
  behavior:  [],
  python:    [],
  database:  ['database'],
  os:        [],
  network:   [],
  all:       []
};

const DIFF_MAP = { 'EASY': '简单', 'MEDIUM': '中等', 'HARD': '困难' };

const LC_HEADER = {
  'Content-Type': 'application/json',
  'Referer': 'https://leetcode.cn',
  'Origin':  'https://leetcode.cn'
};

function _cacheKey(name, params) {
  return LC_CACHE_PREFIX + name + '_' + JSON.stringify(params || {});
}

function _getCache(key, ttl) {
  try {
    const cached = wx.getStorageSync(key);
    if (cached && (Date.now() - cached.t) < ttl) return cached.d;
  } catch (e) {}
  return null;
}

function _setCache(key, data) {
  try {
    wx.setStorageSync(key, { d: data, t: Date.now() });
  } catch (e) {}
}

/**
 * 从 LeetCode 拉取真实编程题
 */
function fetchLeetCodeProblems(category, difficulty, limit, skip) {
  limit = limit || 20;
  skip  = skip  || 0;
  const cacheKey = _cacheKey('list', { category: category || 'all', difficulty: difficulty || '', limit, skip });
  const cached = _getCache(cacheKey, LC_LIST_TTL);
  if (cached) return Promise.resolve(cached);
  if (_pending[cacheKey]) return _pending[cacheKey];

  const tags = CATEGORY_TO_LEETCODE_TAGS[category] || [];
  const filters = {};
  if (difficulty) filters.difficulty = difficulty;
  if (tags.length > 0) filters.tags = tags;

  const query = `query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
    problemsetQuestionList(categorySlug: $categorySlug limit: $limit skip: $skip filters: $filters) {
      total hasMore
      questions {
        frontendQuestionId title titleCn titleSlug difficulty acRate paidOnly
        topicTags { name nameTranslated slug }
      }
    }
  }`;

  _pending[cacheKey] = new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        delete _pending[cacheKey];
        console.warn('LeetCode API 超时');
        resolve(_getCache(cacheKey, 24 * 60 * 60 * 1000) || []);
      }
    }, 6000);

    wx.request({
      url: LEETCODE_API_URL,
      method: 'POST',
      header: LC_HEADER,
      data: { query, variables: { categorySlug: '', limit, skip, filters } },
      timeout: 6000,
      success: (res) => {
        if (resolved) return;
        resolved = true;
        delete _pending[cacheKey];
        clearTimeout(timer);
        try {
          const raw = res.data.data.problemsetQuestionList.questions || [];
          const formatted = raw.filter(q => !q.paidOnly).map(q => {
            const rate = q.acRate > 1 ? q.acRate : q.acRate * 100;
            const rateStr = rate.toFixed(1) + '%';
            return {
              id: 'lc_' + q.frontendQuestionId,
              lcId: q.frontendQuestionId,
              title: q.titleCn || q.title,
              titleEn: q.title,
              difficulty: DIFF_MAP[q.difficulty] || '中等',
              category: category || 'algorithm',
              acRate: rateStr,
              views: Math.floor(rate * 100),
              tags: (q.topicTags || []).map(t => t.nameTranslated || t.name),
              answer: '通过率: ' + rateStr + ' | 标签: ' + (q.topicTags || []).map(t => t.nameTranslated || t.name).slice(0, 3).join('、'),
              source: 'leetcode',
              isAI: false
            };
          });
          _setCache(cacheKey, formatted);
          resolve(formatted);
        } catch (e) {
          console.error('LeetCode 解析失败:', e);
          resolve([]);
        }
      },
      fail: (err) => {
        if (resolved) return;
        resolved = true;
        delete _pending[cacheKey];
        clearTimeout(timer);
        console.error('LeetCode 请求失败:', err);
        resolve(_getCache(cacheKey, 24 * 60 * 60 * 1000) || []);
      }
    });
  });
  return _pending[cacheKey];
}

/**
 * 获取 LeetCode 题库总数统计
 */
function fetchLeetCodeStats() {
  const cacheKey = _cacheKey('stats', {});
  const cached = _getCache(cacheKey, LC_STATS_TTL);
  if (cached) return Promise.resolve(cached);
  if (_pending[cacheKey]) return _pending[cacheKey];
  const query = `query problemsetQuestionList {
    problemsetQuestionList(categorySlug: "", limit: 1, skip: 0, filters: {}) { total }
  }`;
  _pending[cacheKey] = new Promise((resolve) => {
    wx.request({
      url: LEETCODE_API_URL,
      method: 'POST',
      header: LC_HEADER,
      data: { query },
      timeout: 6000,
      success: (res) => {
        try {
          const total = res.data.data.problemsetQuestionList.total || 3000;
          const stats = { total, easy: Math.round(total * 0.27), medium: Math.round(total * 0.48), hard: Math.round(total * 0.25) };
          _setCache(cacheKey, stats);
          resolve(stats);
        } catch (e) {
          resolve({ total: 3000, easy: 810, medium: 1440, hard: 750 });
        }
      },
      fail: () => resolve(_getCache(cacheKey, 24 * 60 * 60 * 1000) || { total: 3000, easy: 800, medium: 1500, hard: 700 }),
      complete: () => {
        delete _pending[cacheKey];
      }
    });
  });
  return _pending[cacheKey];
}

module.exports = { fetchLeetCodeProblems, fetchLeetCodeStats };

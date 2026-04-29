// utils/api-leetcode.js
// LeetCode 题库模块（直连 leetcode.cn GraphQL）

const config = require('./config.js');
const LEETCODE_API_URL = config.LEETCODE_API_URL;

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

/**
 * 从 LeetCode 拉取真实编程题
 */
function fetchLeetCodeProblems(category, difficulty, limit, skip) {
  limit = limit || 20;
  skip  = skip  || 0;

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

  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; console.warn('LeetCode API 超时'); resolve([]); }
    }, 8000);

    wx.request({
      url: LEETCODE_API_URL,
      method: 'POST',
      header: LC_HEADER,
      data: { query, variables: { categorySlug: '', limit, skip, filters } },
      success: (res) => {
        if (resolved) return;
        resolved = true;
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
          resolve(formatted);
        } catch (e) {
          console.error('LeetCode 解析失败:', e);
          resolve([]);
        }
      },
      fail: (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        console.error('LeetCode 请求失败:', err);
        resolve([]);
      }
    });
  });
}

/**
 * 获取 LeetCode 题库总数统计
 */
function fetchLeetCodeStats() {
  const query = `query problemsetQuestionList {
    problemsetQuestionList(categorySlug: "", limit: 1, skip: 0, filters: {}) { total }
  }`;
  return new Promise((resolve) => {
    wx.request({
      url: LEETCODE_API_URL,
      method: 'POST',
      header: LC_HEADER,
      data: { query },
      success: (res) => {
        try {
          const total = res.data.data.problemsetQuestionList.total || 3000;
          resolve({ total, easy: Math.round(total * 0.27), medium: Math.round(total * 0.48), hard: Math.round(total * 0.25) });
        } catch (e) {
          resolve({ total: 3000, easy: 810, medium: 1440, hard: 750 });
        }
      },
      fail: () => resolve({ total: 3000, easy: 800, medium: 1500, hard: 700 })
    });
  });
}

module.exports = { fetchLeetCodeProblems, fetchLeetCodeStats };

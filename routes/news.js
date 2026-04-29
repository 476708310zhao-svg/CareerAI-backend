// routes/news.js — 求职快讯 API（NewsAPI.org 代理 + 30分钟缓存 + mock 兜底）
const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const NEWS_API_KEY = process.env.NEWS_API_KEY || '';
const CACHE_TTL    = 30 * 60 * 1000; // 30 分钟

// 简单内存缓存
const _cache = {};

// 按分类对应的中文搜索词
const TAB_QUERIES = {
  all:    '求职 OR 留学生 OR 招聘 OR 职场',
  news:   '校招 OR 春招 OR 秋招 OR 招聘',
  tip:    '面试技巧 OR 简历优化 OR offer',
  data:   '薪资报告 OR 就业数据 OR 职场薪酬',
  policy: 'OPT OR H1B OR 落户政策 OR 签证',
};

// GET /api/news?tab=all&keyword=xxx
router.get('/', async (req, res) => {
  const tab     = req.query.tab     || 'all';
  const keyword = (req.query.keyword || '').trim();

  if (!NEWS_API_KEY) {
    // 未配置 API key → 返回空列表，前端自动降级 mock
    return res.json({ source: 'mock', articles: [] });
  }

  const cacheKey = `${tab}::${keyword}`;
  const now      = Date.now();

  if (_cache[cacheKey] && now - _cache[cacheKey].time < CACHE_TTL) {
    return res.json({ source: 'cache', articles: _cache[cacheKey].data });
  }

  try {
    const q = keyword || TAB_QUERIES[tab] || TAB_QUERIES.all;

    const { data } = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q,
        language:  'zh',
        sortBy:    'publishedAt',
        pageSize:  30,
        apiKey:    NEWS_API_KEY,
      },
      timeout: 8000,
    });

    const articles = (data.articles || [])
      .filter(a => a.title && a.title !== '[Removed]')
      .map((a, i) => ({
        id:         'api_' + i + '_' + Date.now(),
        title:      a.title,
        desc:       a.description || a.title,
        content:    buildContent(a),
        url:        a.url || '',
        source:     a.source?.name || '资讯',
        time:       relativeTime(a.publishedAt),
        type:       guessType(a.title + ' ' + (a.description || ''), tab),
        isPersonal: false,
      }));

    _cache[cacheKey] = { data: articles, time: now };
    res.json({ source: 'api', articles });

  } catch (err) {
    console.error('[News API Error]', err.message);
    // API 报错 → 前端降级 mock，不影响用户
    res.json({ source: 'mock', articles: [] });
  }
});

// ── 工具函数 ─────────────────────────────────────────────────────────────

function guessType(text, defaultTab) {
  if (defaultTab !== 'all') return defaultTab;
  if (/招聘|校招|春招|秋招|offer|实习/i.test(text))           return 'news';
  if (/技巧|简历|面试|STAR|ATS|笔试/i.test(text))            return 'tip';
  if (/薪资|数据|报告|平均|涨薪|调薪/i.test(text))           return 'data';
  if (/政策|签证|OPT|H1B|落户|CPT|移民/i.test(text))         return 'policy';
  return 'news';
}

function relativeTime(iso) {
  if (!iso) return '近期';
  const diff  = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1)  return '刚刚';
  if (hours < 24) return hours + '小时前';
  const days  = Math.floor(diff / 86400000);
  if (days === 1) return '昨天';
  if (days < 7)   return days + '天前';
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function buildContent(a) {
  const parts = [];
  if (a.description) parts.push(a.description);
  if (a.content) {
    // NewsAPI 免费版 content 会被截断，去掉截断提示
    const cleaned = a.content.replace(/\[\+\d+ chars\]$/, '').trim();
    if (cleaned && cleaned !== a.description) parts.push(cleaned);
  }
  if (a.url) parts.push('\n阅读原文：' + a.url);
  if (a.source?.name) parts.push('来源：' + a.source.name);
  return parts.join('\n\n');
}

module.exports = router;

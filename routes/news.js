// routes/news.js — 求职快讯 API（RSS聚合 + 30分钟缓存 + mock 兜底）
const express = require('express');
const router  = express.Router();
const Parser  = require('rss-parser');
const axios   = require('axios');
const db      = require('../db/database');

const rssParser = new Parser({ timeout: 8000 });
const CACHE_TTL  = 30 * 60 * 1000; // 30 分钟
const OFFICIAL_SOURCE_NAME = process.env.OFFICIAL_NEWS_SOURCE_NAME || '职引官网';

// 简单内存缓存
const _cache = {};

function splitEnvList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

const OFFICIAL_RSS_FEEDS = splitEnvList(process.env.OFFICIAL_NEWS_FEEDS).map((url) => ({
  url,
  source: OFFICIAL_SOURCE_NAME,
  type: 'news',
  lang: 'zh',
  official: true
}));

const OFFICIAL_API_URLS = splitEnvList(process.env.OFFICIAL_NEWS_API_URLS);

// RSS 源配置（均可从服务器访问）
const RSS_FEEDS = [
  ...OFFICIAL_RSS_FEEDS,
  // ── 中文职场/科技 ──
  { url: 'https://36kr.com/feed',                         source: '36氪',         type: 'news', lang: 'zh' },
  { url: 'https://www.woshipm.com/feed',                  source: '人人都是PM',    type: 'tip',  lang: 'zh' },
  { url: 'https://www.geekpark.net/rss',                  source: '极客公园',      type: 'news', lang: 'zh' },
  { url: 'https://www.infoq.cn/feed',                     source: 'InfoQ中文',     type: 'news', lang: 'zh' },
  // ── 英文科技/职位 ──
  { url: 'https://hnrss.org/jobs',                        source: 'HN Jobs',       type: 'news', lang: 'en' },
  { url: 'https://hnrss.org/newest?q=hiring+OR+job+OR+salary', source: 'Hacker News', type: 'data', lang: 'en' },
  { url: 'https://techcrunch.com/feed/',                  source: 'TechCrunch',    type: 'news', lang: 'en' },
  { url: 'https://feeds.feedburner.com/TechCrunchIT',     source: 'TechCrunch IT', type: 'news', lang: 'en' },
  { url: 'https://www.levels.fyi/blog/feed.xml',          source: 'Levels.fyi',    type: 'data', lang: 'en' },
];

// tab 关键词过滤（null = 不过滤）
const TAB_KEYWORDS = {
  all:    null,
  news:   /校招|招聘|春招|秋招|实习|offer|hiring|layoff|job|career|startup/i,
  tip:    /面试|简历|求职|技巧|offer|ATS|interview|resume|negotiat|linkedin/i,
  data:   /薪资|数据|报告|涨薪|salary|compensation|pay|TC|wage|report/i,
  policy: /OPT|H1B|签证|落户|CPT|visa|immigration|work permit/i,
};

async function fetchAllFeeds() {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const parsed = await rssParser.parseURL(feed.url);
      return (parsed.items || []).slice(0, 20).map((item) => ({
        id:         (feed.official ? 'official_rss_' : 'rss_') + (item.guid || item.link || (feed.source + '_' + (item.title || ''))),
        title:      (item.title || '').trim(),
        desc:       (item.contentSnippet || item.summary || item.title || '').slice(0, 200),
        content:    (item.content || item['content:encoded'] || item.contentSnippet || '')
                    + '\n\n来源：' + feed.source,
        url:        item.link || '',
        source:     feed.source,
        lang:       feed.lang || 'zh',
        time:       relativeTime(item.pubDate || item.isoDate),
        pubDate:    item.pubDate || item.isoDate || '',
        type:       feed.type,
        isOfficial: !!feed.official,
        isPersonal: false,
      }));
    })
  );

  const seen = new Set();
  const articles = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const a of r.value) {
      if (!a.title || seen.has(a.id)) continue;
      seen.add(a.id);
      articles.push(a);
    }
  }
  // 按发布时间降序
  articles.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });
  return articles;
}

function pickArticleList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.articles)) return payload.articles;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.articles)) return payload.data.articles;
  if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
  if (payload.data && Array.isArray(payload.data.list)) return payload.data.list;
  return [];
}

function stripHtml(input) {
  return String(input || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectType(category) {
  const text = String(category || '').toLowerCase();
  if (/政策|签证|opt|cpt|h1b|visa|policy/.test(text)) return 'policy';
  if (/攻略|技巧|简历|面试|tip|guide|interview|resume/.test(text)) return 'tip';
  if (/数据|报告|薪资|data|report|salary/.test(text)) return 'data';
  return 'news';
}

function normalizeOfficialArticle(item, idx, url) {
  const title = item.title || item.name || item.headline || '';
  const content = item.content || item.body || item.html || item.markdown || item.detail || '';
  const desc = item.desc || item.summary || item.excerpt || item.description || stripHtml(content).slice(0, 200) || title;
  const pubDate = item.pubDate || item.publishedAt || item.published_at || item.createdAt || item.created_at || item.date || '';
  const articleUrl = item.url || item.link || item.permalink || item.sourceUrl || item.source_url || '';
  const category = item.category || item.type || item.tag || '';
  return {
    id:         'official_api_' + (item.id || item.slug || item.guid || articleUrl || `${url}_${idx}`),
    title:      String(title).trim(),
    desc:       String(desc || '').slice(0, 200),
    content:    (content ? stripHtml(content) : String(desc || '')) + '\n\n来源：' + OFFICIAL_SOURCE_NAME,
    url:        articleUrl,
    source:     OFFICIAL_SOURCE_NAME,
    lang:       item.lang || item.language || 'zh',
    time:       relativeTime(pubDate),
    pubDate,
    type:       ['news', 'tip', 'data', 'policy'].includes(item.type) ? item.type : detectType(category),
    imageUrl:   item.imageUrl || item.image_url || item.cover || item.cover_url || item.thumbnail || '',
    isOfficial: true,
    isPersonal: false,
  };
}

async function fetchOfficialApis() {
  if (!OFFICIAL_API_URLS.length) return [];
  const results = await Promise.allSettled(
    OFFICIAL_API_URLS.map(async (url) => {
      const res = await axios.get(url, { timeout: 8000 });
      return pickArticleList(res.data)
        .slice(0, 50)
        .map((item, idx) => normalizeOfficialArticle(item, idx, url));
    })
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

function fetchLocalAnnouncements() {
  try {
    return db.prepare(`
      SELECT id, title, content, category, cover_url, is_pinned, created_at, updated_at
      FROM announcements
      WHERE is_published = 1
      ORDER BY is_pinned DESC, created_at DESC
      LIMIT 50
    `).all().map(row => ({
      id:         'announcement_' + row.id,
      title:      row.title,
      desc:       stripHtml(row.content).slice(0, 200),
      content:    stripHtml(row.content) + '\n\n来源：职引',
      url:        '',
      source:     '职引',
      lang:       'zh',
      time:       relativeTime(row.updated_at || row.created_at),
      pubDate:    row.updated_at || row.created_at || '',
      type:       detectType(row.category),
      imageUrl:   row.cover_url || '',
      isPinned:   !!row.is_pinned,
      isOfficial: true,
      isPersonal: false,
    }));
  } catch (err) {
    console.warn('[News announcements]', err.message);
    return [];
  }
}

// GET /api/news?tab=all&keyword=xxx&lang=zh|en
router.get('/', async (req, res) => {
  const tab     = req.query.tab     || 'all';
  const keyword = (req.query.keyword || '').trim();
  const lang    = req.query.lang    || '';   // 'zh' | 'en' | '' = 全部

  const cacheKey = `${tab}::${keyword}::${lang}`;
  const now      = Date.now();

  if (_cache[cacheKey] && now - _cache[cacheKey].time < CACHE_TTL) {
    return res.json({ source: 'cache', articles: _cache[cacheKey].data });
  }

  try {
    const [rssArticles, officialApiArticles] = await Promise.all([
      fetchAllFeeds(),
      fetchOfficialApis()
    ]);

    let articles = [...fetchLocalAnnouncements(), ...officialApiArticles, ...rssArticles];
    const seen = new Set();
    articles = articles.filter((a) => {
      const key = String(a.url || a.id || a.title).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return !!a.title;
    });

    articles.sort((a, b) => {
      if ((b.isPinned ? 1 : 0) !== (a.isPinned ? 1 : 0)) return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
      const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return tb - ta;
    });

    // 语言过滤
    if (lang === 'zh' || lang === 'en') {
      articles = articles.filter(a => a.lang === lang);
    }

    // tab 过滤
    const tabRe = TAB_KEYWORDS[tab];
    if (tabRe) {
      articles = articles.filter(a => tabRe.test(a.title + ' ' + a.desc));
    }

    // 关键词搜索
    if (keyword) {
      const kw = keyword.toLowerCase();
      articles = articles.filter(a =>
        a.title.toLowerCase().includes(kw) || a.desc.toLowerCase().includes(kw)
      );
    }

    _cache[cacheKey] = { data: articles, time: now };
    res.json({ source: 'rss', articles, total: articles.length });

  } catch (err) {
    console.error('[News RSS Error]', err.message);
    res.json({ source: 'mock', articles: [], total: 0 });
  }
});

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

module.exports = router;

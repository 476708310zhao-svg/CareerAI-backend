const express = require('express');
const Parser = require('rss-parser');
const axios = require('axios');
const db = require('../db/database');

const router = express.Router();
const rssParser = new Parser({ timeout: 8000 });
const CACHE_TTL = 30 * 60 * 1000;
const cache = {};

const OFFICIAL_SOURCE_NAME = process.env.OFFICIAL_NEWS_SOURCE_NAME || '职引官网';

function splitEnvList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

const OFFICIAL_RSS_FEEDS = splitEnvList(process.env.OFFICIAL_NEWS_FEEDS).map(url => ({
  url,
  source: OFFICIAL_SOURCE_NAME,
  type: 'news',
  lang: 'zh',
  official: true
}));

const OFFICIAL_API_URLS = splitEnvList(process.env.OFFICIAL_NEWS_API_URLS);

const RSS_FEEDS = [
  ...OFFICIAL_RSS_FEEDS,
  { url: 'https://www.woshipm.com/feed', source: '人人都是产品经理', type: 'tip', lang: 'zh' },
  { url: 'https://www.infoq.cn/feed', source: 'InfoQ中文', type: 'news', lang: 'zh' },
  { url: 'https://www.geekpark.net/rss', source: '极客公园', type: 'news', lang: 'zh' },
  { url: 'https://36kr.com/feed', source: '36氪', type: 'news', lang: 'zh' },
  { url: 'https://www.levels.fyi/blog/feed.xml', source: 'Levels.fyi', type: 'data', lang: 'en' },
  { url: 'https://hnrss.org/jobs', source: 'HN Jobs', type: 'news', lang: 'en' },
  { url: 'https://hnrss.org/newest?q=hiring+OR+job+OR+salary+OR+interview+OR+resume', source: 'Hacker News', type: 'tip', lang: 'en' },
  { url: 'https://techcrunch.com/feed/', source: 'TechCrunch', type: 'news', lang: 'en' },
  { url: 'https://www.themuse.com/advice/rss', source: 'The Muse Advice', type: 'tip', lang: 'en' },
  { url: 'https://www.jobscan.co/blog/feed/', source: 'Jobscan', type: 'tip', lang: 'en' },
  { url: 'https://careersidekick.com/feed/', source: 'Career Sidekick', type: 'tip', lang: 'en' }
];

const CURATED_ARTICLES = [
  {
    id: 'career_resume_ats_2026',
    title: '留学生简历如何通过 ATS：关键词、项目量化和岗位匹配',
    desc: '用目标岗位 JD 反推简历结构，优化 Summary、技能词、项目结果和动词表达，减少 ATS 漏筛。',
    content: '建议按目标岗位拆出硬技能、业务关键词、工具栈、结果指标四类词，再回填到简历的 Summary、Skills 和 Experience 中。',
    type: 'tip',
    lang: 'zh',
    source: '职引编辑部',
    pubDate: '2026-05-28T08:00:00.000Z',
    tags: ['简历优化', 'ATS', '留学生求职']
  },
  {
    id: 'career_behavior_star_2026',
    title: '行为面试 STAR 框架：如何讲清楚个人贡献而不是项目流水账',
    desc: '从 Situation、Task、Action、Result 四段组织答案，突出决策、权衡、协作和结果指标。',
    content: '一个有效的 STAR 答案需要有明确目标、你亲自采取的行动、可验证结果，以及复盘后的下一步优化。',
    type: 'tip',
    lang: 'zh',
    source: '职引编辑部',
    pubDate: '2026-05-25T08:00:00.000Z',
    tags: ['面试技巧', 'STAR', 'BQ']
  },
  {
    id: 'career_linkedin_outreach_2026',
    title: 'LinkedIn Coffee Chat 模板：如何让校友愿意回复你',
    desc: '拆解一封高回复率私信：身份说明、具体请教点、低压力请求和后续感谢。',
    content: '不要泛泛而谈“想了解贵司”，而是提出一个对方能在 10 分钟内回答的问题，并附上你已做过的研究。',
    type: 'tip',
    lang: 'zh',
    source: '职引编辑部',
    pubDate: '2026-05-22T08:00:00.000Z',
    tags: ['Networking', 'LinkedIn', '内推']
  },
  {
    id: 'career_offer_compare_2026',
    title: 'Offer 对比不只看总包：薪资、股票、签证和成长空间怎么权衡',
    desc: '从现金流、股票风险、团队稳定性、城市成本和身份支持五个维度建立决策表。',
    content: '总包高不等于长期收益高。需要把 vesting、refresh、裁员风险、H-1B 支持和城市生活成本放在一起比较。',
    type: 'data',
    lang: 'zh',
    source: '职引编辑部',
    pubDate: '2026-05-20T08:00:00.000Z',
    tags: ['Offer', '薪资谈判', '总包']
  },
  {
    id: 'career_newgrad_timeline_2026',
    title: '2026 New Grad 求职时间线：暑期前应该完成哪些准备',
    desc: '按 3 个月、6 个月、12 个月拆解刷题、项目、简历、投递和面试节奏。',
    content: '北美 New Grad 岗位常常提前开放。建议在暑期前完成简历定稿、项目包装、题库复盘和目标公司清单。',
    type: 'news',
    lang: 'zh',
    source: '职引编辑部',
    pubDate: '2026-05-18T08:00:00.000Z',
    tags: ['New Grad', '校招', '时间线']
  },
  {
    id: 'career_h1b_opt_risk_2026',
    title: 'OPT、CPT、H-1B：投递前如何判断岗位的身份风险',
    desc: '看清岗位 sponsor 信号、雇主历史、岗位地点、合同类型和入职时间，避免后期被动。',
    content: '身份风险需要前置评估。建议关注公司是否有 sponsor 历史、岗位是否 full-time、是否接受 OPT/CPT，以及 HR 是否能明确答复。',
    type: 'policy',
    lang: 'zh',
    source: '职引编辑部',
    pubDate: '2026-05-16T08:00:00.000Z',
    tags: ['OPT', 'H-1B', '签证']
  },
  {
    id: 'career_system_design_intern_2026',
    title: '实习和 New Grad 如何准备系统设计：先讲清 trade-off',
    desc: '从 API、数据模型、扩展性、缓存和故障处理五个模块准备入门级系统设计。',
    content: '初级岗位的系统设计重点不是背架构，而是把需求澄清、容量估算、核心数据流和权衡讲清楚。',
    type: 'tip',
    lang: 'zh',
    source: '职引编辑部',
    pubDate: '2026-05-14T08:00:00.000Z',
    tags: ['系统设计', '技术面试', 'SDE']
  }
];

const TAB_KEYWORDS = {
  all: null,
  news: /校招|招聘|春招|秋招|实习|offer|hiring|layoff|job|career|startup|new grad/i,
  tip: /面试|简历|求职|技巧|offer|ATS|interview|resume|negotiat|linkedin|networking|case|system design/i,
  data: /薪资|数据|报告|涨薪|salary|compensation|pay|TC|wage|report|levels/i,
  policy: /OPT|H1B|H-1B|签证|落户|CPT|visa|immigration|work permit|sponsor/i
};

function stripHtml(input) {
  return String(input || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value = '') {
  return stripHtml(value);
}

function relativeTime(iso) {
  if (!iso) return '近期';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '近期';
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(diff / 86400000);
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function detectType(category) {
  const text = String(category || '').toLowerCase();
  if (/政策|签证|opt|cpt|h1b|h-1b|visa|policy/.test(text)) return 'policy';
  if (/攻略|技巧|简历|面试|tip|guide|interview|resume|networking/.test(text)) return 'tip';
  if (/数据|报告|薪资|data|report|salary|compensation/.test(text)) return 'data';
  return 'news';
}

function normalizeRssItem(item, feed) {
  const title = normalizeText(item.title || '');
  const desc = normalizeText(item.contentSnippet || item.summary || item.description || title).slice(0, 220);
  const content = normalizeText(item.content || item['content:encoded'] || desc);
  const pubDate = item.isoDate || item.pubDate || '';
  return {
    id: `${feed.official ? 'official_rss' : 'rss'}_${item.guid || item.link || `${feed.source}_${title}`}`,
    title,
    desc,
    content: `${content}\n\n来源：${feed.source}`,
    url: item.link || '',
    source: feed.source,
    lang: feed.lang || 'zh',
    time: relativeTime(pubDate),
    pubDate,
    type: feed.type,
    tags: [feed.source],
    isOfficial: !!feed.official,
    isPersonal: false
  };
}

function normalizeCuratedArticle(article) {
  return {
    ...article,
    time: relativeTime(article.pubDate),
    url: article.url || '',
    isOfficial: true,
    isPersonal: false
  };
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

function normalizeOfficialArticle(item, idx, url) {
  const title = item.title || item.name || item.headline || '';
  const content = item.content || item.body || item.html || item.markdown || item.detail || '';
  const desc = item.desc || item.summary || item.excerpt || item.description || stripHtml(content).slice(0, 200) || title;
  const pubDate = item.pubDate || item.publishedAt || item.published_at || item.createdAt || item.created_at || item.date || '';
  const articleUrl = item.url || item.link || item.permalink || item.sourceUrl || item.source_url || '';
  const category = item.category || item.type || item.tag || '';
  return {
    id: `official_api_${item.id || item.slug || item.guid || articleUrl || `${url}_${idx}`}`,
    title: String(title).trim(),
    desc: String(desc || '').slice(0, 220),
    content: `${content ? stripHtml(content) : String(desc || '')}\n\n来源：${OFFICIAL_SOURCE_NAME}`,
    url: articleUrl,
    source: OFFICIAL_SOURCE_NAME,
    lang: item.lang || item.language || 'zh',
    time: relativeTime(pubDate),
    pubDate,
    type: ['news', 'tip', 'data', 'policy'].includes(item.type) ? item.type : detectType(category),
    imageUrl: item.imageUrl || item.image_url || item.cover || item.cover_url || item.thumbnail || '',
    isOfficial: true,
    isPersonal: false
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
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
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
      id: `announcement_${row.id}`,
      title: row.title,
      desc: stripHtml(row.content).slice(0, 220),
      content: `${stripHtml(row.content)}\n\n来源：职引`,
      url: '',
      source: '职引',
      lang: 'zh',
      time: relativeTime(row.updated_at || row.created_at),
      pubDate: row.updated_at || row.created_at || '',
      type: detectType(row.category),
      imageUrl: row.cover_url || '',
      isPinned: !!row.is_pinned,
      isOfficial: true,
      isPersonal: false
    }));
  } catch (err) {
    console.warn('[News announcements]', err.message);
    return [];
  }
}

async function fetchAllFeeds() {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const parsed = await rssParser.parseURL(feed.url);
      return (parsed.items || []).slice(0, 18).map(item => normalizeRssItem(item, feed));
    })
  );

  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

function dedupeAndSort(articles) {
  const seen = new Set();
  return articles
    .filter((article) => {
      const key = String(article.url || article.id || article.title).toLowerCase();
      if (!article.title || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if ((b.isPinned ? 1 : 0) !== (a.isPinned ? 1 : 0)) {
        return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
      }
      const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return tb - ta;
    });
}

function applyFilters(articles, { tab, keyword, lang }) {
  let list = [...articles];

  if (lang === 'zh' || lang === 'en') {
    list = list.filter(article => article.lang === lang);
  }

  if (tab && tab !== 'all') {
    const tabRe = TAB_KEYWORDS[tab];
    list = list.filter(article =>
      article.type === tab || (tabRe ? tabRe.test(`${article.title} ${article.desc} ${article.content}`) : true)
    );
  }

  if (keyword) {
    const kw = keyword.toLowerCase();
    list = list.filter(article =>
      `${article.title} ${article.desc} ${article.content} ${(article.tags || []).join(' ')}`
        .toLowerCase()
        .includes(kw)
    );
  }

  return list;
}

router.get('/', async (req, res) => {
  const tab = req.query.tab || 'all';
  const keyword = String(req.query.keyword || '').trim();
  const lang = req.query.lang || '';
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 60, 1), 120);
  const cacheKey = `${tab}::${keyword}::${lang}::${limit}`;
  const now = Date.now();

  if (cache[cacheKey] && now - cache[cacheKey].time < CACHE_TTL) {
    return res.json({ source: 'cache', articles: cache[cacheKey].data, total: cache[cacheKey].data.length });
  }

  try {
    const [rssArticles, officialApiArticles] = await Promise.all([
      fetchAllFeeds(),
      fetchOfficialApis()
    ]);
    const articles = dedupeAndSort([
      ...fetchLocalAnnouncements(),
      ...officialApiArticles,
      ...rssArticles,
      ...CURATED_ARTICLES.map(normalizeCuratedArticle)
    ]);
    const filtered = applyFilters(articles, { tab, keyword, lang }).slice(0, limit);
    cache[cacheKey] = { data: filtered, time: now };
    res.json({ source: 'rss+official+curated', articles: filtered, total: filtered.length });
  } catch (err) {
    console.error('[News RSS Error]', err.message);
    const articles = applyFilters(CURATED_ARTICLES.map(normalizeCuratedArticle), { tab, keyword, lang }).slice(0, limit);
    res.json({ source: 'curated', articles, total: articles.length });
  }
});

module.exports = router;

const express = require('express');
const Parser = require('rss-parser');

const router = express.Router();
const rssParser = new Parser({ timeout: 8000 });
const CACHE_TTL = 30 * 60 * 1000;
const cache = {};

const RSS_FEEDS = [
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
  { url: 'https://careersidekick.com/feed/', source: 'Career Sidekick', type: 'tip', lang: 'en' },
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
    tags: ['简历优化', 'ATS', '留学生求职'],
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
    tags: ['面试技巧', 'STAR', 'BQ'],
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
    tags: ['Networking', 'LinkedIn', '内推'],
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
    tags: ['Offer', '薪资谈判', '总包'],
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
    tags: ['New Grad', '校招', '时间线'],
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
    tags: ['OPT', 'H-1B', '签证'],
  },
  {
    id: 'career_system_design_intern_2026',
    title: '实习和 New Grad 如何准备系统设计：不追求大而全，先讲清 trade-off',
    desc: '从 API、数据模型、扩展性、缓存和故障处理五个模块准备入门级系统设计。',
    content: '初级岗位的系统设计重点不是背架构，而是把需求澄清、容量估算、核心数据流和权衡讲清楚。',
    type: 'tip',
    lang: 'zh',
    source: '职引编辑部',
    pubDate: '2026-05-14T08:00:00.000Z',
    tags: ['系统设计', '技术面试', 'SDE'],
  },
  {
    id: 'career_case_interview_2026',
    title: '咨询 Case Interview 入门：框架可以用，但不要被框架绑架',
    desc: '从问题澄清、结构拆解、数据计算、洞察总结四步练习 case 表达。',
    content: '优秀的 case 回答不是套模板，而是围绕商业问题持续收敛。每一步都要让面试官听到你的假设和判断。',
    type: 'tip',
    lang: 'zh',
    source: '职引编辑部',
    pubDate: '2026-05-12T08:00:00.000Z',
    tags: ['咨询', 'Case Interview', '面试'],
  },
];

const TAB_KEYWORDS = {
  all: null,
  news: /校招|招聘|春招|秋招|实习|offer|hiring|layoff|job|career|startup|new grad/i,
  tip: /面试|简历|求职|技巧|offer|ATS|interview|resume|negotiat|linkedin|networking|case|system design/i,
  data: /薪资|数据|报告|涨薪|salary|compensation|pay|TC|wage|report|levels/i,
  policy: /OPT|H1B|H-1B|签证|落户|CPT|visa|immigration|work permit|sponsor/i,
};

function normalizeText(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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

function normalizeRssItem(item, feed) {
  const title = normalizeText(item.title || '');
  const desc = normalizeText(item.contentSnippet || item.summary || item.description || title).slice(0, 220);
  const content = normalizeText(item.content || item['content:encoded'] || desc);
  const pubDate = item.isoDate || item.pubDate || '';
  return {
    id: item.guid || item.link || `${feed.source}_${title}`,
    title,
    desc,
    content,
    url: item.link || '',
    source: feed.source,
    lang: feed.lang || 'zh',
    time: relativeTime(pubDate),
    pubDate,
    type: feed.type,
    tags: [feed.source],
    isPersonal: false,
  };
}

function normalizeCuratedArticle(article) {
  return {
    ...article,
    time: relativeTime(article.pubDate),
    url: article.url || '',
    isPersonal: false,
  };
}

async function fetchAllFeeds() {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const parsed = await rssParser.parseURL(feed.url);
      return (parsed.items || []).slice(0, 18).map((item) => normalizeRssItem(item, feed));
    })
  );

  const articles = CURATED_ARTICLES.map(normalizeCuratedArticle);
  const seen = new Set(articles.map((article) => article.id));

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      const key = article.url || article.id || article.title;
      if (!article.title || seen.has(key)) continue;
      seen.add(key);
      articles.push(article);
    }
  }

  articles.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });
  return articles;
}

function applyFilters(articles, { tab, keyword, lang }) {
  let list = [...articles];

  if (lang === 'zh' || lang === 'en') {
    list = list.filter((article) => article.lang === lang);
  }

  if (tab && tab !== 'all') {
    const tabRe = TAB_KEYWORDS[tab];
    list = list.filter((article) => article.type === tab || (tabRe ? tabRe.test(`${article.title} ${article.desc} ${article.content}`) : true));
  }

  if (keyword) {
    const kw = keyword.toLowerCase();
    list = list.filter((article) =>
      `${article.title} ${article.desc} ${(article.tags || []).join(' ')}`.toLowerCase().includes(kw)
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
    const allArticles = await fetchAllFeeds();
    const articles = applyFilters(allArticles, { tab, keyword, lang }).slice(0, limit);
    cache[cacheKey] = { data: articles, time: now };
    res.json({ source: 'rss+curated', articles, total: articles.length });
  } catch (err) {
    console.error('[News RSS Error]', err.message);
    const articles = applyFilters(CURATED_ARTICLES.map(normalizeCuratedArticle), { tab, keyword, lang }).slice(0, limit);
    res.json({ source: 'curated', articles, total: articles.length });
  }
});

module.exports = router;

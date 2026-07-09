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
const NEWS_RSS_ENABLED = process.env.NEWS_RSS_ENABLED !== 'false';
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID || '';
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY || '';
const NEWS_JOB_API_ENABLED = process.env.NEWS_JOB_API_ENABLED !== 'false';
const JOBICY_TAGS = splitEnvList(process.env.NEWS_JOBICY_TAGS);
const MUSE_JOB_CATEGORIES = splitEnvList(process.env.NEWS_MUSE_JOB_CATEGORIES);
const ADZUNA_NEWS_QUERIES = splitEnvList(process.env.NEWS_ADZUNA_QUERIES);
const ADZUNA_NEWS_COUNTRIES = splitEnvList(process.env.NEWS_ADZUNA_COUNTRIES);

const DEFAULT_JOBICY_TAGS = ['software', 'data', 'product', 'devops'];
const DEFAULT_MUSE_JOB_CATEGORIES = ['Software Engineering', 'Data Science', 'Product Management'];
const DEFAULT_ADZUNA_NEWS_QUERIES = [
  'new grad software engineer',
  'software engineer intern',
  'data analyst intern',
  'product manager intern'
];
const DEFAULT_ADZUNA_NEWS_COUNTRIES = ['us'];

const RSS_FEEDS = [
  ...OFFICIAL_RSS_FEEDS,
  { url: 'https://www.infoq.cn/feed', source: 'InfoQ中文', type: 'news', lang: 'zh', allowTech: true },
  { url: 'https://www.geekpark.net/rss', source: '极客公园', type: 'news', lang: 'zh', allowTech: true },
  { url: 'https://36kr.com/feed', source: '36氪', type: 'news', lang: 'zh', allowTech: true },
  { url: 'https://www.levels.fyi/blog/feed.xml', source: 'Levels.fyi', type: 'data', lang: 'en', sourceType: 'career_feed' },
  { url: 'https://hnrss.org/jobs', source: 'HN Jobs', type: 'news', lang: 'en', sourceType: 'career_feed' },
  { url: 'https://hnrss.org/newest?q=hiring+OR+job+OR+salary+OR+interview+OR+resume', source: 'Hacker News', type: 'tip', lang: 'en', strictCareer: true },
  { url: 'https://techcrunch.com/feed/', source: 'TechCrunch', type: 'news', lang: 'en', allowTech: true },
  { url: 'https://www.themuse.com/advice/rss', source: 'The Muse Advice', type: 'tip', lang: 'en', sourceType: 'career_feed' },
  { url: 'https://www.jobscan.co/blog/feed/', source: 'Jobscan', type: 'tip', lang: 'en', sourceType: 'career_feed' },
  { url: 'https://careersidekick.com/feed/', source: 'Career Sidekick', type: 'tip', lang: 'en', sourceType: 'career_feed' }
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

const CAREER_RELEVANCE_RE = /校招|社招|招聘|内推|春招|秋招|实习|岗位|职位|投递|求职|简历|面试|offer|薪资|总包|裁员|扩招|雇主|职场|职涯|职业发展|转行|产品经理|签证|OPT|CPT|H-?1B|hiring|recruit|recruiting|job|jobs|career|intern|internship|new grad|graduate|entry[- ]?level|layoff|resume|interview|salary|compensation|sponsor|work authorization/i;
const RECRUITMENT_SIGNAL_RE = /校招|社招|招聘|内推|春招|秋招|实习|岗位|职位|投递|求职|offer|薪资|总包|裁员|扩招|雇主|签证|OPT|CPT|H-?1B|hiring|recruit|recruiting|job|jobs|career|intern|internship|new grad|graduate|entry[- ]?level|layoff|resume|salary|compensation|sponsor|work authorization/i;
const TECH_RELEVANCE_RE = /AI|人工智能|大模型|模型|云计算|SaaS|开源|数据库|安全|开发者|程序员|工程师|软件|数据|算法|自动化|机器人|半导体|算力|GPU|NVIDIA|英伟达|developer|engineering|software|data|security|open source|cloud|robotics|machine learning|startup/i;
const CONSUMER_TECH_NOISE_RE = /手机|iPhone|折叠屏|新机|影像|续航|快充|骁龙|天玑|麒麟|处理器|平板|耳机|穿戴|相机|车机|新车|车型|屏幕|电池|soc/i;
const MARKET_NOISE_RE = /指数|深成指|创业板|沪指|科创板|纳指|标普|道指|恒指|涨停|跌停|跌超|涨超|暴涨|暴跌|领跌|领涨|大盘|A股|港股|美股|股价|市值|收盘|开盘|券商|基金|楼市|房价|黄金|原油|比特币|加密货币|财报|营收|净利|亏损|融资|投融资|IPO|并购/i;

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

function parseJsonList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim()).filter(Boolean);
  } catch (_) {}
  return text.split(/[,\n，]/).map(item => item.trim()).filter(Boolean);
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

function getArticleText(article) {
  return `${article.title || ''} ${article.desc || ''} ${article.content || ''} ${(article.tags || []).join(' ')}`;
}

function getArticleSummaryText(article) {
  return `${article.title || ''} ${article.desc || ''}`;
}

function hasCareerRelevance(article) {
  return CAREER_RELEVANCE_RE.test(getArticleText(article));
}

function hasVisibleCareerRelevance(article) {
  return CAREER_RELEVANCE_RE.test(getArticleSummaryText(article));
}

function hasRecruitmentSignal(article) {
  return RECRUITMENT_SIGNAL_RE.test(getArticleSummaryText(article));
}

function hasTechRelevance(article) {
  return TECH_RELEVANCE_RE.test(getArticleText(article));
}

function hasNonCareerNoise(article) {
  if (hasRecruitmentSignal(article)) return false;
  const text = getArticleSummaryText(article);
  return CONSUMER_TECH_NOISE_RE.test(text) || MARKET_NOISE_RE.test(text);
}

function isArticleRelevant(article) {
  if (!article || !article.title) return false;
  if (article.isOfficial || article.isPersonal) return true;
  if (article.sourceType === 'job_api' || article.sourceType === 'career_feed') {
    return !hasNonCareerNoise(article);
  }
  if (article.strictCareer) return hasVisibleCareerRelevance(article);
  if (hasNonCareerNoise(article)) return false;
  return hasCareerRelevance(article) || (article.allowTech && hasTechRelevance(article));
}

function getConfiguredList(list, fallback) {
  return (Array.isArray(list) && list.length ? list : fallback).filter(Boolean);
}

function firstArrayValue(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(' / ') : String(value || '');
}

function formatMoney(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const prefix = currency ? `${currency} ` : '';
  if (amount >= 1000) return `${prefix}${Math.round(amount / 1000)}k`;
  return `${prefix}${Math.round(amount)}`;
}

function formatSalaryRange(min, max, currency, period) {
  const minText = formatMoney(min, currency);
  const maxText = formatMoney(max, currency);
  if (!minText && !maxText) return '';
  const suffix = period ? `/${String(period).replace(/^per[-_\s]?/i, '')}` : '';
  if (minText && maxText) return `${minText}-${maxText}${suffix}`;
  return `${minText || maxText}${suffix}`;
}

function cleanSnippet(value, maxLength = 360) {
  return stripHtml(value)
    .replace(/&hellip;/g, '...')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .slice(0, maxLength)
    .trim();
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
    sourceType: feed.sourceType || 'rss',
    allowTech: !!feed.allowTech,
    strictCareer: !!feed.strictCareer,
    isOfficial: !!feed.official,
    isPersonal: false
  };
}

function normalizeCuratedArticle(article) {
  return {
    ...article,
    time: relativeTime(article.pubDate),
    url: article.url || '',
    sourceType: article.sourceType || 'curated',
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
    sourceType: 'official_api',
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

function normalizeJobicyArticle(job, tag) {
  const company = String(job.companyName || 'Remote Company').trim();
  const jobTitle = String(job.jobTitle || '').trim();
  if (!jobTitle) return null;
  const location = String(job.jobGeo || 'Remote').trim();
  const jobType = firstArrayValue(job.jobType);
  const industry = firstArrayValue(job.jobIndustry);
  const level = String(job.jobLevel || '').trim();
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod);
  const pubDate = job.pubDate || '';
  const detailParts = [location, level, jobType, salary].filter(Boolean);
  const excerpt = cleanSnippet(job.jobExcerpt || job.jobDescription || '');
  return {
    id: `jobicy_${job.id || job.jobSlug || `${company}_${jobTitle}`}`,
    title: `${company} 开放 ${jobTitle} 远程岗位`,
    desc: `${detailParts.join(' · ') || '远程岗位'}。来自 Jobicy 的招聘信息，点击查看岗位详情。`,
    content: `${excerpt || '该岗位来自 Jobicy 远程招聘信息源。'}\n\n来源：Jobicy，申请请以原始岗位链接为准。`,
    url: job.url || '',
    source: 'Jobicy',
    lang: 'zh',
    time: relativeTime(pubDate),
    pubDate,
    type: 'news',
    imageUrl: job.companyLogo || '',
    tags: ['招聘', '远程岗位', tag, industry, level].filter(Boolean),
    sourceType: 'job_api',
    isOfficial: false,
    isPersonal: false
  };
}

async function fetchJobicyArticles() {
  const tags = getConfiguredList(JOBICY_TAGS, DEFAULT_JOBICY_TAGS).slice(0, 4);
  const results = await Promise.allSettled(
    tags.map(async (tag) => {
      const res = await axios.get('https://jobicy.com/api/v2/remote-jobs', {
        params: { count: 6, tag },
        timeout: 8000
      });
      return (res.data && Array.isArray(res.data.jobs) ? res.data.jobs : [])
        .map(job => normalizeJobicyArticle(job, tag))
        .filter(Boolean);
    })
  );
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

function normalizeMuseJobArticle(job, category) {
  const company = job.company && job.company.name ? String(job.company.name).trim() : 'The Muse Company';
  const jobTitle = String(job.name || '').trim();
  if (!jobTitle) return null;
  const location = (job.locations && job.locations[0] && job.locations[0].name) || 'United States';
  const level = (job.levels && job.levels[0] && job.levels[0].name) || '';
  const jobCategory = (job.categories && job.categories[0] && job.categories[0].name) || category || '';
  const pubDate = job.publication_date || '';
  const excerpt = cleanSnippet(job.contents || '', 320);
  return {
    id: `muse_job_${job.id || `${company}_${jobTitle}`}`,
    title: `${company} 开放 ${jobTitle} 岗位`,
    desc: `${[location, level, jobCategory].filter(Boolean).join(' · ')}。The Muse 精选招聘信息。`,
    content: `${excerpt || '该岗位来自 The Muse 公开职位接口。'}\n\n来源：The Muse，申请请以原始岗位链接为准。`,
    url: job.refs && job.refs.landing_page ? job.refs.landing_page : '',
    source: 'The Muse Jobs',
    lang: 'zh',
    time: relativeTime(pubDate),
    pubDate,
    type: 'news',
    imageUrl: '',
    tags: ['招聘', company, jobCategory, level].filter(Boolean),
    sourceType: 'job_api',
    isOfficial: false,
    isPersonal: false
  };
}

async function fetchMuseJobArticles() {
  const categories = getConfiguredList(MUSE_JOB_CATEGORIES, DEFAULT_MUSE_JOB_CATEGORIES).slice(0, 4);
  const results = await Promise.allSettled(
    categories.map(async (category) => {
      const res = await axios.get('https://www.themuse.com/api/public/jobs', {
        params: { page: 0, category },
        timeout: 8000
      });
      return (res.data && Array.isArray(res.data.results) ? res.data.results : [])
        .slice(0, 8)
        .map(job => normalizeMuseJobArticle(job, category))
        .filter(Boolean);
    })
  );
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

function isValidAdzunaConfig() {
  return ADZUNA_APP_ID.length > 0 && ADZUNA_APP_KEY.length > 0;
}

function normalizeAdzunaJobArticle(job, query) {
  const company = job.company && job.company.display_name ? String(job.company.display_name).trim() : '招聘公司';
  const jobTitle = String(job.title || '').trim();
  if (!jobTitle) return null;
  const location = job.location && job.location.display_name ? String(job.location.display_name).trim() : '';
  const salary = formatSalaryRange(job.salary_min, job.salary_max, job.salary_currency || '', '');
  const pubDate = job.created || '';
  const detailParts = [location, salary, query].filter(Boolean);
  const excerpt = cleanSnippet(job.description || '', 320);
  return {
    id: `adzuna_${job.id || `${company}_${jobTitle}`}`,
    title: `${company} 正在招聘 ${jobTitle}`,
    desc: `${detailParts.join(' · ') || '来自 Adzuna 的招聘信息'}。`,
    content: `${excerpt || '该岗位来自 Adzuna 招聘信息接口。'}\n\n来源：Adzuna，申请请以原始岗位链接为准。`,
    url: job.redirect_url || '',
    source: 'Adzuna',
    lang: 'zh',
    time: relativeTime(pubDate),
    pubDate,
    type: 'news',
    imageUrl: '',
    tags: ['招聘', company, query].filter(Boolean),
    sourceType: 'job_api',
    isOfficial: false,
    isPersonal: false
  };
}

async function fetchAdzunaJobArticles() {
  if (!isValidAdzunaConfig()) return [];
  const queries = getConfiguredList(ADZUNA_NEWS_QUERIES, DEFAULT_ADZUNA_NEWS_QUERIES).slice(0, 4);
  const countries = getConfiguredList(ADZUNA_NEWS_COUNTRIES, DEFAULT_ADZUNA_NEWS_COUNTRIES).slice(0, 2);
  const requests = [];
  queries.forEach((query) => {
    countries.forEach((country) => {
      requests.push(
        axios.get(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`, {
          params: {
            app_id: ADZUNA_APP_ID,
            app_key: ADZUNA_APP_KEY,
            results_per_page: 6,
            what: query,
            sort_by: 'date'
          },
          headers: { 'Content-Type': 'application/json' },
          timeout: 8000
        }).then(res => (res.data && Array.isArray(res.data.results) ? res.data.results : [])
          .map(job => normalizeAdzunaJobArticle(job, query))
          .filter(Boolean))
      );
    });
  });
  const results = await Promise.allSettled(requests);
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

async function fetchRecruitmentApis() {
  if (!NEWS_JOB_API_ENABLED) return [];
  const results = await Promise.allSettled([
    fetchJobicyArticles(),
    fetchMuseJobArticles(),
    fetchAdzunaJobArticles()
  ]);
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

function fetchLocalAnnouncements() {
  try {
    return db.prepare(`
      SELECT
        id, title, content, category, cover_url, summary, tags, target_roles, target_regions,
        action_type, action_label, action_url, source_url, sort_order,
        is_pinned, created_at, updated_at
      FROM announcements
      WHERE is_published = 1
      ORDER BY is_pinned DESC, sort_order DESC, created_at DESC
      LIMIT 50
    `).all().map(row => {
      const tags = parseJsonList(row.tags);
      const targetRoles = parseJsonList(row.target_roles);
      const targetRegions = parseJsonList(row.target_regions);
      const actionType = String(row.action_type || '').trim();
      const actionLabel = String(row.action_label || '').trim();
      const actionUrl = String(row.action_url || '').trim();
      const action = actionType || actionLabel || actionUrl
        ? {
            type: actionType || (actionUrl ? 'link' : 'read'),
            label: actionLabel || '继续行动',
            url: actionUrl
          }
        : null;

      return {
        id: `announcement_${row.id}`,
        title: row.title,
        desc: (row.summary || stripHtml(row.content)).slice(0, 220),
        content: `${stripHtml(row.content)}\n\n来源：职引`,
        url: row.source_url || '',
        sourceUrl: row.source_url || '',
        source: '职引',
        lang: 'zh',
        time: relativeTime(row.updated_at || row.created_at),
        pubDate: row.updated_at || row.created_at || '',
        type: detectType(row.category),
        imageUrl: row.cover_url || '',
        tags: ['职引', row.category, ...tags].filter(Boolean),
        targetRoles,
        targetRegions,
        action,
        actionType,
        actionLabel,
        actionUrl,
        sortOrder: Number(row.sort_order) || 0,
        sourceType: 'announcement',
        isPinned: !!row.is_pinned,
        isOfficial: true,
        isPersonal: false
      };
    });
  } catch (err) {
    console.warn('[News announcements]', err.message);
    return [];
  }
}

async function fetchAllFeeds() {
  if (!NEWS_RSS_ENABLED) return [];
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
      const sortA = Number(a.sortOrder || a.sort_order || 0);
      const sortB = Number(b.sortOrder || b.sort_order || 0);
      if (sortB !== sortA) return sortB - sortA;
      const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return tb - ta;
    });
}

function applyFilters(articles, { tab, keyword, lang }) {
  let list = [...articles].filter(isArticleRelevant);

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
    const [rssArticles, officialApiArticles, recruitmentApiArticles] = await Promise.all([
      fetchAllFeeds(),
      fetchOfficialApis(),
      fetchRecruitmentApis()
    ]);
    const articles = dedupeAndSort([
      ...fetchLocalAnnouncements(),
      ...officialApiArticles,
      ...recruitmentApiArticles,
      ...rssArticles,
      ...CURATED_ARTICLES.map(normalizeCuratedArticle)
    ]);
    const filtered = applyFilters(articles, { tab, keyword, lang }).slice(0, limit);
    cache[cacheKey] = { data: filtered, time: now };
    res.json({ source: 'rss+official+jobs+curated', articles: filtered, total: filtered.length });
  } catch (err) {
    console.error('[News RSS Error]', err.message);
    const articles = applyFilters(CURATED_ARTICLES.map(normalizeCuratedArticle), { tab, keyword, lang }).slice(0, limit);
    res.json({ source: 'curated', articles, total: articles.length });
  }
});

module.exports = router;

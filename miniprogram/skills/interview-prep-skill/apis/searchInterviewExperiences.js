const { request } = require('../utils/request.js');
const { rememberExperienceIds } = require('../utils/auth.js');

const EXPERIENCE_PAGE = '/pages/experiences/experiences';
const EXPERIENCE_DETAIL_PAGE = '/package-content/pages/experience-detail/experience-detail';

function normalizeInterviewType(type) {
  const value = String(type || '').toLowerCase();
  if (!value) return '';
  if (/technical|coding|算法|技术/.test(value)) return '技术面试';
  if (/sql|data/.test(value)) return 'SQL 面试';
  if (/product|产品/.test(value)) return '产品面试';
  if (/case|consult|咨询/.test(value)) return 'Case Interview';
  if (/super/.test(value)) return 'Super Day';
  return '';
}

function buildKeyword(args, relaxed) {
  const parts = [];
  if (!relaxed && args.jobTitle) parts.push(args.jobTitle);
  if (args.keyword) parts.push(args.keyword);
  return parts.map(value => String(value || '').trim()).filter(Boolean).join(' ');
}

function withinUpdatedAt(item, days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return true;
  const time = Date.parse(item.createdAt || '');
  if (!Number.isFinite(time)) return false;
  return time >= Date.now() - n * 86400000;
}

function stripText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function summary(text) {
  const clean = stripText(text);
  if (!clean) return '';
  return clean.length > 140 ? clean.slice(0, 140) + '...' : clean;
}

function parseRoundCount(round) {
  const text = String(round || '');
  const digit = text.match(/\d+/);
  if (digit) return Number(digit[0]);
  if (/一/.test(text)) return 1;
  if (/二/.test(text)) return 2;
  if (/三/.test(text)) return 3;
  if (/四/.test(text)) return 4;
  return 0;
}

function companyInitial(company) {
  const name = String(company || '--').trim();
  return name ? name.slice(0, 2).toUpperCase() : '--';
}

function normalizeExperience(item, isSimilar) {
  const experienceId = String(item.id || '');
  const company = item.company || '';
  return {
    experienceId,
    company,
    companyInitial: companyInitial(company),
    jobTitle: item.position || '',
    interviewType: item.type || '面试',
    round: item.round || '',
    roundCount: parseRoundCount(item.round),
    difficulty: '',
    title: item.title || '',
    summary: summary(item.content),
    updatedAt: item.createdAt || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    likesCount: item.likesCount || 0,
    commentsCount: item.commentsCount || 0,
    isSimilar: !!isSimilar,
    detailPage: EXPERIENCE_DETAIL_PAGE + '?id=' + encodeURIComponent(experienceId)
  };
}

function buildParams(args, relaxed) {
  return {
    company: args.company || '',
    keyword: buildKeyword(args, relaxed),
    type: normalizeInterviewType(args.interviewType),
    page: 1,
    pageSize: 20
  };
}

function extractList(res) {
  const payload = res && res.data;
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.list)) return payload.list;
  return [];
}

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: {
      experiences: [],
      total: 0,
      hasMore: false,
      usedSimilarFallback: false
    },
    _meta: {
      experiences: [],
      total: 0,
      hasMore: false,
      relatedPage: EXPERIENCE_PAGE,
      ui: { componentPath: 'components/interview-list/index' }
    }
  };
}

function emptyResult(args) {
  rememberExperienceIds([]);
  return {
    isError: false,
    content: [{
      type: 'text',
      text: '暂时没有找到匹配的真实面经。可以换公司、岗位、面试类型或关键词再试。'
    }],
    structuredContent: {
      query: args,
      experiences: [],
      total: 0,
      hasMore: false,
      usedSimilarFallback: false
    },
    _meta: {
      experiences: [],
      total: 0,
      hasMore: false,
      usedSimilarFallback: false,
      relatedPage: EXPERIENCE_PAGE,
      ui: { componentPath: 'components/interview-list/index' }
    }
  };
}

function resultFromList(args, list, isSimilar) {
  const filtered = list
    .filter(item => withinUpdatedAt(item, args.updatedWithinDays))
    .map(item => normalizeExperience(item, isSimilar))
    .filter(item => item.experienceId);

  const experiences = filtered.slice(0, 5);
  rememberExperienceIds(experiences.map(item => item.experienceId));

  const total = filtered.length;
  const prefix = isSimilar ? '没有找到完全匹配项，以下是真实相似面经：' : '找到 ' + total + ' 条真实面经，先展示前 ' + experiences.length + ' 条。';
  return {
    isError: false,
    content: [{
      type: 'text',
      text: experiences.length ? prefix : '暂时没有找到匹配的真实面经。可以换公司、岗位、面试类型或关键词再试。'
    }],
    structuredContent: {
      query: args,
      experiences,
      total,
      hasMore: filtered.length > experiences.length,
      usedSimilarFallback: !!isSimilar
    },
    _meta: {
      experiences,
      total,
      hasMore: filtered.length > experiences.length,
      usedSimilarFallback: !!isSimilar,
      relatedPage: EXPERIENCE_PAGE,
      ui: { componentPath: 'components/interview-list/index' }
    }
  };
}

function searchInterviewExperiences(input) {
  const args = input || {};
  const exactParams = buildParams(args, false);

  return request({
    path: '/api/experiences',
    params: exactParams,
    timeout: 12000
  }).then(res => {
    if (res && res.isError) return errorResult(res.message || '面经查询请求失败，请稍后再试。');

    const exactList = extractList(res);
    if (exactList.length) return resultFromList(args, exactList, false);

    const shouldRelax = !!(args.company && (args.jobTitle || args.keyword));
    if (!shouldRelax) return emptyResult(args);

    return request({
      path: '/api/experiences',
      params: buildParams(args, true),
      timeout: 12000
    }).then(relaxedRes => {
      if (relaxedRes && relaxedRes.isError) return emptyResult(args);
      const relaxedList = extractList(relaxedRes);
      if (!relaxedList.length) return emptyResult(args);
      return resultFromList(args, relaxedList, true);
    });
  });
}

module.exports = searchInterviewExperiences;

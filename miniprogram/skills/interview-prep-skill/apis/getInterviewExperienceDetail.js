const { request } = require('../utils/request.js');
const { hasRecentExperienceId } = require('../utils/auth.js');

const EXPERIENCE_DETAIL_PAGE = '/package-content/pages/experience-detail/experience-detail';

function stripText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function summary(text) {
  const clean = stripText(text);
  if (!clean) return '暂无摘要，请进入职引查看完整内容。';
  return clean.length > 260 ? clean.slice(0, 260) + '...' : clean;
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

function normalizeDetail(item, experienceId) {
  const id = String(item.id || experienceId || '');
  const company = item.company || '';
  return {
    experienceId: id,
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
    detailPage: EXPERIENCE_DETAIL_PAGE + '?id=' + encodeURIComponent(id)
  };
}

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: {
      experience: null
    },
    _meta: {
      experience: null,
      relatedPage: EXPERIENCE_DETAIL_PAGE,
      ui: { componentPath: 'components/interview-detail-card/index' }
    }
  };
}

function successResult(experience) {
  return {
    isError: false,
    content: [{
      type: 'text',
      text: (experience.company || '面经') + ' · ' + (experience.jobTitle || experience.title || '面试经验') + '，可以进入职引查看完整内容。'
    }],
    structuredContent: {
      experience
    },
    _meta: {
      experience,
      relatedPage: EXPERIENCE_DETAIL_PAGE,
      ui: { componentPath: 'components/interview-detail-card/index' }
    }
  };
}

function getInterviewExperienceDetail(input) {
  const experienceId = String((input && input.experienceId) || '').trim();
  if (!experienceId) return Promise.resolve(errorResult('缺少 experienceId，请先从面经列表中选择一条真实面经。'));
  if (!hasRecentExperienceId(experienceId)) {
    return Promise.resolve(errorResult('这个 experienceId 不在最近一次 searchInterviewExperiences 返回结果中，请先重新搜索并从列表中选择面经。'));
  }

  return request({
    path: '/api/experiences/' + encodeURIComponent(experienceId),
    params: {},
    timeout: 12000
  }).then(res => {
    if (res && res.isError) return errorResult(res.message || '面经详情请求失败，请稍后再试。');
    if (!res || res.code !== 0 || !res.data) return errorResult('没有获取到这条面经详情，可能内容已删除或暂时不可用。');
    return successResult(normalizeDetail(res.data, experienceId));
  });
}

module.exports = getInterviewExperienceDetail;

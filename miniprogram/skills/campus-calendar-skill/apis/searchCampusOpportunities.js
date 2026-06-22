const { request } = require('../utils/request.js');

const CAMPUS_PAGE = '/pages/campus/campus';
const CAMPUS_DETAIL_PAGE = '/package-content/pages/campus-detail/campus-detail';
const VISA_TAGS = ['OPT', 'CPT', 'H-1B', 'E-Verify'];

function normalizeRegion(region) {
  const value = String(region || '').toLowerCase();
  if (!value) return '';
  if (/north america|北美|美国|加拿大|usa|united states|canada/.test(value)) return '北美';
  if (/china|中国|内地|mainland/.test(value)) return '中国内地';
  if (/uk|united kingdom|英国|london/.test(value)) return '英国';
  if (/australia|澳洲|singapore|新加坡/.test(value)) return '澳洲/新加坡';
  if (/europe|欧洲/.test(value)) return '欧洲';
  return region;
}

function normalizeDirection(direction) {
  const value = String(direction || '').toLowerCase();
  if (!value) return '';
  if (/ai|sde|software|engineer|tech|技术|算法|开发/.test(value)) return '技术';
  if (/data|数据|analyst|scientist/.test(value)) return '数据';
  if (/product|pm|产品/.test(value)) return '产品';
  if (/operation|运营/.test(value)) return '运营';
  if (/finance|quant|bank|金融/.test(value)) return '金融';
  if (/consult|咨询/.test(value)) return '咨询';
  return direction;
}

function normalizeRecruitmentType(type) {
  const value = String(type || '').toLowerCase();
  if (!value) return '';
  if (/summer|intern|实习/.test(value)) return '暑期实习';
  if (/fall|秋招|new grad/.test(value)) return '秋招';
  if (/spring|春招/.test(value)) return '春招';
  return type;
}

function parseGradYear(value) {
  const match = String(value || '').match(/\d{4}/);
  return match ? match[0] : '';
}

function buildKeyword(args) {
  return [args.keyword, args.direction]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
}

function parseDate(value) {
  if (!value || value === '尽快投递') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function withinDeadline(item, days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return true;
  const time = parseDate(item.deadlineDate);
  if (!time) return false;
  const now = Date.now();
  return time >= now - 86400000 && time <= now + n * 86400000;
}

function sortByDeadline(a, b) {
  const at = parseDate(a.deadlineDate) || Number.MAX_SAFE_INTEGER;
  const bt = parseDate(b.deadlineDate) || Number.MAX_SAFE_INTEGER;
  return at - bt;
}

function locationText(item) {
  const locations = Array.isArray(item.locations) ? item.locations : [];
  return locations.length ? locations.join(' · ') : (item.region || '地点待确认');
}

function inferVisaTags(item) {
  const text = [item.notes, item.positionName, item.company, item.applyUrl, item.announceUrl].filter(Boolean).join(' ');
  return VISA_TAGS.filter(tag => {
    if (tag === 'H-1B') return /\bH[- ]?1B\b|sponsor(ship)?/i.test(text);
    if (tag === 'E-Verify') return /E-?Verify/i.test(text);
    return new RegExp('\\b' + tag + '\\b', 'i').test(text);
  });
}

function companyInitial(company) {
  const name = String(company || '--').trim();
  return name ? name.slice(0, 2).toUpperCase() : '--';
}

function normalizeOpportunity(item) {
  const opportunityId = String(item.id || '');
  return {
    opportunityId,
    title: item.positionName || item.positionType || '校招机会',
    company: item.company || '',
    companyLogo: item.companyLogo || '',
    companyInitial: companyInitial(item.company),
    location: locationText(item),
    direction: item.positionType || '',
    recruitmentType: item.recruitType || '',
    graduationYear: item.gradYear ? String(item.gradYear) : '',
    deadline: item.deadlineDate || '',
    visaTags: inferVisaTags(item),
    updatedAt: item.createdAt || '',
    writtenTest: item.writtenTest || '',
    notes: item.notes || '',
    isVerified: !!item.isVerified,
    detailPage: CAMPUS_DETAIL_PAGE + '?id=' + encodeURIComponent(opportunityId)
  };
}

function buildParams(args) {
  return {
    region: normalizeRegion(args.region),
    position_type: normalizeDirection(args.direction),
    recruit_type: normalizeRecruitmentType(args.recruitmentType),
    grad_year: parseGradYear(args.graduationYear),
    keyword: buildKeyword(args),
    page: 0,
    pageSize: 50
  };
}

function emptyText() {
  return '暂时没有找到匹配校招机会。可以调整地区、方向、毕业届别或截止时间范围后再试。';
}

function errorResult(message, componentPath) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: {
      opportunities: [],
      total: 0,
      hasMore: false
    },
    _meta: {
      opportunities: [],
      total: 0,
      hasMore: false,
      relatedPage: CAMPUS_PAGE,
      ui: { componentPath }
    }
  };
}

function searchCampusOpportunities(input, options) {
  const args = input || {};
  const componentPath = (options && options.componentPath) || 'components/campus-list/index';
  const deadlineDays = args.deadlineWithinDays;

  return request({
    path: '/api/campus',
    params: buildParams(args),
    timeout: 12000
  }).then(res => {
    if (res && res.isError) return errorResult(res.message || '校招查询请求失败，请稍后再试。', componentPath);

    const payload = res && res.data;
    const list = Array.isArray(payload) ? payload : ((payload && payload.list) || []);
    const normalized = list
      .filter(item => withinDeadline(item, deadlineDays))
      .map(normalizeOpportunity)
      .filter(item => item.opportunityId);

    const sorted = Number(deadlineDays) > 0 ? normalized.sort((a, b) => sortByDeadline({ deadlineDate: a.deadline }, { deadlineDate: b.deadline })) : normalized;
    const opportunities = sorted.slice(0, 5);
    const total = sorted.length;

    return {
      isError: false,
      content: [{
        type: 'text',
        text: opportunities.length ? '找到 ' + total + ' 个校招机会，先展示前 ' + opportunities.length + ' 个。' : emptyText()
      }],
      structuredContent: {
        query: args,
        opportunities,
        total,
        hasMore: total > opportunities.length
      },
      _meta: {
        opportunities,
        total,
        hasMore: total > opportunities.length,
        relatedPage: CAMPUS_PAGE,
        ui: { componentPath }
      }
    };
  });
}

module.exports = searchCampusOpportunities;

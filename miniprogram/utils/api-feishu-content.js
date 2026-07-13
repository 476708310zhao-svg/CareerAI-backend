const config = require('./app-config.js');
const { request, post } = require('./api-client.js');

const API_BASE = config.FEISHU_CONTENT_API_BASE_URL;
const DEFAULT_TIMEOUT = 8000;
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

function enabled() {
  return !!API_BASE;
}

function compactUrl(url) {
  return String(url || '').trim();
}

function fieldsOf(item) {
  return (item && item.fields) || {};
}

function pick(item, names, fallback) {
  const fields = fieldsOf(item);
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const value = item && item[name] !== undefined && item[name] !== null && item[name] !== ''
      ? item[name]
      : fields[name];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return String(value)
    .split(/[,;，；、/|]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function asNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : (fallback || 0);
}

function pageParams(params, defaultPageSize) {
  const page = Math.max(1, Number((params && params.page) || 1));
  const pageSize = Math.max(1, Math.min(Number((params && (params.pageSize || params.size)) || defaultPageSize || 20), 100));
  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
}

function isAllValue(value) {
  const text = String(value || '').trim().toLowerCase();
  return !text
    || text === 'all'
    || text.indexOf('全部') !== -1
    || text.indexOf('不限') !== -1
    || text.indexOf('鍏ㄩ儴') !== -1;
}

function firstMeaningful(values) {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!isAllValue(value)) return value;
  }
  return '';
}

function contentRequest(path, params, options) {
  if (!enabled()) return Promise.reject(new Error('FEISHU_CONTENT_API_BASE_URL is not configured'));
  return request({
    baseUrl: API_BASE,
    path,
    params: params || {},
    timeout: (options && options.timeout) || DEFAULT_TIMEOUT,
    cacheTTL: options && options.noCache ? 0 : ((options && options.cacheTTL) || DEFAULT_CACHE_TTL),
    noCache: !!(options && options.noCache)
  });
}

function getFeishuList(route, params, options) {
  const paging = pageParams(params || {}, 20);
  const q = firstMeaningful(params ? [params.q, params.keyword, params.industry, params.region, params.positionType] : []);
  return contentRequest('/api/miniprogram/' + route, {
    q,
    limit: paging.limit,
    offset: paging.offset
  }, options).then(res => Object.assign({}, res, {
    _page: paging.page,
    _pageSize: paging.pageSize
  }));
}

function getFeishuDetail(route, id, options) {
  return contentRequest('/api/miniprogram/' + route + '/' + encodeURIComponent(id), {}, options);
}

function getFeishuHome(options) {
  return contentRequest('/api/miniprogram/home', {}, options);
}

function getFeishuSearch(q, params, options) {
  const paging = pageParams(params || {}, 20);
  return contentRequest('/api/miniprogram/search', {
    q,
    limit: paging.limit,
    offset: paging.offset
  }, options);
}

function getFeishuRecommend(profile) {
  if (!enabled()) return Promise.reject(new Error('FEISHU_CONTENT_API_BASE_URL is not configured'));
  return post({
    baseUrl: API_BASE,
    path: '/api/miniprogram/recommend',
    body: profile || {},
    timeout: DEFAULT_TIMEOUT,
    skipAuth: true
  });
}

function totalPages(total, pageSize) {
  return Math.max(1, Math.ceil(Number(total || 0) / Math.max(1, Number(pageSize || 20))));
}

function normalizeCompany(item) {
  const name = pick(item, ['name', 'title', 'company'], '');
  const industry = pick(item, ['industry', 'category', 'direction'], '');
  const description = pick(item, ['description', 'summary', 'desc', 'services'], '');
  const domain = compactUrl(pick(item, ['officialDomain', 'domain', 'website', 'url'], ''));
  return {
    id: pick(item, ['id', 'recordId'], name),
    name,
    displayName: name,
    description,
    descriptionZh: description,
    industry,
    industryL1: industry,
    industryL2: pick(item, ['direction', 'category'], industry),
    officialDomain: domain,
    website: domain,
    logo: compactUrl(pick(item, ['logo', 'logoUrl', 'image', 'cover'], '')),
    brandColor: pick(item, ['brandColor', 'color'], '#2563eb'),
    jobCount: asNumber(pick(item, ['jobCount', 'jobsCount'], 0), 0),
    tags: asArray(pick(item, ['tags'], [])),
    fields: fieldsOf(item),
    _source: 'feishu'
  };
}

function normalizeCampus(item) {
  const company = pick(item, ['company', 'name'], '');
  const positionName = pick(item, ['positionName', 'title', 'direction', 'category'], '');
  const city = pick(item, ['city', 'region'], '');
  const locations = asArray(pick(item, ['locations', 'city'], city));
  return {
    id: pick(item, ['id', 'recordId'], ''),
    company,
    positionName,
    positionType: pick(item, ['positionType', 'direction', 'category'], positionName),
    recruitType: pick(item, ['recruitType', 'category'], ''),
    writtenTest: pick(item, ['writtenTest'], ''),
    locations,
    region: pick(item, ['region', 'city'], locations[0] || ''),
    industry: pick(item, ['industry', 'direction'], ''),
    startDate: pick(item, ['startDate', 'publishTime'], ''),
    deadlineDate: pick(item, ['deadline', 'deadlineDate'], ''),
    gradYear: pick(item, ['gradYear', 'year'], ''),
    recruitYear: pick(item, ['recruitYear', 'year'], ''),
    educationLevel: pick(item, ['educationLevel', 'level'], ''),
    overseasFriendly: !!pick(item, ['overseasFriendly'], false),
    visaTag: pick(item, ['visaTag', 'visa'], ''),
    deadlineStatus: pick(item, ['deadlineStatus'], ''),
    isHot: !!pick(item, ['isHot', 'hot'], false),
    notes: pick(item, ['description', 'summary'], ''),
    source: pick(item, ['source', 'tableName'], 'Feishu'),
    isVerified: true,
    viewCount: asNumber(pick(item, ['viewCount', 'score'], 0), 0),
    createdAt: pick(item, ['createdAt', 'publishTime', 'startDate'], ''),
    applyUrl: compactUrl(pick(item, ['applyUrl', 'url'], '')),
    announceUrl: compactUrl(pick(item, ['announceUrl', 'url'], '')),
    companyLogo: compactUrl(pick(item, ['companyLogo', 'logo', 'logoUrl'], '')),
    fields: fieldsOf(item),
    _source: 'feishu'
  };
}

function normalizeAgency(item) {
  const name = pick(item, ['name', 'title'], '');
  const score = asNumber(pick(item, ['score', 'ratingAvg', 'rating'], 0), 0);
  return {
    id: pick(item, ['id', 'recordId'], name),
    name,
    type: pick(item, ['category', 'type'], 'agency'),
    city: pick(item, ['city', 'region'], ''),
    description: pick(item, ['description', 'summary'], ''),
    services: asArray(pick(item, ['services', 'direction'], [])),
    specialties: asArray(pick(item, ['tags', 'direction', 'advantages'], [])),
    priceRange: pick(item, ['priceRange'], ''),
    ratingAvg: score,
    ratingCount: asNumber(pick(item, ['ratingCount', 'reviewCount'], 0), 0),
    aiEval: pick(item, ['officialConclusion', 'summary'], ''),
    advantages: pick(item, ['advantages'], ''),
    disadvantages: pick(item, ['disadvantages'], ''),
    riskTips: pick(item, ['riskTips'], ''),
    officialConclusion: pick(item, ['officialConclusion'], ''),
    logo: compactUrl(pick(item, ['logo', 'logoUrl'], '')),
    logoDomain: compactUrl(pick(item, ['logoDomain', 'domain', 'url'], '')),
    fields: fieldsOf(item),
    _source: 'feishu'
  };
}

function normalizeArticle(item) {
  const title = pick(item, ['title', 'name'], '');
  return {
    id: pick(item, ['id', 'recordId'], title),
    title,
    desc: pick(item, ['summary', 'description'], ''),
    summary: pick(item, ['summary', 'description'], ''),
    content: pick(item, ['content', 'description', 'summary'], ''),
    type: pick(item, ['type', 'category'], 'news'),
    source: pick(item, ['source'], 'Feishu'),
    time: pick(item, ['publishTime', 'createdAt'], ''),
    url: compactUrl(pick(item, ['url'], '')),
    imageUrl: compactUrl(pick(item, ['imageUrl', 'image', 'cover'], '')),
    cover: compactUrl(pick(item, ['cover', 'imageUrl', 'image'], '')),
    isOfficial: true,
    fields: fieldsOf(item),
    _source: 'feishu'
  };
}

function normalizeJob(item) {
  const title = pick(item, ['title', 'name', 'positionName', 'direction'], '');
  const company = pick(item, ['company'], '');
  return {
    job_id: pick(item, ['id', 'recordId'], title + '_' + company),
    job_title: title,
    employer_name: company || pick(item, ['name'], ''),
    job_city: pick(item, ['city', 'region'], 'Remote'),
    job_state: pick(item, ['state'], ''),
    job_country: pick(item, ['country'], ''),
    job_employment_type: pick(item, ['type', 'category'], 'Full-time'),
    employer_logo: compactUrl(pick(item, ['logo', 'logoUrl', 'companyLogo'], '')),
    job_description: pick(item, ['description', 'summary'], ''),
    job_apply_link: compactUrl(pick(item, ['url', 'applyUrl'], '')),
    job_posted_at_datetime_utc: pick(item, ['publishTime', 'createdAt', 'startDate'], ''),
    job_min_salary: pick(item, ['minSalary'], ''),
    job_max_salary: pick(item, ['maxSalary'], ''),
    _source: 'feishu',
    raw: item
  };
}

function hasItems(res) {
  return !!(res && Array.isArray(res.items) && res.items.length);
}

function getFeishuCompanies(params) {
  const paging = pageParams(params || {}, 20);
  return getFeishuList('companies', params || {}, { timeout: 7000 }).then(res => {
    if (!hasItems(res)) throw new Error('empty feishu companies');
    const list = res.items.map(normalizeCompany);
    return {
      code: 0,
      data: {
        list,
        total: res.total || list.length,
        totalPages: totalPages(res.total || list.length, paging.pageSize),
        page: paging.page,
        pageSize: paging.pageSize
      },
      _source: 'feishu'
    };
  });
}

function getFeishuCompanyDetail(id) {
  return getFeishuDetail('companies', id, { timeout: 7000 }).then(res => {
    if (!res || !res.item) throw new Error('empty feishu company detail');
    return { code: 0, data: normalizeCompany(res.item), _source: 'feishu' };
  });
}

function getFeishuCampusList(params) {
  const paging = pageParams(params || {}, 20);
  return getFeishuList('campus-calendar', params || {}, { timeout: (params && params.timeout) || 7000, noCache: !!(params && params.noCache) }).then(res => {
    if (!hasItems(res)) throw new Error('empty feishu campus');
    const list = res.items.map(normalizeCampus);
    return {
      code: 0,
      data: {
        list,
        total: res.total || list.length,
        page: paging.page,
        pageSize: paging.pageSize
      },
      _source: 'feishu'
    };
  });
}

function getFeishuCampusMeta() {
  return Promise.resolve({ code: 0, data: { gradYears: [], industries: [] }, _source: 'feishu' });
}

function getFeishuCampusDetail(id) {
  return getFeishuDetail('campus-calendar', id, { timeout: 7000 }).then(res => {
    if (!res || !res.item) throw new Error('empty feishu campus detail');
    return { code: 0, data: normalizeCampus(res.item), _source: 'feishu' };
  });
}

function getFeishuAgencies(params) {
  const paging = pageParams(params || {}, 15);
  return getFeishuList('institutions', params || {}, { timeout: 7000 }).then(res => {
    if (!hasItems(res)) throw new Error('empty feishu institutions');
    const data = res.items.map(normalizeAgency);
    return {
      code: 0,
      data,
      total: res.total || data.length,
      page: paging.page,
      pageSize: paging.pageSize,
      _source: 'feishu'
    };
  });
}

function getFeishuAgencyDetail(id) {
  return getFeishuDetail('institutions', id, { timeout: 7000 }).then(res => {
    if (!res || !res.item) throw new Error('empty feishu agency detail');
    return { code: 0, data: normalizeAgency(res.item), _source: 'feishu' };
  });
}

function getFeishuNews(params) {
  const paging = pageParams(params || {}, (params && params.limit) || 20);
  return getFeishuList('articles', Object.assign({}, params, { pageSize: paging.pageSize }), { timeout: 7000 }).then(res => {
    if (!hasItems(res)) throw new Error('empty feishu articles');
    return {
      code: 0,
      articles: res.items.map(normalizeArticle),
      total: res.total || res.items.length,
      _source: 'feishu'
    };
  });
}

function getFeishuJobs(params) {
  return getFeishuList('manual-jobs', params || {}, { timeout: (params && params.timeout) || 7000, noCache: !!(params && params.noCache) }).then(res => {
    if (!hasItems(res)) throw new Error('empty feishu jobs');
    return { data: res.items.map(normalizeJob), total: res.total || res.items.length, _source: 'feishu' };
  });
}

module.exports = {
  enabled,
  getFeishuList,
  getFeishuDetail,
  getFeishuHome,
  getFeishuSearch,
  getFeishuRecommend,
  getFeishuCompanies,
  getFeishuCompanyDetail,
  getFeishuCampusList,
  getFeishuCampusMeta,
  getFeishuCampusDetail,
  getFeishuAgencies,
  getFeishuAgencyDetail,
  getFeishuNews,
  getFeishuJobs,
  normalizeCompany,
  normalizeCampus,
  normalizeAgency,
  normalizeArticle,
  normalizeJob
};

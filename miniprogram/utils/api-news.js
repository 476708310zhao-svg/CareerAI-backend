const { request } = require('./api-client.js');
const feishuContent = require('./api-feishu-content.js');

function requestNews(params) {
  const requestParams = Object.assign({}, params || { tab: 'all' });
  delete requestParams.skipFeishu;
  return request({
    path: '/api/news',
    params: requestParams,
    timeout: 8000,
    noCache: true
  });
}

function mergeNewsResponse(baseRes, feishuRes) {
  const baseArticles = baseRes && Array.isArray(baseRes.articles) ? baseRes.articles : [];
  const feishuArticles = feishuRes && Array.isArray(feishuRes.articles) ? feishuRes.articles : [];
  const seen = {};
  const articles = [];
  baseArticles.slice(0, 3).concat(feishuArticles, baseArticles.slice(3)).forEach(item => {
    const key = String((item && (item.title || item.id)) || '').trim().toLowerCase();
    if (!key || seen[key]) return;
    seen[key] = true;
    articles.push(item);
  });
  return Object.assign({}, baseRes || { code: 0 }, {
    code: 0,
    articles,
    total: Math.max(Number((baseRes && baseRes.total) || 0), articles.length)
  });
}

function getNews(params) {
  if (params && params.skipFeishu) return requestNews(params);

  return requestNews(params)
    .then(baseRes => feishuContent.getFeishuNews(params || {})
      .then(feishuRes => mergeNewsResponse(baseRes, feishuRes))
      .catch(() => baseRes))
    .catch(() => feishuContent.getFeishuNews(params || {}));
}

function getExchangeRates(base) {
  return request({
    path: '/api/exchange-rates',
    params: { base: base || 'USD' },
    cacheTTL: 60 * 60 * 1000
  });
}

function getCountries() {
  return request({
    path: '/api/countries',
    params: {},
    cacheTTL: 24 * 60 * 60 * 1000   // 24小时缓存
  });
}

function getGlassdoorOverview(company) {
  return request({
    path: '/api/glassdoor/overview',
    params: { company },
    cacheTTL: 60 * 60 * 1000
  });
}

function getGlassdoorReviews(company, page, employerId) {
  const params = { company, page: page || 1 };
  if (employerId) params.employerId = employerId;
  return request({
    path: '/api/glassdoor/reviews',
    params,
    cacheTTL: 2 * 60 * 60 * 1000
  });
}

module.exports = {
  getNews,
  getExchangeRates,
  getCountries,
  getGlassdoorOverview,
  getGlassdoorReviews
};

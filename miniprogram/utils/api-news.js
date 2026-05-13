const { request } = require('./api-client.js');

function getNews(params) {
  return request({
    path: '/api/news',
    params: params || { tab: 'all' },
    timeout: 8000,
    noCache: true
  });
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

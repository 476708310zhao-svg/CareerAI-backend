const config = require('./config.js');
const { request, DETAIL_CACHE_TTL } = require('./api-client.js');

const LOGO_CACHE_VERSION = '20260429a';

function normalizeLogo(url) {
  if (!url) return '/images/default-company.png';
  if (url.indexOf('/api/logo') === 0) {
    const separator = url.indexOf('?') >= 0 ? '&' : '?';
    return `${config.API_BASE_URL}${url}${separator}v=${LOGO_CACHE_VERSION}`;
  }
  if (url.indexOf('/api/') === 0 || url.indexOf('/uploads/') === 0) {
    return config.API_BASE_URL + url;
  }
  return url;
}

function normalizeCompany(company) {
  if (!company) return company;
  return Object.assign({}, company, {
    name: company.name || company.displayName,
    logo: normalizeLogo(company.logo || company.logoUrl),
    industry: company.industry || company.industryL1 || '-',
    size: company.size || company.employeeRange || '-',
    headquarters: company.headquarters || [company.hqCity, company.hqCountry].filter(Boolean).join(', '),
    founded: company.founded || (company.foundedYear ? String(company.foundedYear) : '-'),
    description: company.description || company.descriptionZh || company.descriptionEn || '',
    tags: company.tags || []
  });
}

function getCompanies(data) {
  return request({
    path: '/api/companies',
    params: data || {},
    cacheTTL: 30 * 60 * 1000
  }).then(res => {
    if (res && res.data && Array.isArray(res.data.list)) {
      res.data.list = res.data.list.map(normalizeCompany);
    }
    return res;
  });
}

function getCompanyDetail(id, name) {
  const params = {};
  if (name) params.name = name;
  return request({
    path: `/api/companies/${id}`,
    params,
    cacheTTL: DETAIL_CACHE_TTL
  }).then(res => {
    if (res && res.data) res.data = normalizeCompany(res.data);
    return res;
  });
}

module.exports = {
  getCompanies,
  getCompanyDetail,
  normalizeCompanyLogo: normalizeLogo
};

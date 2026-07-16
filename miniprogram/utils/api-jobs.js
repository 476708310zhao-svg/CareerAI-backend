// utils/api-jobs.js
// 职位搜索 + 薪资查询模块

const { request, post, DETAIL_CACHE_TTL } = require('./api-client.js');
const feishuContent = require('./api-feishu-content.js');

// ── 职位搜索 ──

function getJobs(data) {
  data = data || {};
  const params = {
    query: data.keyword || 'Software Engineer',
    page:  data.page || 1,
    num_pages: data.size ? Math.ceil(data.size / 10) : 1,
    country: data.country || 'us',
    date_posted: data.date_posted || 'all'
  };
  if (data.employment_types) params.employment_types = data.employment_types;
  return feishuContent.getFeishuJobs(data || {})
    .catch(() => request({ path: '/api/jobs/search', params, timeout: data.timeout || 15000 }));
}

function getJobDetail(jobId) {
  return request({
    path: '/api/jobs/detail',
    params: { job_id: jobId },
    cacheTTL: DETAIL_CACHE_TTL
  });
}

function searchCompanyJobs(companyName, size) {
  return request({
    path: '/api/jobs/search',
    params: {
      query: companyName + ' jobs',
      page: 1,
      num_pages: Math.ceil((size || 10) / 10),
      country: 'us',
      date_posted: 'month'
    }
  });
}

/**
 * 批量多关键词搜索职位，合并去重
 */
function fetchBatchJobs(keywords, country, sizePerKeyword) {
  country = country || 'us';
  sizePerKeyword = sizePerKeyword || 10;

  const promises = keywords.map(kw =>
    request({
      path: '/api/jobs/search',
      params: { query: kw, page: 1, num_pages: 1, country: country, date_posted: 'month' },
      timeout: 10000
    }).catch(() => ({ data: [] }))
  );

  return Promise.all(promises).then(results => {
    const seen = new Set();
    const merged = [];
    results.forEach(res => {
      const list = (res && res.data) || [];
      list.forEach(job => {
        const key = job.job_id || (job.job_title + '_' + job.employer_name);
        if (!seen.has(key)) { seen.add(key); merged.push(job); }
      });
    });
    return { data: merged };
  });
}

/**
 * 搜索热门岗位（按行业随机抽 3 个关键词批量拉取）
 */
function fetchTrendingJobs(industry) {
  const industryKeywords = {
    tech:        ['Software Engineer', 'Data Scientist', 'Product Manager', 'Frontend Developer', 'Backend Engineer', 'ML Engineer', 'DevOps Engineer', 'iOS Developer', 'Android Developer', 'Full Stack Developer'],
    finance:     ['Financial Analyst', 'Quantitative Analyst', 'Investment Banking', 'Risk Analyst', 'Actuary', 'Portfolio Manager'],
    consulting:  ['Management Consultant', 'Strategy Analyst', 'Business Analyst', 'Operations Consultant'],
    design:      ['UX Designer', 'Product Designer', 'UI Designer', 'Graphic Designer'],
    marketing:   ['Marketing Manager', 'Growth Manager', 'Content Strategist', 'Brand Manager']
  };
  const keywords = industryKeywords[industry] || industryKeywords.tech;
  const selected = keywords.sort(() => Math.random() - 0.5).slice(0, 3);
  return fetchBatchJobs(selected, 'us', 10);
}

// ── 薪资（统一走聚合接口：本地DB → RapidAPI → AI估算）──

function getEstimatedSalary(jobTitle, location, _unusedType, _unusedExp, region) {
  return request({
    path: '/api/salaries/market',
    params: { job_title: jobTitle, location: location || '', region: region || 'NA' },
    timeout: 30000
  });
}

function getCompanyJobSalary(company, jobTitle, _unusedType, _unusedExp, region) {
  return request({
    path: '/api/salaries/market',
    params: { job_title: jobTitle, company: company || '', region: region || 'NA' },
    timeout: 30000
  });
}

function fetchUserSalaryStats(position, currency) {
  return request({ path: '/api/salaries/statistics', params: { position, currency } });
}

function submitSalaryReport(data) {
  return post({ path: '/api/salaries', body: data });
}

// ── 远程职位（RemoteOK，免费无需 Key）──
function getRemoteJobs(data) {
  return request({
    path: '/api/jobs/remote',
    params: { query: data.keyword || '', tag: data.tag || '', page: data.page || 1, pageSize: data.size || 10 },
    timeout: 12000
  });
}

// ── 多源聚合（JSearch/Adzuna + The Muse，一次请求拿多源合并结果）──
function getAggregatedJobs(data) {
  data = data || {};
  const params = {
    query:    data.keyword || 'software engineer',
    country:  data.country  || 'us',
    page:     data.page     || 1,
    pageSize: data.size     || 20
  };
  if (data.date_posted) params.date_posted = data.date_posted;
  if (data.employment_types) params.employment_types = data.employment_types;
  return feishuContent.getFeishuJobs(data || {}).catch(() => request({
    path: '/api/jobs/aggregate',
    params,
    timeout: 15000,
    noCache: !!data.noCache
  }));
}

// ── The Muse 精选职位（完全免费，科技/创业公司）──
// category 可选：software / data / product / design / finance / marketing / consulting
// level 可选：Entry Level / Mid Level / Senior Level / Management / Internship
function getFeaturedJobs(data) {
  return request({
    path: '/api/jobs/featured',
    params: { query: data.keyword || '', category: data.category || '', level: data.level || '', location: data.location || '', page: data.page || 0 },
    timeout: 12000
  });
}

// ── LinkedIn Jobs（RapidAPI，需单独订阅）──
function getLinkedInJobs(data) {
  return request({
    path: '/api/jobs/linkedin',
    params: { query: data.keyword || 'software engineer', location: data.location || 'United States', page: data.page || 1 },
    timeout: 12000
  });
}

// ── Indeed Jobs（RapidAPI，需单独订阅）──
function getIndeedJobs(data) {
  return request({
    path: '/api/jobs/indeed',
    params: { query: data.keyword || 'software engineer', location: data.location || 'United States', page: data.page || 1 },
    timeout: 12000
  });
}

// ── 大厂直招（Greenhouse + Lever 聚合）──
function getBigtechJobs(params) {
  return request({
    path: '/api/aggregate/jobs',
    params: {
      company:     params.company     || '',
      source:      params.source      || '',
      sponsorship: params.sponsorship || '',
      remote:      params.remote      || '',
      keyword:     params.keyword     || '',
      department:  params.department  || '',
      page:        params.page        || 1,
      pageSize:    params.pageSize    || 20,
    },
    timeout: 10000,
    noCache: true,
  });
}

function getBigtechStats() {
  return request({ path: '/api/aggregate/stats', params: {}, timeout: 8000 });
}

function refreshBigtechJobs() {
  return post({ path: '/api/aggregate/refresh', body: {} });
}

function getCronLogs() {
  return request({ path: '/api/aggregate/cron-logs', params: {}, cacheTTL: 0, timeout: 8000 });
}

module.exports = {
  getJobs, getAggregatedJobs, getJobDetail, searchCompanyJobs, fetchBatchJobs, fetchTrendingJobs,
  getRemoteJobs, getFeaturedJobs, getLinkedInJobs, getIndeedJobs,
  getEstimatedSalary, getCompanyJobSalary, fetchUserSalaryStats, submitSalaryReport,
  getBigtechJobs, getBigtechStats, refreshBigtechJobs, getCronLogs,
};

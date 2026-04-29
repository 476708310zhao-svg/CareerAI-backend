// utils/api-jobs.js
// 职位搜索 + 薪资查询模块

const { request, post, DETAIL_CACHE_TTL } = require('./api-client.js');

// ── 职位搜索 ──

function getJobs(data) {
  const params = {
    query: data.keyword || 'Software Engineer',
    page:  data.page || 1,
    num_pages: data.size ? Math.ceil(data.size / 10) : 1,
    country: data.country || 'us',
    date_posted: data.date_posted || 'all'
  };
  if (data.employment_types) params.employment_types = data.employment_types;
  return request({ path: '/api/jobs/search', params, timeout: data.timeout || 5000 });
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

module.exports = {
  getJobs, getJobDetail, searchCompanyJobs, fetchBatchJobs, fetchTrendingJobs,
  getEstimatedSalary, getCompanyJobSalary, fetchUserSalaryStats, submitSalaryReport
};

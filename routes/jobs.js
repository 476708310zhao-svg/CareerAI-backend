const express = require('express');
const router = express.Router();
const axios = require('axios');
const jobsData = require('../data/jobs.json');
const { jobsLimiter } = require('../middleware/rateLimit');
const { parseId } = require('../db/utils');

// ── RapidAPI 配置（真实职位搜索） ─────────────────
const RAPID_HEADERS = {
  'X-RapidAPI-Key':  process.env.RAPID_API_KEY,
  'X-RapidAPI-Host': process.env.RAPID_API_HOST || 'jsearch.p.rapidapi.com'
};
const RAPID_BASE = process.env.RAPID_API_URL || 'https://jsearch.p.rapidapi.com';

// 判断 RapidAPI Key 是否像真实 key（至少 30 位且不含空格）
function _isValidRapidKey(key) {
  return key && key.length >= 30 && !/\s/.test(key);
}

// ════════════════════════════════════════════════
// 真实职位搜索（RapidAPI JSearch）
// ════════════════════════════════════════════════

// GET /api/jobs/search?query=...&page=1&date_posted=all
router.get('/search', jobsLimiter, async (req, res) => {
  // 未配置或无效 key 时直接走本地数据
  if (!_isValidRapidKey(process.env.RAPID_API_KEY)) {
    return _localSearch(req, res);
  }
  try {
    const result = await axios.get(`${RAPID_BASE}/search`, {
      params: req.query,
      headers: RAPID_HEADERS,
      timeout: 5000
    });
    res.json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[jobs/search]', status, err.message);
    if (status === 429) {
      return res.status(429).json({ error: 'API配额已用完，请稍后再试', _source: 'rateLimit' });
    }
    // 任何非429错误（403/401/502/500等）→ 降级本地数据
    console.warn('[jobs/search] RapidAPI异常(', status, ')，降级到本地数据');
    return _localSearch(req, res);
  }
});

function _localSearch(req, res) {
  try {
    const { query = '', page = 1, num_pages = 1 } = req.query;
    const keyword = query.toLowerCase();
    const all = jobsData.jobs.filter(j =>
      !keyword ||
      j.title.toLowerCase().includes(keyword) ||
      j.company.toLowerCase().includes(keyword) ||
      (j.description || '').toLowerCase().includes(keyword)
    );
    const pageSize = 10;
    const start = (parseInt(page) - 1) * pageSize;
    const slice = all.slice(start, start + pageSize * parseInt(num_pages));
    // 兼容 JSearch 数据结构，前端 parseJSearchResult 能复用
    const data = slice.map(j => ({
      job_id: String(j.id),
      job_title: j.title,
      employer_name: j.company,
      job_city: j.location || '',
      job_country: j.region || '',
      job_description: j.description || '',
      job_min_salary: null,
      job_max_salary: null,
      job_salary_currency: 'CNY',
      job_employment_type: j.jobType || '',
      job_apply_link: j.applyUrl || '',
      _local: true,
    }));
    res.json({ data, status: 'OK', _source: 'local' });
  } catch (e) {
    res.status(500).json({ error: e.message, data: [] });
  }
}

// GET /api/jobs/detail?job_id=xxx
router.get('/detail', jobsLimiter, async (req, res) => {
  if (!req.query.job_id) {
    return res.status(400).json({ error: 'job_id 不能为空' });
  }
  // key 无效时从本地数据查
  if (!_isValidRapidKey(process.env.RAPID_API_KEY)) {
    const job = jobsData.jobs.find(j => String(j.id) === String(req.query.job_id));
    if (job) return res.json({ data: [{ job_id: String(job.id), job_title: job.title, employer_name: job.company, job_description: job.description || '', job_city: job.location || '', _local: true }], status: 'OK' });
    return res.status(404).json({ error: '职位不存在', data: [] });
  }
  try {
    const result = await axios.get(`${RAPID_BASE}/job-details`, {
      params: req.query,
      headers: RAPID_HEADERS,
      timeout: 5000
    });
    res.json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[jobs/detail]', status, err.message);
    // 任何异常 → 降级本地数据
    console.warn('[jobs/detail] RapidAPI异常(', status, ')，降级到本地数据');
    const job = jobsData.jobs.find(j => String(j.id) === String(req.query.job_id));
    if (job) return res.json({ data: [{ job_id: String(job.id), job_title: job.title, employer_name: job.company, job_description: job.description || '', job_city: job.location || '', _local: true }], status: 'OK' });
    res.status(404).json({ error: '职位不存在', data: [] });
  }
});

// GET /api/jobs/salary?job_title=...&location=US
router.get('/salary', jobsLimiter, async (req, res) => {
  if (!_isValidRapidKey(process.env.RAPID_API_KEY)) {
    return res.json({ data: [], status: 'OK', _source: 'local' });
  }
  try {
    const result = await axios.get(`${RAPID_BASE}/estimated-salary`, {
      params: {
        ...req.query,
        location_type: req.query.location_type || 'ANY',
        years_of_experience: req.query.years_of_experience || 'ALL'
      },
      headers: RAPID_HEADERS,
      timeout: 10000
    });
    res.json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[jobs/salary]', status, err.message);
    if (status === 403 || status === 401) {
      return res.json({ data: [], status: 'OK', _source: 'local' });
    }
    res.status(status).json({ error: err.message, data: [] });
  }
});

// ════════════════════════════════════════════════
// 本地静态职位数据
// 注意：命名路由必须在 /:id 之前，否则会被拦截
// ════════════════════════════════════════════════

// GET /api/jobs/recommend/list
router.get('/recommend/list', (req, res) => {
  try {
    const shuffled = [...jobsData.jobs].sort(() => 0.5 - Math.random());
    const recommended = shuffled.slice(0, 5);
    res.json({ code: 0, message: 'success', data: recommended });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// GET /api/jobs/companies/list
router.get('/companies/list', (req, res) => {
  try {
    res.json({ code: 0, message: 'success', data: jobsData.companies });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// GET /api/jobs/filters/options
router.get('/filters/options', (req, res) => {
  try {
    const rSet = new Set(), iSet = new Set(), tSet = new Set();
    jobsData.jobs.forEach(j => { rSet.add(j.region); iSet.add(j.industry); tSet.add(j.jobType); });
    const regions = [...rSet], industries = [...iSet], jobTypes = [...tSet];
    res.json({ code: 0, message: 'success', data: { regions, industries, jobTypes } });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// GET /api/jobs  （列表 + 筛选 + 分页）
router.get('/', (req, res) => {
  try {
    const {
      keyword,
      region,
      industry,
      jobType,
      visaSponsored,
      page = 1,
      pageSize = 10
    } = req.query;

    let filteredJobs = [...jobsData.jobs];

    if (keyword) {
      const lowerKeyword = keyword.toLowerCase();
      filteredJobs = filteredJobs.filter(job =>
        job.title.toLowerCase().includes(lowerKeyword) ||
        job.company.toLowerCase().includes(lowerKeyword) ||
        job.description.toLowerCase().includes(lowerKeyword)
      );
    }
    if (region)    filteredJobs = filteredJobs.filter(job => job.region === region);
    if (industry)  filteredJobs = filteredJobs.filter(job => job.industry === industry);
    if (jobType)   filteredJobs = filteredJobs.filter(job => job.jobType === jobType);
    if (visaSponsored === 'true') filteredJobs = filteredJobs.filter(job => job.visaSponsored === true);

    const startIndex    = (page - 1) * pageSize;
    const paginatedJobs = filteredJobs.slice(startIndex, startIndex + parseInt(pageSize));

    res.json({
      code: 0,
      message: 'success',
      data: {
        list: paginatedJobs,
        total: filteredJobs.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(filteredJobs.length / pageSize)
      }
    });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// GET /api/jobs/:id  （本地职位详情，放在所有命名路由之后）
router.get('/:id', (req, res) => {
  try {
    const jobId = parseId(req.params.id);
    if (!jobId) return res.status(400).json({ code: -1, message: '参数无效' });
    const job = jobsData.jobs.find(j => j.id === jobId);
    if (!job) {
      return res.status(404).json({ code: -1, message: '职位不存在' });
    }
    res.json({ code: 0, message: 'success', data: job });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

module.exports = router;

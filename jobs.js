const express = require('express');
const router = express.Router();
const axios = require('axios');
const jobsData = require('../data/jobs.json');
const { jobsLimiter } = require('../middleware/rateLimit');

// ── RapidAPI 配置（真实职位搜索） ─────────────────
const RAPID_HEADERS = {
  'X-RapidAPI-Key':  process.env.RAPID_API_KEY,
  'X-RapidAPI-Host': process.env.RAPID_API_HOST || 'jsearch.p.rapidapi.com'
};
const RAPID_BASE = process.env.RAPID_API_URL || 'https://jsearch.p.rapidapi.com';

// ════════════════════════════════════════════════
// 真实职位搜索（RapidAPI JSearch）
// ════════════════════════════════════════════════

// GET /api/jobs/search?query=...&page=1&date_posted=all
router.get('/search', jobsLimiter, async (req, res) => {
  try {
    const result = await axios.get(`${RAPID_BASE}/search`, {
      params: req.query,
      headers: RAPID_HEADERS,
      timeout: 10000
    });
    res.json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[jobs/search]', status, err.message);
    if (status === 429) {
      return res.status(429).json({ error: 'API配额已用完，请稍后再试', _source: 'rateLimit' });
    }
    res.status(status).json({ error: err.message, data: [] });
  }
});

// GET /api/jobs/detail?job_id=xxx
router.get('/detail', jobsLimiter, async (req, res) => {
  if (!req.query.job_id) {
    return res.status(400).json({ error: 'job_id 不能为空' });
  }
  try {
    const result = await axios.get(`${RAPID_BASE}/job-details`, {
      params: req.query,
      headers: RAPID_HEADERS,
      timeout: 10000
    });
    res.json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[jobs/detail]', status, err.message);
    res.status(status).json({ error: err.message, data: [] });
  }
});

// GET /api/jobs/salary?job_title=...&location=US
router.get('/salary', jobsLimiter, async (req, res) => {
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
    res.status(500).json({ code: -1, message: error.message });
  }
});

// GET /api/jobs/companies/list
router.get('/companies/list', (req, res) => {
  try {
    res.json({ code: 0, message: 'success', data: jobsData.companies });
  } catch (error) {
    res.status(500).json({ code: -1, message: error.message });
  }
});

// GET /api/jobs/filters/options
router.get('/filters/options', (req, res) => {
  try {
    const regions    = [...new Set(jobsData.jobs.map(j => j.region))];
    const industries = [...new Set(jobsData.jobs.map(j => j.industry))];
    const jobTypes   = [...new Set(jobsData.jobs.map(j => j.jobType))];
    res.json({ code: 0, message: 'success', data: { regions, industries, jobTypes } });
  } catch (error) {
    res.status(500).json({ code: -1, message: error.message });
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
    res.status(500).json({ code: -1, message: error.message });
  }
});

// GET /api/jobs/:id  （本地职位详情，放在所有命名路由之后）
router.get('/:id', (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const job = jobsData.jobs.find(j => j.id === jobId);
    if (!job) {
      return res.status(404).json({ code: -1, message: '职位不存在' });
    }
    res.json({ code: 0, message: 'success', data: job });
  } catch (error) {
    res.status(500).json({ code: -1, message: error.message });
  }
});

module.exports = router;

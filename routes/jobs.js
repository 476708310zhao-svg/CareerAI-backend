const express = require('express');
const router = express.Router();
const axios = require('axios');
const jobsData = require('../data/jobs.json');
const { jobsLimiter } = require('../middleware/rateLimit');
const { parseId } = require('../db/utils');

// ── RapidAPI / JSearch ────────────────────────────────────────────────────────
const RAPID_HEADERS = {
  'X-RapidAPI-Key':  process.env.RAPID_API_KEY,
  'X-RapidAPI-Host': process.env.RAPID_API_HOST || 'jsearch.p.rapidapi.com'
};
const RAPID_BASE = process.env.RAPID_API_URL || 'https://jsearch.p.rapidapi.com';

function _isValidRapidKey(key) {
  return key && key.length >= 30 && !/\s/.test(key);
}

// ── Adzuna ────────────────────────────────────────────────────────────────────
const ADZUNA_APP_ID  = process.env.ADZUNA_APP_ID  || '';
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY || '';

function _isValidAdzuna() {
  return ADZUNA_APP_ID.length > 0 && ADZUNA_APP_KEY.length > 0;
}

// Adzuna 支持的国家代码（前端 country 参数直接复用）
const ADZUNA_COUNTRIES = new Set(['us','gb','ca','au','sg','de','fr','in','it','nl','br','nz','pl']);

// 将 employment_types 映射到 Adzuna contract_time
function _toAdzunaContract(types) {
  if (!types) return undefined;
  const t = types.toUpperCase();
  if (t.includes('PARTTIME')) return 'part_time';
  if (t.includes('FULLTIME')) return 'full_time';
  return undefined;
}

// 将 Adzuna 结果归一化为 JSearch 格式（前端无需改动）
function _normalizeAdzuna(job, countryCode) {
  const currencyMap = { gb: 'GBP', ca: 'CAD', au: 'AUD', sg: 'SGD', de: 'EUR', fr: 'EUR', it: 'EUR', nl: 'EUR', br: 'BRL', in: 'INR' };
  return {
    job_id:                    'adz_' + job.id,
    job_title:                 job.title || '',
    employer_name:             (job.company && job.company.display_name) || '',
    employer_logo:             '',
    job_city:                  (job.location && job.location.display_name) || '',
    job_country:               countryCode.toUpperCase(),
    job_description:           job.description || '',
    job_min_salary:            job.salary_min || null,
    job_max_salary:            job.salary_max || null,
    job_salary_currency:       currencyMap[countryCode] || 'USD',
    job_employment_type:       job.contract_time === 'full_time' ? 'FULLTIME' : job.contract_time === 'part_time' ? 'PARTTIME' : '',
    job_apply_link:            job.redirect_url || '',
    job_posted_at_datetime_utc: job.created || null,
    _source: 'adzuna'
  };
}

// 将 RemoteOK 结果归一化为 JSearch 格式
function _normalizeRemoteOK(job) {
  return {
    job_id:                    'rok_' + job.id,
    job_title:                 job.position || '',
    employer_name:             job.company || '',
    employer_logo:             job.logo || '',
    job_city:                  job.location || 'Remote',
    job_country:               'Remote',
    job_description:           job.description || '',
    job_min_salary:            job.salary_min || null,
    job_max_salary:            job.salary_max || null,
    job_salary_currency:       'USD',
    job_employment_type:       'FULLTIME',
    job_apply_link:            job.url || ('https://remoteok.com/jobs/' + job.id),
    job_posted_at_datetime_utc: job.date || null,
    job_tags:                  job.tags || [],
    _source: 'remoteok'
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/jobs/search
// 优先级：JSearch → Adzuna → 本地数据
// ════════════════════════════════════════════════════════════════════════════════
router.get('/search', jobsLimiter, async (req, res) => {
  // 1. JSearch
  if (_isValidRapidKey(process.env.RAPID_API_KEY)) {
    try {
      const result = await axios.get(`${RAPID_BASE}/search`, {
        params: req.query,
        headers: RAPID_HEADERS,
        timeout: 5000
      });
      return res.json(result.data);
    } catch (err) {
      const status = err.response?.status || 500;
      console.warn('[jobs/search] JSearch 异常(', status, ')，尝试 Adzuna');
    }
  }

  // 2. Adzuna
  if (_isValidAdzuna()) {
    try {
      const { query = '', page = 1, country = 'us', employment_types } = req.query;
      const countryCode = ADZUNA_COUNTRIES.has(country) ? country : 'us';
      const params = {
        app_id:           ADZUNA_APP_ID,
        app_key:          ADZUNA_APP_KEY,
        results_per_page: 10,
        what:             query || 'software engineer',
        content_type:     'application/json'
      };
      const contract = _toAdzunaContract(employment_types);
      if (contract) params.contract_time = contract;

      const result = await axios.get(
        `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/${page}`,
        { params, timeout: 8000 }
      );
      const data = (result.data.results || []).map(j => _normalizeAdzuna(j, countryCode));
      return res.json({ data, status: 'OK', _source: 'adzuna', total: result.data.count || data.length });
    } catch (err) {
      const status = err.response?.status || 500;
      console.warn('[jobs/search] Adzuna 异常(', status, ')，降级本地数据');
    }
  }

  // 3. 本地兜底
  return _localSearch(req, res);
});

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/jobs/remote
// RemoteOK 远程职位专用接口（免费，无需 Key）
// 参数：query / page / pageSize / tag
// ════════════════════════════════════════════════════════════════════════════════
router.get('/remote', jobsLimiter, async (req, res) => {
  try {
    const response = await axios.get('https://remoteok.com/api', {
      headers: { 'User-Agent': 'ZhiyinCareer/1.0 (job search app for international students)' },
      timeout: 10000
    });

    // 第一条是 meta 信息，跳过
    const allJobs = (response.data || []).slice(1).filter(j => j.id && j.position);

    const { query = '', tag = '', page = 1, pageSize = 10 } = req.query;
    const keyword = (query || tag).toLowerCase();

    const filtered = keyword
      ? allJobs.filter(j =>
          (j.position || '').toLowerCase().includes(keyword) ||
          (j.company  || '').toLowerCase().includes(keyword) ||
          (j.tags     || []).some(t => t.toLowerCase().includes(keyword))
        )
      : allJobs;

    const ps    = parseInt(pageSize) || 10;
    const pg    = parseInt(page) || 1;
    const start = (pg - 1) * ps;
    const slice = filtered.slice(start, start + ps);
    const data  = slice.map(_normalizeRemoteOK);

    res.json({
      data,
      status:   'OK',
      _source:  'remoteok',
      total:    filtered.length,
      page:     pg,
      pageSize: ps,
      hasMore:  start + ps < filtered.length
    });
  } catch (err) {
    console.error('[jobs/remote] RemoteOK 异常:', err.message);
    // 降级：从本地数据里找远程职位
    try {
      const remoteJobs = jobsData.jobs.filter(j =>
        (j.jobType || '').toLowerCase().includes('remote') ||
        (j.location || '').toLowerCase().includes('remote')
      );
      const data = remoteJobs.slice(0, 10).map(j => ({
        job_id: String(j.id), job_title: j.title, employer_name: j.company,
        job_city: 'Remote', job_country: 'Remote', job_description: j.description || '',
        job_min_salary: null, job_max_salary: null, job_salary_currency: 'USD',
        job_employment_type: 'FULLTIME', job_apply_link: j.applyUrl || '', _source: 'local'
      }));
      res.json({ data, status: 'OK', _source: 'local_fallback' });
    } catch (e) {
      res.status(500).json({ error: e.message, data: [] });
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 本地数据搜索（内部兜底函数）
// ════════════════════════════════════════════════════════════════════════════════
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
    const data = slice.map(j => ({
      job_id:               String(j.id),
      job_title:            j.title,
      employer_name:        j.company,
      job_city:             j.location || '',
      job_country:          j.region || '',
      job_description:      j.description || '',
      job_min_salary:       null,
      job_max_salary:       null,
      job_salary_currency:  'CNY',
      job_employment_type:  j.jobType || '',
      job_apply_link:       j.applyUrl || '',
      _local: true,
    }));
    res.json({ data, status: 'OK', _source: 'local' });
  } catch (e) {
    res.status(500).json({ error: e.message, data: [] });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/jobs/detail
// 优先级：JSearch → 本地数据
// ════════════════════════════════════════════════════════════════════════════════
router.get('/detail', jobsLimiter, async (req, res) => {
  if (!req.query.job_id) {
    return res.status(400).json({ error: 'job_id 不能为空' });
  }
  if (!_isValidRapidKey(process.env.RAPID_API_KEY)) {
    const job = jobsData.jobs.find(j => String(j.id) === String(req.query.job_id));
    if (job) return res.json({ data: [{ job_id: String(job.id), job_title: job.title, employer_name: job.company, job_description: job.description || '', job_city: job.location || '', _local: true }], status: 'OK' });
    return res.status(404).json({ error: '职位不存在', data: [] });
  }
  try {
    const result = await axios.get(`${RAPID_BASE}/job-details`, {
      params: req.query, headers: RAPID_HEADERS, timeout: 5000
    });
    res.json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.warn('[jobs/detail] JSearch 异常(', status, ')，降级本地数据');
    const job = jobsData.jobs.find(j => String(j.id) === String(req.query.job_id));
    if (job) return res.json({ data: [{ job_id: String(job.id), job_title: job.title, employer_name: job.company, job_description: job.description || '', job_city: job.location || '', _local: true }], status: 'OK' });
    res.status(404).json({ error: '职位不存在', data: [] });
  }
});

// GET /api/jobs/salary
router.get('/salary', jobsLimiter, async (req, res) => {
  if (!_isValidRapidKey(process.env.RAPID_API_KEY)) {
    return res.json({ data: [], status: 'OK', _source: 'local' });
  }
  try {
    const result = await axios.get(`${RAPID_BASE}/estimated-salary`, {
      params: { ...req.query, location_type: req.query.location_type || 'ANY', years_of_experience: req.query.years_of_experience || 'ALL' },
      headers: RAPID_HEADERS, timeout: 10000
    });
    res.json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[jobs/salary]', status, err.message);
    res.json({ data: [], status: 'OK', _source: 'local' });
  }
});

// GET /api/jobs/recommend/list
router.get('/recommend/list', (req, res) => {
  try {
    const shuffled = [...jobsData.jobs].sort(() => 0.5 - Math.random());
    res.json({ code: 0, message: 'success', data: shuffled.slice(0, 5) });
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
    res.json({ code: 0, message: 'success', data: { regions: [...rSet], industries: [...iSet], jobTypes: [...tSet] } });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// GET /api/jobs（列表 + 筛选 + 分页）
router.get('/', (req, res) => {
  try {
    const { keyword, region, industry, jobType, visaSponsored, page = 1, pageSize = 10 } = req.query;
    let filteredJobs = [...jobsData.jobs];
    if (keyword) {
      const lk = keyword.toLowerCase();
      filteredJobs = filteredJobs.filter(j =>
        j.title.toLowerCase().includes(lk) ||
        j.company.toLowerCase().includes(lk) ||
        j.description.toLowerCase().includes(lk)
      );
    }
    if (region)              filteredJobs = filteredJobs.filter(j => j.region === region);
    if (industry)            filteredJobs = filteredJobs.filter(j => j.industry === industry);
    if (jobType)             filteredJobs = filteredJobs.filter(j => j.jobType === jobType);
    if (visaSponsored === 'true') filteredJobs = filteredJobs.filter(j => j.visaSponsored === true);
    const startIndex = (page - 1) * pageSize;
    res.json({
      code: 0, message: 'success',
      data: {
        list: filteredJobs.slice(startIndex, startIndex + parseInt(pageSize)),
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

// GET /api/jobs/:id（本地详情，放最后避免拦截命名路由）
router.get('/:id', (req, res) => {
  try {
    const jobId = parseId(req.params.id);
    if (!jobId) return res.status(400).json({ code: -1, message: '参数无效' });
    const job = jobsData.jobs.find(j => j.id === jobId);
    if (!job) return res.status(404).json({ code: -1, message: '职位不存在' });
    res.json({ code: 0, message: 'success', data: job });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

module.exports = router;

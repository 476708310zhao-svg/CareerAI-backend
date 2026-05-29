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

// ── LinkedIn Jobs（RapidAPI）─────────────────────────────────────────────────
const LINKEDIN_RAPID_HOST = process.env.LINKEDIN_RAPID_HOST || 'linkedin-job-search-api.p.rapidapi.com';

// ── Indeed（RapidAPI，需单独订阅）────────────────────────────────────────────
const INDEED_RAPID_HOST = process.env.INDEED_RAPID_HOST || 'indeed12.p.rapidapi.com';

function _isValidAdzuna() {
  return ADZUNA_APP_ID.length > 0 && ADZUNA_APP_KEY.length > 0;
}

// Adzuna 支持的国家代码（前端 country 参数直接复用）
const ADZUNA_COUNTRIES = new Set(['us','gb','ca','au','sg','de','fr','in','it','nl','br','nz','pl']);
const JOB_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const LIVE_JOBS_ENABLED = process.env.LIVE_JOBS_ENABLED !== 'false';
const externalJobCache = new Map();

function _cacheWebJob(job) {
  if (!job || !job.id) return job;
  externalJobCache.set(String(job.id), { job, expiresAt: Date.now() + JOB_CACHE_TTL_MS });
  return job;
}

function _getCachedWebJob(id) {
  const cached = externalJobCache.get(String(id));
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    externalJobCache.delete(String(id));
    return null;
  }
  return cached.job;
}

function _stripHtml(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function _formatPostedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function _salaryText(job) {
  const min = job.job_min_salary;
  const max = job.job_max_salary;
  if (!min && !max) return '';
  const currency = job.job_salary_currency || 'USD';
  if (min && max) return `${currency} ${Math.round(min).toLocaleString()}-${Math.round(max).toLocaleString()}`;
  return `${currency} ${Math.round(min || max).toLocaleString()}+`;
}

function _inferRegion(location = '', country = '') {
  const text = `${location} ${country}`.toLowerCase();
  if (/china|beijing|shanghai|shenzhen|guangzhou|hangzhou|中国|北京|上海|深圳|广州|杭州/.test(text)) return '中国';
  if (/hong kong|香港/.test(text)) return '香港';
  if (/singapore|新加坡/.test(text)) return '新加坡';
  if (/united kingdom|london|uk|gb|英国|伦敦/.test(text)) return '英国';
  if (/remote/.test(text)) return '其他';
  if (/united states|usa|us|new york|san francisco|seattle|美国/.test(text)) return '美国';
  return country || location || '其他';
}

function _inferIndustry(title = '', category = '', tags = []) {
  const text = `${title} ${category} ${tags.join(' ')}`.toLowerCase();
  if (/finance|bank|investment|quant|trading|金融/.test(text)) return '金融';
  if (/consult|strategy|咨询/.test(text)) return '咨询';
  if (/hardware|chip|semiconductor|telecom|通信|芯片|硬件/.test(text)) return '通信/硬件';
  if (/energy|新能源|battery|solar|ev/.test(text)) return '新能源';
  return '互联网';
}

function _inferJobType(type = '', title = '') {
  const text = `${type} ${title}`.toLowerCase();
  if (/intern|实习/.test(text)) return '实习';
  if (/part/.test(text)) return '兼职';
  return '全职';
}

function _extractRequirements(job) {
  const tags = Array.isArray(job.job_tags) ? job.job_tags.filter(Boolean).slice(0, 5) : [];
  if (tags.length) return tags;

  const text = _stripHtml(job.job_description || '');
  const sentences = text.split(/[。.!?；;\n]/).map(s => s.trim()).filter(Boolean);
  return sentences
    .filter(s => /experience|skill|required|qualification|熟悉|经验|能力|要求|优先/i.test(s))
    .slice(0, 4);
}

function _toWebJob(job) {
  const title = job.job_title || '';
  const company = job.employer_name || '';
  const location = job.job_city || job.job_country || '';
  const region = _inferRegion(location, job.job_country || '');
  const tags = Array.isArray(job.job_tags) ? job.job_tags.filter(Boolean) : [];
  const webJob = {
    id: String(job.job_id),
    title,
    company,
    companyLogo: job.employer_logo || '',
    location,
    region,
    salary: _salaryText(job),
    jobType: _inferJobType(job.job_employment_type, title),
    industry: _inferIndustry(title, job.job_category || '', tags),
    description: job.job_description || '',
    requirements: _extractRequirements(job),
    tags,
    visaSponsored: false,
    postedAt: _formatPostedAt(job.job_posted_at_datetime_utc),
    applyUrl: job.job_apply_link || '',
    source: job._source || 'external',
    sourceLabel: SOURCE_LABELS[job._source] || '外部职位源',
    viewCount: 0,
    applyCount: 0
  };
  return _cacheWebJob(webJob);
}

function _toLocalWebJob(job) {
  const webJob = {
    ...job,
    id: String(job.id),
    source: 'local',
    sourceLabel: '历史职位库',
    tags: Array.isArray(job.requirements) ? job.requirements : [],
    applyUrl: job.applyUrl || '',
    postedAt: job.postedAt || '',
    viewCount: job.viewCount || 0,
    applyCount: job.applyCount || 0
  };
  return _cacheWebJob(webJob);
}

function _applyWebFilters(list, query) {
  const { keyword, region, industry, jobType, visaSponsored } = query;
  let filtered = [...list];
  if (keyword) {
    const lk = String(keyword).toLowerCase();
    filtered = filtered.filter(j =>
      (j.title || '').toLowerCase().includes(lk) ||
      (j.company || '').toLowerCase().includes(lk) ||
      _stripHtml(j.description || '').toLowerCase().includes(lk)
    );
  }
  if (region) filtered = filtered.filter(j => j.region === region);
  if (industry) filtered = filtered.filter(j => j.industry === industry);
  if (jobType) filtered = filtered.filter(j => j.jobType === jobType);
  if (visaSponsored === 'true') filtered = filtered.filter(j => j.visaSponsored === true);
  return filtered;
}

const SOURCE_LABELS = {
  jsearch: 'JSearch',
  adzuna: 'Adzuna',
  remoteok: 'RemoteOK',
  themuse: 'The Muse',
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  local: '历史职位库'
};
const MAP_KEYWORDS = ['software', 'data', 'product', 'finance', 'design', 'consulting'];
const MAP_MUSE_PAGES = [1, 2];

async function _fetchSearchJobsForWeb(query, page) {
  const searchQuery = query || 'software engineer';
  if (_isValidRapidKey(process.env.RAPID_API_KEY)) {
    try {
      const result = await axios.get(`${RAPID_BASE}/search`, {
        params: { query: searchQuery, page, num_pages: 1, country: 'us', date_posted: 'week' },
        headers: RAPID_HEADERS,
        timeout: 5000
      });
      const data = Array.isArray(result.data?.data) ? result.data.data : [];
      if (data.length) return data.map(job => ({ ...job, _source: job._source || 'jsearch' }));
    } catch (err) {
      console.warn('[jobs/web] JSearch 异常，尝试其他职位源:', err.message);
    }
  }

  if (_isValidAdzuna()) {
    try {
      const result = await axios.get(
        `https://api.adzuna.com/v1/api/jobs/us/search/${page}`,
        {
          params: { app_id: ADZUNA_APP_ID, app_key: ADZUNA_APP_KEY, results_per_page: 20, what: searchQuery, sort_by: 'date' },
          headers: { 'Content-Type': 'application/json' },
          timeout: 8000
        }
      );
      return (result.data.results || []).map(j => _normalizeAdzuna(j, 'us'));
    } catch (err) {
      console.warn('[jobs/web] Adzuna 异常，尝试免费职位源:', err.message);
    }
  }
  return [];
}

async function _fetchMuseJobsForWeb(query, page) {
  try {
    const keyword = String(query || 'software').toLowerCase();
    const museCategory = MUSE_CATEGORIES[keyword] || 'Software Engineering';
    const result = await axios.get('https://www.themuse.com/api/public/jobs', {
      params: { page: Math.max(0, parseInt(page) - 1), category: museCategory },
      timeout: 6000
    });
    return (result.data.results || []).map(_normalizeMuse);
  } catch (err) {
    console.warn('[jobs/web] The Muse 异常:', err.message);
    return [];
  }
}

async function _fetchRemoteJobsForWeb(query) {
  try {
    const response = await axios.get('https://remoteok.com/api', {
      headers: { 'User-Agent': 'ZhiyinCareer/1.0 (job search app for international students)' },
      timeout: 6000
    });
    const keyword = String(query || '').toLowerCase();
    return (response.data || [])
      .slice(1)
      .filter(j => j.id && j.position)
      .filter(j => !keyword || (j.position || '').toLowerCase().includes(keyword) || (j.company || '').toLowerCase().includes(keyword) || (j.tags || []).some(t => String(t).toLowerCase().includes(keyword)))
      .slice(0, 20)
      .map(_normalizeRemoteOK);
  } catch (err) {
    console.warn('[jobs/web] RemoteOK 异常:', err.message);
    return [];
  }
}

async function _fetchLiveWebJobs(query) {
  if (!LIVE_JOBS_ENABLED) return [];
  const page = parseInt(query.page) || 1;
  const keyword = query.keyword || query.query || 'software';
  const [searchJobs, museJobs, remoteJobs] = await Promise.all([
    _fetchSearchJobsForWeb(keyword, page),
    _fetchMuseJobsForWeb(keyword, page),
    _fetchRemoteJobsForWeb(keyword)
  ]);

  const seen = new Set();
  return [...searchJobs, ...museJobs, ...remoteJobs]
    .map(_toWebJob)
    .filter(job => {
      const key = `${job.title}|${job.company}|${job.location}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime());
}

async function _fetchMapWebJobs(pageSize) {
  if (!LIVE_JOBS_ENABLED) return [];
  const batches = await Promise.all(
    MAP_KEYWORDS.flatMap(keyword => [
      _fetchSearchJobsForWeb(keyword, 1),
      ...MAP_MUSE_PAGES.map(page => _fetchMuseJobsForWeb(keyword, page))
    ])
  );
  const seen = new Set();
  return batches
    .flat()
    .map(_toWebJob)
    .filter(job => {
      const key = `${job.title}|${job.company}|${job.location}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime())
    .slice(0, pageSize);
}

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
        what:             query || 'software engineer'
      };
      const contract = _toAdzunaContract(employment_types);
      if (contract) params.contract_time = contract;

      const result = await axios.get(
        `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/${page}`,
        { params, headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
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
// GET /api/jobs/aggregate
// 多源聚合：JSearch → Adzuna → The Muse → Local，并行拉取后合并去重
// 参数：query / country / page / pageSize
// ════════════════════════════════════════════════════════════════════════════════
router.get('/aggregate', jobsLimiter, async (req, res) => {
  const { query = 'software engineer', country = 'us', page = 1, pageSize = 20 } = req.query;
  const ps = Math.min(parseInt(pageSize) || 20, 50);

  // 从 JSearch/Adzuna/Local 走搜索链
  async function _fetchSearch() {
    if (_isValidRapidKey(process.env.RAPID_API_KEY)) {
      try {
        const r = await axios.get(`${RAPID_BASE}/search`, {
          params: { query, page, num_pages: 1, country, date_posted: 'all' },
          headers: RAPID_HEADERS, timeout: 5000
        });
        if (r.data && r.data.data && r.data.data.length) return r.data.data;
      } catch (_) {}
    }
    if (_isValidAdzuna()) {
      try {
        const countryCode = ADZUNA_COUNTRIES.has(country) ? country : 'us';
        const r = await axios.get(
          `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/${page}`,
          { params: { app_id: ADZUNA_APP_ID, app_key: ADZUNA_APP_KEY, results_per_page: 10, what: query },
            headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
        );
        return (r.data.results || []).map(j => _normalizeAdzuna(j, countryCode));
      } catch (_) {}
    }
    // 本地兜底
    const keyword = query.toLowerCase();
    return jobsData.jobs
      .filter(j => !keyword || j.title.toLowerCase().includes(keyword) || j.company.toLowerCase().includes(keyword))
      .slice(0, 10)
      .map(j => ({ job_id: String(j.id), job_title: j.title, employer_name: j.company, job_city: j.location || '', job_country: j.region || '', job_description: j.description || '', job_min_salary: null, job_max_salary: null, job_salary_currency: 'CNY', job_employment_type: j.jobType || '', job_apply_link: j.applyUrl || '', _source: 'local' }));
  }

  // 从 The Muse 拉精选科技职位
  async function _fetchMuse() {
    try {
      const kw = query.toLowerCase();
      const museCategory = MUSE_CATEGORIES[kw] || 'Software Engineering';
      const r = await axios.get('https://www.themuse.com/api/public/jobs', {
        params: { page: Math.max(0, parseInt(page) - 1), category: museCategory },
        timeout: 8000
      });
      return (r.data.results || []).map(_normalizeMuse);
    } catch (_) { return []; }
  }

  try {
    const [searchJobs, museJobs] = await Promise.all([_fetchSearch(), _fetchMuse()]);

    // 合并去重（按 job_title + employer_name 去重）
    const seen = new Set();
    const merged = [];
    for (const job of [...searchJobs, ...museJobs]) {
      const key = (job.job_title + '|' + job.employer_name).toLowerCase();
      if (!seen.has(key)) { seen.add(key); merged.push(job); }
    }

    const start = 0;
    const slice = merged.slice(start, ps);
    res.json({ data: slice, status: 'OK', _source: 'aggregate', total: merged.length, sources: [...new Set(merged.map(j => j._source))] });
  } catch (err) {
    console.error('[jobs/aggregate]', err.message);
    return _localSearch(req, res);
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/jobs/featured
// The Muse 精选职位（完全免费，专注科技/创业公司，附带公司文化介绍）
// 参数：query / category / level / location / page
// ════════════════════════════════════════════════════════════════════════════════
// The Muse 职位分类映射（常用留学生方向）
const MUSE_CATEGORIES = {
  'software': 'Software Engineering',
  'data':     'Data Science',
  'product':  'Product Management',
  'design':   'Design & UX',
  'finance':  'Finance',
  'marketing':'Marketing & Communications',
  'consulting':'Consulting',
  'devops':   'IT',
  'ml':       'Data Science'
};

function _normalizeMuse(job) {
  const location = (job.locations && job.locations[0] && job.locations[0].name) || 'United States';
  const level    = (job.levels    && job.levels[0]    && job.levels[0].name)    || '';
  const category = (job.categories && job.categories[0] && job.categories[0].name) || '';
  const company  = (job.company && job.company.name) || '';
  return {
    job_id:                    'muse_' + job.id,
    job_title:                 job.name || '',
    employer_name:             company,
    employer_logo:             '',
    job_city:                  location,
    job_country:               'US',
    job_description:           job.contents || '',
    job_min_salary:            null,
    job_max_salary:            null,
    job_salary_currency:       'USD',
    job_employment_type:       'FULLTIME',
    job_apply_link:            (job.refs && job.refs.landing_page) || '',
    job_posted_at_datetime_utc: job.publication_date || null,
    job_level:                 level,
    job_category:              category,
    _source: 'themuse'
  };
}

router.get('/featured', jobsLimiter, async (req, res) => {
  try {
    const { query = '', category = '', level = '', location = '', page = 0 } = req.query;

    const params = { page: parseInt(page) };

    // 关键词映射到 The Muse 分类
    const kw = (query || category).toLowerCase();
    const museCategory = MUSE_CATEGORIES[kw] || (category || undefined);
    if (museCategory) params.category = museCategory;
    if (level)        params.level     = level;
    if (location)     params.location  = location;

    const result = await axios.get('https://www.themuse.com/api/public/jobs', {
      params,
      timeout: 10000
    });

    const data = (result.data.results || []).map(_normalizeMuse);
    res.json({
      data,
      status:     'OK',
      _source:    'themuse',
      total:      result.data.total      || data.length,
      page:       result.data.page       || 0,
      page_count: result.data.page_count || 1,
      hasMore:    (result.data.page || 0) < (result.data.page_count || 1) - 1
    });
  } catch (err) {
    console.error('[jobs/featured] The Muse 异常:', err.message);
    return _localSearch(req, res);
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/jobs/linkedin
// LinkedIn Jobs（RapidAPI，需在 RapidAPI 订阅 linkedin-jobs-search）
// 参数：query / location / page
// ════════════════════════════════════════════════════════════════════════════════
router.get('/linkedin', jobsLimiter, async (req, res) => {
  if (!_isValidRapidKey(process.env.RAPID_API_KEY)) {
    return res.status(503).json({ error: '未配置 RapidAPI Key', data: [], _source: 'unavailable' });
  }
  try {
    const { query = 'software engineer', location = 'United States OR United Kingdom', page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * 10;
    const result = await axios.get(`https://${LINKEDIN_RAPID_HOST}/active-jb-1h`, {
      params: {
        title_filter:    query,
        location_filter: location,
        description_type: 'text',
        offset:          offset
      },
      headers: {
        'Content-Type':  'application/json',
        'X-RapidAPI-Key':  process.env.RAPID_API_KEY,
        'X-RapidAPI-Host': LINKEDIN_RAPID_HOST
      },
      timeout: 8000
    });

    const jobs = Array.isArray(result.data) ? result.data : (result.data.jobs || result.data.data || []);
    const data = jobs.map(j => ({
      job_id:                    'li_' + (j.job_id || j.id || Math.random()),
      job_title:                 j.title || j.job_title || '',
      employer_name:             j.company || j.company_name || '',
      employer_logo:             j.company_logo || '',
      job_city:                  j.location || j.job_location || '',
      job_country:               'US',
      job_description:           j.description || j.job_description || '',
      job_min_salary:            null,
      job_max_salary:            null,
      job_salary_currency:       'USD',
      job_employment_type:       j.job_type || 'FULLTIME',
      job_apply_link:            j.url || j.job_url || j.linkedin_url || '',
      job_posted_at_datetime_utc: j.posted_date || j.date_posted || null,
      _source: 'linkedin'
    }));

    res.json({ data, status: 'OK', _source: 'linkedin', total: data.length });
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[jobs/linkedin]', status, err.message);
    if (status === 403) {
      return res.status(403).json({ error: '请先在 RapidAPI 订阅 LinkedIn Jobs API', data: [], _source: 'unavailable' });
    }
    return _localSearch(req, res);
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/jobs/indeed
// Indeed Jobs（RapidAPI，需在 RapidAPI 订阅 indeed12）
// 参数：query / location / page
// ════════════════════════════════════════════════════════════════════════════════
router.get('/indeed', jobsLimiter, async (req, res) => {
  if (!_isValidRapidKey(process.env.RAPID_API_KEY)) {
    return res.status(503).json({ error: '未配置 RapidAPI Key', data: [], _source: 'unavailable' });
  }
  try {
    const { query = 'software engineer', location = 'United States', page = 1 } = req.query;
    const result = await axios.get('https://indeed12.p.rapidapi.com/jobs/search', {
      params: { q: query, l: location, page_id: String(page), locality: 'us' },
      headers: {
        'X-RapidAPI-Key':  process.env.RAPID_API_KEY,
        'X-RapidAPI-Host': INDEED_RAPID_HOST
      },
      timeout: 8000
    });

    const jobs = result.data.hits || result.data.jobs || [];
    const data = jobs.map(j => ({
      job_id:                    'ind_' + (j.job_id || j.id || Math.random()),
      job_title:                 j.title || '',
      employer_name:             j.company_name || j.company || '',
      employer_logo:             '',
      job_city:                  j.location || '',
      job_country:               'US',
      job_description:           j.description || j.summary || '',
      job_min_salary:            j.salary_min || null,
      job_max_salary:            j.salary_max || null,
      job_salary_currency:       'USD',
      job_employment_type:       j.job_type || 'FULLTIME',
      job_apply_link:            j.url || j.job_url || '',
      job_posted_at_datetime_utc: j.date || null,
      _source: 'indeed'
    }));

    res.json({ data, status: 'OK', _source: 'indeed', total: result.data.total || data.length });
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[jobs/indeed]', status, err.message);
    if (status === 403) {
      return res.status(403).json({ error: '请先在 RapidAPI 订阅 Indeed API', data: [], _source: 'unavailable' });
    }
    return _localSearch(req, res);
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
router.get('/recommend/list', jobsLimiter, async (req, res) => {
  try {
    const liveJobs = await _fetchLiveWebJobs({ keyword: req.query.keyword || 'software engineer', page: 1 });
    const list = liveJobs.length
      ? liveJobs.slice(0, 5)
      : [...jobsData.jobs].sort(() => 0.5 - Math.random()).slice(0, 5).map(_toLocalWebJob);
    res.json({ code: 0, message: 'success', data: list });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// GET /api/jobs/map
router.get('/map', jobsLimiter, async (req, res) => {
  try {
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 160, 20), 240);
    const liveJobs = await _fetchMapWebJobs(pageSize);
    const localJobs = jobsData.jobs.map(_toLocalWebJob);
    const hasEnoughLiveCoverage = liveJobs.length >= 30;
    const list = hasEnoughLiveCoverage
      ? liveJobs
      : [...liveJobs, ...localJobs].slice(0, pageSize);

    res.json({
      code: 0,
      message: 'success',
      data: {
        list,
        total: list.length,
        source: hasEnoughLiveCoverage ? 'live' : liveJobs.length ? 'live_with_local_fallback' : 'local_fallback',
        sources: [...new Set(list.map(job => job.source).filter(Boolean))]
      },
      meta: {
        liveJobsEnabled: LIVE_JOBS_ENABLED,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[jobs/map]', error.message);
    const list = jobsData.jobs.map(_toLocalWebJob).slice(0, Math.min(parseInt(req.query.pageSize) || 160, 240));
    res.json({
      code: 0,
      message: 'success',
      data: {
        list,
        total: list.length,
        source: 'local_fallback',
        sources: ['local']
      }
    });
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
router.get('/', jobsLimiter, async (req, res) => {
  try {
    const { keyword, region, industry, jobType, visaSponsored, page = 1, pageSize = 10 } = req.query;
    const pg = Math.max(parseInt(page) || 1, 1);
    const ps = Math.min(Math.max(parseInt(pageSize) || 10, 1), 50);

    const liveJobs = await _fetchLiveWebJobs({ keyword, region, industry, jobType, visaSponsored, page: pg });
    const localJobs = jobsData.jobs.map(_toLocalWebJob);
    let filteredJobs = _applyWebFilters(liveJobs, req.query);
    let source = liveJobs.length ? 'live' : 'local_fallback';

    if (!filteredJobs.length) {
      filteredJobs = _applyWebFilters(localJobs, req.query);
      source = 'local_fallback';
    }

    const startIndex = (pg - 1) * ps;
    res.json({
      code: 0, message: 'success',
      data: {
        list: filteredJobs.slice(startIndex, startIndex + ps),
        total: filteredJobs.length,
        page: pg,
        pageSize: ps,
        totalPages: Math.ceil(filteredJobs.length / ps) || 1,
        source,
        sources: [...new Set(filteredJobs.map(j => j.source).filter(Boolean))]
      },
      meta: {
        liveJobsEnabled: LIVE_JOBS_ENABLED,
        source,
        keyword: keyword || '',
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// GET /api/jobs/:id（本地详情，放最后避免拦截命名路由）
router.get('/:id', jobsLimiter, async (req, res) => {
  try {
    const rawId = decodeURIComponent(String(req.params.id || ''));
    if (!rawId) return res.status(400).json({ code: -1, message: '参数无效' });

    const cachedJob = _getCachedWebJob(rawId);
    if (cachedJob) return res.json({ code: 0, message: 'success', data: cachedJob });

    const numericId = parseId(rawId);
    if (numericId) {
      const localJob = jobsData.jobs.find(j => j.id === numericId);
      if (localJob) return res.json({ code: 0, message: 'success', data: _toLocalWebJob(localJob) });
    }

    if (rawId.startsWith('muse_')) {
      try {
        const museId = rawId.replace(/^muse_/, '');
        const result = await axios.get(`https://www.themuse.com/api/public/jobs/${museId}`, { timeout: 6000 });
        return res.json({ code: 0, message: 'success', data: _toWebJob(_normalizeMuse(result.data)) });
      } catch (err) {
        console.warn('[jobs/detail] The Muse 详情拉取失败:', err.message);
      }
    }

    if (rawId.startsWith('rok_')) {
      try {
        const remoteId = rawId.replace(/^rok_/, '');
        const response = await axios.get('https://remoteok.com/api', {
          headers: { 'User-Agent': 'ZhiyinCareer/1.0 (job search app for international students)' },
          timeout: 6000
        });
        const remoteJob = (response.data || []).slice(1).find(j => String(j.id) === remoteId);
        if (remoteJob) return res.json({ code: 0, message: 'success', data: _toWebJob(_normalizeRemoteOK(remoteJob)) });
      } catch (err) {
        console.warn('[jobs/detail] RemoteOK 详情拉取失败:', err.message);
      }
    }

    if (_isValidRapidKey(process.env.RAPID_API_KEY)) {
      try {
        const result = await axios.get(`${RAPID_BASE}/job-details`, {
          params: { job_id: rawId },
          headers: RAPID_HEADERS,
          timeout: 5000
        });
        const apiJob = Array.isArray(result.data?.data) ? result.data.data[0] : null;
        if (apiJob) return res.json({ code: 0, message: 'success', data: _toWebJob({ ...apiJob, _source: apiJob._source || 'jsearch' }) });
      } catch (err) {
        console.warn('[jobs/detail] JSearch 详情拉取失败:', err.message);
      }
    }

    res.status(404).json({ code: -1, message: '职位不存在或已下线' });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

module.exports = router;

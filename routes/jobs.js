const express = require('express');
const router = express.Router();
const axios = require('axios');
const { readJobsData } = require('../utils/jobData');
const { jobsLimiter } = require('../middleware/rateLimit');
const { parseId } = require('../db/utils');

function localJobs() {
  return readJobsData().jobs || [];
}

function localCompanies() {
  return readJobsData().companies || [];
}

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

function _normalizeLocalJob(job) {
  return {
    job_id:                    String(job.id),
    job_title:                 job.title || '',
    employer_name:             job.company || '',
    employer_logo:             job.companyLogo || '',
    job_city:                  job.location || '',
    job_country:               job.region || '',
    job_description:           job.description || '',
    job_min_salary:            null,
    job_max_salary:            null,
    job_salary_currency:       job.region === '中国' ? 'CNY' : 'USD',
    job_employment_type:       job.jobType || '',
    job_apply_link:            job.applyUrl || '',
    job_posted_at_datetime_utc: job.postedAt || null,
    _source: 'local'
  };
}

function _queryTokens(query) {
  return String(query || '')
    .toLowerCase()
    .replace(/\b(jobs?|roles?|positions?|opening|openings|hiring)\b/g, ' ')
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter(t => t.length > 1);
}

function _localJobScore(job, tokens) {
  if (tokens.length === 0) return 1;
  const title = String(job.title || '').toLowerCase();
  const company = String(job.company || '').toLowerCase();
  const desc = String(job.description || '').toLowerCase();
  const meta = [job.industry, job.jobType, job.region, job.location].filter(Boolean).join(' ').toLowerCase();
  let score = 0;
  tokens.forEach(token => {
    if (title.includes(token)) score += 5;
    if (company.includes(token)) score += 3;
    if (meta.includes(token)) score += 2;
    if (desc.includes(token)) score += 1;
  });
  return score;
}

function _postedTime(job) {
  const candidates = [
    job.job_posted_at_datetime_utc,
    job.job_posted_at_timestamp,
    job.postedAt,
    job.publication_date,
    job.created,
    job.date,
    job.posted_at
  ];

  for (const value of candidates) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'number' || /^\d+$/.test(String(value))) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric > 100000000000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function _sortByLatest(list) {
  return [...list].sort((a, b) => _postedTime(b) - _postedTime(a));
}

const VALID_DATE_POSTED = new Set(['today', '3days', 'week', 'month', 'all']);

function _normalizeDatePosted(value) {
  const normalized = String(value || '').toLowerCase();
  return VALID_DATE_POSTED.has(normalized) ? normalized : '';
}

function _withinDatePosted(job, datePosted) {
  if (!datePosted || datePosted === 'all') return true;
  const time = _postedTime(job);
  if (!time) return false;
  const ageDays = (Date.now() - time) / 86400000;
  if (datePosted === 'today') return ageDays <= 1;
  if (datePosted === '3days') return ageDays <= 3;
  if (datePosted === 'week') return ageDays <= 7;
  if (datePosted === 'month') return ageDays <= 31;
  return true;
}

function _matchesEmploymentType(job, employmentTypes) {
  const wanted = String(employmentTypes || '').toUpperCase();
  if (!wanted) return true;
  const haystack = [
    job.job_employment_type,
    job.job_type,
    job.job_title,
    job.title
  ].filter(Boolean).join(' ').toUpperCase();

  if (wanted.includes('INTERN')) return /INTERN|INTERNSHIP|实习/.test(haystack);
  if (wanted.includes('PARTTIME')) return /PART|兼职/.test(haystack);
  if (wanted.includes('CONTRACTOR')) return /CONTRACT|CONTRACTOR|合同/.test(haystack);
  if (wanted.includes('FULLTIME')) return /FULL|FULLTIME|全职/.test(haystack) || !/PART|INTERN|CONTRACT|兼职|实习|合同/.test(haystack);
  return true;
}

function _dedupeJobKey(job) {
  return String(
    job.job_id ||
    job.job_apply_link ||
    [
      job.job_title || '',
      job.employer_name || '',
      job.job_city || '',
      job.job_state || '',
      job.job_country || ''
    ].join('|')
  ).toLowerCase();
}

function _museCategoryForQuery(query) {
  const kw = String(query || '').toLowerCase();
  if (/\b(data|scientist|analyst|machine learning|ml|ai)\b/.test(kw)) return 'Data Science';
  if (/\b(product|pm)\b/.test(kw)) return 'Product Management';
  if (/\b(design|designer|ux|ui)\b/.test(kw)) return 'Design & UX';
  if (/\b(finance|banking|quant|investment)\b/.test(kw)) return 'Finance';
  if (/\b(marketing|growth|content)\b/.test(kw)) return 'Marketing & Communications';
  if (/\b(consulting|consultant|strategy)\b/.test(kw)) return 'Consulting';
  if (/\b(devops|it|cloud|sre)\b/.test(kw)) return 'IT';
  return 'Software Engineering';
}

function _localSearchJobs(query) {
  const tokens = _queryTokens(query);
  return localJobs()
    .map(job => ({ job, score: _localJobScore(job, tokens) }))
    .filter(item => tokens.length === 0 || item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return _postedTime(b.job) - _postedTime(a.job);
    })
    .map(item => _normalizeLocalJob(item.job));
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
      const remoteJobs = localJobs().filter(j =>
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
  const {
    query = 'software engineer',
    country = 'us',
    page = 1,
    pageSize = 20,
    date_posted,
    employment_types
  } = req.query;
  const ps = Math.min(parseInt(pageSize, 10) || 20, 50);
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const needed = pg * ps;
  const searchTarget = Math.min(120, Math.max(needed + ps * 2, 60));
  const datePosted = _normalizeDatePosted(date_posted);
  const dateFilterExplicit = !!datePosted && datePosted !== 'all';
  const dateWindows = dateFilterExplicit ? [datePosted] : ['week', 'month'];
  const localMatches = _localSearchJobs(query);
  const freeSourcesEnabled = process.env.DISABLE_FREE_JOB_SOURCES !== 'true';

  async function _fetchJSearchFresh() {
    if (!_isValidRapidKey(process.env.RAPID_API_KEY)) return [];
    const seen = new Set();
    const merged = [];

    for (const dateWindow of dateWindows) {
      try {
        const params = {
          query,
          page: 1,
          num_pages: Math.max(1, Math.ceil(searchTarget / 10)),
          country,
          date_posted: dateWindow
        };
        if (employment_types) params.employment_types = employment_types;
        const r = await axios.get(`${RAPID_BASE}/search`, {
          params,
          headers: RAPID_HEADERS,
          timeout: 7000
        });
        const list = (r.data && r.data.data) || [];
        for (const job of list) {
          const key = _dedupeJobKey(job);
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(job);
          }
        }
        if (merged.length >= searchTarget) break;
      } catch (_) {}
    }
    return merged;
  }

  async function _fetchAdzunaFresh() {
    if (!_isValidAdzuna()) return [];
    try {
      const countryCode = ADZUNA_COUNTRIES.has(country) ? country : 'us';
      const contract = _toAdzunaContract(employment_types);
      const pages = Math.max(1, Math.min(3, Math.ceil(searchTarget / 50)));
      const requests = [];
      for (let p = 1; p <= pages; p++) {
        const params = {
          app_id: ADZUNA_APP_ID,
          app_key: ADZUNA_APP_KEY,
          results_per_page: Math.min(50, searchTarget),
          what: query,
          sort_by: 'date'
        };
        if (contract) params.contract_time = contract;
        requests.push(axios.get(
          `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/${p}`,
          { params, headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
        ).catch(() => ({ data: { results: [] } })));
      }
      const results = await Promise.all(requests);
      return results.flatMap(r => (r.data.results || []).map(j => _normalizeAdzuna(j, countryCode)));
    } catch (_) {
      return [];
    }
  }

  async function _fetchSearchFresh() {
    const [jsearchJobs, adzunaJobs] = await Promise.all([_fetchJSearchFresh(), _fetchAdzunaFresh()]);
    const seen = new Set();
    const merged = [];
    for (const job of [...jsearchJobs, ...adzunaJobs]) {
      const key = _dedupeJobKey(job);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(job);
      }
    }
    return merged.length ? merged : localMatches;
  }

  async function _fetchMuseFresh() {
    if (!freeSourcesEnabled) return [];
    try {
      const museCategory = _museCategoryForQuery(query);
      const pages = Math.max(1, Math.min(3, Math.ceil(searchTarget / 20)));
      const requests = [];
      for (let p = 0; p < pages; p++) {
        requests.push(axios.get('https://www.themuse.com/api/public/jobs', {
          params: { page: p, category: museCategory },
          timeout: 8000
        }).catch(() => ({ data: { results: [] } })));
      }
      const results = await Promise.all(requests);
      return results.flatMap(r => (r.data.results || []).map(_normalizeMuse));
    } catch (_) {
      return [];
    }
  }

  async function _fetchRemoteOKFresh() {
    if (!freeSourcesEnabled) return [];
    try {
      const response = await axios.get('https://remoteok.com/api', {
        headers: { 'User-Agent': 'ZhiyinCareer/1.0 (job search app for international students)' },
        timeout: 8000
      });
      const tokens = _queryTokens(query);
      const allJobs = (response.data || []).slice(1).filter(j => j.id && j.position);
      const filtered = tokens.length
        ? allJobs.filter(j => {
            const text = [
              j.position,
              j.company,
              j.description,
              ...(j.tags || [])
            ].filter(Boolean).join(' ').toLowerCase();
            return tokens.some(token => text.includes(token));
          })
        : allJobs;
      return filtered.slice(0, searchTarget).map(_normalizeRemoteOK);
    } catch (_) {
      return [];
    }
  }

  try {
    const [searchJobs, museJobs, remoteJobs] = await Promise.all([
      _fetchSearchFresh(),
      _fetchMuseFresh(),
      _fetchRemoteOKFresh()
    ]);

    // 合并去重：优先按 job_id/apply_link，兜底带上城市，避免同公司多城市岗位被压成一条。
    const seen = new Set();
    const merged = [];
    for (const job of [...searchJobs, ...museJobs, ...remoteJobs, ...localMatches]) {
      if (!_matchesEmploymentType(job, employment_types)) continue;
      if (dateFilterExplicit && !_withinDatePosted(job, datePosted)) continue;

      const key = _dedupeJobKey(job);
      if (!seen.has(key)) { seen.add(key); merged.push(job); }
    }

    const sorted = _sortByLatest(merged);
    const start = (pg - 1) * ps;
    const slice = sorted.slice(start, start + ps);
    res.json({
      data: slice,
      status: 'OK',
      _source: 'aggregate',
      total: sorted.length,
      page: pg,
      pageSize: ps,
      hasMore: start + ps < sorted.length,
      sources: [...new Set(sorted.map(j => j._source || (j._local ? 'local' : 'unknown')))]
    });
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
    const all = localJobs().filter(j =>
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
      job_posted_at_datetime_utc: j.postedAt || null,
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
    const job = localJobs().find(j => String(j.id) === String(req.query.job_id));
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
    const job = localJobs().find(j => String(j.id) === String(req.query.job_id));
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
    const shuffled = [...localJobs()].sort(() => 0.5 - Math.random());
    res.json({ code: 0, message: 'success', data: shuffled.slice(0, 5) });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// GET /api/jobs/companies/list
router.get('/companies/list', (req, res) => {
  try {
    res.json({ code: 0, message: 'success', data: localCompanies() });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// GET /api/jobs/filters/options
router.get('/filters/options', (req, res) => {
  try {
    const rSet = new Set(), iSet = new Set(), tSet = new Set();
    localJobs().forEach(j => { rSet.add(j.region); iSet.add(j.industry); tSet.add(j.jobType); });
    res.json({ code: 0, message: 'success', data: { regions: [...rSet], industries: [...iSet], jobTypes: [...tSet] } });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// GET /api/jobs（列表 + 筛选 + 分页）
router.get('/', (req, res) => {
  try {
    const { keyword, region, industry, jobType, visaSponsored, page = 1, pageSize = 10 } = req.query;
    let filteredJobs = [...localJobs()];
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
    const job = localJobs().find(j => j.id === jobId);
    if (!job) return res.status(404).json({ code: -1, message: '职位不存在' });
    res.json({ code: 0, message: 'success', data: job });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

module.exports = router;

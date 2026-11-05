const express = require('express');
const router = express.Router();
const axios = require('axios');
const { readJobsData } = require('../utils/jobData');
const { jobsLimiter } = require('../middleware/rateLimit');
const { parseId } = require('../db/utils');
const { buildDataMeta, summarizeDataMeta } = require('../utils/dataProvenance');
const { optionalAuth } = require('../middleware/auth');
const analytics = require('../services/v4Analytics');
const { withCoreRefs } = require('../utils/coreEntityRefs');
const { createJobSourceGateway } = require('../services/jobSourceGateway');
const { ADZUNA_COUNTRIES, normalizeCountry, globalSampleCountries, isRemoteJobEligible } = require('../utils/jobGeography');

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
const THE_MUSE_API_KEY = process.env.THE_MUSE_API_KEY || '';
const sourceGateway = createJobSourceGateway();

// ── LinkedIn Jobs（RapidAPI）─────────────────────────────────────────────────
const LINKEDIN_RAPID_HOST = process.env.LINKEDIN_RAPID_HOST || 'linkedin-job-search-api.p.rapidapi.com';

// ── Indeed（RapidAPI，需单独订阅）────────────────────────────────────────────
const INDEED_RAPID_HOST = process.env.INDEED_RAPID_HOST || 'indeed12.p.rapidapi.com';

function _isValidAdzuna() {
  return ADZUNA_APP_ID.length > 0 && ADZUNA_APP_KEY.length > 0;
}

const JOB_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const LIVE_JOBS_ENABLED = process.env.LIVE_JOBS_ENABLED !== 'false';
const FREE_JOB_SOURCES_ENABLED = process.env.DISABLE_FREE_JOB_SOURCES !== 'true';
const externalJobCache = new Map();
const _shouldLogSourceError = error => !['cooldown', 'budget_exhausted'].includes(error?.reason);
const countryNamesZh = new Intl.DisplayNames(['zh-CN'], { type: 'region' });

async function _requestJSearch(endpoint, params, timeout = 15000, policy = {}) {
  if (endpoint === 'search' && Number(params.page) > 1 && !params.cursor) {
    let cursor = '';
    let result;
    for (let currentPage = 1; currentPage <= Number(params.page); currentPage++) {
      result = await _requestJSearch('search', { ...params, page: 1, num_pages: 1, cursor: cursor || undefined }, timeout, policy);
      cursor = result.data.cursor;
      if (currentPage < Number(params.page) && !cursor) {
        return { ...result, data: { ...result.data, data: [] } };
      }
    }
    return result;
  }
  const requestEndpoint = endpoint === 'search' ? 'search-v2' : endpoint;
  const requestParams = endpoint === 'search' ? { ...params } : params;
  if (endpoint === 'search') {
    delete requestParams.page;
    if (!requestParams.cursor) delete requestParams.cursor;
  }
  const requestCost = endpoint === 'search' ? Math.min(20, Math.max(1, parseInt(requestParams.num_pages, 10) || 1)) : 1;
  return sourceGateway.request('jsearch', JSON.stringify([requestEndpoint, requestParams]), async () => {
    const result = await axios.get(`${RAPID_BASE}/${requestEndpoint}`, { params: requestParams, headers: RAPID_HEADERS, timeout });
    if (result.data?.status === 'ERROR') {
      throw { response: { status: Number(result.data.error?.code) || 502, headers: result.headers } };
    }
    if (endpoint === 'search') {
      if (!Array.isArray(result.data?.data?.jobs)) throw new Error('invalid JSearch payload');
      return { ...result, data: { ...result.data, cursor: result.data.data.cursor || '', data: result.data.data.jobs } };
    }
    if (endpoint === 'job-details' && !Array.isArray(result.data?.data)) {
      throw new Error('invalid JSearch payload');
    }
    return result;
  }, { ...policy, requestCost });
}

async function _requestAdzuna(country, page, params, timeout = 8000, policy = {}) {
  return sourceGateway.request('adzuna', JSON.stringify([country, page, params]), async () => {
    const result = await axios.get(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`,
      { params: { ...params, app_id: ADZUNA_APP_ID, app_key: ADZUNA_APP_KEY }, timeout });
    if (!Array.isArray(result.data?.results)) throw new Error('invalid Adzuna payload');
    return result;
  }, policy);
}

async function _requestMuse(endpoint, params = {}, timeout = 6000) {
  return sourceGateway.request('themuse', JSON.stringify([endpoint, params]), async () => {
    const result = await axios.get(`https://www.themuse.com/api/public/${endpoint}`,
      { params: { ...params, api_key: THE_MUSE_API_KEY }, timeout });
    if (endpoint === 'jobs' && !Array.isArray(result.data?.results)) throw new Error('invalid The Muse payload');
    return result;
  });
}

async function _requestRemoteOK(timeout = 8000) {
  return sourceGateway.request('remoteok', 'feed', async () => {
    const result = await axios.get('https://remoteok.com/api', {
      headers: { 'User-Agent': 'ZhiyinCareer/1.0 (job search app for international students)' }, timeout
    });
    if (!Array.isArray(result.data)) throw new Error('invalid RemoteOK payload');
    return result;
  });
}

function _cacheWebJob(job) {
  if (!job || !job.id) return job;
  externalJobCache.delete(String(job.id));
  externalJobCache.set(String(job.id), { job, expiresAt: Date.now() + JOB_CACHE_TTL_MS });
  if (externalJobCache.size > 2_000) externalJobCache.delete(externalJobCache.keys().next().value);
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

async function _withSoftDeadline(promise, milliseconds, fallback) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(resolve => { timer = setTimeout(() => resolve(fallback), milliseconds); })
    ]);
  } finally {
    clearTimeout(timer);
  }
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
  if (/united kingdom|london|\buk\b|\bgb\b|英国|伦敦/.test(text)) return '英国';
  if (/remote/.test(text)) return '其他';
  if (/united states|\busa\b|\bus\b|new york|san francisco|seattle|美国/.test(text)) return '美国';
  if (/germany|deutschland|德国/.test(text)) return '德国';
  if (/france|法国/.test(text)) return '法国';
  if (/japan|日本/.test(text)) return '日本';
  if (/india|印度/.test(text)) return '印度';
  if (/united arab emirates|uae|阿联酋/.test(text)) return '阿联酋';
  if (/^[a-z]{2}$/i.test(country)) return countryNamesZh.of(country.toUpperCase()) || country;
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
  const source = job._source || 'external';
  const rawCountryCode = String(job._requestedCountry || job.job_country || '').toLowerCase();
  const countryCode = /^[a-z]{2}$/.test(rawCountryCode) ? rawCountryCode : 'global';
  const dataMeta = job.dataMeta || buildDataMeta({
    domain: 'job',
    source,
    publishedAt: job.job_posted_at_datetime_utc,
    isExpired: _isPastDeadline(_rawDeadline(job))
  });
  const webJob = {
    id: String(job.job_id),
    title,
    company,
    companyLogo: job.employer_logo || '',
    location,
    region,
    countryCode,
    salary: _salaryText(job),
    jobType: _inferJobType(job.job_employment_type, title),
    industry: _inferIndustry(title, job.job_category || '', tags),
    description: job.job_description || '',
    requirements: _extractRequirements(job),
    tags,
    visaSponsored: false,
    postedAt: _formatPostedAt(job.job_posted_at_datetime_utc),
    applyUrl: job.job_apply_link || '',
    source,
    sourceLabel: dataMeta.sourceLabel,
    dataMeta,
    viewCount: 0,
    applyCount: 0
  };
  return _cacheWebJob(webJob);
}

function _toLocalWebJob(job) {
  const dataMeta = buildDataMeta({
    domain: 'job', source: 'local_fallback', publishedAt: job.postedAt,
    isExpired: _isPastDeadline(job.deadline), isFallback: true,
    fallbackReason: '实时职位源无可用结果'
  });
  const webJob = {
    ...job,
    id: String(job.id),
    source: 'local',
    countryCode: normalizeCountry('', job.region),
    sourceLabel: dataMeta.sourceLabel,
    dataMeta,
    tags: Array.isArray(job.requirements) ? job.requirements : [],
    applyUrl: job.applyUrl || '',
    postedAt: job.postedAt || '',
    viewCount: job.viewCount || 0,
    applyCount: job.applyCount || 0
  };
  return _cacheWebJob(webJob);
}

function _isCurrentWebJob(job) {
  return job && !['stale', 'expired'].includes(job.dataMeta?.freshness);
}

function _publicLocalWebJobs() {
  return localJobs()
    .map(_toLocalWebJob)
    .filter(job => ['fresh', 'aging'].includes(job.dataMeta?.freshness));
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
  if (region) {
    const code = normalizeCountry('', region);
    filtered = filtered.filter(j => code === 'global'
      ? j.region === region
      : j.countryCode === code || (j.source === 'remoteok' && isRemoteJobEligible({ location: j.location }, code)));
  }
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

function _rawPublishedAt(job) {
  return job && (job.job_posted_at_datetime_utc || job.postedAt || job.publication_date || job.posted_at || job.created || job.date) || '';
}

function _rawDeadline(job) {
  return job && (job.job_offer_expiration_datetime_utc || job.job_offer_expiration_date || job.valid_through || job.deadline) || '';
}

function _isPastDeadline(value) {
  if (!value) return false;
  const timestamp = Date.parse(String(value).length <= 10 ? `${String(value).slice(0, 10)}T23:59:59+08:00` : value);
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function _withRawJobMeta(job, source, options = {}) {
  const sourceCode = source || job._source || (job._local ? 'local_fallback' : 'unknown');
  return {
    ...job,
    _source: sourceCode,
    dataMeta: buildDataMeta({
      domain: 'job',
      source: sourceCode,
      publishedAt: _rawPublishedAt(job),
      updatedAt: job.updatedAt || job.updated_at || '',
      fetchedAt: options.fetchedAt,
      isExpired: _isPastDeadline(_rawDeadline(job)),
      isFallback: options.isFallback === true,
      fallbackReason: options.fallbackReason
    })
  };
}

function _collectionMeta(items, options = {}) {
  return summarizeDataMeta(items, options);
}

function _trackJobView(req, jobId) {
  if (!req.user || !req.user.userId || !jobId) return;
  analytics.trackFunnel(req.user.userId, 'job_viewed', withCoreRefs(
    { jobId: String(jobId), surface: 'legacy_job_detail' },
    { userId: req.user.userId, jobId: String(jobId) }
  ), '/api/jobs/detail');
}
async function _fetchSearchJobsForWeb(query, page, country, policy = {}) {
  const searchQuery = query || 'jobs';
  if (country !== 'global' && _isValidRapidKey(process.env.RAPID_API_KEY)) {
    try {
      const result = await _requestJSearch('search',
        { query: searchQuery, page, num_pages: 1, country, date_posted: 'week' }, 12000, policy);
      const data = Array.isArray(result.data?.data) ? result.data.data : [];
      if (data.length) return data.map(job => ({ ...job, _source: 'jsearch', _requestedCountry: country }));
    } catch (err) {
      if (_shouldLogSourceError(err)) console.warn('[jobs/web] JSearch 异常，尝试其他职位源:', err.message);
    }
  }

  if (country !== 'global' && ADZUNA_COUNTRIES.has(country) && _isValidAdzuna()) {
    try {
      const result = await _requestAdzuna(country, page,
        { results_per_page: 20, what: searchQuery, sort_by: 'date' }, 8000, policy);
      return (result.data.results || []).map(j => _normalizeAdzuna(j, country));
    } catch (err) {
      if (_shouldLogSourceError(err)) console.warn('[jobs/web] Adzuna 异常，尝试免费职位源:', err.message);
    }
  }
  return [];
}

async function _fetchMuseJobsForWeb(query, page, country) {
  if (!FREE_JOB_SOURCES_ENABLED || !THE_MUSE_API_KEY || country !== 'global') return [];
  try {
    const keyword = String(query || 'software').toLowerCase();
    const museCategory = MUSE_CATEGORIES[keyword] || 'Software Engineering';
    const result = await _requestMuse('jobs',
      { page: Math.max(0, parseInt(page) - 1), category: museCategory });
    return (result.data.results || []).map(_normalizeMuse);
  } catch (err) {
    if (_shouldLogSourceError(err)) console.warn('[jobs/web] The Muse 异常:', err.message);
    return [];
  }
}

async function _fetchRemoteJobsForWeb(query, limit = 20, country = 'global') {
  if (!FREE_JOB_SOURCES_ENABLED) return [];
  try {
    const response = await _requestRemoteOK(3500);
    const keyword = String(query || '').toLowerCase();
    return (response.data || [])
      .slice(1)
      .filter(j => j.id && j.position && isRemoteJobEligible(j, country))
      .filter(j => !keyword || (j.position || '').toLowerCase().includes(keyword) || (j.company || '').toLowerCase().includes(keyword) || (j.tags || []).some(t => String(t).toLowerCase().includes(keyword)))
      .slice(0, limit)
      .map(_normalizeRemoteOK);
  } catch (err) {
    if (_shouldLogSourceError(err)) console.warn('[jobs/web] RemoteOK 异常:', err.message);
  }
  return [];
}

async function _fetchLiveWebJobs(query) {
  if (!LIVE_JOBS_ENABLED) return [];
  const page = parseInt(query.page) || 1;
  const keyword = query.keyword || query.query || '';
  const country = normalizeCountry(query.country, query.region);
  const marketCountries = country === 'global' ? globalSampleCountries() : [country];
  const [searchBatches, museJobs, remoteJobs] = await Promise.all([
    Promise.all(marketCountries.map(code => _withSoftDeadline(
      _fetchSearchJobsForWeb(keyword, page, code), 14_000, []))),
    _withSoftDeadline(_fetchMuseJobsForWeb(keyword, page, country), 6_000, []),
    _fetchRemoteJobsForWeb(keyword, 20, country)
  ]);

  const seen = new Set();
  return [...searchBatches.flat(), ...museJobs, ...remoteJobs]
    .map(_toWebJob)
    .filter(_isCurrentWebJob)
    .filter(job => {
      const key = `${job.title}|${job.company}|${job.location}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime());
}

async function _fetchMapWebJobs(pageSize, country, countries) {
  if (!LIVE_JOBS_ENABLED) return [];
  // Global means a clearly labelled, rotating sample of local markets plus
  // worldwide remote roles. Never fan out to every country on each page view.
  const batches = await Promise.all([
    _fetchRemoteJobsForWeb('', pageSize, country),
    ...countries.map(code => _withSoftDeadline(
      _fetchSearchJobsForWeb('software engineer', 1, code, { ttlMs: 24 * 60 * 60_000 }),
      8_000, []))
  ]);
  const normalize = jobs => jobs.map(_toWebJob).filter(_isCurrentWebJob);
  const remote = normalize(batches[0]);
  const markets = normalize(batches.slice(1).flat());
  const newest = jobs => jobs.sort((a, b) => new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime());
  const marketQuota = Math.min(markets.length, Math.ceil(pageSize * 0.4));
  const remoteQuota = Math.min(remote.length, pageSize - marketQuota);
  const priority = [
    ...newest(markets).slice(0, marketQuota),
    ...newest(remote).slice(0, remoteQuota),
    ...newest([...markets.slice(marketQuota), ...remote.slice(remoteQuota)])
  ];
  const seen = new Set();
  return priority
    .filter(job => {
      const key = `${job.title}|${job.company}|${job.location}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
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
  const currencyMap = {
    gb: 'GBP', ca: 'CAD', au: 'AUD', sg: 'SGD', de: 'EUR', fr: 'EUR', it: 'EUR', nl: 'EUR',
    at: 'EUR', be: 'EUR', es: 'EUR', br: 'BRL', in: 'INR', mx: 'MXN', nz: 'NZD',
    pl: 'PLN', za: 'ZAR', ch: 'CHF'
  };
  return _withRawJobMeta({
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
    _source: 'adzuna',
    _requestedCountry: countryCode
  }, 'adzuna');
}

// 将 RemoteOK 结果归一化为 JSearch 格式
function _normalizeRemoteOK(job) {
  return _withRawJobMeta({
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
  }, 'remoteok');
}

function _normalizeLocalJob(job) {
  return _withRawJobMeta({
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
  }, 'local_fallback', { isFallback: true, fallbackReason: '实时职位源无可用结果' });
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

function _localFallbackPool(query) {
  const ranked = _localSearchJobs(query);
  const allLocal = localJobs().map(_normalizeLocalJob);
  const seen = new Set();
  const pool = [];

  for (const job of [...ranked, ...allLocal]) {
    const key = _dedupeJobKey(job);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(job);
  }

  return pool;
}

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/jobs/search
// 优先级：JSearch → Adzuna → 本地数据
// ════════════════════════════════════════════════════════════════════════════════
router.get('/search', jobsLimiter, async (req, res) => {
  const country = normalizeCountry(req.query.country);
  if (!country) return res.status(400).json({ data: [], status: 'ERROR', message: 'country 必须为两位国家代码或 global' });
  const query = String(req.query.query || 'software engineer').slice(0, 120);
  const page = Math.min(5, Math.max(1, parseInt(req.query.page, 10) || 1));
  // 1. JSearch
  if (country !== 'global' && _isValidRapidKey(process.env.RAPID_API_KEY)) {
    try {
      const params = { query, country, page, num_pages: 1 };
      if (_normalizeDatePosted(req.query.date_posted)) params.date_posted = _normalizeDatePosted(req.query.date_posted);
      if (req.query.employment_types) params.employment_types = String(req.query.employment_types).slice(0, 80);
      const result = await _requestJSearch('search', params, 15000);
      const payload = result.data || {};
      const data = (Array.isArray(payload.data) ? payload.data : []).map(job => _withRawJobMeta(job, 'jsearch'));
      return res.json({ ...payload, data, _source: 'jsearch', dataMeta: _collectionMeta(data) });
    } catch (err) {
      const status = err.status || err.response?.status || 500;
      if (_shouldLogSourceError(err)) console.warn('[jobs/search] JSearch 异常(', status, ')，尝试 Adzuna');
    }
  }

  // 2. Adzuna
  if (country !== 'global' && ADZUNA_COUNTRIES.has(country) && _isValidAdzuna()) {
    try {
      const params = {
        results_per_page: 10,
        what: query
      };
      const contract = _toAdzunaContract(req.query.employment_types);
      if (contract) params.contract_time = contract;
      const result = await _requestAdzuna(country, page, params);
      const data = (result.data.results || []).map(j => _normalizeAdzuna(j, country));
      return res.json({ data, status: 'OK', _source: 'adzuna', total: result.data.count || data.length, dataMeta: _collectionMeta(data) });
    } catch (err) {
      const status = err.status || err.response?.status || 500;
      if (_shouldLogSourceError(err)) console.warn('[jobs/search] Adzuna 异常(', status, ')，降级其他职位源');
    }
  }

  // Global requests and countries without a local Adzuna market can still
  // receive confirmed worldwide/country-eligible remote roles.
  const remoteJobs = await _fetchRemoteJobsForWeb(query, 20, country);
  if (remoteJobs.length) return res.json({
    data: remoteJobs.map(job => _withRawJobMeta(job, 'remoteok')),
    status: 'OK', _source: 'remoteok', total: remoteJobs.length,
    dataMeta: _collectionMeta(remoteJobs)
  });

  // 3. 本地兜底
  return _localSearch(req, res);
});

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/jobs/remote
// RemoteOK 远程职位专用接口（免费，无需 Key）
// 参数：query / page / pageSize / tag
// ════════════════════════════════════════════════════════════════════════════════
router.get('/remote', jobsLimiter, async (req, res) => {
  const country = normalizeCountry(req.query.country);
  if (!country) return res.status(400).json({ data: [], status: 'ERROR', message: 'country 必须为两位国家代码或 global' });
  try {
    if (!FREE_JOB_SOURCES_ENABLED) throw new Error('remoteok disabled');
    const response = await _requestRemoteOK(10000);

    // 第一条是 meta 信息，跳过
    const allJobs = (response.data || []).slice(1).filter(j => j.id && j.position && isRemoteJobEligible(j, country));

    const { query = '', tag = '', page = 1, pageSize = 10 } = req.query;
    const keyword = (query || tag).toLowerCase();

    const filtered = keyword
      ? allJobs.filter(j =>
          (j.position || '').toLowerCase().includes(keyword) ||
          (j.company  || '').toLowerCase().includes(keyword) ||
          (j.tags     || []).some(t => t.toLowerCase().includes(keyword))
        )
      : allJobs;

    const ps    = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 10));
    const pg    = Math.max(1, parseInt(page, 10) || 1);
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
      hasMore:  start + ps < filtered.length,
      dataMeta: _collectionMeta(data)
    });
  } catch (err) {
    if (_shouldLogSourceError(err)) console.warn('[jobs/remote] RemoteOK 异常:', err.message);
    // 降级：从本地数据里找远程职位
    try {
      const remoteJobs = localJobs().filter(j =>
        ((j.jobType || '').toLowerCase().includes('remote') ||
          (j.location || '').toLowerCase().includes('remote')) &&
        isRemoteJobEligible({ location: j.location }, country)
      );
      const data = remoteJobs.slice(0, 10).map(j => _withRawJobMeta({
        job_id: String(j.id), job_title: j.title, employer_name: j.company,
        job_city: 'Remote', job_country: 'Remote', job_description: j.description || '',
        job_min_salary: null, job_max_salary: null, job_salary_currency: 'USD',
        job_employment_type: 'FULLTIME', job_apply_link: j.applyUrl || '',
        job_posted_at_datetime_utc: j.postedAt || '', _source: 'local'
      }, 'local_fallback', { isFallback: true, fallbackReason: 'RemoteOK 暂不可用' }));
      res.json({
        data, status: 'OK', _source: 'local_fallback',
        dataMeta: _collectionMeta(data, { degraded: true, fallbackReason: 'RemoteOK 暂不可用' })
      });
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
    country = 'global',
    page = 1,
    pageSize = 20,
    date_posted,
    employment_types
  } = req.query;
  const normalizedCountry = normalizeCountry(country);
  if (!normalizedCountry) return res.status(400).json({ data: [], status: 'ERROR', message: 'country 必须为两位国家代码或 global' });
  const coverageCountries = normalizedCountry === 'global' ? globalSampleCountries() : [normalizedCountry];
  const ps = Math.min(parseInt(pageSize, 10) || 20, 50);
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const needed = pg * ps;
  const searchTarget = Math.min(120, Math.max(needed + ps * 2, 60));
  const datePosted = _normalizeDatePosted(date_posted);
  const dateFilterExplicit = !!datePosted && datePosted !== 'all';
  const dateWindow = dateFilterExplicit ? datePosted : 'month';
  const localMatches = normalizedCountry === 'global' ? _localSearchJobs(query) : [];
  const freeSourcesEnabled = FREE_JOB_SOURCES_ENABLED;

  async function _fetchJSearchFresh(countryCode) {
    if (!_isValidRapidKey(process.env.RAPID_API_KEY)) return [];
    try {
      const params = {
        query: String(query).slice(0, 120), page: 1,
        num_pages: normalizedCountry === 'global' ? 1 : Math.min(2, Math.max(1, Math.ceil(searchTarget / 10))),
        date_posted: dateWindow, country: countryCode
      };
      if (employment_types) params.employment_types = String(employment_types).slice(0, 80);
      const r = await _requestJSearch('search', params);
      return ((r.data && r.data.data) || []).map(job => _withRawJobMeta(
        { ...job, _requestedCountry: countryCode }, 'jsearch'));
    } catch (_) { return []; }
  }

  async function _fetchAdzunaFresh(countryCode) {
    if (!_isValidAdzuna()) return [];
    if (!ADZUNA_COUNTRIES.has(countryCode)) return [];
    try {
      const contract = _toAdzunaContract(employment_types);
      const params = { results_per_page: Math.min(50, searchTarget), what: String(query).slice(0, 120), sort_by: 'date' };
      if (contract) params.contract_time = contract;
      const result = await _requestAdzuna(countryCode, 1, params);
      return (result.data.results || []).map(job => _normalizeAdzuna(job, countryCode));
    } catch (_) {
      return [];
    }
  }

  async function _fetchSearchFresh() {
    // A global feed samples two markets per day and falls back per market.
    // This is not a claim that every country was queried on each request.
    if (normalizedCountry === 'global') {
      const batches = await Promise.all(coverageCountries.map(async code => {
        const jobs = await _fetchJSearchFresh(code);
        return jobs.length ? jobs : _fetchAdzunaFresh(code);
      }));
      return batches.flat();
    }
    const [jsearchJobs, adzunaJobs] = await Promise.all([
      _fetchJSearchFresh(normalizedCountry), _fetchAdzunaFresh(normalizedCountry)
    ]);
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
    if (!freeSourcesEnabled || !THE_MUSE_API_KEY || normalizedCountry !== 'global') return [];
    try {
      const museCategory = _museCategoryForQuery(query);
      const result = await _requestMuse('jobs', { page: 0, category: museCategory }, 8000);
      return (result.data.results || []).map(_normalizeMuse);
    } catch (_) {
      return [];
    }
  }

  async function _fetchRemoteOKFresh() {
    if (!freeSourcesEnabled) return [];
    try {
      const response = await _requestRemoteOK();
      const tokens = _queryTokens(query);
      const allJobs = (response.data || []).slice(1).filter(j => j.id && j.position && isRemoteJobEligible(j, normalizedCountry));
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
      _withSoftDeadline(_fetchSearchFresh(), 18_000, []),
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

    const start = (pg - 1) * ps;
    const minPoolSize = start + ps + 1;
    if (merged.length < minPoolSize) {
      for (const job of normalizedCountry === 'global' ? _localFallbackPool(query) : []) {
        if (!_matchesEmploymentType(job, employment_types)) continue;
        if (dateFilterExplicit && !_withinDatePosted(job, datePosted)) continue;

        const key = _dedupeJobKey(job);
        if (!seen.has(key)) { seen.add(key); merged.push(job); }
        if (merged.length >= minPoolSize) break;
      }
    }

    const sorted = _sortByLatest(merged);
    const slice = sorted.slice(start, start + ps);
    res.json({
      data: slice,
      status: 'OK',
      _source: 'aggregate',
      total: sorted.length,
      page: pg,
      pageSize: ps,
      hasMore: start + ps < sorted.length,
      sources: [...new Set(sorted.map(j => j._source || (j._local ? 'local' : 'unknown')))],
      coverage: {
        mode: normalizedCountry === 'global' ? 'sampled' : 'country',
        countries: coverageCountries,
        countriesWithResults: [...new Set(searchJobs.map(job => job._requestedCountry || job.job_country)
          .filter(value => /^[a-z]{2}$/i.test(String(value || '')))
          .map(value => String(value).toLowerCase()))]
      },
      dataMeta: _collectionMeta(slice, {
        degraded: !sorted.length || slice.some(job => job.dataMeta && job.dataMeta.isFallback),
        fallbackReason: !sorted.length ? '所选地区暂无可验证实时岗位' :
          (slice.some(job => job.dataMeta && job.dataMeta.isFallback) ? '实时来源数量不足，已补充历史职位库' : '')
      })
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
  return _withRawJobMeta({
    job_id:                    'muse_' + job.id,
    job_title:                 job.name || '',
    employer_name:             company,
    employer_logo:             '',
    job_city:                  location,
    job_country:               location,
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
  }, 'themuse');
}

router.get('/featured', jobsLimiter, async (req, res) => {
  if (!THE_MUSE_API_KEY || !FREE_JOB_SOURCES_ENABLED) return _localSearch(req, res);
  try {
    const { query = '', category = '', level = '', location = '', page = 0 } = req.query;

    const params = { page: parseInt(page) };

    // 关键词映射到 The Muse 分类
    const kw = (query || category).toLowerCase();
    const museCategory = MUSE_CATEGORIES[kw] || (category || undefined);
    if (museCategory) params.category = museCategory;
    if (level)        params.level     = level;
    if (location)     params.location  = location;

    const result = await _requestMuse('jobs', params, 10000);

    const data = (result.data.results || []).map(_normalizeMuse);
    res.json({
      data,
      status:     'OK',
      _source:    'themuse',
      total:      result.data.total      || data.length,
      page:       result.data.page       || 0,
      page_count: result.data.page_count || 1,
      hasMore:    (result.data.page || 0) < (result.data.page_count || 1) - 1,
      dataMeta:   _collectionMeta(data)
    });
  } catch (err) {
    if (_shouldLogSourceError(err)) console.warn('[jobs/featured] The Muse 异常:', err.message);
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
    const params = {
      title_filter: query, location_filter: location,
      description_type: 'text', offset
    };
    const result = await sourceGateway.request('linkedin', JSON.stringify(params), () => axios.get(`https://${LINKEDIN_RAPID_HOST}/active-jb-1h`, {
      params,
      headers: {
        'Content-Type':  'application/json',
        'X-RapidAPI-Key':  process.env.RAPID_API_KEY,
        'X-RapidAPI-Host': LINKEDIN_RAPID_HOST
      },
      timeout: 8000
    }));

    const jobs = Array.isArray(result.data) ? result.data : (result.data.jobs || result.data.data || []);
    const data = jobs.map(j => _withRawJobMeta({
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
    }, 'linkedin'));

    res.json({ data, status: 'OK', _source: 'linkedin', total: data.length, dataMeta: _collectionMeta(data) });
  } catch (err) {
    const status = err.status || err.response?.status || 500;
    if (_shouldLogSourceError(err)) console.warn('[jobs/linkedin]', status, err.message);
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
    const params = { q: query, l: location, page_id: String(page), locality: 'us' };
    const result = await sourceGateway.request('indeed', JSON.stringify(params), () => axios.get('https://indeed12.p.rapidapi.com/jobs/search', {
      params,
      headers: {
        'X-RapidAPI-Key':  process.env.RAPID_API_KEY,
        'X-RapidAPI-Host': INDEED_RAPID_HOST
      },
      timeout: 8000
    }));

    const jobs = result.data.hits || result.data.jobs || [];
    const data = jobs.map(j => _withRawJobMeta({
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
    }, 'indeed'));

    res.json({ data, status: 'OK', _source: 'indeed', total: result.data.total || data.length, dataMeta: _collectionMeta(data) });
  } catch (err) {
    const status = err.status || err.response?.status || 500;
    if (_shouldLogSourceError(err)) console.warn('[jobs/indeed]', status, err.message);
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
    const country = normalizeCountry(req.query.country);
    const keyword = String(query).toLowerCase();
    const all = localJobs().filter(j =>
      (country === 'global' || normalizeCountry('', j.region) === country) &&
      (!keyword || j.title.toLowerCase().includes(keyword) ||
        j.company.toLowerCase().includes(keyword) ||
        (j.description || '').toLowerCase().includes(keyword))
    );
    const pageSize = 10;
    const start = (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize;
    const slice = all.slice(start, start + pageSize * Math.min(2, Math.max(1, parseInt(num_pages, 10) || 1)));
    const data = slice.map(j => _withRawJobMeta({
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
    }, 'local_fallback', { isFallback: true, fallbackReason: '实时职位源无可用结果' }));
    res.json({
      data,
      status: 'OK',
      _source: 'local_fallback',
      dataMeta: _collectionMeta(data, { degraded: true, fallbackReason: '实时职位源无可用结果' })
    });
  } catch (e) {
    res.status(500).json({ error: e.message, data: [] });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/jobs/detail
// 优先级：JSearch → 本地数据
// ════════════════════════════════════════════════════════════════════════════════
router.get('/detail', optionalAuth, jobsLimiter, async (req, res) => {
  if (!req.query.job_id) {
    return res.status(400).json({ error: 'job_id 不能为空' });
  }
  if (!_isValidRapidKey(process.env.RAPID_API_KEY)) {
    const job = localJobs().find(j => String(j.id) === String(req.query.job_id));
    if (job) {
      const data = [_withRawJobMeta({
        job_id: String(job.id), job_title: job.title, employer_name: job.company,
        job_description: job.description || '', job_city: job.location || '',
        job_apply_link: job.applyUrl || '', job_posted_at_datetime_utc: job.postedAt || '', _local: true
      }, 'local_fallback', { isFallback: true, fallbackReason: '未配置实时职位源' })];
      _trackJobView(req, req.query.job_id);
      return res.json({ data, status: 'OK', _source: 'local_fallback', dataMeta: _collectionMeta(data, { degraded: true, fallbackReason: '未配置实时职位源' }) });
    }
    return res.status(404).json({ error: '职位不存在', data: [] });
  }
  try {
    const result = await _requestJSearch('job-details', { job_id: String(req.query.job_id) }, 5000);
    const payload = result.data || {};
    const data = (Array.isArray(payload.data) ? payload.data : []).map(job => _withRawJobMeta(job, 'jsearch'));
    if (data.length) _trackJobView(req, req.query.job_id);
    res.json({ ...payload, data, _source: 'jsearch', dataMeta: _collectionMeta(data) });
  } catch (err) {
    const status = err.status || err.response?.status || 500;
    if (_shouldLogSourceError(err)) console.warn('[jobs/detail] JSearch 异常(', status, ')，降级本地数据');
    const job = localJobs().find(j => String(j.id) === String(req.query.job_id));
    if (job) {
      const data = [_withRawJobMeta({
        job_id: String(job.id), job_title: job.title, employer_name: job.company,
        job_description: job.description || '', job_city: job.location || '',
        job_apply_link: job.applyUrl || '', job_posted_at_datetime_utc: job.postedAt || '', _local: true
      }, 'local_fallback', { isFallback: true, fallbackReason: 'JSearch 详情加载失败' })];
      _trackJobView(req, req.query.job_id);
      return res.json({ data, status: 'OK', _source: 'local_fallback', dataMeta: _collectionMeta(data, { degraded: true, fallbackReason: 'JSearch 详情加载失败' }) });
    }
    res.status(404).json({ error: '职位不存在', data: [] });
  }
});

// GET /api/jobs/salary
router.get('/salary', jobsLimiter, async (req, res) => {
  if (!_isValidRapidKey(process.env.RAPID_API_KEY)) {
    return res.json({ data: [], status: 'OK', _source: 'local' });
  }
  try {
    const result = await _requestJSearch('estimated-salary',
      { ...req.query, location_type: req.query.location_type || 'ANY', years_of_experience: req.query.years_of_experience || 'ALL' }, 10000);
    res.json(result.data);
  } catch (err) {
    const status = err.status || err.response?.status || 500;
    if (_shouldLogSourceError(err)) console.warn('[jobs/salary]', status, err.message);
    res.json({ data: [], status: 'OK', _source: 'local' });
  }
});

// GET /api/jobs/recommend/list
router.get('/recommend/list', jobsLimiter, async (req, res) => {
  try {
    const liveJobs = await _fetchLiveWebJobs({ keyword: req.query.keyword || 'software engineer', page: 1 });
    const list = liveJobs.length
      ? liveJobs.slice(0, 5)
      : _publicLocalWebJobs().sort(() => 0.5 - Math.random()).slice(0, 5);
    res.json({ code: 0, message: 'success', data: list });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// GET /api/jobs/map
router.get('/map', jobsLimiter, async (req, res) => {
  const country = normalizeCountry(req.query.country, req.query.region);
  if (!country) return res.status(400).json({ code: -1, message: 'country 必须为两位国家代码或 global' });
  const coverageCountries = country === 'global' ? globalSampleCountries() : [country];
  try {
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 160, 20), 240);
    const liveJobs = await _fetchMapWebJobs(pageSize, country, coverageCountries);
    const countriesWithResults = [...new Set(liveJobs
      .filter(job => job.source !== 'remoteok' && job.countryCode !== 'global')
      .map(job => job.countryCode))];
    const localFallbackJobs = _publicLocalWebJobs().filter(job => country === 'global' || job.countryCode === country);
    const list = [...liveJobs, ...localFallbackJobs].slice(0, pageSize);
    const hasFallback = list.length > liveJobs.length;
    const source = liveJobs.length ? (hasFallback ? 'live_with_local_fallback' : 'live') : 'local_fallback';

    res.json({
      code: 0,
      message: 'success',
      data: {
        list,
        total: list.length,
        source,
        sources: [...new Set(list.map(job => job.source).filter(Boolean))],
        dataMeta: _collectionMeta(list, {
          degraded: hasFallback || !liveJobs.length,
          fallbackReason: hasFallback ? '实时地图岗位不足，已补充近期职位库' : (liveJobs.length ? '' : '实时地图岗位不可用')
        })
      },
      meta: {
        liveJobsEnabled: LIVE_JOBS_ENABLED,
        coverage: {
          mode: country === 'global' ? 'sampled' : 'country',
          countries: coverageCountries, countriesWithResults,
          remoteIncluded: liveJobs.some(job => job.source === 'remoteok')
        },
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[jobs/map]', error.message);
    const list = _publicLocalWebJobs()
      .filter(job => country === 'global' || job.countryCode === country)
      .slice(0, Math.min(parseInt(req.query.pageSize) || 160, 240));
    res.json({
      code: 0,
      message: 'success',
      data: {
        list,
        total: list.length,
        source: 'local_fallback',
        sources: list.length ? ['local'] : [],
        dataMeta: _collectionMeta(list, { degraded: true, fallbackReason: '实时地图岗位加载失败' })
      },
      meta: { coverage: {
        mode: country === 'global' ? 'sampled' : 'country',
        countries: coverageCountries, countriesWithResults: [], remoteIncluded: false
      } }
    });
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
router.get('/', jobsLimiter, async (req, res) => {
  try {
    const { keyword, region, industry, jobType, visaSponsored, page = 1, pageSize = 10 } = req.query;
    const country = normalizeCountry(req.query.country, region);
    if (!country) return res.status(400).json({ code: -1, message: 'country 必须为两位国家代码或 global' });
    const pg = Math.max(parseInt(page) || 1, 1);
    const ps = Math.min(Math.max(parseInt(pageSize) || 10, 1), 50);

    // Web clients use this fast path for the first render, then refresh from
    // live sources in the background. This keeps external API latency from
    // leaving the job list in an indefinite loading state.
    if (req.query.source === 'local') {
      const filteredJobs = _applyWebFilters(_publicLocalWebJobs()
        .filter(job => country === 'global' || job.countryCode === country), req.query);
      const startIndex = (pg - 1) * ps;
      const list = filteredJobs.slice(startIndex, startIndex + ps);
      return res.json({
        code: 0,
        message: 'success',
        data: {
          list,
          total: filteredJobs.length,
          page: pg,
          pageSize: ps,
          totalPages: Math.ceil(filteredJobs.length / ps) || 1,
          source: 'local_fallback',
          sources: ['local'],
          dataMeta: _collectionMeta(list, {
            degraded: true,
            fallbackReason: '实时职位正在后台更新'
          })
        },
        meta: {
          liveJobsEnabled: LIVE_JOBS_ENABLED,
          source: 'local_fallback',
          keyword: keyword || '',
          generatedAt: new Date().toISOString()
        }
      });
    }

    const liveJobs = await _fetchLiveWebJobs({ keyword, region, country, industry, jobType, visaSponsored, page: pg });
    const localFallbackJobs = _publicLocalWebJobs().filter(job => country === 'global' || job.countryCode === country);
    let filteredJobs = _applyWebFilters(liveJobs, req.query);
    let source = liveJobs.length ? 'live' : 'local_fallback';

    if (!filteredJobs.length) {
      filteredJobs = _applyWebFilters(localFallbackJobs, req.query);
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
        sources: [...new Set(filteredJobs.map(j => j.source).filter(Boolean))],
        dataMeta: _collectionMeta(filteredJobs.slice(startIndex, startIndex + ps), {
          degraded: source === 'local_fallback',
          fallbackReason: source === 'local_fallback' ? '实时职位源无可用结果' : ''
        })
      },
      meta: {
        liveJobsEnabled: LIVE_JOBS_ENABLED,
        source,
        country,
        coverage: {
          mode: country === 'global' ? 'sampled' : 'country',
          countries: country === 'global' ? globalSampleCountries() : [country],
          countriesWithResults: [...new Set(liveJobs
            .filter(job => job.source !== 'remoteok' && job.countryCode !== 'global')
            .map(job => job.countryCode))],
          remoteIncluded: liveJobs.some(job => job.source === 'remoteok')
        },
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
      const localJob = localJobs().find(j => j.id === numericId);
      if (localJob) {
        const job = _toLocalWebJob(localJob);
        // Historic IDs remain navigable from saved applications and favorites.
        // dataMeta.freshnessReason tells clients to verify the official posting.
        return res.json({ code: 0, message: 'success', data: job });
      }
    }

    if (rawId.startsWith('muse_') && THE_MUSE_API_KEY && FREE_JOB_SOURCES_ENABLED) {
      try {
        const museId = rawId.replace(/^muse_/, '');
        const result = await _requestMuse(`jobs/${encodeURIComponent(museId)}`);
        const job = _toWebJob(_normalizeMuse(result.data));
        return res.json({ code: 0, message: 'success', data: job });
      } catch (err) {
        if (_shouldLogSourceError(err)) console.warn('[jobs/detail] The Muse 详情拉取失败:', err.message);
      }
    }

    if (rawId.startsWith('rok_')) {
      try {
        const remoteId = rawId.replace(/^rok_/, '');
        const response = await _requestRemoteOK(6000);
        const remoteJob = (response.data || []).slice(1).find(j => String(j.id) === remoteId);
        if (remoteJob) {
          const job = _toWebJob(_normalizeRemoteOK(remoteJob));
          return res.json({ code: 0, message: 'success', data: job });
        }
      } catch (err) {
        if (_shouldLogSourceError(err)) console.warn('[jobs/detail] RemoteOK 详情拉取失败:', err.message);
      }
    }

    if (_isValidRapidKey(process.env.RAPID_API_KEY)) {
      try {
        const result = await _requestJSearch('job-details', { job_id: rawId }, 5000);
        const apiJob = Array.isArray(result.data?.data) ? result.data.data[0] : null;
        if (apiJob) {
          const job = _toWebJob({ ...apiJob, _source: apiJob._source || 'jsearch' });
          return res.json({ code: 0, message: 'success', data: job });
        }
      } catch (err) {
        if (_shouldLogSourceError(err)) console.warn('[jobs/detail] JSearch 详情拉取失败:', err.message);
      }
    }

    res.status(404).json({ code: -1, message: '职位不存在或已下线' });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

module.exports = router;

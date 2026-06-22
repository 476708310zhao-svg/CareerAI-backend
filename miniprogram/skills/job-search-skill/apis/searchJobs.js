const { request } = require('../utils/request.js');
const { rememberJobIds } = require('../utils/auth.js');

const VISA_TAGS = ['OPT', 'CPT', 'H-1B', 'E-Verify'];
const DETAIL_PAGE = '/package-user/pages/job-detail/job-detail';

function normalizeCountry(region, city) {
  const text = String(region || city || '').toLowerCase();
  if (/canada|toronto|vancouver|waterloo|montreal|ottawa/.test(text)) return 'ca';
  if (/united kingdom|uk|london|england/.test(text)) return 'gb';
  if (/singapore/.test(text)) return 'sg';
  if (/australia|sydney|melbourne/.test(text)) return 'au';
  return 'us';
}

function normalizeJobType(jobType) {
  const value = String(jobType || '').toLowerCase();
  if (/intern|实习|summer/.test(value)) return 'INTERN';
  if (/part/.test(value)) return 'PARTTIME';
  if (/contract|contractor/.test(value)) return 'CONTRACTOR';
  if (/full|new grad|全职/.test(value)) return 'FULLTIME';
  return '';
}

function normalizeDatePosted(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n <= 1) return 'today';
  if (n <= 3) return '3days';
  if (n <= 7) return 'week';
  if (n <= 31) return 'month';
  return 'all';
}

function formatSalary(min, max, currency) {
  if (!min && !max) return '';
  const cur = currency || 'USD';
  const toText = value => Math.round(Number(value)).toLocaleString();
  if (min && max) return cur + ' ' + toText(min) + '-' + toText(max);
  return cur + ' ' + toText(min || max) + '+';
}

function inferVisaTags(job) {
  const text = [
    job.job_title,
    job.employer_name,
    job.job_description,
    job.job_highlights && JSON.stringify(job.job_highlights)
  ].filter(Boolean).join(' ');

  const tags = [];
  if (/\bOPT\b/i.test(text)) tags.push('OPT');
  if (/\bCPT\b/i.test(text)) tags.push('CPT');
  if (/\bH[- ]?1B\b|sponsor(ship)?/i.test(text)) tags.push('H-1B');
  if (/E-?Verify/i.test(text)) tags.push('E-Verify');
  return tags;
}

function locationText(job) {
  return [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', ') || 'Remote';
}

function sourceText(job) {
  if (job._source) return job._source;
  if (job._local) return 'local';
  return '';
}

function companyInitial(company) {
  const name = String(company || 'C').trim();
  return name ? name.slice(0, 1).toUpperCase() : 'C';
}

function normalizeJob(job) {
  const visaTags = inferVisaTags(job);
  const salaryRange = formatSalary(job.job_min_salary, job.job_max_salary, job.job_salary_currency);
  const company = job.employer_name || 'Company';
  return {
    jobId: String(job.job_id || ''),
    title: job.job_title || '',
    company,
    companyInitial: companyInitial(company),
    location: locationText(job),
    city: job.job_city || '',
    state: job.job_state || '',
    jobType: job.job_employment_type || 'Full-time',
    visaTags,
    updatedAt: job.job_posted_at_datetime_utc || '',
    salaryRange,
    companyLogo: job.employer_logo || '',
    applyUrl: job.job_apply_link || '',
    description: job.job_description || '',
    source: sourceText(job),
    detailPage: DETAIL_PAGE + '?id=' + encodeURIComponent(String(job.job_id || ''))
  };
}

function buildKeyword(input) {
  const parts = [];
  if (input.keyword) parts.push(String(input.keyword).trim());
  if (input.city) parts.push(String(input.city).trim());
  if (input.graduationYear) parts.push(String(input.graduationYear).trim(), 'new grad');
  if (!parts.length && input.jobType && /intern|实习|summer/i.test(input.jobType)) parts.push('internship');
  return parts.filter(Boolean).join(' ') || 'Software Engineer jobs';
}

function includesCity(job, city) {
  if (!city) return true;
  const needle = String(city).toLowerCase();
  return [job.location, job.city, job.state].filter(Boolean).join(' ').toLowerCase().includes(needle);
}

function includesVisaTags(job, requestedTags) {
  const tags = (requestedTags || []).filter(tag => VISA_TAGS.includes(tag));
  if (!tags.length) return true;
  return tags.some(tag => (job.visaTags || []).includes(tag));
}

function buildContent(jobs, total) {
  if (!jobs.length) {
    return [{
      type: 'text',
      text: '暂时没有找到匹配岗位。可以放宽关键词、地区、城市、岗位类型、签证标签或更新时间再试。'
    }];
  }

  return [{
    type: 'text',
    text: '找到 ' + total + ' 个相关岗位，先展示前 ' + jobs.length + ' 个。'
  }];
}

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: {
      jobs: [],
      total: 0,
      hasMore: false
    },
    _meta: {
      jobs: [],
      total: 0,
      hasMore: false,
      relatedPage: '/pages/jobs/jobs',
      ui: {
        componentPath: 'components/job-list/index'
      }
    }
  };
}

function searchJobs(input) {
  const args = input || {};
  const keyword = buildKeyword(args);
  const params = {
    query: keyword,
    country: normalizeCountry(args.region, args.city),
    page: 1,
    pageSize: 20
  };
  const datePosted = normalizeDatePosted(args.updatedWithinDays);
  const employmentTypes = normalizeJobType(args.jobType);
  if (datePosted) params.date_posted = datePosted;
  if (employmentTypes) params.employment_types = employmentTypes;

  return request({
    path: '/api/jobs/aggregate',
    params,
    timeout: 18000
  }).then(res => {
    if (res && res.isError) {
      return errorResult(res.message || '岗位搜索请求失败，请稍后再试。');
    }

    const rawList = Array.isArray(res.data) ? res.data : [];
    const requestedVisaTags = Array.isArray(args.visaTags) ? args.visaTags : [];
    const normalized = rawList
      .map(normalizeJob)
      .filter(job => job.jobId && includesCity(job, args.city))
      .filter(job => includesVisaTags(job, requestedVisaTags));

    const jobs = normalized.slice(0, 5);
    rememberJobIds(jobs.map(job => job.jobId));

    const total = normalized.length || 0;
    return {
      isError: false,
      content: buildContent(jobs, total),
      structuredContent: {
        query: {
          keyword,
          country: params.country,
          city: args.city || '',
          jobType: args.jobType || '',
          graduationYear: args.graduationYear || '',
          visaTags: requestedVisaTags,
          updatedWithinDays: args.updatedWithinDays || null
        },
        jobs,
        total,
        hasMore: normalized.length > jobs.length || !!res.hasMore
      },
      _meta: {
        jobs,
        total,
        hasMore: normalized.length > jobs.length || !!res.hasMore,
        source: res._source || 'aggregate',
        sources: res.sources || [],
        relatedPage: '/pages/jobs/jobs',
        ui: {
          componentPath: 'components/job-list/index'
        }
      }
    };
  });
}

module.exports = searchJobs;

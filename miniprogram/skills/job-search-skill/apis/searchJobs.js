const { request } = require('../utils/request.js');
const { rememberJobIds } = require('../utils/auth.js');
const { visaFromDescription, salaryFromSource } = require('../utils/job-evidence.js');

const VISA_TAGS = ['OPT', 'CPT', 'H-1B', 'E-Verify'];
const DETAIL_PAGE = '/package-user/pages/job-detail/job-detail';
const CITY_ALIASES = [
  [/纽约|new york/i, 'New York', 'us'],
  [/旧金山|san francisco/i, 'San Francisco', 'us'],
  [/洛杉矶|los angeles/i, 'Los Angeles', 'us'],
  [/西雅图|seattle/i, 'Seattle', 'us'],
  [/波士顿|boston/i, 'Boston', 'us'],
  [/多伦多|toronto/i, 'Toronto', 'ca'],
  [/温哥华|vancouver/i, 'Vancouver', 'ca'],
  [/伦敦|london/i, 'London', 'gb'],
  [/新加坡|singapore/i, 'Singapore', 'sg'],
  [/悉尼|sydney/i, 'Sydney', 'au'],
  [/墨尔本|melbourne/i, 'Melbourne', 'au'],
  [/柏林|berlin/i, 'Berlin', 'de'],
  [/巴黎|paris/i, 'Paris', 'fr'],
  [/东京|tokyo/i, 'Tokyo', 'jp'],
  [/香港|hong kong/i, 'Hong Kong', 'hk'],
  [/北京|beijing/i, 'Beijing', 'cn'],
  [/上海|shanghai/i, 'Shanghai', 'cn'],
  [/深圳|shenzhen/i, 'Shenzhen', 'cn'],
  [/广州|guangzhou/i, 'Guangzhou', 'cn'],
  [/杭州|hangzhou/i, 'Hangzhou', 'cn']
];

function cityAlias(city) {
  const text = String(city || '').trim();
  return CITY_ALIASES.find(([pattern]) => pattern.test(text));
}

function normalizeCountry(region, city) {
  const text = String(region || '').trim().toLowerCase();
  if (!text) {
    const match = cityAlias(city);
    return match ? match[2] : 'global';
  }
  if (/^(global|worldwide|all|全球|不限)$/.test(text)) return 'global';
  if (/^(us|usa|united states|america|美国|美國)$/.test(text)) return 'us';
  if (/^(ca|canada|加拿大)$/.test(text)) return 'ca';
  if (/^(gb|uk|united kingdom|britain|england|英国|英國)$/.test(text)) return 'gb';
  if (/^(sg|singapore|新加坡)$/.test(text)) return 'sg';
  if (/^(au|australia|澳大利亚|澳洲)$/.test(text)) return 'au';
  if (/^(de|germany|德国)$/.test(text)) return 'de';
  if (/^(fr|france|法国)$/.test(text)) return 'fr';
  if (/^(jp|japan|日本)$/.test(text)) return 'jp';
  if (/^(cn|china|中国|中國|中国内地|中國內地|大陆|大陸)$/.test(text)) return 'cn';
  if (/^(hk|hong kong|香港|中国香港|中國香港)$/.test(text)) return 'hk';
  return null;
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

function locationText(job) {
  return [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', ')
    || (job.job_is_remote === true ? 'Remote' : '地点未披露');
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
  const visaEvidence = visaFromDescription(job.job_description);
  const salary = salaryFromSource(job);
  const company = job.employer_name || '公司未披露';
  return {
    jobId: String(job.job_id || ''),
    title: job.job_title || '',
    company,
    companyInitial: companyInitial(company),
    location: locationText(job),
    city: job.job_city || '',
    state: job.job_state || '',
    jobType: job.job_employment_type || '类型未披露',
    visaTags: visaEvidence.map(item => item.tag),
    visaEvidence,
    updatedAt: job.job_posted_at_datetime_utc || '',
    salaryRange: salary.text,
    salaryEvidence: salary.source,
    companyLogo: job.employer_logo || '',
    applyUrl: job.job_apply_link || '',
    sourceUrl: job.job_source_url || '',
    sourceReference: job.job_source_reference || '',
    description: job.job_description || '',
    source: sourceText(job),
    detailPage: DETAIL_PAGE + '?id=' + encodeURIComponent(String(job.job_id || ''))
  };
}

function normalizeKeyword(keyword) {
  return String(keyword || '')
    .replace(/软件(开发)?工程师/g, ' software engineer ')
    .replace(/数据分析师?|数据分析/g, ' data analyst ')
    .replace(/产品经理/g, ' product manager ')
    .replace(/暑期实习|实习生?/g, ' internship ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildKeyword(input) {
  const parts = [];
  if (input.keyword) parts.push(normalizeKeyword(input.keyword));
  if (input.city) parts.push((cityAlias(input.city) || [null, String(input.city).trim()])[1]);
  if (input.graduationYear) parts.push(String(input.graduationYear).trim(), 'new grad');
  if (!parts.length && input.jobType && /intern|实习|summer/i.test(input.jobType)) parts.push('internship');
  return parts.filter(Boolean).join(' ') || 'Software Engineer jobs';
}

function includesCity(job, city) {
  if (!city) return true;
  const needle = (cityAlias(city) || [null, String(city).trim()])[1].toLowerCase();
  return [job.location, job.city, job.state].filter(Boolean).join(' ').toLowerCase().includes(needle);
}

function includesVisaTags(job, requestedTags) {
  const tags = (requestedTags || []).filter(tag => VISA_TAGS.includes(tag));
  if (!tags.length) return true;
  return tags.some(tag => (job.visaTags || []).includes(tag));
}

function titleRelevance(job, keyword) {
  const title = String(job.title || '').toLowerCase();
  const tokens = normalizeKeyword(keyword).toLowerCase().split(/\s+/)
    .map(token => token === 'internship' ? 'intern' : token)
    .filter(token => token.length > 2 && !['jobs', 'job', 'roles', 'role'].includes(token));
  return tokens.reduce((score, token) => score + (title.includes(token) ? 1 : 0), 0);
}

function locationRelevance(job, city) {
  if (!city) return 0;
  const target = (cityAlias(city) || [null, String(city).trim()])[1].toLowerCase();
  if (String(job.city || '').toLowerCase() === target) return 2;
  return String(job.location || '').toLowerCase().includes(target) ? 1 : 0;
}

function postedTime(job) {
  const value = Date.parse(job.updatedAt || '');
  return Number.isFinite(value) ? value : 0;
}

function compareJobs(a, b, args) {
  return titleRelevance(b, args.keyword) - titleRelevance(a, args.keyword)
    || locationRelevance(b, args.city) - locationRelevance(a, args.city)
    || postedTime(b) - postedTime(a);
}

function rememberJobSnapshot(job) {
  if (typeof wx === 'undefined' || !wx || !wx.setStorageSync || !job.jobId) return;
  try {
    wx.setStorageSync('jobDetailSnapshot_' + job.jobId, {
      id: job.jobId, title: job.title, company: job.company,
      city: job.city, state: job.state, type: job.jobType,
      description: String(job.description || '').slice(0, 6000),
      salary: job.salaryRange || '', postedAtRaw: job.updatedAt || '',
      applyLink: job.applyUrl || '', source: job.source,
      sourceUrl: job.sourceUrl || '', sourceReference: job.sourceReference || '',
      skillSnapshotAt: Date.now()
    });
  } catch (error) {}
}

const MARKET_NAMES = { us: '美国', gb: '英国', cn: '中国内地', hk: '香港', ca: '加拿大',
  au: '澳大利亚', sg: '新加坡', jp: '日本', de: '德国', fr: '法国' };

function buildContent(jobs, total, response) {
  const coverage = response && response.coverage || {};
  const sampled = coverage.mode === 'sampled' && Array.isArray(coverage.countries)
    ? '本次全球搜索抽样地区：' + coverage.countries.map(code => MARKET_NAMES[code] || code).join('、')
      + '；如需其他地区，请明确选择地区。' : '';
  const partial = (response && response.sourceStatus || [])
    .some(item => item.status === 'unavailable')
    ? '部分岗位来源暂不可用，结果可能不完整。' : '';
  if (!jobs.length) {
    return [{
      type: 'text',
      text: ['暂时没有找到匹配岗位。可以放宽关键词、地区、城市、岗位类型、签证标签或更新时间再试。', sampled, partial]
        .filter(Boolean).join(' ')
    }];
  }

  return [{
    type: 'text',
    text: ['本次检索找到 ' + total + ' 条符合条件的岗位，先展示 ' + jobs.length
      + ' 条。点击“查看全部”可进入完整岗位列表。', sampled, partial].filter(Boolean).join(' ')
  }];
}

function errorResult(message, reason) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: {
      jobs: [],
      total: 0,
      hasMore: false,
      sourceUnavailable: reason === 'source_unavailable',
      emptyMessage: message
    },
    _meta: {
      jobs: [],
      total: 0,
      hasMore: false,
      sourceUnavailable: reason === 'source_unavailable',
      emptyMessage: message,
      relatedPage: '/pages/jobs/jobs',
      ui: {
        componentPath: 'components/job-list/index'
      }
    }
  };
}

function searchJobs(input) {
  const args = input || {};
  const country = normalizeCountry(args.region, args.city);
  if (!country) return Promise.resolve(errorResult('暂时无法识别该地区，请指定国家（例如美国、加拿大、英国）后重试。'));
  const keyword = buildKeyword(args);
  const params = {
    query: keyword,
    country,
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
    // The backend may wait up to 18 seconds for live job sources. Leave room
    // for network transit so wx.request does not time out before it responds.
    timeout: 25000
  }).then(res => {
    if (res && res.isError) {
      return errorResult(res.message || '岗位搜索请求失败，请稍后再试。');
    }
    if (!res || res.status !== 'OK' || !Array.isArray(res.data)) {
      return errorResult('岗位搜索服务暂不可用，请稍后重试。');
    }

    const rawList = res.data;
    if (!rawList.length && res.dataMeta && res.dataMeta.degraded && !(res.sources || []).length) {
      const scope = country === 'global' ? '全球' : (args.region || args.city || '所选地区');
      return errorResult('本次未获取到' + scope + '的可验证实时岗位，无法确认是暂无匹配还是岗位源暂不可用。请稍后重试或调整条件。', 'source_unavailable');
    }
    const requestedVisaTags = Array.isArray(args.visaTags) ? args.visaTags : [];
    const normalized = rawList
      .map(normalizeJob)
      .filter(job => job.jobId && includesCity(job, args.city))
      .filter(job => includesVisaTags(job, requestedVisaTags))
      .sort((a, b) => compareJobs(a, b, args));

    const jobs = normalized.slice(0, 5).map(job => {
      rememberJobSnapshot(job);
      return { ...job, description: String(job.description || '').slice(0, 300) };
    });
    rememberJobIds(jobs.map(job => job.jobId));

    const total = normalized.length || 0;
    return {
      isError: false,
      content: buildContent(jobs, total, res),
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
        retrievedTotal: Number(res.total) || rawList.length,
        coverage: res.coverage || {},
        sourceStatus: res.sourceStatus || [],
        sourceUnavailable: false,
        emptyMessage: jobs.length ? '' : '本次检索正常，但筛选后没有匹配岗位。可放宽城市、类型或更新时间。',
        hasMore: normalized.length > jobs.length || !!res.hasMore
      },
      _meta: {
        jobs,
        total,
        retrievedTotal: Number(res.total) || rawList.length,
        coverage: res.coverage || {},
        sourceStatus: res.sourceStatus || [],
        sourceUnavailable: false,
        emptyMessage: jobs.length ? '' : '本次检索正常，但筛选后没有匹配岗位。可放宽城市、类型或更新时间。',
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

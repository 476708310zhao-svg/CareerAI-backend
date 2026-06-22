const { request } = require('../utils/request.js');
const { hasRecentJobId } = require('../utils/auth.js');

const DETAIL_PAGE = '/package-user/pages/job-detail/job-detail';

function formatSalary(min, max, currency) {
  if (!min && !max) return '';
  const cur = currency || 'USD';
  const toText = value => Math.round(Number(value)).toLocaleString();
  if (min && max) return cur + ' ' + toText(min) + '-' + toText(max);
  return cur + ' ' + toText(min || max) + '+';
}

function inferVisaTags(text) {
  const value = String(text || '');
  const tags = [];
  if (/\bOPT\b/i.test(value)) tags.push('OPT');
  if (/\bCPT\b/i.test(value)) tags.push('CPT');
  if (/\bH[- ]?1B\b|sponsor(ship)?/i.test(value)) tags.push('H-1B');
  if (/E-?Verify/i.test(value)) tags.push('E-Verify');
  return tags;
}

function companyInitial(company) {
  const name = String(company || 'C').trim();
  return name ? name.slice(0, 1).toUpperCase() : 'C';
}

function shortDescription(text) {
  const clean = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '暂无职位详情，请进入职引查看完整信息。';
  return clean.length > 220 ? clean.slice(0, 220) + '...' : clean;
}

function normalizeJSearchJob(job, jobId) {
  const desc = [
    job.job_description,
    job.job_highlights && JSON.stringify(job.job_highlights)
  ].filter(Boolean).join(' ');

  const id = String(job.job_id || jobId || '');
  const company = job.employer_name || 'Company';
  return {
    jobId: id,
    title: job.job_title || '',
    company,
    companyInitial: companyInitial(company),
    location: [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', ') || 'Remote',
    jobType: job.job_employment_type || 'Full-time',
    visaTags: inferVisaTags(desc),
    updatedAt: job.job_posted_at_datetime_utc || '',
    description: shortDescription(job.job_description || ''),
    salaryRange: formatSalary(job.job_min_salary, job.job_max_salary, job.job_salary_currency),
    applyUrl: job.job_apply_link || '',
    companyLogo: job.employer_logo || '',
    source: job._source || (job._local ? 'local' : ''),
    detailPage: DETAIL_PAGE + '?id=' + encodeURIComponent(id)
  };
}

function normalizeWebJob(job, jobId) {
  const desc = job.description || '';
  const id = String(job.id || job.jobId || jobId || '');
  const company = job.company || 'Company';
  return {
    jobId: id,
    title: job.title || '',
    company,
    companyInitial: companyInitial(company),
    location: job.location || job.city || 'Remote',
    jobType: job.jobType || job.type || 'Full-time',
    visaTags: Array.isArray(job.tags) && job.tags.length ? job.tags.filter(tag => /OPT|CPT|H-1B|E-Verify/i.test(tag)) : inferVisaTags(desc),
    updatedAt: job.postedAt || job.updatedAt || '',
    description: shortDescription(desc),
    salaryRange: job.salary || job.salaryRange || '',
    applyUrl: job.applyUrl || '',
    companyLogo: job.companyLogo || job.logo || '',
    source: job.source || '',
    detailPage: DETAIL_PAGE + '?id=' + encodeURIComponent(id)
  };
}

function normalizeDetail(res, jobId) {
  if (Array.isArray(res && res.data)) {
    return res.data[0] ? normalizeJSearchJob(res.data[0], jobId) : null;
  }
  if (res && res.data && (res.data.job_id || res.data.job_title || res.data.employer_name)) {
    return normalizeJSearchJob(res.data, jobId);
  }
  if (res && res.data && (res.data.id || res.data.title || res.data.company)) {
    return normalizeWebJob(res.data, jobId);
  }
  return null;
}

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: {
      job: null
    },
    _meta: {
      job: null,
      relatedPage: DETAIL_PAGE,
      ui: {
        componentPath: 'components/job-detail-card/index'
      }
    }
  };
}

function successResult(job) {
  return {
    isError: false,
    content: [{
      type: 'text',
      text: job.title + ' · ' + job.company + '，可以进入职引查看完整详情。'
    }],
    structuredContent: {
      job
    },
    _meta: {
      job,
      relatedPage: DETAIL_PAGE,
      ui: {
        componentPath: 'components/job-detail-card/index'
      }
    }
  };
}

function getJobDetail(input) {
  const jobId = String((input && input.jobId) || '').trim();
  if (!jobId) return Promise.resolve(errorResult('缺少 jobId，请先从岗位列表中选择一个真实岗位。'));
  if (!hasRecentJobId(jobId)) {
    return Promise.resolve(errorResult('这个 jobId 不在最近一次 searchJobs 返回结果中，请先重新搜索并从列表中选择岗位。'));
  }

  return request({
    path: '/api/jobs/detail',
    params: { job_id: jobId },
    timeout: 12000
  }).then(res => {
    const detail = normalizeDetail(res, jobId);
    if (detail) return successResult(detail);

    return request({
      path: '/api/jobs/' + encodeURIComponent(jobId),
      params: {},
      timeout: 12000
    }).then(fallbackRes => {
      const fallbackDetail = normalizeDetail(fallbackRes, jobId);
      if (fallbackDetail) return successResult(fallbackDetail);
      return errorResult('没有获取到这个岗位的详情，可能岗位已下线或接口暂时不可用。');
    });
  });
}

module.exports = getJobDetail;

const fs = require('fs');
const { JOBS_FILE, ensureJobsFile } = require('./jobsFile');

function readJobsData() {
  try {
    ensureJobsFile();
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  } catch (e) {
    return { jobs: [], companies: [] };
  }
}

function listJobs() {
  return readJobsData().jobs || [];
}

function isHeldVerification(record) {
  return !!record && (record.status === 'closed' || record.status === 'review_needed' || record.availabilityHold === true);
}

const shanghaiDayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
});

function isExpiredLocalJob(job, now = new Date()) {
  const deadline = job && job.deadline;
  if (typeof deadline !== 'string') return false;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(deadline);
  const timestamp = dateOnly ? null
    : /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(deadline);
  if (!dateOnly && !timestamp) return false;
  const datePart = dateOnly ? deadline : timestamp[1];
  const [year, month, day] = datePart.split('-').map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return false;
  if (timestamp) {
    if (/^[+-]14:(?!00$)/.test(timestamp[2])) return false;
    const instant = Date.parse(deadline);
    return Number.isFinite(instant) && instant <= now.getTime();
  }
  const parts = Object.fromEntries(shanghaiDayFormatter.formatToParts(now).map(part => [part.type, part.value]));
  return deadline < `${parts.year}-${parts.month}-${parts.day}`;
}

function isUnavailableLocalJob(job, verification, now = new Date()) {
  return isHeldVerification(verification) || isExpiredLocalJob(job, now);
}

function getJobVerification(id) {
  return readJobsData().jobVerification?.[String(id)] || null;
}

function isHeldLocalJobId(id) {
  const text = String(id ?? '').trim();
  if (!/^[1-9]\d*$/.test(text)) return false;
  const numericId = Number(text);
  if (!Number.isSafeInteger(numericId)) return false;
  const data = readJobsData();
  const job = (data.jobs || []).find(item => String(item.id) === String(numericId));
  if (job) return isUnavailableLocalJob(job, data.jobVerification?.[String(numericId)]);
  return (data.jobVerificationAudit || []).some(item =>
    item.action === 'job_deleted' && String(item.jobId) === String(numericId));
}

function listBrowsableJobs() {
  const data = readJobsData();
  return (data.jobs || []).filter(job => !isUnavailableLocalJob(job, data.jobVerification?.[String(job.id)]));
}

function findJobById(id) {
  return listJobs().find(job => String(job.id) === String(id)) || null;
}

function findJobsByIds(ids) {
  const wanted = new Set((ids || []).map(id => String(id)));
  const map = {};
  listJobs().forEach(job => {
    if (wanted.has(String(job.id))) map[String(job.id)] = job;
  });
  return map;
}

function companyNamesMatch(job, names) {
  const company = String(job.company || '').trim().toLowerCase();
  return names.some(name => company === String(name || '').trim().toLowerCase());
}

function listJobsByCompanyNames(names, limit) {
  const cleanNames = (names || []).filter(Boolean);
  if (!cleanNames.length) return [];
  return listBrowsableJobs()
    .filter(job => companyNamesMatch(job, cleanNames))
    .slice(0, limit || 12);
}

function countJobsByCompanyNames(names) {
  return listJobsByCompanyNames(names, Number.MAX_SAFE_INTEGER).length;
}

function toApplicationJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    companyLogo: job.companyLogo || job.company_logo || '',
    location: job.location || '',
    salary: job.salary || ''
  };
}

function toCompanyJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    salary: job.salary || '',
    location: job.location || '',
    job_type: job.jobType || job.job_type || '',
    company_logo: job.companyLogo || job.company_logo || ''
  };
}

module.exports = {
  readJobsData,
  listJobs,
  listBrowsableJobs,
  getJobVerification,
  isHeldVerification,
  isExpiredLocalJob,
  isUnavailableLocalJob,
  isHeldLocalJobId,
  findJobById,
  findJobsByIds,
  listJobsByCompanyNames,
  countJobsByCompanyNames,
  toApplicationJob,
  toCompanyJob
};

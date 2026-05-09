const fs = require('fs');
const path = require('path');

const JOBS_FILE = path.join(__dirname, '../data/jobs.json');

function readJobsData() {
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  } catch (e) {
    return { jobs: [], companies: [] };
  }
}

function listJobs() {
  return readJobsData().jobs || [];
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
  return listJobs()
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
  listJobs,
  findJobById,
  findJobsByIds,
  listJobsByCompanyNames,
  countJobsByCompanyNames,
  toApplicationJob,
  toCompanyJob
};

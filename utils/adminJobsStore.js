const fs = require('fs');
const path = require('path');

const JOBS_FILE = path.join(__dirname, '../data/jobs.json');

function readJobsData() {
  return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
}

function writeJobsData(data) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
}

function listJobs(keyword) {
  let list = readJobsData().jobs || [];
  if (keyword) {
    const k = String(keyword).toLowerCase();
    list = list.filter(job =>
      String(job.title || '').toLowerCase().includes(k) ||
      String(job.company || '').toLowerCase().includes(k)
    );
  }
  return list;
}

function countJobs() {
  return (readJobsData().jobs || []).length;
}

function createJob(body) {
  const data = readJobsData();
  data.jobs = data.jobs || [];
  const maxId = data.jobs.reduce((m, job) => Math.max(m, job.id || 0), 0);
  const job = {
    id: maxId + 1,
    ...body,
    postedAt: new Date().toISOString().slice(0, 10),
    viewCount: 0,
    applyCount: 0
  };
  data.jobs.unshift(job);
  writeJobsData(data);
  return job;
}

function updateJob(id, body) {
  const data = readJobsData();
  data.jobs = data.jobs || [];
  const idx = data.jobs.findIndex(job => job.id === id);
  if (idx === -1) return null;
  data.jobs[idx] = { ...data.jobs[idx], ...body, id };
  writeJobsData(data);
  return data.jobs[idx];
}

function deleteJob(id) {
  const data = readJobsData();
  data.jobs = data.jobs || [];
  const before = data.jobs.length;
  data.jobs = data.jobs.filter(job => job.id !== id);
  if (data.jobs.length === before) return false;
  writeJobsData(data);
  return true;
}

module.exports = {
  listJobs,
  countJobs,
  createJob,
  updateJob,
  deleteJob
};

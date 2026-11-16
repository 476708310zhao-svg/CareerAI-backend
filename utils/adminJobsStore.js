const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db/database');
const { JOBS_FILE, ensureJobsFile } = require('./jobsFile');

function readJobsData() {
  ensureJobsFile();
  return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
}

// All jobs.json writers must share the same DB_PATH and DATA_DIR across processes.
// BEGIN IMMEDIATE takes SQLite's cross-process writer lock before the JSON read.
function withJobsWriteLock(mutator) {
  return db.transaction(() => mutator(readJobsData())).immediate();
}

function writeJobsData(data) {
  ensureJobsFile();
  const temp = path.join(path.dirname(JOBS_FILE), `.${path.basename(JOBS_FILE)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(data, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, JOBS_FILE);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch (_) {}
    throw error;
  }
}

const VERIFICATION_STATUSES = new Set(['unverified', 'open', 'closed', 'review_needed']);
const PUBLIC_JOB_FIELDS = ['title', 'company', 'companyLogo', 'location', 'region', 'salary',
  'jobType', 'industry', 'description', 'requirements', 'visaSponsored', 'applyUrl', 'deadline'];
const PUBLIC_JOB_FIELD_SET = new Set(PUBLIC_JOB_FIELDS);
const STRING_LIMITS = { title: 200, company: 200, companyLogo: 2048, location: 200,
  region: 80, salary: 120, jobType: 80, industry: 120, description: 20000,
  applyUrl: 2048, deadline: 10 };

function normalJobBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('岗位内容无效');
  for (const [key, value] of Object.entries(body)) {
    if (!PUBLIC_JOB_FIELD_SET.has(key)) throw new TypeError(`不允许修改岗位字段：${key}`);
    if (key === 'requirements') {
      if (!Array.isArray(value) || value.length > 30 || value.some(item => typeof item !== 'string' || item.length > 300)) {
        throw new TypeError('岗位要求须为最多 30 条文本，每条不超过 300 字');
      }
    } else if (key === 'visaSponsored') {
      if (typeof value !== 'boolean') throw new TypeError('签证担保须为布尔值');
    } else if (typeof value !== 'string' || value.length > STRING_LIMITS[key]) {
      throw new TypeError(`岗位字段 ${key} 类型或长度无效`);
    }
  }
  if (Object.hasOwn(body, 'title') && !body.title.trim()) throw new TypeError('职位名称不能为空');
  if (Object.hasOwn(body, 'company') && !body.company.trim()) throw new TypeError('公司名称不能为空');
  if (Object.prototype.hasOwnProperty.call(body, 'applyUrl')) inputUrl(body.applyUrl, '申请 URL');
  if (Object.prototype.hasOwnProperty.call(body, 'companyLogo')) inputUrl(body.companyLogo, 'Logo URL');
  if (Object.prototype.hasOwnProperty.call(body, 'deadline')) inputDeadline(body.deadline);
  return body;
}

function criticalSnapshot(job) {
  return Object.fromEntries(PUBLIC_JOB_FIELDS.map(key => [key, job[key] === undefined ? null : job[key]]));
}

function inputUrl(value, label) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length > 2048) throw new TypeError(`${label}过长`);
  let url;
  try { url = new URL(raw); } catch (_) { throw new TypeError(`${label}必须是 http/https 地址`); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new TypeError(`${label}必须是 http/https 地址，且不能带登录凭据`);
  }
  return url.href;
}

function inputDeadline(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('截止日期须为 YYYY-MM-DD，未知请留空');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError('截止日期无效');
  }
  return value;
}

function verificationFor(data, id) {
  return data.jobVerification && data.jobVerification[String(id)] || {
    status: 'unverified', announcementUrl: '', employerApplyUrl: '', deadline: null,
    verifiedAt: null, verifiedBy: null, note: '', version: 0, availabilityHold: false
  };
}

function linkUrlHash(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function matchesEmployerApplyUrl(job, verification) {
  if (verification.status !== 'open' || !verification.employerApplyUrl) return false;
  try { return inputUrl(job.applyUrl, '公开申请 URL') === verification.employerApplyUrl; }
  catch (_) { return false; }
}

function linkHealthFor(data, job) {
  const verification = verificationFor(data, job.id);
  if (!matchesEmployerApplyUrl(job, verification)) return null;
  const health = data.jobApplyLinkHealth && data.jobApplyLinkHealth[String(job.id)];
  return health && health.urlHash === linkUrlHash(verification.employerApplyUrl) ? health : null;
}

function listLinkCheckCandidates(limit = 10, options = {}) {
  const data = readJobsData();
  const minAgeMs = Number.isFinite(options.minAgeMs) && options.minAgeMs > 0 ? options.minAgeMs : 0;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  return (data.jobs || []).flatMap(job => {
    const verification = verificationFor(data, job.id);
    if (!matchesEmployerApplyUrl(job, verification)) return [];
    const lastCheckedAt = linkHealthFor(data, job)?.checkedAt || '';
    const lastCheckedMs = Date.parse(lastCheckedAt);
    if (minAgeMs && Number.isFinite(lastCheckedMs) && nowMs - lastCheckedMs < minAgeMs) return [];
    return [{ id: job.id, url: verification.employerApplyUrl, lastCheckedAt }];
  }).sort((left, right) => left.lastCheckedAt.localeCompare(right.lastCheckedAt) || left.id - right.id)
    .slice(0, Math.min(Math.max(Number(limit) || 10, 1), 20));
}

function claimScheduledLinkCheck({ slot, owner, nowMs, leaseMs }) {
  if (typeof slot !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(slot) ||
      typeof owner !== 'string' || !/^[0-9a-f-]{36}$/.test(owner) ||
      !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(leaseMs) || leaseMs < 1000) {
    throw new TypeError('定时链接检查租约参数无效');
  }
  return withJobsWriteLock(data => {
    const previous = data.jobApplyLinkSchedule || {};
    if (previous.lastCompletedSlot && previous.lastCompletedSlot >= slot) {
      return { claimed: false, reason: 'already_completed' };
    }
    if (previous.active && Number.isFinite(previous.active.leaseUntilMs) &&
        previous.active.leaseUntilMs > nowMs) {
      return { claimed: false, reason: 'already_running' };
    }
    data.jobApplyLinkSchedule = { ...previous, active: { slot, owner,
      startedAt: new Date(nowMs).toISOString(), leaseUntilMs: nowMs + leaseMs } };
    writeJobsData(data);
    return { claimed: true, leaseUntilMs: nowMs + leaseMs };
  });
}

function finishScheduledLinkCheck({ slot, owner, nowMs, succeeded, summary }) {
  if (typeof slot !== 'string' || typeof owner !== 'string' ||
      !Number.isSafeInteger(nowMs) || typeof succeeded !== 'boolean') {
    throw new TypeError('定时链接检查完成参数无效');
  }
  return withJobsWriteLock(data => {
    const current = data.jobApplyLinkSchedule;
    if (!current?.active || current.active.owner !== owner || current.active.slot !== slot) return false;
    const at = new Date(nowMs).toISOString();
    const safeSummary = summary && typeof summary === 'object'
      ? Object.fromEntries(['selected', 'attempted', 'deferred', 'recorded', 'stale', 'reachable',
        'needs_review', 'inconclusive', 'blocked'].map(key =>
        [key, Number.isSafeInteger(summary[key]) && summary[key] >= 0 ? summary[key] : 0])) : null;
    data.jobApplyLinkSchedule = { ...current, active: null,
      lastRun: { slot, outcome: succeeded ? 'completed' : 'failed', at, summary: safeSummary },
      lastCompletedSlot: succeeded ? slot : current.lastCompletedSlot || null,
      lastCompletedAt: succeeded ? at : current.lastCompletedAt || null };
    writeJobsData(data);
    return true;
  });
}

function recordLinkCheck(id, checkedUrl, observation) {
  return withJobsWriteLock(data => {
    const job = (data.jobs || []).find(item => item.id === id);
    if (!job) return false;
    const verification = verificationFor(data, id);
    if (!matchesEmployerApplyUrl(job, verification) || verification.employerApplyUrl !== checkedUrl) return false;
    const previous = data.jobApplyLinkHealth && data.jobApplyLinkHealth[String(id)];
    const checkedAt = typeof observation?.checkedAt === 'string' &&
      Number.isFinite(Date.parse(observation.checkedAt)) ? observation.checkedAt : new Date().toISOString();
    if (previous && previous.urlHash === linkUrlHash(checkedUrl) && previous.checkedAt >= checkedAt) return false;
    const outcomes = new Set(['reachable', 'needs_review', 'inconclusive', 'blocked']);
    if (!observation || !outcomes.has(observation.outcome)) throw new TypeError('链接检查结果无效');
    const current = { urlHash: linkUrlHash(checkedUrl), checkedAt,
      outcome: observation.outcome, reason: String(observation.reason || '').slice(0, 64),
      statusCode: Number.isInteger(observation.statusCode) ? observation.statusCode : null,
      redirects: Number.isInteger(observation.redirects) ? observation.redirects : 0 };
    data.jobApplyLinkHealth = data.jobApplyLinkHealth || {};
    data.jobApplyLinkHealth[String(id)] = current;
    writeJobsData(data);
    return true;
  });
}

function auditFor(data, id) {
  return (data.jobVerificationAudit || []).filter(item => item.jobId === id);
}

function getJob(id) {
  const data = readJobsData();
  const job = (data.jobs || []).find(item => item.id === id);
  if (!job) return null;
  return { ...job, verification: verificationFor(data, id), linkHealth: linkHealthFor(data, job) };
}

function getJobVerification(id) {
  const data = readJobsData();
  const job = (data.jobs || []).find(item => item.id === id);
  if (!job) return null;
  return { verification: verificationFor(data, id), audit: auditFor(data, id), linkHealth: linkHealthFor(data, job) };
}

function getJobAudit(id) {
  return auditFor(readJobsData(), id);
}

function localFeedbackTargets(ids) {
  const wanted = new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647));
  const targets = new Map();
  if (!wanted.size) return targets;
  const data = readJobsData();
  for (const job of data.jobs || []) {
    if (wanted.has(job.id)) targets.set(job.id, 'verification');
  }
  for (const item of data.jobVerificationAudit || []) {
    if (item.action === 'job_deleted' && wanted.has(item.jobId) && !targets.has(item.jobId)) {
      targets.set(item.jobId, 'deleted_audit');
    }
  }
  return targets;
}

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function updateJobVerification(id, input, actor) {
  return withJobsWriteLock(data => {
    const job = (data.jobs || []).find(item => item.id === id);
    if (!job) return null;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('核验内容无效');
    const allowed = new Set(['expectedVersion', 'status', 'announcementUrl', 'employerApplyUrl', 'deadline', 'note']);
    if (Object.keys(input).some(key => !allowed.has(key))) throw new TypeError('包含不允许的核验字段');
    const previous = verificationFor(data, id);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== previous.version) {
      const error = new Error('核验信息已变化，请刷新后再保存');
      error.statusCode = 409;
      throw error;
    }
    if (!VERIFICATION_STATUSES.has(input.status)) throw new TypeError('核验状态无效');
    const announcementUrl = inputUrl(input.announcementUrl, '原始公告 URL');
    const employerApplyUrl = inputUrl(input.employerApplyUrl, '企业申请 URL');
    const deadline = inputDeadline(input.deadline);
    const note = String(input.note || '').trim();
    if (note.length > 1000) throw new TypeError('核验说明不能超过 1000 字');
    if (input.status === 'open' && !employerApplyUrl) throw new TypeError('标记可申请时须填写企业申请 URL');
    if (input.status === 'open' && employerApplyUrl !== inputUrl(job.applyUrl, '公开申请 URL')) {
      throw new TypeError('企业申请 URL 与公开申请 URL 不一致，请先编辑岗位链接');
    }
    if (input.status === 'open' && deadline !== inputDeadline(job.deadline || null)) {
      throw new TypeError('核验截止日期与公开截止日期不一致，请先编辑岗位截止日期');
    }
    if (input.status === 'open' && deadline && deadline < shanghaiToday()) {
      throw new TypeError('截止日期已过，不能标记为可申请');
    }
    const now = new Date().toISOString();
    const who = { id: actor.id, username: actor.username };
    const current = { status: input.status, announcementUrl, employerApplyUrl, deadline,
      verifiedAt: ['open', 'closed'].includes(input.status) ? now : null,
      verifiedBy: ['open', 'closed'].includes(input.status) ? who : null,
      note, version: previous.version + 1,
      availabilityHold: input.status === 'open' ? false
        : input.status === 'closed' || input.status === 'review_needed' || !!previous.availabilityHold };
    data.jobVerification = data.jobVerification || {};
    data.jobVerificationAudit = data.jobVerificationAudit || [];
    data.jobVerification[String(id)] = current;
    data.jobVerificationAudit.push({ jobId: id, action: 'verification_updated', before: previous,
      after: current, jobSnapshot: criticalSnapshot(job), at: now, actor: who });
    writeJobsData(data);
    return { verification: current, audit: auditFor(data, id) };
  });
}

function listJobs(keyword) {
  const data = readJobsData();
  let list = data.jobs || [];
  if (keyword) {
    const k = String(keyword).toLowerCase();
    list = list.filter(job =>
      String(job.title || '').toLowerCase().includes(k) ||
      String(job.company || '').toLowerCase().includes(k)
    );
  }
  return list.map(job => ({ ...job, verification: verificationFor(data, job.id),
    linkHealth: linkHealthFor(data, job) }));
}

function countJobs() {
  return (readJobsData().jobs || []).length;
}

function createJob(body) {
  normalJobBody(body);
  if (!body.title || !body.company) throw new TypeError('职位名称和公司名称不能为空');
  return withJobsWriteLock(data => {
    data.jobs = data.jobs || [];
    const maxId = Math.max(
      data.jobs.reduce((m, job) => Math.max(m, Number(job.id) || 0), 0),
      (data.jobVerificationAudit || []).reduce((m, item) => Math.max(m, Number(item.jobId) || 0), 0)
    );
    const job = {
      ...body,
      id: maxId + 1,
      postedAt: new Date().toISOString().slice(0, 10),
      viewCount: 0,
      applyCount: 0
    };
    data.jobs.unshift(job);
    writeJobsData(data);
    return job;
  });
}

function updateJob(id, body, actor) {
  normalJobBody(body);
  return withJobsWriteLock(data => {
    data.jobs = data.jobs || [];
    const idx = data.jobs.findIndex(job => job.id === id);
    if (idx === -1) return null;
    const before = criticalSnapshot(data.jobs[idx]);
    data.jobs[idx] = { ...data.jobs[idx], ...body, id };
    const after = criticalSnapshot(data.jobs[idx]);
    const currentVerification = data.jobVerification && data.jobVerification[String(id)];
    if (currentVerification && currentVerification.status !== 'unverified' && JSON.stringify(before) !== JSON.stringify(after)) {
      const now = new Date().toISOString();
      const next = { ...currentVerification, status: 'review_needed', verifiedAt: null,
        verifiedBy: null, version: currentVerification.version + 1, availabilityHold: true };
      data.jobVerification[String(id)] = next;
      data.jobVerificationAudit = data.jobVerificationAudit || [];
      data.jobVerificationAudit.push({ jobId: id, action: 'job_fields_changed', before: currentVerification,
        after: next, jobSnapshotBefore: before, jobSnapshot: after, at: now, actor: actor || null });
    }
    writeJobsData(data);
    return data.jobs[idx];
  });
}

function deleteJob(id, actor) {
  return withJobsWriteLock(data => {
    data.jobs = data.jobs || [];
    const job = data.jobs.find(item => item.id === id);
    if (!job) return false;
    const verification = verificationFor(data, id);
    data.jobs = data.jobs.filter(job => job.id !== id);
    data.jobVerificationAudit = data.jobVerificationAudit || [];
    data.jobVerificationAudit.push({ jobId: id, action: 'job_deleted', before: verification,
      jobSnapshot: job, after: null, at: new Date().toISOString(), actor: actor || null });
    if (data.jobVerification) delete data.jobVerification[String(id)];
    if (data.jobApplyLinkHealth) delete data.jobApplyLinkHealth[String(id)];
    writeJobsData(data);
    return true;
  });
}

module.exports = {
  listJobs,
  getJob,
  getJobVerification,
  getJobAudit,
  localFeedbackTargets,
  updateJobVerification,
  countJobs,
  createJob,
  updateJob,
  deleteJob,
  listLinkCheckCandidates,
  recordLinkCheck,
  claimScheduledLinkCheck,
  finishScheduledLinkCheck
};

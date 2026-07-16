const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const { ok, fail } = require('../../utils/response');
const { findJobById, listJobs } = require('../../utils/jobData');
const { getProfile } = require('../../services/v4Profile');
const { buildJobMatch } = require('../../services/v4JobMatch');
const { getSponsorProfile } = require('../../services/v4Sponsor');
const { persistJobMatch, formatMatch } = require('../../services/v4JobMatchStore');
const companyService = require('../../services/companyService');

const router = express.Router();
const analytics = require('../../services/v4Analytics');
const membership = require('../../services/v4Membership');

function sponsorMatches(profile, query) {
  if (query.optFriendly === 'true' && profile.optFriendly !== true) return false;
  if (query.stemFriendly === 'true' && profile.stemFriendly !== true) return false;
  if (query.h1bSponsor === 'true' && profile.h1bSponsor !== true) return false;
  if (query.internationalStudentFriendly === 'true' && profile.internationalStudentFriendly !== true) return false;
  if (query.excludeCitizenRequired === 'true' && profile.citizenRequired) return false;
  return true;
}

const COUNTRY_REGIONS = {
  us: ['美国', 'united states', 'usa'], cn: ['中国', 'china'], gb: ['英国', 'united kingdom', 'uk'],
  uk: ['英国', 'united kingdom', 'uk'], sg: ['新加坡', 'singapore'], ca: ['加拿大', 'canada'],
  au: ['澳大利亚', '澳洲', 'australia'], hk: ['香港', 'hong kong']
};

const EMPLOYMENT_ALIASES = {
  FULLTIME: ['全职', 'full-time', 'full time'], PARTTIME: ['兼职', 'part-time', 'part time'],
  CONTRACTOR: ['合同', 'contract', 'contractor'], INTERN: ['实习', 'intern', 'internship']
};

function coreFiltersMatch(job, query) {
  const employmentType = String(query.employmentType || '').trim().toUpperCase();
  if (employmentType) {
    const aliases = EMPLOYMENT_ALIASES[employmentType] || [employmentType.toLowerCase()];
    const value = String(job.jobType || job.employmentType || '').toLowerCase();
    if (!aliases.some(alias => value.includes(String(alias).toLowerCase()))) return false;
  }

  const country = String(query.country || '').trim().toLowerCase();
  if (country && country !== 'all') {
    const locationText = `${job.region || ''} ${job.location || ''}`.toLowerCase();
    const aliases = COUNTRY_REGIONS[country] || [country];
    if (!aliases.some(alias => locationText.includes(String(alias).toLowerCase()))) return false;
  }

  const datePosted = String(query.datePosted || '').trim();
  if (datePosted && job.postedAt) {
    const days = { today: 1, '3days': 3, week: 7, month: 30 }[datePosted];
    const postedAt = new Date(job.postedAt);
    if (days && Number.isFinite(postedAt.getTime())) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      if (postedAt.getTime() < cutoff) return false;
    }
  }
  return true;
}

router.get('/', authMiddleware, (req, res) => {
  const profile = getProfile(req.user.userId);
  if (!profile) return fail(res, '用户不存在', 404);
  const keyword = String(req.query.keyword || '').trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
  let jobs = listJobs().map(job => {
    const sponsor = getSponsorProfile(job);
    const match = buildJobMatch(job, profile, sponsor);
    return { ...job, sponsor, match: { score: match.score, qualificationStatus: match.qualificationStatus, recommendation: match.recommendation } };
  }).filter(job => {
    const text = `${job.title} ${job.company} ${job.location}`.toLowerCase();
    return (!keyword || text.includes(keyword)) && sponsorMatches(job.sponsor, req.query) && coreFiltersMatch(job, req.query);
  });
  if (req.query.sort === 'recent') {
    jobs.sort((a, b) => String(b.postedAt || '').localeCompare(String(a.postedAt || '')));
  } else {
    jobs.sort((a, b) => b.match.score - a.match.score);
  }
  const start = (page - 1) * pageSize;
  return ok(res, { list: jobs.slice(start, start + pageSize), page, pageSize, total: jobs.length });
});

router.post('/matches/recalculate', authMiddleware, (req, res) => {
  const profile = getProfile(req.user.userId);
  if (!profile) return fail(res, '用户不存在', 404);
  if (profile.completion < 40) {
    return res.status(422).json({ code: -1, message: '请先完善求职画像', data: { completion: profile.completion } });
  }
  const requested = Array.isArray(req.body && req.body.jobIds) ? new Set(req.body.jobIds.map(String)) : null;
  const jobs = listJobs().filter(job => !requested || requested.has(String(job.id))).slice(0, 100);
  if (!jobs.length) return fail(res, '没有可计算的岗位', 400);
  const results = jobs.map(job => persistJobMatch(req.user.userId, job, profile, getSponsorProfile(job)));
  return ok(res, {
    calculated: results.length,
    profileVersion: profile.profileVersion,
    results: results.map(item => ({ jobId: item.jobId, score: item.score, qualificationStatus: item.qualificationStatus, recommendation: item.recommendation }))
  }, '岗位匹配已重新计算');
});

router.get('/matches/summary', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT score, qualification_status, recommendation
    FROM job_matches WHERE user_id=?
      AND id IN (SELECT MAX(id) FROM job_matches WHERE user_id=? GROUP BY job_id)
  `).all(req.user.userId, req.user.userId);
  const count = value => rows.filter(item => item.qualification_status === value).length;
  return ok(res, {
    total: rows.length,
    averageScore: rows.length ? Math.round(rows.reduce((sum, item) => sum + item.score, 0) / rows.length) : 0,
    eligibility: { eligible: count('eligible'), partial: count('partial'), ineligible: count('ineligible') },
    priority: rows.filter(item => item.recommendation === 'priority').length
  });
});

router.get('/:id/sponsor', (req, res) => {
  const job = findJobById(req.params.id);
  if (!job) return fail(res, '职位不存在', 404);
  return ok(res, getSponsorProfile(job));
});

router.get('/:id/detail', authMiddleware, (req, res) => {
  const job = findJobById(req.params.id);
  if (!job) return fail(res, '职位不存在', 404);
  const sponsor = getSponsorProfile(job);
  const profile = getProfile(req.user.userId);
  const match = profile && profile.completion >= 40 ? buildJobMatch(job, profile, sponsor) : null;
  const companyResult = companyService.listCompanies({ keyword: job.company, page: 1, pageSize: 5 });
  const companies = companyResult && companyResult.list ? companyResult.list : [];
  const company = companies.find(item => String(item.displayName || item.name || '').toLowerCase() === String(job.company).toLowerCase()) || companies[0] || null;
  const application = db.prepare(`
    SELECT id, status, status_text, progress_status, deadline, interview_time, updated_at
    FROM applications WHERE user_id=? AND (job_id=? OR source_job_id=?) ORDER BY id DESC LIMIT 1
  `).get(req.user.userId, String(job.id), String(job.id));
  analytics.track(req.user.userId, 'job_viewed', { jobId: String(job.id) }, '/api/v4/jobs/:id/detail');
  return ok(res, {
    job: { ...job, deadline: job.deadline || '', officialApplyUrl: job.applyUrl || job.sourceUrl || '' },
    sponsor,
    match,
    company,
    application: application ? {
      id: application.id,
      status: application.progress_status || application.status,
      statusText: application.status_text,
      deadline: application.deadline || '', interviewTime: application.interview_time || '',
      updatedAt: application.updated_at || ''
    } : null
  });
});

router.post('/:id/match', authMiddleware, (req, res) => {
  const job = findJobById(req.params.id);
  if (!job) return fail(res, '职位不存在', 404);
  const profile = getProfile(req.user.userId);
  if (!profile) return fail(res, '用户不存在', 404);
  if (profile.completion < 40) {
    return res.status(422).json({ code: -1, message: '请先完善求职画像', data: { completion: profile.completion } });
  }

  try {
    const sponsor = getSponsorProfile(job);
    const match = persistJobMatch(req.user.userId, job, profile, sponsor);
    analytics.track(req.user.userId, 'job_matched', { jobId: String(job.id), score: match.score }, '/api/v4/jobs/:id/match');
    return ok(res, match, '岗位匹配完成');
  } catch (error) {
    console.error('[v4/jobs/match] failed:', error.message);
    return fail(res, '岗位匹配失败', 500);
  }
});

router.post('/:id/match/advanced', authMiddleware, (req, res) => {
  const entitlements = membership.getMembership(req.user.userId).entitlements;
  if (!entitlements.advanced_match) return res.status(403).json({ code: -1, message: '高级岗位匹配为会员权益', data: { membershipRequired: true } });
  const job = findJobById(req.params.id); if (!job) return fail(res, '职位不存在', 404);
  const profile = getProfile(req.user.userId); if (!profile || profile.completion < 40) return fail(res, '请先完善求职画像', 422);
  const match = persistJobMatch(req.user.userId, job, profile, getSponsorProfile(job));
  analytics.track(req.user.userId, 'advanced_job_matched', { jobId: String(job.id), score: match.score }, '/api/v4/jobs/:id/match/advanced');
  return ok(res, { ...match, advanced: true }, '高级岗位匹配完成');
});

router.get('/:id/match', authMiddleware, (req, res) => {
  const row = db.prepare(`
    SELECT * FROM job_matches WHERE user_id=? AND job_id=? ORDER BY updated_at DESC, id DESC LIMIT 1
  `).get(req.user.userId, String(req.params.id));
  if (!row) return fail(res, '暂无岗位匹配结果', 404);
  return ok(res, formatMatch(row));
});

module.exports = router;

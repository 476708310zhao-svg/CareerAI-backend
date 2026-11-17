const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const { ok, fail } = require('../../utils/response');
const { findJobById, listBrowsableJobs, getJobVerification, isHeldVerification, isUnavailableLocalJob, isExpiredLocalJob } = require('../../utils/jobData');
const { getProfile } = require('../../services/v4Profile');
const { buildJobMatch } = require('../../services/v4JobMatch');
const { getSponsorProfile } = require('../../services/v4Sponsor');
const { persistJobMatch, formatMatch } = require('../../services/v4JobMatchStore');
const companyService = require('../../services/companyService');
const { applicationRefs, withCoreRefs } = require('../../utils/coreEntityRefs');
const { STATUS_TEXT, toV4Status } = require('../../utils/applicationStatus');
const { buildDataMeta, summarizeDataMeta } = require('../../utils/dataProvenance');
const jobTrust = require('../../services/v4JobTrust');

const router = express.Router();
router.use((req, res, next) => { if (req.method === 'GET') res.set('Cache-Control', 'no-store'); next(); });
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

function jobDataMeta(job) {
  const source = job.source || 'local';
  const isLocalArchive = source === 'local' || source === 'local_fallback';
  return buildDataMeta({
    domain: 'job',
    source,
    sourceLabel: job.sourceLabel,
    publishedAt: job.postedAt,
    updatedAt: job.updatedAt,
    fetchedAt: job.fetchedAt,
    isExpired: isLocalArchive ? isExpiredLocalJob(job)
      : job.deadline ? new Date(`${String(job.deadline).slice(0, 10)}T23:59:59+08:00`).getTime() < Date.now() : false,
    isFallback: isLocalArchive || job._sourceSyncStatus === 'error' || job._sourceSyncStatus === 'anomalous',
    fallbackReason: isLocalArchive ? '当前精准匹配基于历史职位库'
      : job._sourceSyncStatus === 'error' ? '企业官网最近一次同步失败'
        : job._sourceSyncStatus === 'anomalous' ? '企业官网岗位变化待复核' : ''
  });
}

function buildJobTrust(userId, job) {
  return jobTrust.buildTrust(job, listBrowsableJobs(), jobTrust.listObservations(userId, job.id));
}

function buildPublicJobTrust(userId, job, verification) {
  const trust = buildJobTrust(userId, job);
  if (!isUnavailableLocalJob(job, verification)) return trust;
  const manualHold = isHeldVerification(verification);
  trust.score = Math.min(trust.score, 39);
  trust.level = 'risk';
  trust.label = manualHold ? '岗位已关闭或待复核' : '岗位截止日期已过';
  trust.officialVerification = { ...trust.officialVerification, url: '',
    status: manualHold ? 'admin_review_hold' : 'deadline_expired',
    label: manualHold ? '岗位已关闭或待人工复核' : '岗位截止日期已过',
    reason: '历史链接不能作为当前可申请入口' };
  trust.observations = (trust.observations || []).map(item => ({ ...item, officialUrl: '' }));
  trust.recommendation = manualHold ? '暂缓投递，等待人工复核或重新查找企业公告' : '截止日期已过，请重新核对企业公告';
  trust.risks = [...new Set([...trust.risks, manualHold ? '管理员标记岗位已关闭或待复核' : '岗位截止日期已过'])];
  trust.notice = manualHold ? '管理员关闭或待复核状态优先于历史评分；此分数不代表当前可申请'
    : '截止日期已过；历史评分不代表当前可申请';
  return trust;
}

router.get('/', authMiddleware, (req, res) => {
  const profile = getProfile(req.user.userId);
  if (!profile) return fail(res, '用户不存在', 404);
  const keyword = String(req.query.keyword || '').trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
  let jobs = listBrowsableJobs().map(job => {
    const sponsor = getSponsorProfile(job);
    const match = buildJobMatch(job, profile, sponsor);
    return { ...job, dataMeta: jobDataMeta(job), sponsor, match: {
      score: match.score, qualificationStatus: match.qualificationStatus,
      recommendation: match.recommendation, tier: match.tier,
      tierLabel: match.tierLabel, decision: match.decision,
      sponsorAssessment: match.sponsorAssessment
    } };
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
  const pageList = jobs.slice(start, start + pageSize);
  return ok(res, { list: pageList, page, pageSize, total: jobs.length, dataMeta: summarizeDataMeta(pageList) });
});

router.post('/matches/recalculate', authMiddleware, (req, res) => {
  const profile = getProfile(req.user.userId);
  if (!profile) return fail(res, '用户不存在', 404);
  if (profile.completion < 40) {
    return res.status(422).json({ code: -1, message: '请先完善求职画像', data: { completion: profile.completion } });
  }
  const requested = Array.isArray(req.body && req.body.jobIds) ? new Set(req.body.jobIds.map(String)) : null;
  const jobs = listBrowsableJobs().filter(job => !requested || requested.has(String(job.id))).slice(0, 100);
  if (!jobs.length) return fail(res, '没有可计算的岗位', 400);
  const results = jobs.map(job => persistJobMatch(req.user.userId, job, profile, getSponsorProfile(job)));
  return ok(res, {
    calculated: results.length,
    profileVersion: profile.profileVersion,
    results: results.map(item => ({
      jobId: item.jobId, score: item.score, qualificationStatus: item.qualificationStatus,
      recommendation: item.recommendation, tier: item.tier, decision: item.decision
    }))
  }, '岗位匹配已重新计算');
});

router.get('/matches/summary', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM job_matches WHERE user_id=?
      AND id IN (SELECT MAX(id) FROM job_matches WHERE user_id=? GROUP BY job_id)
  `).all(req.user.userId, req.user.userId).map(formatMatch);
  const count = value => rows.filter(item => item.qualificationStatus === value).length;
  return ok(res, {
    total: rows.length,
    averageScore: rows.length ? Math.round(rows.reduce((sum, item) => sum + item.score, 0) / rows.length) : 0,
    eligibility: { eligible: count('eligible'), partial: count('partial'), ineligible: count('ineligible') },
    priority: rows.filter(item => item.recommendation === 'priority').length,
    tiers: {
      safe: rows.filter(item => item.tier === 'safe').length,
      target: rows.filter(item => item.tier === 'target').length,
      reach: rows.filter(item => item.tier === 'reach').length,
      blocked: rows.filter(item => item.tier === 'blocked').length
    }
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
  const verification = getJobVerification(job.id);
  const held = isUnavailableLocalJob(job, verification);
  const sponsor = getSponsorProfile(job);
  const profile = getProfile(req.user.userId);
  const match = profile && profile.completion >= 40 ? buildJobMatch(job, profile, sponsor) : null;
  const companyResult = companyService.listCompanies({ keyword: job.company, page: 1, pageSize: 5 }, { publicOnly: true });
  const companies = companyResult && companyResult.list ? companyResult.list : [];
  const company = companies.find(item => String(item.displayName || item.name || '').toLowerCase() === String(job.company).toLowerCase()) || companies[0] || null;
  const application = db.prepare(`
    SELECT *
    FROM applications WHERE user_id=? AND (job_id=? OR source_job_id=?) ORDER BY id DESC LIMIT 1
  `).get(req.user.userId, String(job.id), String(job.id));
  const trust = buildPublicJobTrust(req.user.userId, job, verification);
  analytics.trackFunnel(req.user.userId, 'job_viewed', withCoreRefs(
    { jobId: String(job.id) },
    { userId: req.user.userId, jobId: String(job.id) },
    applicationRefs(application || {})
  ), '/api/v4/jobs/:id/detail');
  return ok(res, {
    job: { ...job, deadline: job.deadline || '',
      applyUrl: held ? '' : job.applyUrl || '',
      sourceUrl: held ? '' : job.sourceUrl || '',
      officialApplyUrl: held ? '' : job.applyUrl || job.sourceUrl || '',
      applicationStatus: verification?.status || 'unverified', isApplyAvailable: !held,
      applicationNotice: held ? (isHeldVerification(verification) ? '该岗位已关闭或待人工复核，暂不可申请' : '该岗位截止日期已过，暂不可申请，请以企业公告为准') : '',
      dataMeta: jobDataMeta(job) },
    trust,
    sponsor,
    match,
    company,
    application: application ? {
      id: application.id,
      status: toV4Status(application),
      statusText: STATUS_TEXT[toV4Status(application)],
      deadline: application.deadline || '', interviewTime: application.interview_time || '',
      updatedAt: application.updated_at || '',
      refs: applicationRefs(application)
    } : null
  });
});

router.get('/:id/trust', authMiddleware, (req, res) => {
  const job = findJobById(req.params.id);
  if (!job) return fail(res, '职位不存在', 404);
  return ok(res, buildPublicJobTrust(req.user.userId, job, getJobVerification(job.id)));
});

router.post('/:id/trust/observations', authMiddleware, (req, res) => {
  const job = findJobById(req.params.id);
  if (!job) return fail(res, '职位不存在', 404);
  try {
    jobTrust.recordObservation(req.user.userId, job, req.body);
    return ok(res, buildPublicJobTrust(req.user.userId, job, getJobVerification(job.id)), '官网核验记录已保存');
  } catch (error) {
    return res.status(error.status || 400).json({ code: error.code || -1, message: error.message || '核验记录保存失败', data: null });
  }
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
    analytics.trackFunnel(req.user.userId, 'job_matched', withCoreRefs(
      { jobId: String(job.id), score: match.score },
      { userId: req.user.userId, jobId: String(job.id) }
    ), '/api/v4/jobs/:id/match');
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
  analytics.trackFunnel(req.user.userId, 'job_matched', withCoreRefs(
    { jobId: String(job.id), score: match.score, matchType: 'advanced' },
    { userId: req.user.userId, jobId: String(job.id) }
  ), '/api/v4/jobs/:id/match/advanced');
  analytics.track(req.user.userId, 'advanced_job_matched', withCoreRefs(
    { jobId: String(job.id), score: match.score },
    { userId: req.user.userId, jobId: String(job.id) }
  ), '/api/v4/jobs/:id/match/advanced');
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

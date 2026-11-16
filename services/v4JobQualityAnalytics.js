'use strict';

const store = require('../utils/adminJobsStore');
const provenance = require('../utils/dataProvenance');
const submissionAnalytics = require('./v4SubmissionAnalyticsReconciliation');
const db = require('../db/database');

function deadlineState(value, today, nowMs) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T12:00:00+08:00`);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).map(part => [part.type, part.value]));
    if (!Number.isFinite(date.getTime()) || `${parts.year}-${parts.month}-${parts.day}` !== text) return 'unknown';
    return text >= today ? 'future' : 'expired';
  }
  const instant = Date.parse(text);
  if (!Number.isFinite(instant) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) return 'unknown';
  return instant > nowMs ? 'future' : 'expired';
}

function validHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch (_) { return false; }
}

function freshness(job, now) {
  const meta = job.dataMeta && typeof job.dataMeta === 'object' ? job.dataMeta : null;
  if (meta && ['fresh', 'aging', 'stale', 'expired', 'unknown'].includes(meta.freshness)) return meta.freshness;
  const source = provenance.sourceMeta(job.source || job.sourceCode || job.sourceType, {
    sourceLabel: job.sourceLabel,
    isFallback: job.isFallback === true
  });
  const built = provenance.freshnessMeta({
    publishedAt: job.publishedAt || job.postedAt,
    updatedAt: job.updatedAt,
    fetchedAt: job.fetchedAt || now.toISOString(),
    isExpired: false,
    now: now.toISOString()
  });
  return source.isFallback ? 'stale' : built.freshness;
}

function aggregateJobs(rows, now = new Date()) {
  const list = Array.isArray(rows) ? rows : [];
  const exclusions = {
    unverified: 0,
    nonOfficialSource: 0,
    fallback: 0,
    urlMismatchOrMissing: 0,
    linkNotReachable: 0,
    deadlineExpired: 0,
    deadlineUnknown: 0,
    freshnessStale: 0,
    freshnessUnknown: 0
  };
  const freshnessCounts = { fresh: 0, aging: 0, stale: 0, expired: 0, unknown: 0 };
  const sources = new Map();
  const regions = new Map();
  const jobTypes = new Map();
  const qualifiedIds = [];
  let qualified = 0;
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).map(part => [part.type, part.value]));
  const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;

  for (const job of list) {
    const verification = job.verification || {};
    const source = job.dataMeta && typeof job.dataMeta === 'object'
      ? { sourceCode: job.dataMeta.sourceCode || 'unknown', sourceType: job.dataMeta.sourceType || 'unknown', isFallback: job.dataMeta.isFallback === true }
      : provenance.sourceMeta(job.source || job.sourceCode || job.sourceType, { isFallback: job.isFallback === true });
    const fresh = freshness(job, now);
    if (freshnessCounts[fresh] !== undefined) freshnessCounts[fresh] += 1;
    if (verification.status !== 'open' || !verification.verifiedAt || verification.availabilityHold) exclusions.unverified += 1;
    if (source.sourceType !== 'official_board' || source.sourceCode === 'unknown') exclusions.nonOfficialSource += 1;
    if (source.isFallback) exclusions.fallback += 1;
    const linkMatches = validHttpsUrl(verification.employerApplyUrl)
      && validHttpsUrl(job.applyUrl)
      && verification.employerApplyUrl === job.applyUrl;
    if (!linkMatches) exclusions.urlMismatchOrMissing += 1;
    const health = job.linkHealth || {};
    const linkVerified = linkMatches && health.outcome === 'reachable'
      && Date.parse(health.checkedAt || '') >= now.getTime() - 30 * 24 * 60 * 60 * 1000;
    if (!linkVerified) exclusions.linkNotReachable += 1;
    const deadlineStatus = deadlineState(job.deadline || verification.deadline, today, now.getTime());
    const deadlineOkay = deadlineStatus === 'future';
    if (deadlineStatus === 'unknown') exclusions.deadlineUnknown += 1;
    else if (deadlineStatus === 'expired') exclusions.deadlineExpired += 1;
    if (fresh === 'stale' || fresh === 'expired') exclusions.freshnessStale += 1;
    if (fresh === 'unknown') exclusions.freshnessUnknown += 1;
    const qualifies = verification.status === 'open' && !!verification.verifiedAt && !verification.availabilityHold
      && source.sourceType === 'official_board' && source.sourceCode !== 'unknown' && !source.isFallback
      && linkVerified && deadlineOkay && ['fresh', 'aging'].includes(fresh);
    if (!qualifies) continue;
    qualified += 1;
    qualifiedIds.push(String(job.id));
    const increment = (map, key) => {
      const value = String(key || 'unknown').trim().slice(0, 60) || 'unknown';
      map.set(value, (map.get(value) || 0) + 1);
    };
    increment(sources, source.sourceCode);
    increment(regions, job.region || job.country || job.location);
    increment(jobTypes, job.jobType || job.job_type);
  }
  const toRows = map => [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return {
    generatedAt: now.toISOString(),
    universe: 'local_jobs_json_only',
    totalSnapshotJobs: list.length,
    qualifiedLiveJobs: qualified,
    qualifiedIds,
    freshnessCounts,
    exclusions,
    breakdown: { sources: toRows(sources), regions: toRows(regions), jobTypes: toRows(jobTypes) },
    methodology: '仅统计本机 jobs.json 中来源可追溯、官方来源、人工核验为 open、申请链接与核验链接一致且近 30 天有 reachable 检查、明确未截止、来源时效为 fresh/aging 的岗位。截止未知、来源时效未知或未核验岗位分层剔除。不是全网岗位榜或招聘热度排名。'
  };
}

function submissionConversions(dataClass = 'production') {
  const integrity = submissionAnalytics.report(dataClass);
  if (!integrity.available || !integrity.complete) {
    return { available: false, reason: integrity.reason || 'analytics_reconciliation_incomplete', coverage: null, applications: null, byJob: [] };
  }
  const facts = db.prepare(`SELECT f.id,f.application_id AS applicationId,f.user_id AS userId,f.action,f.channel,
      a.job_id AS jobId,a.source_job_id AS sourceJobId,a.id AS retainedId
    FROM application_submission_events f
    LEFT JOIN applications a ON a.id=f.application_id AND a.user_id=f.user_id
    ORDER BY f.id`).all();
  if (!facts.length) return { available: true, reason: null, coverage: { matched: 0, total: 0 }, applications: 0, byJob: [] };
  const events = db.prepare(`SELECT id,user_id AS userId,event_name AS eventName,payload,
      COALESCE(data_class,'production') AS dataClass,COALESCE(is_test,0) AS isTest
    FROM analytics_events WHERE source='server'
      AND event_name IN ('application_submission_confirmed','application_submission_revoked')
      AND json_valid(payload)`).all();
  const byFact = new Map();
  for (const event of events) {
    if (dataClass !== 'all' && (event.dataClass !== dataClass || Number(event.isTest) !== (dataClass === 'test' ? 1 : 0))) continue;
    let payload;
    try { payload = JSON.parse(event.payload || '{}'); } catch (_) { continue; }
    if (!Number.isSafeInteger(payload.confirmationEventId)) continue;
    const rows = byFact.get(payload.confirmationEventId) || [];
    rows.push({ event, payload });
    byFact.set(payload.confirmationEventId, rows);
  }
  const latestByApplication = new Map();
  for (const fact of facts) {
    if (fact.retainedId) latestByApplication.set(`${fact.userId}:${fact.applicationId}`, fact);
  }
  const latest = [...latestByApplication.values()];
  const resolvedLatest = [];
  const confirmed = [];
  for (const fact of latest) {
    const matching = (byFact.get(fact.id) || []).filter(({ event, payload }) =>
      event.userId === fact.userId && payload.applicationId === fact.applicationId
      && payload.channel === fact.channel
      && (fact.action === 'confirmed' ? event.eventName === 'application_submission_confirmed' : event.eventName === 'application_submission_revoked'));
    if (matching.length !== 1) continue;
    const refs = matching[0].payload.refs || {};
    const trustedJobId = String(fact.sourceJobId || fact.jobId || '');
    if (!trustedJobId || String(refs.jobId || '') !== trustedJobId) continue;
    const resolved = { applicationId: fact.applicationId, jobId: trustedJobId, action: fact.action };
    resolvedLatest.push(resolved);
    if (fact.action === 'confirmed') confirmed.push(resolved);
  }
  const jobMap = new Map(store.listJobs().map(job => [String(job.id), job]));
  const counts = new Map();
  for (const item of confirmed) {
    const job = jobMap.get(item.jobId);
    if (!job || !(job.verification && job.verification.status === 'open' && job.verification.verifiedAt)) continue;
    counts.set(item.jobId, (counts.get(item.jobId) || 0) + 1);
  }
  const rows = [...counts.entries()].map(([jobId, applications]) => ({ jobId, applications })).sort((a, b) => b.applications - a.applications);
  return { available: true, reason: null, coverage: { matched: resolvedLatest.length, total: latest.length },
    applications: confirmed.length, byJob: rows };
}

function build({ now = new Date(), dataClass = 'production' } = {}) {
  const jobQuality = aggregateJobs(store.listJobs(), now);
  const conversions = submissionConversions(dataClass);
  const qualifiedIds = new Set(jobQuality.qualifiedIds);
  jobQuality.qualifiedIds = undefined;
  conversions.byJob = conversions.byJob.filter(row => qualifiedIds.has(String(row.jobId)));
  conversions.applications = conversions.byJob.reduce((sum, row) => sum + row.applications, 0);
  if (!conversions.available || !conversions.coverage || conversions.coverage.total === 0) {
    conversions.applications = null;
    conversions.byJob = [];
    conversions.coveragePercent = null;
  } else {
    conversions.coveragePercent = Math.round(conversions.coverage.matched * 1000 / conversions.coverage.total) / 10;
    if (conversions.coveragePercent < 100) {
      conversions.applications = null;
      conversions.byJob = [];
      conversions.available = false;
      conversions.reason = 'job_reference_coverage_incomplete';
    }
  }
  return { generatedAt: now.toISOString(), jobQuality, submissionConversions: conversions };
}

module.exports = { aggregateJobs, submissionConversions, build };

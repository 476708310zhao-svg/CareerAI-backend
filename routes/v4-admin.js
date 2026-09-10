const express = require('express');
const db = require('../db/database');
const adminAuth = require('../middleware/adminAuth');
const { ok, fail } = require('../utils/response');
const { listJobs, findJobById } = require('../utils/jobData');
const { getSponsorProfile, saveSponsorProfile } = require('../services/v4Sponsor');
const { FUNNEL_STAGES, normalizeDataClass } = require('../utils/funnelAnalytics');
const commerce = require('../services/v4Commerce');

const router = express.Router();

function boolValue(value, fallback) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  return value === true || value === 1 || value === '1' || value === 'true';
}

function cleanText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function selectedAnalyticsClass(req) {
  const requested = cleanText(req.query && req.query.dataClass, 30).toLowerCase();
  return requested === 'all' ? 'all' : normalizeDataClass(requested || 'production');
}

function analyticsScope(req, alias = '') {
  const dataClass = selectedAnalyticsClass(req);
  if (dataClass === 'all') return '1=1';
  const prefix = alias ? `${alias}.` : '';
  return `COALESCE(${prefix}data_class,'production')='${dataClass}' AND COALESCE(${prefix}is_test,0)=${dataClass === 'test' ? 1 : 0}`;
}

router.get('/sponsor-profiles', adminAuth, (req, res) => {
  const keyword = cleanText(req.query.keyword, 120).toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  let list = listJobs().map(job => ({
    job: { id: job.id, title: job.title, company: job.company, location: job.location },
    sponsor: getSponsorProfile(job)
  })).filter(item => {
    const text = `${item.job.title} ${item.job.company} ${item.job.location}`.toLowerCase();
    if (keyword && !text.includes(keyword)) return false;
    if (req.query.source && item.sponsor.source !== req.query.source) return false;
    if (req.query.needsReview === 'true' && item.sponsor.confidence >= 0.8 && item.sponsor.verifiedAt) return false;
    return true;
  });
  const start = (page - 1) * pageSize;
  return ok(res, { list: list.slice(start, start + pageSize), page, pageSize, total: list.length });
});

router.put('/sponsor-profiles/:jobId', adminAuth, (req, res) => {
  const job = findJobById(req.params.jobId);
  if (!job) return fail(res, '职位不存在', 404);
  const before = getSponsorProfile(job);
  const profile = {
    jobId: String(job.id),
    optFriendly: boolValue(req.body.optFriendly, before.optFriendly),
    stemFriendly: boolValue(req.body.stemFriendly, before.stemFriendly),
    h1bSponsor: boolValue(req.body.h1bSponsor, before.h1bSponsor),
    internationalStudentFriendly: boolValue(req.body.internationalStudentFriendly, before.internationalStudentFriendly),
    citizenRequired: boolValue(req.body.citizenRequired, before.citizenRequired),
    source: 'manual_review',
    sourceUrl: cleanText(req.body.sourceUrl || before.sourceUrl, 1000),
    confidence: Math.min(1, Math.max(0, Number(req.body.confidence ?? 1))),
    evidence: Array.isArray(req.body.evidence) ? req.body.evidence.map(item => cleanText(item, 300)).filter(Boolean).slice(0, 20) : before.evidence,
    verifiedAt: new Date().toISOString()
  };
  const after = saveSponsorProfile(profile);
  db.prepare(`
    INSERT INTO job_sponsor_history (job_id, before_data, after_data, actor, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(job.id), JSON.stringify(before), JSON.stringify(after), cleanText(req.admin && req.admin.sub, 120), cleanText(req.body.note, 500));
  return ok(res, after, 'Sponsor 资料已核验');
});

router.get('/sponsor-profiles/:jobId/history', adminAuth, (req, res) => {
  const list = db.prepare(`
    SELECT id, before_data AS beforeData, after_data AS afterData,
           actor, note, created_at AS createdAt
    FROM job_sponsor_history WHERE job_id=? ORDER BY id DESC
  `).all(String(req.params.jobId)).map(item => ({
    ...item,
    beforeData: JSON.parse(item.beforeData || '{}'),
    afterData: JSON.parse(item.afterData || '{}')
  }));
  return ok(res, { list, total: list.length });
});

router.get('/operations/dashboard', adminAuth, (req, res) => {
  const count = (sql, ...params) => Number((db.prepare(sql).get(...params) || {}).count || 0);
  const scope = analyticsScope(req);
  const active7d = count(`SELECT COUNT(DISTINCT COALESCE(user_id, id)) AS count FROM analytics_events WHERE ${scope} AND created_at>=datetime('now','-7 day')`);
  const aiUsers = count(`SELECT COUNT(DISTINCT user_id) AS count FROM analytics_events WHERE ${scope} AND created_at>=datetime('now','-7 day') AND event_name IN ('ai_agent_started','resume_optimize_started','interview_training_started','application_material_generated')`);
  let previousUsers = null;
  const funnel = FUNNEL_STAGES.map(stage => {
    const users = count(`SELECT COUNT(DISTINCT user_id) AS count FROM analytics_events WHERE ${scope} AND source='server' AND event_name=? AND created_at>=datetime('now','-30 day')`, stage.eventName);
    const events = count(`SELECT COUNT(*) AS count FROM analytics_events WHERE ${scope} AND source='server' AND event_name=? AND created_at>=datetime('now','-30 day')`, stage.eventName);
    const conversionFromPrevious = previousUsers === null ? null : (previousUsers ? Math.round(users * 1000 / previousUsers) / 10 : 0);
    previousUsers = users;
    return { stage: stage.stage, event: stage.eventName, label: stage.label, users, events, conversionFromPrevious };
  });
  const cohort = count(`SELECT COUNT(DISTINCT u.id) AS count FROM users u JOIN analytics_events e ON e.user_id=u.id
    WHERE ${analyticsScope(req, 'e')} AND date(u.created_at)=date('now','-7 day') AND date(e.created_at)=date(u.created_at)`);
  const retained = count(`SELECT COUNT(DISTINCT u.id) AS count FROM users u JOIN analytics_events e ON e.user_id=u.id
    WHERE ${analyticsScope(req, 'e')} AND date(u.created_at)=date('now','-7 day') AND date(e.created_at)>=date(u.created_at,'+6 day')`);
  const events = db.prepare(`SELECT event_name AS eventName,COUNT(*) AS count FROM analytics_events WHERE ${scope} AND created_at>=datetime('now','-7 day') GROUP BY event_name ORDER BY count DESC LIMIT 20`).all();
  const aiQualityRow = db.prepare(`
    SELECT COUNT(*) AS calls,
      SUM(CASE WHEN json_extract(payload,'$.generation.source')='live' THEN 1 ELSE 0 END) AS liveCalls,
      SUM(CASE WHEN COALESCE(json_extract(payload,'$.generation.degraded'),0)=1 THEN 1 ELSE 0 END) AS degradedCalls,
      ROUND(AVG(CASE WHEN json_extract(payload,'$.generation.elapsedMs') IS NOT NULL THEN json_extract(payload,'$.generation.elapsedMs') END)) AS avgElapsedMs,
      SUM(COALESCE(json_extract(payload,'$.generation.usage.inputTokens'),0)) AS inputTokens,
      SUM(COALESCE(json_extract(payload,'$.generation.usage.outputTokens'),0)) AS outputTokens,
      SUM(CASE WHEN json_extract(payload,'$.generation.estimatedCostUsd') IS NOT NULL THEN 1 ELSE 0 END) AS pricedCalls,
      ROUND(SUM(COALESCE(json_extract(payload,'$.generation.estimatedCostUsd'),0)),8) AS estimatedCostUsd
    FROM analytics_events
    WHERE ${scope} AND source='server' AND created_at>=datetime('now','-7 day')
      AND event_name IN ('ai_agent_started','resume_optimize_started','application_material_generated','interview_answer_scored')
      AND json_extract(payload,'$.generation.source') IN ('live','fallback')
  `).get() || {};
  const aiQuality7d = {
    calls: Number(aiQualityRow.calls || 0),
    liveCalls: Number(aiQualityRow.liveCalls || 0),
    liveSuccessRate: Number(aiQualityRow.calls || 0)
      ? Math.round(Number(aiQualityRow.liveCalls || 0) * 1000 / Number(aiQualityRow.calls)) / 10 : 0,
    degradedCalls: Number(aiQualityRow.degradedCalls || 0),
    degradationRate: Number(aiQualityRow.calls || 0)
      ? Math.round(Number(aiQualityRow.degradedCalls || 0) * 1000 / Number(aiQualityRow.calls)) / 10 : 0,
    avgElapsedMs: Number(aiQualityRow.avgElapsedMs || 0),
    inputTokens: Number(aiQualityRow.inputTokens || 0),
    outputTokens: Number(aiQualityRow.outputTokens || 0),
    pricedCalls: Number(aiQualityRow.pricedCalls || 0),
    estimatedCostUsd: Number(aiQualityRow.pricedCalls || 0) ? Number(aiQualityRow.estimatedCostUsd || 0) : null
  };
  const dataClasses = db.prepare("SELECT COALESCE(data_class,'production') AS dataClass,COUNT(*) AS count FROM analytics_events WHERE created_at>=datetime('now','-30 day') GROUP BY COALESCE(data_class,'production') ORDER BY count DESC").all();
  const missingRefs = count(`SELECT COUNT(*) AS count FROM analytics_events WHERE ${scope} AND source='server' AND event_name IN (${FUNNEL_STAGES.map(() => '?').join(',')}) AND created_at>=datetime('now','-30 day') AND COALESCE(json_array_length(json_extract(payload,'$.missingRefs')),0)>0`, ...FUNNEL_STAGES.map(item => item.eventName));
  const slow = db.prepare("SELECT route,method,COUNT(*) AS count,ROUND(AVG(duration_ms)) AS avgMs,MAX(duration_ms) AS maxMs FROM api_performance_v4 WHERE slow=1 AND created_at>=datetime('now','-24 hour') GROUP BY route,method ORDER BY avgMs DESC LIMIT 20").all();
  const errors = db.prepare("SELECT severity,code,message,route,created_at AS createdAt FROM error_events_v4 ORDER BY id DESC LIMIT 30").all();
  const membership = {
    active: count("SELECT COUNT(*) AS count FROM users WHERE vip_level>0 AND (vip_expires_at IS NULL OR vip_expires_at='' OR vip_expires_at>=date('now'))"),
    orders: count("SELECT COUNT(*) AS count FROM orders"),
    paidOrders: count("SELECT COUNT(*) AS count FROM orders WHERE status='paid'"),
    refunds: count("SELECT COUNT(*) AS count FROM payment_refunds_v4")
  };
  return ok(res, { analyticsDataClass: selectedAnalyticsClass(req), activeUsers7d: active7d,
    retention7d: { cohort, retained, rate: cohort ? Math.round(retained * 1000 / cohort) / 10 : 0 },
    funnel, analyticsQuality: { dataClasses, missingRefs }, aiQuality7d,
    aiUsageRate: active7d ? Math.round(aiUsers * 1000 / active7d) / 10 : 0, topEvents: events, slowQueries: slow,
    errors, membership, commerce: commerce.overview() });
});

router.get('/commerce/overview', adminAuth, (_req, res) => {
  return ok(res, commerce.overview());
});

router.post('/commerce/alerts/evaluate', adminAuth, (_req, res) => {
  return ok(res, commerce.evaluateAlerts(), '商业化运行告警已评估；未执行外部操作');
});

router.patch('/commerce/alerts/:id', adminAuth, (req, res) => {
  try { return ok(res, commerce.updateAlert(req.params.id, cleanText(req.body.status, 30), cleanText(req.admin && req.admin.sub, 120)), '告警状态已更新'); }
  catch (error) { return fail(res, error.message, error.status || 400, error.data); }
});

router.patch('/commerce/refunds/:refundNo', adminAuth, (req, res) => {
  try {
    return ok(res, commerce.decideRefund(req.params.refundNo, req.body, cleanText(req.admin && req.admin.sub, 120)),
      req.body.status === 'completed' ? '外部退款凭据已记录并撤销对应权益' : '退款审核状态已更新');
  } catch (error) { return fail(res, error.message, error.status || 400, error.data); }
});

router.get('/rollout', adminAuth, (_req, res) => {
  return ok(res, db.prepare('SELECT feature,percentage,status,updated_by AS updatedBy,updated_at AS updatedAt FROM rollout_config_v4 ORDER BY feature').all());
});

router.put('/rollout/:feature', adminAuth, (req, res) => {
  const percentage = Number(req.body.percentage);
  if (![0, 5, 20, 50, 100].includes(percentage)) return fail(res, '放量比例仅支持 0/5/20/50/100', 400);
  const feature = cleanText(req.params.feature, 80);
  if (feature === 'commerce' && percentage > 0 && String(process.env.COMMERCE_ROLLOUT_APPROVED || 'false').toLowerCase() !== 'true') {
    return fail(res, '商业化灰度尚未获得 Human 审批，当前只能保持 0%', 403);
  }
  const status = percentage === 0 ? 'paused' : (percentage === 100 ? 'full' : 'rolling');
  db.prepare(`INSERT INTO rollout_config_v4 (feature,percentage,status,updated_by,updated_at) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(feature) DO UPDATE SET percentage=excluded.percentage,status=excluded.status,updated_by=excluded.updated_by,updated_at=datetime('now')`)
    .run(feature, percentage, status, cleanText(req.admin && req.admin.sub, 120));
  return ok(res, db.prepare('SELECT * FROM rollout_config_v4 WHERE feature=?').get(req.params.feature), '灰度比例已更新');
});

module.exports = router;

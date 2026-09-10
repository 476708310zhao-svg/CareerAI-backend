'use strict';

const db = require('../db/database');
const { buildDataMeta, sourceMeta } = require('../utils/dataProvenance');

const OBSERVED_STATUSES = Object.freeze({
  active: '官网仍可申请',
  closed: '官网显示已关闭',
  redirected: '链接发生跳转',
  unavailable: '官网链接不可访问',
  unknown: '未能确认状态'
});

function clean(value, max = 1000) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function problem(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function validHttpUrl(value) {
  const text = clean(value, 1000);
  if (!text) return '';
  try {
    const parsed = new URL(text);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch (error) {
    return '';
  }
}

function normalizedWords(value) {
  return clean(value, 200).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .split(' ').filter(word => word.length >= 3 && !['inc', 'ltd', 'company', 'group', 'limited'].includes(word));
}

function normalizedJobKey(job) {
  const normalize = value => clean(value, 300).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
  return [normalize(job.company), normalize(job.title), normalize(job.location)].join('|');
}

function duplicateEvidence(job, allJobs) {
  const key = normalizedJobKey(job);
  const matches = (Array.isArray(allJobs) ? allJobs : []).filter(item => normalizedJobKey(item) === key);
  const count = Math.max(1, matches.length);
  return {
    count,
    score: count === 1 ? 15 : count === 2 ? 10 : 4,
    reason: count === 1 ? '当前职位库未发现同公司、同岗位、同地点的重复记录'
      : `当前职位库发现 ${count} 条同公司、同岗位、同地点记录，投递前建议核对是否重复或已更新`
  };
}

function jobDataMeta(job) {
  const source = job.source || 'local';
  const isLocal = ['local', 'local_fallback'].includes(source);
  return buildDataMeta({
    domain: 'job',
    source,
    sourceLabel: job.sourceLabel,
    publishedAt: job.postedAt,
    updatedAt: job.updatedAt,
    isExpired: job.deadline ? new Date(`${String(job.deadline).slice(0, 10)}T23:59:59+08:00`).getTime() < Date.now() : false,
    isFallback: isLocal,
    fallbackReason: isLocal ? '当前记录来自历史职位库' : ''
  });
}

function officialEvidence(job, latestObservation) {
  const url = validHttpUrl((latestObservation && (latestObservation.officialUrl || latestObservation.official_url)) || job.applyUrl || job.sourceUrl);
  const source = sourceMeta(job.source || 'local');
  let host = '';
  try { host = url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : ''; } catch (error) {}
  const companyWords = normalizedWords(job.company);
  const companyDomainSignal = host && companyWords.some(word => host.includes(word));
  const officialBoardSignal = source.sourceType === 'official_board';
  const userChecked = Boolean(latestObservation && (latestObservation.checkedOfficial || latestObservation.checked_official));
  const userActive = userChecked && (latestObservation.status || latestObservation.observed_status) === 'active';
  const score = userActive ? 25 : officialBoardSignal || companyDomainSignal ? 20 : url ? 12 : 0;
  return {
    url,
    host,
    score,
    status: userActive ? 'user_checked_active' : officialBoardSignal || companyDomainSignal ? 'direct_link_signal' : url ? 'link_available' : 'missing',
    label: userActive ? '本人已核对官网可申请' : officialBoardSignal || companyDomainSignal ? '存在官网/ATS 直链信号' : url ? '存在投递链接，域名待核实' : '缺少可核验链接',
    reason: userActive
      ? '该状态来自用户本人最近一次官网核对，不代表系统持续监控结果'
      : '系统只判断链接与来源信号，不会联网代替用户确认岗位仍然有效'
  };
}

function observationView(row) {
  return {
    id: row.id,
    status: row.observed_status,
    statusLabel: OBSERVED_STATUSES[row.observed_status] || row.observed_status,
    officialUrl: row.official_url || '',
    checkedOfficial: Boolean(row.checked_official),
    note: row.note || '',
    observedAt: row.observed_at,
    source: 'user_reported'
  };
}

function listObservations(userId, jobId) {
  return db.prepare(`SELECT * FROM job_trust_observations_v4 WHERE user_id=? AND job_id=?
    ORDER BY observed_at DESC, id DESC LIMIT 20`).all(userId, String(jobId)).map(observationView);
}

function buildTrust(job, allJobs, observations = []) {
  const dataMeta = jobDataMeta(job);
  const normalizedObservations = observations.map(item => item && item.status ? item : observationView(item));
  const latestObservation = normalizedObservations.length ? normalizedObservations[0] : null;
  const official = officialEvidence(job, latestObservation);
  const duplicate = duplicateEvidence(job, allJobs);
  const freshnessScores = { fresh: 25, aging: 15, stale: 5, expired: 0, unknown: 8 };
  const freshnessScore = freshnessScores[dataMeta.freshness] ?? 8;
  const publishedScore = dataMeta.publishedAt ? 15 : 3;
  const statusScores = { active: 20, unknown: 8, redirected: 5, unavailable: 2, closed: 0 };
  const latestStatus = latestObservation ? latestObservation.status : 'unknown';
  const statusScore = dataMeta.isExpired ? 0 : (statusScores[latestStatus] ?? 8);
  const score = Math.max(0, Math.min(100, official.score + freshnessScore + publishedScore + duplicate.score + statusScore));
  const evidenceSignals = [official.url, dataMeta.publishedAt || dataMeta.updatedAt,
    duplicate.count > 0, latestObservation && latestObservation.checkedOfficial].filter(Boolean).length;
  const confidence = evidenceSignals >= 4 ? 'high' : evidenceSignals >= 2 ? 'medium' : 'low';
  const risks = [];
  if (!official.url) risks.push('缺少可核验的投递链接');
  if (!latestObservation) risks.push('尚未由用户记录官网状态');
  if (['aging', 'stale', 'unknown'].includes(dataMeta.freshness)) risks.push(dataMeta.freshnessReason);
  if (dataMeta.isExpired || latestStatus === 'closed') risks.push('当前证据显示岗位可能已关闭，不建议直接投递');
  if (duplicate.count > 1) risks.push(duplicate.reason);
  const level = score >= 80 ? 'higher' : score >= 60 ? 'review' : 'risk';
  const labels = { higher: '信号较完整', review: '需要复核', risk: '风险信号较多' };
  return {
    score,
    level,
    label: labels[level],
    confidence,
    confidenceLabel: { high: '证据较完整', medium: '证据一般', low: '证据不足' }[confidence],
    recommendation: dataMeta.isExpired || latestStatus === 'closed' ? '暂缓投递并重新查找官网岗位'
      : score >= 80 ? '仍需打开官网确认后再投递' : '先补齐官网、时间和岗位状态证据',
    evidence: [
      { key: 'official', label: '官网可验证性', score: official.score, maximum: 25, status: official.status, explanation: official.label },
      { key: 'freshness', label: '信息新鲜度', score: freshnessScore, maximum: 25, status: dataMeta.freshness, explanation: dataMeta.freshnessReason },
      { key: 'published', label: '发布时间', score: publishedScore, maximum: 15, status: dataMeta.publishedAt ? 'known' : 'unknown', explanation: dataMeta.publishedAt || '缺少可验证发布时间' },
      { key: 'duplicate', label: '重复度', score: duplicate.score, maximum: 15, status: duplicate.count === 1 ? 'unique' : 'duplicate', explanation: duplicate.reason },
      { key: 'status', label: '官网状态记录', score: statusScore, maximum: 20, status: latestStatus, explanation: latestObservation ? OBSERVED_STATUSES[latestStatus] : '尚未由用户核对官网状态' }
    ],
    officialVerification: official,
    dataMeta,
    duplicateCount: duplicate.count,
    observations: normalizedObservations,
    risks,
    notice: 'Job Trust Score 仅汇总现有证据，不能证明岗位真实、有效或一定适合投递；缺失数据不会被包装成确定结论。'
  };
}

function recordObservation(userId, job, payload = {}) {
  if (payload.confirmObserved !== true) throw problem('OBSERVATION_CONFIRMATION_REQUIRED', '请确认该状态由你本人打开官网核对');
  const status = clean(payload.status, 30);
  if (!OBSERVED_STATUSES[status]) throw problem('INVALID_JOB_STATUS', '岗位官网状态无效');
  const officialUrl = validHttpUrl(payload.officialUrl || job.applyUrl || job.sourceUrl);
  if (!officialUrl) throw problem('OFFICIAL_URL_REQUIRED', '请提供可打开的 HTTP/HTTPS 岗位链接');
  const result = db.prepare(`INSERT INTO job_trust_observations_v4
    (user_id, job_id, observed_status, official_url, checked_official, note)
    VALUES (?, ?, ?, ?, 1, ?)`).run(userId, String(job.id), status, officialUrl, clean(payload.note, 1000));
  return observationView(db.prepare('SELECT * FROM job_trust_observations_v4 WHERE id=?').get(result.lastInsertRowid));
}

module.exports = {
  OBSERVED_STATUSES,
  normalizedJobKey,
  duplicateEvidence,
  buildTrust,
  listObservations,
  recordObservation,
  validHttpUrl
};

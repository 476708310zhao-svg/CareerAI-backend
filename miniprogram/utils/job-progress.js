const STORAGE_KEY = 'localApplications';
const apiClient = require('./api-client.js');
const { applicationState } = require('./application-state.js');
const { shanghaiDayKey, shanghaiDayDistance } = require('./date-time.js');

let suppressRemoteSync = false;

const STATUS_OPTIONS = [
  { code: 'collected', label: '已收藏', short: '收藏', tone: 'gray' },
  { code: 'applied', label: '已投递', short: '投递', tone: 'blue' },
  { code: 'online_apply', label: '待投递', short: '待投', tone: 'indigo' },
  { code: 'oa', label: 'OA 阶段', short: 'OA', tone: 'amber' },
  { code: 'first_interview', label: '一面', short: '一面', tone: 'teal' },
  { code: 'second_interview', label: '二面', short: '二面', tone: 'teal' },
  { code: 'hr_interview', label: 'HR 面', short: 'HR', tone: 'violet' },
  { code: 'offer', label: 'Offer', short: 'Offer', tone: 'green' },
  { code: 'rejected', label: '拒信', short: '拒信', tone: 'red' },
  { code: 'closed', label: '已结束', short: '结束', tone: 'slate' }
];

const STATUS_LABEL_MAP = STATUS_OPTIONS.reduce((map, item, index) => {
  map[item.code] = Object.assign({ level: index + 1 }, item);
  return map;
}, {});

const LEGACY_STATUS_MAP = {
  interested: 'collected', preparing: 'online_apply', phone_screen: 'first_interview',
  interview_1: 'first_interview', interview_2: 'second_interview', final: 'hr_interview', withdrawn: 'closed',
  pending: 'collected',
  viewed: 'collected',
  saved: 'collected',
  screening: 'online_apply',
  interview: 'first_interview',
  rejected: 'rejected',
  offer: 'offer'
};

const TERMINAL_STATUSES = {
  offer: true,
  rejected: true,
  closed: true
};

function getToday() {
  return shanghaiDayKey();
}

function safeStorageGet(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    if (!value) return fallback;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        return fallback;
      }
    }
    return value;
  } catch (e) {
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {}
}

function hashScope(prefix, value) {
  const text = String(value || '');
  if (!text) return '';
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 16777619);
    second = ((second << 5) + second) ^ code;
  }
  return prefix + '_' + (first >>> 0).toString(36) + '_' + (second >>> 0).toString(36) + '_' + text.length;
}

function readToken() {
  try { return String(wx.getStorageSync('token') || ''); } catch (e) { return ''; }
}

function decodeJwtIdentity(token) {
  const part = String(token || '').split('.')[1];
  if (!part) return '';
  try {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const input = part.replace(/-/g, '+').replace(/_/g, '/');
    let bits = 0;
    let bitCount = 0;
    const bytes = [];
    for (const char of input) {
      const value = alphabet.indexOf(char);
      if (value < 0) continue;
      bits = (bits << 6) | value;
      bitCount += 6;
      if (bitCount >= 8) {
        bitCount -= 8;
        bytes.push((bits >>> bitCount) & 255);
      }
    }
    const encoded = bytes.map(value => '%' + value.toString(16).padStart(2, '0')).join('');
    const payload = JSON.parse(decodeURIComponent(encoded));
    return String(payload.userId || payload.user_id || payload.openid || payload.sub || '');
  } catch (error) { return ''; }
}

function storedIdentity() {
  try {
    const info = wx.getStorageSync('userInfo') || {};
    const profile = wx.getStorageSync('userProfile') || {};
    return String(info.userId || info.id || info.openid || profile.userId || profile.id || profile.openid || '');
  } catch (error) { return ''; }
}

function legacyTokenScope() {
  return hashScope('u', readToken());
}

function currentOwnerScope() {
  const token = readToken();
  if (!token) return '';
  // A verified JWT is stable across token rotation. Stored identity is the
  // fallback for opaque-token deployments; raw identifiers are never stored.
  const identity = decodeJwtIdentity(token) || storedIdentity();
  return identity ? hashScope('id', identity) : legacyTokenScope();
}

function hasToken() {
  try {
    return !!wx.getStorageSync('token');
  } catch (e) {
    return false;
  }
}

function normalizeStatus(status) {
  const raw = String(status || '').trim();
  if (STATUS_LABEL_MAP[raw]) return raw;
  return LEGACY_STATUS_MAP[raw] || 'collected';
}

function toLegacyStatus(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'offer') return 'offer';
  if (normalized === 'rejected' || normalized === 'closed') return 'rejected';
  if (normalized === 'first_interview' || normalized === 'second_interview' || normalized === 'hr_interview') {
    return 'interview';
  }
  return 'pending';
}

function getStatusConfig(status) {
  const code = normalizeStatus(status);
  return STATUS_LABEL_MAP[code] || STATUS_LABEL_MAP.collected;
}

function daysUntil(dateText) {
  return dateText ? shanghaiDayDistance(String(dateText).slice(0, 10)) : null;
}

function getDeadlineMeta(record) {
  const days = daysUntil(record.deadline);
  if (days === null || TERMINAL_STATUSES[record.status]) {
    return { days: null, urgent: false, label: '' };
  }
  if (days < 0) return { days, urgent: false, label: '已截止' };
  if (days === 0) return { days, urgent: true, label: '今天截止' };
  if (days <= 3) return { days, urgent: true, label: days + ' 天后截止' };
  return { days, urgent: false, label: '截止 ' + record.deadline };
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : '?';
}

function normalizeRecord(item) {
  const source = item || {};
  const sourceJobId = source.sourceJobId || source.source_job_id || source.job_id || source.jobId || source.targetId || '';
  const clientId = source.clientId || source.client_id || (/^local_|^progress_/.test(String(source.id || '')) ? String(source.id) : '');
  const status = normalizeStatus(source.progressStatus || source.currentStatus || source.status);
  const company = source.company || (source.jobSnapshot && source.jobSnapshot.company) || '';
  const jobTitle = source.jobTitle || source.job_title || source.title || (source.jobSnapshot && source.jobSnapshot.title) || '';
  const appliedAt = source.appliedAt || source.applied_at || source.createdAt || '';
  const deadline = (source.deadline || source.deadlineDate || '').slice(0, 10);
  const interviewTime = source.interviewTime || source.interview_time || '';
  const cfg = getStatusConfig(status);
  const record = {
    id: String(source.id || ('progress_' + Date.now())),
    clientId,
    sourceJobId: sourceJobId ? String(sourceJobId) : '',
    company,
    jobTitle,
    city: source.city || source.location || (source.jobSnapshot && (source.jobSnapshot.city || source.jobSnapshot.location)) || '',
    salary: source.salary || (source.jobSnapshot && source.jobSnapshot.salary) || '',
    jobLink: source.jobLink || source.officialApplyUrl || source.applyLink || source.apply_url || '',
    logo: source.logo || '',
    appliedAt,
    deadline,
    interviewTime,
    status,
    statusText: cfg.label,
    statusShort: cfg.short,
    statusTone: cfg.tone,
    stageLevel: cfg.level,
    notes: source.notes || source.remark || '',
    resumeVersionId: source.resumeVersionId || '',
    interviewQuestionIds: source.interviewQuestionIds || [],
    aiReportId: source.aiReportId || source.ai_report_id || (source.jobSnapshot && source.jobSnapshot.aiReportId) || '',
    matchScore: Number(source.matchScore || source.match_score || (source.jobSnapshot && source.jobSnapshot.matchScore) || 0),
    matchedKeywords: source.matchedKeywords || source.matched_keywords || (source.jobSnapshot && source.jobSnapshot.matchedKeywords) || [],
    missingKeywords: source.missingKeywords || source.missing_keywords || (source.jobSnapshot && source.jobSnapshot.missingKeywords) || [],
    aiSuggestion: source.aiSuggestion || source.ai_suggestion || (source.jobSnapshot && source.jobSnapshot.aiSuggestion) || '',
    nextAction: source.nextAction || source.next_action || (source.jobSnapshot && source.jobSnapshot.nextAction) || '',
    reminderEnabled: !!source.reminderEnabled,
    reminderLeadDays: source.reminderLeadDays || [3, 1],
    projectId: source.projectId || '',
    offer: source.offer || null,
    createdAt: source.createdAt || appliedAt || getToday(),
    updatedAt: source.updatedAt || '',
    cacheOwnerScope: String(source.cacheOwnerScope || '')
  };
  const deadlineMeta = getDeadlineMeta(record);
  return Object.assign(record, {
    companyInitial: getInitial(company),
    deadlineDays: deadlineMeta.days,
    deadlineUrgent: deadlineMeta.urgent,
    deadlineLabel: deadlineMeta.label,
    hasInterviewToday: !!record.interviewTime && record.interviewTime.slice(0, 10) === getToday()
  });
}

function toStorageShape(record) {
  const normalized = normalizeRecord(record);
  return Object.assign({}, record, {
    id: normalized.id,
    clientId: normalized.clientId,
    sourceJobId: normalized.sourceJobId,
    job_id: normalized.sourceJobId,
    company: normalized.company,
    job_title: normalized.jobTitle,
    title: normalized.jobTitle,
    city: normalized.city,
    salary: normalized.salary || '面议',
    jobLink: normalized.jobLink,
    applied_at: normalized.appliedAt,
    appliedAt: normalized.appliedAt,
    deadline: normalized.deadline,
    interviewTime: normalized.interviewTime,
    notes: normalized.notes,
    status: toLegacyStatus(normalized.status),
    progressStatus: normalized.status,
    currentStatus: normalized.status,
    reminderEnabled: normalized.reminderEnabled,
    reminderLeadDays: normalized.reminderLeadDays,
    resumeVersionId: normalized.resumeVersionId,
    interviewQuestionIds: normalized.interviewQuestionIds,
    aiReportId: normalized.aiReportId,
    matchScore: normalized.matchScore,
    matchedKeywords: normalized.matchedKeywords,
    missingKeywords: normalized.missingKeywords,
    aiSuggestion: normalized.aiSuggestion,
    nextAction: normalized.nextAction,
    projectId: normalized.projectId,
    offer: normalized.offer,
    updatedAt: normalized.updatedAt || new Date().toISOString(),
    cacheOwnerScope: normalized.cacheOwnerScope || currentOwnerScope()
  });
}

function getAllRawList() {
  const list = safeStorageGet(STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
}

function getRawList() {
  const scope = currentOwnerScope();
  if (!scope) return [];
  const legacyScope = legacyTokenScope();
  const all = getAllRawList();
  const legacy = legacyScope !== scope
    ? all.filter(item => String(item && item.cacheOwnerScope || '') === legacyScope)
    : [];
  if (legacy.length) {
    safeStorageSet(STORAGE_KEY, all.map(item => String(item && item.cacheOwnerScope || '') === legacyScope
      ? Object.assign({}, item, { cacheOwnerScope: scope }) : item));
  }
  return all.filter(item => {
    const owner = String(item && item.cacheOwnerScope || '');
    return owner === scope || owner === legacyScope;
  }).map(item => Object.assign({}, item, { cacheOwnerScope: scope }));
}

function getList(options) {
  const opts = options || {};
  let list = getRawList().map(normalizeRecord);
  if (opts.status && opts.status !== 'all') {
    list = list.filter(item => item.status === opts.status);
  }
  if (opts.keyword) {
    const kw = String(opts.keyword).trim().toLowerCase();
    list = list.filter(item =>
      (item.company || '').toLowerCase().includes(kw) ||
      (item.jobTitle || '').toLowerCase().includes(kw)
    );
  }
  return list.sort((a, b) => {
    const ad = a.interviewTime || a.deadline || a.appliedAt || a.createdAt || '';
    const bd = b.interviewTime || b.deadline || b.appliedAt || b.createdAt || '';
    return ad < bd ? 1 : ad > bd ? -1 : 0;
  });
}

function saveList(list) {
  const scope = currentOwnerScope();
  if (!scope) return;
  const legacyScope = legacyTokenScope();
  const otherOwners = getAllRawList().filter(item => {
    const owner = String(item && item.cacheOwnerScope || '');
    return owner !== scope && owner !== legacyScope;
  });
  const owned = (list || []).map(item => toStorageShape(Object.assign({}, item, { cacheOwnerScope: scope })));
  safeStorageSet(STORAGE_KEY, otherOwners.concat(owned));
}

function findIndexByIdOrJob(list, record) {
  const id = record && record.id ? String(record.id) : '';
  const clientId = record && record.clientId ? String(record.clientId) : '';
  const sourceJobId = record && record.sourceJobId ? String(record.sourceJobId) : '';
  return (list || []).findIndex(item => {
    const normalized = normalizeRecord(item);
    if (id && String(normalized.id) === id) return true;
    if (clientId && String(normalized.clientId) === clientId) return true;
    if (sourceJobId && String(normalized.sourceJobId) === sourceJobId) return true;
    return false;
  });
}

function mergeRemoteRecord(record) {
  if (!record) return null;
  const raw = getRawList();
  const normalized = normalizeRecord(record);
  const idx = findIndexByIdOrJob(raw, normalized);
  const next = toStorageShape(Object.assign({}, idx >= 0 ? raw[idx] : {}, normalized, {
    clientId: normalized.clientId || (idx >= 0 ? normalizeRecord(raw[idx]).clientId : ''),
    updatedAt: normalized.updatedAt || new Date().toISOString()
  }));
  if (idx >= 0) raw[idx] = next;
  else raw.unshift(next);
  suppressRemoteSync = true;
  saveList(raw);
  suppressRemoteSync = false;
  return normalizeRecord(next);
}

function mergeRemoteList(remoteList) {
  (remoteList || []).forEach(mergeRemoteRecord);
  return getList();
}

function remotePayload(record) {
  const normalized = normalizeRecord(record);
  return {
    id: /^[0-9]+$/.test(String(normalized.id)) ? normalized.id : '',
    clientId: normalized.clientId || (/^local_|^progress_/.test(String(normalized.id)) ? normalized.id : ''),
    sourceJobId: normalized.sourceJobId,
    jobId: normalized.sourceJobId || normalized.id,
    company: normalized.company,
    jobTitle: normalized.jobTitle,
    title: normalized.jobTitle,
    city: normalized.city,
    salary: normalized.salary,
    jobLink: normalized.jobLink,
    appliedAt: normalized.appliedAt,
    deadline: normalized.deadline,
    interviewTime: normalized.interviewTime,
    status: normalized.status,
    progressStatus: normalized.status,
    notes: normalized.notes,
    resumeVersionId: normalized.resumeVersionId,
    aiReportId: normalized.aiReportId,
    matchScore: normalized.matchScore,
    matchedKeywords: normalized.matchedKeywords,
    missingKeywords: normalized.missingKeywords,
    aiSuggestion: normalized.aiSuggestion,
    nextAction: normalized.nextAction,
    reminderEnabled: normalized.reminderEnabled,
    reminderLeadDays: normalized.reminderLeadDays,
    jobSnapshot: {
      id: normalized.sourceJobId,
      title: normalized.jobTitle,
      company: normalized.company,
      location: normalized.city,
      salary: normalized.salary,
      applyLink: normalized.jobLink,
      aiReportId: normalized.aiReportId,
      matchScore: normalized.matchScore,
      matchedKeywords: normalized.matchedKeywords,
      missingKeywords: normalized.missingKeywords,
      aiSuggestion: normalized.aiSuggestion,
      nextAction: normalized.nextAction
    }
  };
}

function syncRecordRemote(record) {
  if (suppressRemoteSync || !hasToken() || !record) return Promise.resolve(null);
  const requestToken = readToken();
  const requestOwnerScope = currentOwnerScope();
  if (!requestToken || !requestOwnerScope) return Promise.resolve(null);
  const normalized = normalizeRecord(record);
  const body = remotePayload(normalized);
  const numericId = /^[0-9]+$/.test(String(normalized.id)) ? normalized.id : '';
  const request = numericId
    ? apiClient.put({ path: '/api/applications/progress/' + encodeURIComponent(numericId), body, timeout: 15000 })
    : apiClient.post({ path: '/api/applications/progress', body, timeout: 15000 });
  return request.then(res => {
    // Token rotation is allowed when the stable owner is unchanged. A real
    // account switch must discard the old response before it reaches storage.
    if (currentOwnerScope() !== requestOwnerScope) return null;
    if (res && res.code === 0 && res.data) return mergeRemoteRecord(res.data);
    return null;
  }).catch(() => null);
}

function syncFromServer() {
  if (!hasToken()) return Promise.resolve(getList());
  const requestToken = readToken();
  const requestOwnerScope = currentOwnerScope();
  if (!requestToken || !requestOwnerScope) return Promise.resolve([]);
  return apiClient.request({
    path: '/api/applications/progress',
    noCache: true,
    timeout: 15000
  }).then(res => {
    if (currentOwnerScope() !== requestOwnerScope) return [];
    if (res && res.code === 0 && Array.isArray(res.data)) {
      return mergeRemoteList(res.data);
    }
    return getList();
  }).catch(() => currentOwnerScope() === requestOwnerScope ? getList() : []);
}

function deleteRemote(id) {
  if (!hasToken() || !id) return Promise.resolve(null);
  return apiClient._write({
    method: 'DELETE',
    path: '/api/applications/progress/' + encodeURIComponent(id),
    timeout: 15000
  }).catch(() => null);
}

function upsert(record) {
  const raw = getRawList();
  const normalized = normalizeRecord(record);
  const idx = findIndexByIdOrJob(raw, normalized);
  const next = toStorageShape(Object.assign({}, idx >= 0 ? raw[idx] : {}, normalized, {
    id: idx >= 0 ? normalizeRecord(raw[idx]).id : normalized.id,
    createdAt: idx >= 0 ? normalizeRecord(raw[idx]).createdAt : (normalized.createdAt || getToday()),
    updatedAt: new Date().toISOString()
  }));
  if (idx >= 0) {
    raw[idx] = next;
  } else {
    raw.unshift(next);
  }
  saveList(raw);
  const saved = normalizeRecord(next);
  syncRecordRemote(saved);
  return saved;
}

function upsertFromJob(job, patch) {
  const source = job || {};
  const extra = patch || {};
  return upsert(Object.assign({
    id: source.sourceJobId ? '' : ('local_' + Date.now()),
    sourceJobId: source.id || source.job_id || source.jobId || '',
    company: source.company || source.employer_name || '',
    jobTitle: source.title || source.job_title || source.jobTitle || '',
    city: source.city || source.location || '',
    salary: source.salary || '',
    logo: source.logo || '',
    jobLink: source.applyLink || source.apply_url || source.jobLink || '',
    appliedAt: '',
    deadline: source.deadline || '',
    status: 'collected'
  }, extra));
}

function update(id, patch) {
  const raw = getRawList();
  const idx = raw.findIndex(item => String(normalizeRecord(item).id) === String(id));
  if (idx < 0) return null;
  const next = toStorageShape(Object.assign({}, raw[idx], patch || {}, { updatedAt: new Date().toISOString() }));
  raw[idx] = next;
  saveList(raw);
  const saved = normalizeRecord(next);
  syncRecordRemote(saved);
  return saved;
}

function remove(id) {
  const raw = getRawList();
  const target = raw.find(item => String(normalizeRecord(item).id) === String(id));
  const next = raw.filter(item => String(normalizeRecord(item).id) !== String(id));
  saveList(next);
  if (target && !suppressRemoteSync) {
    const normalized = normalizeRecord(target);
    deleteRemote(normalized.id || normalized.clientId);
  }
  return next.length !== raw.length;
}

function getByJobId(jobId) {
  const target = String(jobId || '');
  if (!target) return null;
  return getList().find(item => String(item.sourceJobId) === target) || null;
}

function getJobState(jobId) {
  return applicationState(getByJobId(jobId));
}

function getStats() {
  const list = getList();
  const byStatus = {};
  STATUS_OPTIONS.forEach(item => { byStatus[item.code] = 0; });
  list.forEach(item => { byStatus[item.status] = (byStatus[item.status] || 0) + 1; });
  const active = list.filter(item => !TERMINAL_STATUSES[item.status]).length;
  const interviews = list.filter(item => ['first_interview', 'second_interview', 'hr_interview'].includes(item.status)).length;
  const dueSoon = getUpcomingDeadlines(3).length;
  const todayInterviews = getTodayInterviews().length;
  return {
    total: list.length,
    active,
    interviews,
    offer: byStatus.offer || 0,
    rejected: byStatus.rejected || 0,
    closed: byStatus.closed || 0,
    dueSoon,
    todayInterviews,
    byStatus
  };
}

function getUpcomingDeadlines(days) {
  const limit = typeof days === 'number' ? days : 3;
  return getList()
    .filter(item => !TERMINAL_STATUSES[item.status] && item.deadlineDays !== null && item.deadlineDays >= 0 && item.deadlineDays <= limit)
    .sort((a, b) => a.deadlineDays - b.deadlineDays);
}

function getTodayInterviews() {
  return getList()
    .filter(item => item.hasInterviewToday)
    .sort((a, b) => String(a.interviewTime).localeCompare(String(b.interviewTime)));
}

function buildDailyAdvice() {
  const stats = getStats();
  if (stats.dueSoon > 0) return '今天优先处理即将截止的岗位，先确认 JD、简历版本和投递材料。';
  if (stats.todayInterviews > 0) return '今天有面试安排，建议提前复盘 STAR 案例和岗位关键词。';
  if (stats.active === 0) return '先收藏 3 个目标岗位，再把每个岗位拆成可执行的下一步。';
  if ((stats.byStatus.applied || 0) + (stats.byStatus.online_apply || 0) > 5) return '投递量已经起来了，今天重点跟进状态和补齐备注，避免机会散落。';
  return '今天适合补充 1 条投递记录、收藏 2 个岗位，并为最近的截止日期设置提醒。';
}

module.exports = {
  STATUS_OPTIONS,
  TERMINAL_STATUSES,
  normalizeStatus,
  getStatusConfig,
  getList,
  saveList,
  upsert,
  upsertFromJob,
  update,
  remove,
  getByJobId,
  getJobState,
  getStats,
  getUpcomingDeadlines,
  getTodayInterviews,
  buildDailyAdvice,
  getToday,
  syncFromServer,
  syncRecordRemote,
  mergeRemoteList,
  currentOwnerScope
};

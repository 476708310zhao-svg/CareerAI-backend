const STORAGE_KEY = 'localApplications';

const STATUS_OPTIONS = [
  { code: 'collected', label: '已收藏', short: '收藏', tone: 'gray' },
  { code: 'applied', label: '已投递', short: '投递', tone: 'blue' },
  { code: 'online_apply', label: '网申中', short: '网申', tone: 'indigo' },
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
  return new Date().toISOString().slice(0, 10);
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
  if (!dateText) return null;
  const target = new Date(String(dateText).slice(0, 10) + 'T00:00:00').getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date(getToday() + 'T00:00:00').getTime();
  return Math.round((target - today) / 86400000);
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
  const status = normalizeStatus(source.progressStatus || source.currentStatus || source.status);
  const company = source.company || (source.jobSnapshot && source.jobSnapshot.company) || '';
  const jobTitle = source.jobTitle || source.job_title || source.title || (source.jobSnapshot && source.jobSnapshot.title) || '';
  const appliedAt = source.appliedAt || source.applied_at || source.createdAt || '';
  const deadline = (source.deadline || source.deadlineDate || '').slice(0, 10);
  const interviewTime = source.interviewTime || source.interview_time || '';
  const cfg = getStatusConfig(status);
  const record = {
    id: String(source.id || ('progress_' + Date.now())),
    sourceJobId: sourceJobId ? String(sourceJobId) : '',
    company,
    jobTitle,
    city: source.city || source.location || (source.jobSnapshot && (source.jobSnapshot.city || source.jobSnapshot.location)) || '',
    salary: source.salary || (source.jobSnapshot && source.jobSnapshot.salary) || '',
    jobLink: source.jobLink || source.applyLink || source.apply_url || '',
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
    aiReportId: source.aiReportId || '',
    reminderEnabled: !!source.reminderEnabled,
    reminderLeadDays: source.reminderLeadDays || [3, 1],
    projectId: source.projectId || '',
    offer: source.offer || null,
    createdAt: source.createdAt || appliedAt || getToday(),
    updatedAt: source.updatedAt || ''
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
    projectId: normalized.projectId,
    offer: normalized.offer,
    updatedAt: normalized.updatedAt || new Date().toISOString()
  });
}

function getRawList() {
  const list = safeStorageGet(STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
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
  safeStorageSet(STORAGE_KEY, (list || []).map(toStorageShape));
}

function findIndexByIdOrJob(list, record) {
  const id = record && record.id ? String(record.id) : '';
  const sourceJobId = record && record.sourceJobId ? String(record.sourceJobId) : '';
  return (list || []).findIndex(item => {
    const normalized = normalizeRecord(item);
    if (id && String(normalized.id) === id) return true;
    if (sourceJobId && String(normalized.sourceJobId) === sourceJobId) return true;
    return false;
  });
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
  return normalizeRecord(next);
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
  return normalizeRecord(next);
}

function remove(id) {
  const raw = getRawList();
  const next = raw.filter(item => String(normalizeRecord(item).id) !== String(id));
  saveList(next);
  return next.length !== raw.length;
}

function getByJobId(jobId) {
  const target = String(jobId || '');
  if (!target) return null;
  return getList().find(item => String(item.sourceJobId) === target) || null;
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
  getStats,
  getUpcomingDeadlines,
  getTodayInterviews,
  buildDailyAdvice,
  getToday
};

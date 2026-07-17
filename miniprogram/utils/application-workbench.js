const GROUP_META = {
  preparing: { label: '准备中', tone: 'blue', order: 1 },
  applied: { label: '已投递', tone: 'indigo', order: 2 },
  interview: { label: '面试中', tone: 'orange', order: 3 },
  offer: { label: 'Offer', tone: 'green', order: 4 },
  closed: { label: '已结束', tone: 'gray', order: 5 }
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00' : raw.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayDistance(value, now) {
  const target = startOfDay(value);
  const today = startOfDay(now || new Date());
  if (!target || !today) return null;
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

function shortDate(value) {
  const date = parseDate(value);
  if (!date) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function deadlineMeta(value, now) {
  const days = dayDistance(value, now);
  if (days === null) return { label: '未设置截止时间', tone: 'muted', days: null };
  if (days < 0) return { label: `已逾期${Math.abs(days)}天`, tone: 'danger', days };
  if (days === 0) return { label: '今天截止', tone: 'danger', days };
  if (days === 1) return { label: '明天截止', tone: 'warning', days };
  if (days <= 7) return { label: `${days}天后截止`, tone: 'warning', days };
  return { label: `${shortDate(value)}截止`, tone: 'muted', days };
}

function interviewMeta(value, now) {
  const date = parseDate(value);
  if (!date) return null;
  const days = dayDistance(date, now);
  const time = String(value).match(/(?:T|\s)(\d{2}:\d{2})/);
  const dayText = days === 0 ? '今天' : days === 1 ? '明天' : shortDate(date);
  return {
    days,
    label: `${dayText}${time ? ' ' + time[1] : ''}面试`,
    upcoming: days !== null && days >= 0 && days <= 7
  };
}

function enrichApplication(item, now) {
  const group = item.group || 'preparing';
  const groupMeta = GROUP_META[group] || GROUP_META.preparing;
  const deadline = deadlineMeta(item.deadline, now);
  const interview = interviewMeta(item.interviewTime, now);
  const materialCount = [item.resumeId || item.resumeVersionId, item.coverLetter, item.deadline].filter(Boolean).length;
  const materialPercent = Math.round(materialCount / 3 * 100);
  let priority = groupMeta.order * 100;
  if (interview && interview.upcoming) priority = interview.days * 5;
  else if (deadline.days !== null && deadline.days <= 7 && group !== 'closed') priority = 40 + Math.max(deadline.days, -3);

  return Object.assign({}, item, {
    companyInitial: String(item.company || '职').slice(0, 1),
    groupLabel: groupMeta.label,
    statusTone: groupMeta.tone,
    deadlineLabel: deadline.label,
    deadlineTone: deadline.tone,
    deadlineDays: deadline.days,
    interviewLabel: interview ? interview.label : '',
    materialCount,
    materialPercent,
    materialText: `材料 ${materialCount}/3`,
    _priority: priority
  });
}

function buildHighlights(applications, now) {
  const highlights = [];
  const seen = new Set();

  applications.forEach(item => {
    const interview = interviewMeta(item.interviewTime, now);
    if (!interview || !interview.upcoming || seen.has(item.id)) return;
    seen.add(item.id);
    highlights.push({
      id: item.id,
      type: 'interview',
      badge: '面试',
      title: `${item.company || '目标公司'} · ${item.jobTitle || '目标岗位'}`,
      desc: interview.label,
      order: interview.days
    });
  });

  applications.forEach(item => {
    if (item.group === 'closed' || item.deadlineDays === null || item.deadlineDays > 7 || seen.has(item.id)) return;
    seen.add(item.id);
    highlights.push({
      id: item.id,
      type: item.deadlineDays < 0 ? 'danger' : 'deadline',
      badge: item.deadlineDays < 0 ? '逾期' : '截止',
      title: `${item.company || '目标公司'} · ${item.jobTitle || '目标岗位'}`,
      desc: item.deadlineLabel,
      order: 20 + item.deadlineDays
    });
  });

  applications.forEach(item => {
    if (item.group === 'closed' || !item.nextAction || seen.has(item.id)) return;
    seen.add(item.id);
    highlights.push({
      id: item.id,
      type: 'action',
      badge: '下一步',
      title: `${item.company || '目标公司'} · ${item.jobTitle || '目标岗位'}`,
      desc: item.nextAction,
      order: 60 + item._priority
    });
  });

  return highlights.sort((a, b) => a.order - b.order).slice(0, 3);
}

function buildApplicationWorkbench(source, now) {
  const applications = (Array.isArray(source) ? source : [])
    .map(item => enrichApplication(item, now || new Date()))
    .sort((a, b) => a._priority - b._priority);
  const counts = { preparing: 0, applied: 0, interview: 0, offer: 0, closed: 0 };
  applications.forEach(item => { counts[item.group] = (counts[item.group] || 0) + 1; });
  const funnelKeys = ['preparing', 'applied', 'interview', 'offer'];
  const funnelMax = Math.max(1, ...funnelKeys.map(key => counts[key] || 0));
  const funnel = funnelKeys.map(key => ({
    key,
    label: GROUP_META[key].label,
    count: counts[key] || 0,
    width: Math.max(8, Math.round((counts[key] || 0) / funnelMax * 100))
  }));

  return {
    applications,
    counts,
    total: applications.length,
    activeCount: counts.preparing + counts.applied + counts.interview,
    highlights: buildHighlights(applications, now || new Date()),
    funnel
  };
}

function extractBoardData(response) {
  if (!response || typeof response !== 'object') return null;
  if (response.data && response.data.groups) return response.data;
  if (response.groups) return response;
  return null;
}

function groupForLocalStatus(status) {
  const value = String(status || '').trim();
  if (['first_interview', 'second_interview', 'hr_interview', 'phone_screen', 'interview_1', 'interview_2', 'final', 'interview'].includes(value)) return 'interview';
  if (value === 'offer') return 'offer';
  if (['rejected', 'closed', 'withdrawn'].includes(value)) return 'closed';
  if (['applied', 'oa'].includes(value)) return 'applied';
  return 'preparing';
}

function normalizeLocalApplication(item) {
  const source = item || {};
  return {
    id: String(source.id || source.clientId || ('local_' + Date.now())),
    jobId: source.sourceJobId || source.jobId || source.job_id || '',
    sourceJobId: source.sourceJobId || source.jobId || source.job_id || '',
    company: source.company || '',
    jobTitle: source.jobTitle || source.job_title || source.title || '',
    city: source.city || source.location || '',
    status: source.progressStatus || source.currentStatus || source.status || 'collected',
    statusText: source.statusText || '',
    deadline: source.deadline || '',
    interviewTime: source.interviewTime || source.interview_time || '',
    nextAction: source.nextAction || source.next_action || '',
    notes: source.notes || '',
    resumeVersionId: source.resumeVersionId || '',
    coverLetter: source.coverLetter || '',
    group: groupForLocalStatus(source.progressStatus || source.currentStatus || source.status),
    localOnly: true
  };
}

function applicationKey(item) {
  const sourceId = item && (item.sourceJobId || item.jobId || item.job_id);
  if (sourceId) return 'job:' + String(sourceId);
  return `manual:${String(item && item.company || '').trim().toLowerCase()}:${String(item && (item.jobTitle || item.job_title) || '').trim().toLowerCase()}`;
}

function mergeApplicationSources(remoteApplications, localApplications) {
  const remote = Array.isArray(remoteApplications) ? remoteApplications : [];
  const keys = new Set(remote.map(applicationKey));
  const local = (Array.isArray(localApplications) ? localApplications : [])
    .map(normalizeLocalApplication)
    .filter(item => !keys.has(applicationKey(item)));
  return remote.concat(local);
}

module.exports = {
  buildApplicationWorkbench,
  dayDistance,
  deadlineMeta,
  interviewMeta,
  extractBoardData,
  groupForLocalStatus,
  mergeApplicationSources,
  normalizeLocalApplication
};

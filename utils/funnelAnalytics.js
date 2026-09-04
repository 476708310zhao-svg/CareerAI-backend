const { compactCoreRefs, mergeCoreRefs } = require('./coreEntityRefs');

const EVENT_VERSION = 1;
const DATA_CLASSES = Object.freeze(['production', 'demo', 'test', 'system']);
const FUNNEL_STAGES = Object.freeze([
  { stage: 'job_viewed', eventName: 'job_viewed', label: '查看岗位', requiredRefs: ['jobId'] },
  { stage: 'job_matched', eventName: 'job_matched', label: '完成匹配', requiredRefs: ['jobId'] },
  { stage: 'resume_optimized', eventName: 'resume_optimized', label: '确认简历版本', requiredRefs: ['resumeId', 'resumeVersionId'] },
  { stage: 'application_added', eventName: 'application_added', label: '加入申请看板', requiredRefs: ['jobId', 'applicationId'] },
  { stage: 'application_submitted', eventName: 'application_submitted', label: '确认完成投递', requiredRefs: ['jobId', 'applicationId'] },
  { stage: 'interview_reached', eventName: 'interview_reached', label: '进入面试', requiredRefs: ['jobId', 'applicationId'] },
  { stage: 'offer_received', eventName: 'offer_received', label: '收到 Offer', requiredRefs: ['jobId', 'applicationId'] }
]);

const FUNNEL_BY_EVENT = Object.freeze(Object.fromEntries(FUNNEL_STAGES.map(item => [item.eventName, item])));
const NON_PRODUCTION_RE = /(?:^|[_:\-])(mock|demo|test|smoke|fixture|default)(?:[_:\-]|$)/i;

function clean(value, max = 200) {
  return String(value === undefined || value === null ? '' : value).trim().slice(0, max);
}

function normalizeDataClass(value, fallback = 'production') {
  const normalized = clean(value, 30).toLowerCase();
  return DATA_CLASSES.includes(normalized) ? normalized : fallback;
}

function identifierValues(payload = {}) {
  const refs = payload.refs && typeof payload.refs === 'object' ? payload.refs : {};
  return [
    payload.jobId, payload.sourceJobId, payload.applicationId, payload.resumeId,
    payload.resumeVersionId, payload.interviewSpaceId, payload.interviewSessionId,
    payload.interviewReportId, payload.clientId, payload.taskId,
    refs.jobId, refs.applicationId, refs.resumeId, refs.resumeVersionId,
    refs.interviewSpaceId, refs.interviewSessionId, refs.interviewReportId, refs.todayTaskId
  ].map(value => clean(value)).filter(Boolean);
}

function inferDataClass(options = {}) {
  const configured = normalizeDataClass(options.environment, 'production');
  if (configured !== 'production') return configured;
  const explicit = normalizeDataClass(options.explicit, 'production');
  const source = clean(options.source, 80);
  const payload = options.payload && typeof options.payload === 'object' ? options.payload : {};
  const user = options.user && typeof options.user === 'object' ? options.user : {};
  const userMarker = `${clean(user.email, 200)} ${clean(user.nickname || user.nickName, 120)}`;
  const ids = identifierValues(payload);

  if (/\b(test|smoke|fixture)\b/i.test(source) || /smoke[_-].*@example\.com|\b(smoke|test)\s+user\b/i.test(userMarker)) return 'test';
  if (/\b(mock|demo|fixture)\b/i.test(source) || payload.demo === true || payload.mock === true) return 'demo';
  if (ids.some(value => NON_PRODUCTION_RE.test(value))) {
    return ids.some(value => /(?:^|[_:\-])(test|smoke|fixture)(?:[_:\-]|$)/i.test(value)) ? 'test' : 'demo';
  }
  if (explicit === 'test' || explicit === 'demo' || explicit === 'system') return explicit;
  return 'production';
}

function stageForEvent(eventName) {
  return FUNNEL_BY_EVENT[clean(eventName, 100)] || null;
}

function eventForApplicationStatus(status) {
  const value = clean(status, 40);
  if (value === 'applied' || value === 'online_apply' || value === 'oa') return 'application_submitted';
  if (['phone_screen', 'interview_1', 'interview_2', 'final', 'first_interview', 'second_interview', 'hr_interview', 'interview'].includes(value)) return 'interview_reached';
  if (value === 'offer') return 'offer_received';
  return '';
}

function prepareFunnelPayload(userId, eventName, payload = {}) {
  const stage = stageForEvent(eventName);
  if (!stage) throw new Error(`未知漏斗事件：${eventName}`);
  const refs = compactCoreRefs(mergeCoreRefs({ userId }, payload.refs || {}, payload));
  const missingRefs = stage.requiredRefs.filter(key => refs[key] === undefined);
  return {
    ...payload,
    refs,
    eventVersion: EVENT_VERSION,
    funnelStage: stage.stage,
    funnelLabel: stage.label,
    missingRefs
  };
}

module.exports = {
  EVENT_VERSION,
  DATA_CLASSES,
  FUNNEL_STAGES,
  normalizeDataClass,
  inferDataClass,
  stageForEvent,
  eventForApplicationStatus,
  prepareFunnelPayload
};

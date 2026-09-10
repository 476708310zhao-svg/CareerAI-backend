const CORE_REF_KEYS = Object.freeze([
  'userId',
  'jobId',
  'applicationId',
  'resumeId',
  'resumeVersionId',
  'interviewSpaceId',
  'interviewSessionId',
  'interviewReportId',
  'todayTaskId'
]);

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null
    && (typeof value !== 'string' || value.trim() !== ''));
}

function positiveId(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function textId(value, max = 200) {
  return String(value === undefined || value === null ? '' : value).trim().slice(0, max);
}

function canonicalJobId(value = {}) {
  if (typeof value !== 'object' || Array.isArray(value)) return textId(value);
  return textId(firstValue(
    value.sourceJobId,
    value.source_job_id,
    value.jobId,
    value.job_id
  ));
}

function normalizeCoreRefs(value = {}) {
  return {
    userId: positiveId(firstValue(value.userId, value.user_id)),
    jobId: canonicalJobId(value),
    applicationId: positiveId(firstValue(value.applicationId, value.application_id)),
    resumeId: positiveId(firstValue(value.resumeId, value.resume_id)),
    resumeVersionId: positiveId(firstValue(value.resumeVersionId, value.resume_version_id)),
    interviewSpaceId: positiveId(firstValue(value.interviewSpaceId, value.interview_space_id, value.spaceId, value.space_id)),
    interviewSessionId: positiveId(firstValue(value.interviewSessionId, value.interview_session_id, value.sessionId, value.session_id)),
    interviewReportId: positiveId(firstValue(value.interviewReportId, value.interview_report_id, value.reportId, value.report_id)),
    todayTaskId: positiveId(firstValue(value.todayTaskId, value.today_task_id, value.taskId, value.task_id))
  };
}

function mergeCoreRefs(...values) {
  const merged = normalizeCoreRefs();
  values.forEach(value => {
    const current = normalizeCoreRefs(value);
    CORE_REF_KEYS.forEach(key => {
      if ((merged[key] === null || merged[key] === '') && current[key] !== null && current[key] !== '') {
        merged[key] = current[key];
      }
    });
  });
  return merged;
}

function applicationRefs(row = {}) {
  return normalizeCoreRefs({
    userId: firstValue(row.userId, row.user_id),
    sourceJobId: firstValue(row.sourceJobId, row.source_job_id),
    jobId: firstValue(row.jobId, row.job_id),
    applicationId: firstValue(row.applicationId, row.application_id, row.id),
    resumeId: firstValue(row.resumeId, row.resume_id),
    resumeVersionId: firstValue(row.resumeVersionId, row.resume_version_id)
  });
}

function compactCoreRefs(value) {
  const refs = normalizeCoreRefs(value);
  return Object.fromEntries(CORE_REF_KEYS
    .filter(key => refs[key] !== null && refs[key] !== '')
    .map(key => [key, refs[key]]));
}

function withCoreRefs(payload, ...values) {
  return { ...(payload || {}), refs: compactCoreRefs(mergeCoreRefs(...values)) };
}

module.exports = {
  CORE_REF_KEYS,
  positiveId,
  textId,
  canonicalJobId,
  normalizeCoreRefs,
  mergeCoreRefs,
  applicationRefs,
  compactCoreRefs,
  withCoreRefs
};

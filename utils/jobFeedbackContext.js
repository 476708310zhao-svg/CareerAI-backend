const JOB_FEEDBACK_TYPE = '岗位信息纠错';
const REASONS = new Set(['链接失效', '岗位已关闭', '信息有误']);
const SOURCES = new Set(['adzuna', 'remoteok', 'jsearch', 'themuse', 'linkedin', 'indeed', 'external', 'aggregate', 'unknown']);
// Keep this in step with the website's lib/job-feedback.ts. These are user-supplied hints only.
const JOB_ID = /^(?:(?:rok|adz|muse|li|ind)_[A-Za-z0-9][A-Za-z0-9_.-]{0,115}|[A-Za-z0-9_+-]{1,118}={0,2})$/;
const LOCAL_ID = /^[1-9]\d{0,9}$/;

function localJobId(value) {
  if (!LOCAL_ID.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

function parseJobFeedbackContext(type, content) {
  if (type !== JOB_FEEDBACK_TYPE || typeof content !== 'string' || content.length > 500) return null;
  const match = /^岗位问题：(链接失效|岗位已关闭|信息有误)；岗位ID：([^；\s]+)；来源：([a-z]+)(?:；说明：([^\r\n]{1,240}))?$/.exec(content);
  if (!match || !REASONS.has(match[1]) || !JOB_ID.test(match[2]) || !SOURCES.has(match[3])) return null;
  return { reason: match[1], jobId: match[2], source: match[3], localJobId: localJobId(match[2]) };
}

module.exports = { JOB_FEEDBACK_TYPE, parseJobFeedbackContext };

const LINK_KEYS = [
  'applyUrl', 'apply_url', 'applyLink', 'sourceUrl', 'source_url',
  'officialApplyUrl', 'jobLink', 'job_link', 'job_apply_link'
];

function withoutHeldJobLinks(view) {
  const snapshot = { ...(view.jobSnapshot || {}) };
  for (const key of LINK_KEYS) {
    if (Object.hasOwn(snapshot, key)) snapshot[key] = '';
  }
  const result = { ...view, jobSnapshot: snapshot, isApplyAvailable: false,
    applicationNotice: '该岗位已关闭、待人工复核或已删除，历史链接不可作为当前申请入口' };
  for (const key of LINK_KEYS) {
    if (Object.hasOwn(result, key)) result[key] = '';
  }
  return result;
}

module.exports = { withoutHeldJobLinks };

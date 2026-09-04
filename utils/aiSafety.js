const EXECUTION_CLAIM_RE = /(?:已|已经|成功)(?:为你|替你)?(?:创建|保存|更新|修改|提交|投递|发送|执行)|\b(?:i|we)\s+(?:have\s+)?(?:created|saved|updated|submitted|applied|sent|executed)\b/i;

function serialized(value) {
  try { return JSON.stringify(value); } catch (error) { return String(value || ''); }
}

function containsFabricatedExecutionClaim(value) {
  return EXECUTION_CLAIM_RE.test(serialized(value));
}

module.exports = { containsFabricatedExecutionClaim };

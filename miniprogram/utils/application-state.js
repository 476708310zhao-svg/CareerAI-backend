// 移动端展示适配；API 仍使用既有 V4 状态值，不更改服务端状态机。
const LABELS = Object.freeze({
  interested: '已收藏', preparing: '待投递', applied: '已投递', oa: 'OA',
  phone_screen: '电话面试', interview_1: '一面', interview_2: '二面', final: '终面',
  offer: 'Offer', rejected: '已拒绝', withdrawn: '已结束'
});
const ALIASES = Object.freeze({
  collected: 'interested', pending: 'interested', saved: 'interested',
  online_apply: 'preparing', first_interview: 'interview_1',
  second_interview: 'interview_2', hr_interview: 'final', interview: 'interview_1', closed: 'withdrawn',
  '已收藏': 'interested', '感兴趣': 'interested', '待投递': 'preparing',
  '准备申请': 'preparing', '准备中': 'preparing', '网申中': 'preparing',
  '已投递': 'applied', '已申请': 'applied', 'OA 阶段': 'oa', '在线测评': 'oa'
});

function normalizeStatus(value) {
  const raw = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(LABELS, raw) ? raw : (ALIASES[raw] || '');
}

function applicationState(record) {
  const source = record || {};
  const status = normalizeStatus(source.progressStatus || source.currentStatus || source.applicationStatus || source.applyStatus || source.status);
  const submitted = ['applied', 'oa', 'phone_screen', 'interview_1', 'interview_2', 'final', 'offer', 'rejected'];
  return {
    applicationStatus: status,
    inProgress: !!status,
    isApplied: status ? submitted.includes(status) : source.isApplied === true,
    progressStatusText: LABELS[status] || (source.isApplied ? '已投递' : ''),
    isQueued: status === 'preparing'
  };
}

function mobileGroup(status) {
  const value = normalizeStatus(status);
  if (value === 'oa') return 'oa';
  if (['phone_screen', 'interview_1', 'interview_2', 'final'].includes(value)) return 'interview';
  if (['rejected', 'withdrawn'].includes(value)) return 'closed';
  if (value === 'applied' || value === 'offer') return value;
  return 'preparing';
}

module.exports = { LABELS, normalizeStatus, applicationState, mobileGroup };

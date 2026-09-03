const STATUS_TEXT = Object.freeze({
  interested: '感兴趣', preparing: '准备申请', applied: '已申请', oa: '在线测评',
  phone_screen: '电话面试', interview_1: '一轮面试', interview_2: '二轮面试',
  final: '终面', offer: 'Offer', rejected: '已拒绝', withdrawn: '已撤回'
});

const TRANSITIONS = Object.freeze({
  interested: ['preparing', 'withdrawn'],
  preparing: ['interested', 'applied', 'withdrawn'],
  applied: ['oa', 'phone_screen', 'interview_1', 'rejected', 'withdrawn'],
  oa: ['phone_screen', 'interview_1', 'rejected', 'withdrawn'],
  phone_screen: ['interview_1', 'rejected', 'withdrawn'],
  interview_1: ['interview_2', 'final', 'offer', 'rejected', 'withdrawn'],
  interview_2: ['final', 'offer', 'rejected', 'withdrawn'],
  final: ['offer', 'rejected', 'withdrawn'],
  offer: ['withdrawn'],
  rejected: [],
  withdrawn: []
});

const LEGACY_TO_V4 = Object.freeze({
  pending: 'interested', collected: 'interested', online_apply: 'preparing',
  applied: 'applied', viewed: 'applied', oa: 'oa',
  first_interview: 'interview_1', interview: 'interview_1',
  second_interview: 'interview_2', hr_interview: 'final',
  offer: 'offer', rejected: 'rejected', closed: 'withdrawn'
});

const V4_TO_PROGRESS = Object.freeze({
  interested: 'collected', preparing: 'online_apply', applied: 'applied', oa: 'oa',
  phone_screen: 'first_interview', interview_1: 'first_interview',
  interview_2: 'second_interview', final: 'hr_interview', offer: 'offer',
  rejected: 'rejected', withdrawn: 'closed'
});

function toV4Status(row = {}) {
  const explicit = String(row.v4_status || '').trim();
  return STATUS_TEXT[explicit]
    ? explicit
    : LEGACY_TO_V4[row.progress_status] || LEGACY_TO_V4[row.status] || 'interested';
}

function broadStatus(status) {
  if (status === 'offer') return 'offer';
  if (['rejected', 'withdrawn'].includes(status)) return 'rejected';
  if (['phone_screen', 'interview_1', 'interview_2', 'final'].includes(status)) return 'interview';
  if (['applied', 'oa'].includes(status)) return 'applied';
  return 'pending';
}

function boardGroup(status) {
  if (['interested', 'preparing'].includes(status)) return 'preparing';
  if (['applied', 'oa'].includes(status)) return 'applied';
  if (['phone_screen', 'interview_1', 'interview_2', 'final'].includes(status)) return 'interview';
  if (status === 'offer') return 'offer';
  return 'closed';
}

function allowedStatusViews(status) {
  return (TRANSITIONS[status] || []).map(value => ({ value, label: STATUS_TEXT[value] }));
}

module.exports = {
  STATUS_TEXT,
  TRANSITIONS,
  LEGACY_TO_V4,
  V4_TO_PROGRESS,
  toV4Status,
  broadStatus,
  boardGroup,
  allowedStatusViews
};

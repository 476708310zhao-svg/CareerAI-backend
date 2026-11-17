const ALL_ADMIN_PERMISSIONS = [
  'dashboard',
  'features',
  'banners',
  'share',
  'jobs',
  'companies',
  'experiences',
  'questions',
  'questionBankEdit',
  'questionBankPublish',
  'questionAssets',
  'questionRightsReview',
  'questionContentReview',
  'starTemplates',
  'comments',
  'campus',
  'agencies',
  'announcements',
  'feedback',
  'users',
  'memberships',
  'manualServices',
  'resumes',
  'admins'
];

const PERMISSION_LABELS = {
  dashboard: '数据概览',
  features: '功能开关',
  banners: 'Banner 管理',
  share: '分享配置',
  jobs: '岗位管理',
  companies: '公司管理',
  experiences: '面经管理',
  questions: '题库管理',
  questionBankEdit: '人工题库编辑',
  questionBankPublish: '人工题集发布',
  questionAssets: '私有 PDF 素材',
  questionRightsReview: 'PDF 权利审核',
  questionContentReview: 'PDF 内容审核',
  starTemplates: 'STAR 模板',
  comments: '评论管理',
  campus: '校招日历',
  agencies: '机构管理',
  announcements: '资讯公告',
  feedback: '反馈管理',
  users: '用户管理',
  memberships: '会员权益',
  manualServices: '人工服务工单',
  resumes: '简历管理',
  admins: '权限管理'
};

function normalizePermissions(value) {
  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch (_) {
      list = value.split(',');
    }
  }
  if (!Array.isArray(list)) return [];
  if (list.includes('*')) return ['*'];
  return [...new Set(list.filter(item => ALL_ADMIN_PERMISSIONS.includes(item)))];
}

function hasPermission(admin, permission) {
  const permissions = normalizePermissions(admin && admin.permissions);
  return permissions.includes('*') || permissions.includes(permission);
}

function permissionForAdminPath(path = '') {
  // adminAuth receives originalUrl, which includes the query string. Match only
  // the routed pathname, using Express's default case-insensitive routing.
  const pathname = String(path).split(/[?#]/, 1)[0].toLowerCase();
  if (/^\/admin\/api\/v4\/question-assets(?:\/|$)/.test(pathname)) return 'questionAssets';
  // The bank router checks live account permissions per action. A single
  // prefix-level permission here would prevent independent reviewers reading.
  if (/^\/admin\/api\/v4\/question-bank(?:\/|$)/.test(pathname)) return null;
  // The parsing router performs a live account lookup and checks each action.
  if (/^\/admin\/api\/v4\/question-parsing(?:\/|$)/.test(pathname)) return null;
  if (/^\/admin\/api\/v4\/operations\/(?:dashboard|jobs\/quality)$/.test(pathname)) return 'dashboard';
  if (/^\/admin\/api\/v4\/commerce\/(?:overview|alerts(?:\/evaluate|\/\d+)?|refunds\/[A-Za-z0-9_-]+|audit)$/.test(pathname)) return 'memberships';
  if (/^\/admin\/api\/v4\/manual-services(?:\/|$)/.test(pathname)) return 'manualServices';
  if (/\/api\/v4\/assessment-(products|home|orders|companies|instructions)(?:\/|$)/.test(pathname)) return 'memberships';
  if (pathname.includes('/api/stats')) return 'dashboard';
  if (pathname.includes('/api/feature-flags')) return 'features';
  if (pathname.includes('/api/upload/banner') || pathname.includes('/api/banners')) return 'banners';
  if (pathname.includes('/api/upload/share') || pathname.includes('/api/share-configs')) return 'share';
  if (pathname.includes('/api/jobs') || pathname.includes('/api/v4/sponsor-profiles')) return 'jobs';
  if (pathname.includes('/api/companies')) return 'companies';
  if (pathname.includes('/api/experiences')) return 'experiences';
  if (pathname.includes('/api/interview-questions')) return 'questions';
  if (pathname.includes('/api/star-templates')) return 'starTemplates';
  if (pathname.includes('/api/comments') || pathname.includes('/api/comment-replies')) return 'comments';
  if (pathname.includes('/api/campus')) return 'campus';
  if (pathname.includes('/api/agency-reviews') || pathname.includes('/api/agencies')) return 'agencies';
  if (pathname.includes('/api/announcements')) return 'announcements';
  if (pathname.includes('/api/feedbacks')) return 'feedback';
  if (pathname.includes('/api/memberships') || pathname.includes('/api/users/') && pathname.includes('/vip')) return 'memberships';
  if (pathname.includes('/api/users')) return 'users';
  if (pathname.includes('/api/resumes')) return 'resumes';
  if (pathname.includes('/api/admin-accounts') || pathname.includes('/api/admin-permissions')) return 'admins';
  return null;
}

module.exports = {
  ALL_ADMIN_PERMISSIONS,
  PERMISSION_LABELS,
  normalizePermissions,
  hasPermission,
  permissionForAdminPath
};

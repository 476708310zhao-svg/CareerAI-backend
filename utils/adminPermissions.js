const ALL_ADMIN_PERMISSIONS = [
  'dashboard',
  'features',
  'banners',
  'share',
  'jobs',
  'companies',
  'experiences',
  'comments',
  'campus',
  'agencies',
  'announcements',
  'users',
  'memberships',
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
  comments: '评论管理',
  campus: '校招日历',
  agencies: '机构管理',
  announcements: '资讯公告',
  users: '用户管理',
  memberships: '会员权益',
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
  if (path.includes('/api/stats')) return 'dashboard';
  if (path.includes('/api/feature-flags')) return 'features';
  if (path.includes('/api/upload/banner') || path.includes('/api/banners')) return 'banners';
  if (path.includes('/api/upload/share') || path.includes('/api/share-configs')) return 'share';
  if (path.includes('/api/jobs')) return 'jobs';
  if (path.includes('/api/companies')) return 'companies';
  if (path.includes('/api/experiences')) return 'experiences';
  if (path.includes('/api/comments')) return 'comments';
  if (path.includes('/api/campus')) return 'campus';
  if (path.includes('/api/agency-reviews') || path.includes('/api/agencies')) return 'agencies';
  if (path.includes('/api/announcements')) return 'announcements';
  if (path.includes('/api/memberships') || path.includes('/api/users/') && path.includes('/vip')) return 'memberships';
  if (path.includes('/api/users')) return 'users';
  if (path.includes('/api/resumes')) return 'resumes';
  if (path.includes('/api/admin-accounts') || path.includes('/api/admin-permissions')) return 'admins';
  return null;
}

module.exports = {
  ALL_ADMIN_PERMISSIONS,
  PERMISSION_LABELS,
  normalizePermissions,
  hasPermission,
  permissionForAdminPath
};

const config = require('./app-config.js');

const CACHE_KEY = 'publicFeatureFlags_v2';
const REFRESH_INTERVAL = 30 * 1000;
const RECRUITMENT_PATHS = [
  '/pages/jobs/',
  '/package-user/pages/apply-form/',
  '/package-user/pages/job-detail/',
  '/package-user/pages/search/',
  '/package-content/pages/bigtech-jobs/'
];
const MEMBERSHIP_PATHS = [
  '/package-user/pages/vip/vip'
];

let pendingRefresh = null;
let lastRefreshAt = 0;
let redirecting = false;

function defaultFlags() {
  return Object.assign({ recruitment: false, membership: false }, config.DEFAULT_FEATURE_FLAGS || {});
}

function normalizeFlags(value) {
  const defaults = defaultFlags();
  const source = value && typeof value === 'object' ? value : {};
  return {
    recruitment: typeof source.recruitment === 'boolean'
      ? source.recruitment
      : defaults.recruitment,
    membership: typeof source.membership === 'boolean'
      ? source.membership
      : defaults.membership
  };
}

function getCachedFlags() {
  try {
    return normalizeFlags(wx.getStorageSync(CACHE_KEY));
  } catch (e) {
    return defaultFlags();
  }
}

function getCurrentFlags() {
  try {
    const app = getApp();
    if (app && app.globalData && app.globalData.featureFlags) {
      return normalizeFlags(app.globalData.featureFlags);
    }
  } catch (e) {}
  return getCachedFlags();
}

function isRecruitmentEnabled() {
  return getCurrentFlags().recruitment;
}

function isMembershipEnabled() {
  return getCurrentFlags().membership;
}

function isRecruitmentUrl(url) {
  const raw = String(url || '').split('?')[0];
  const normalized = raw.startsWith('/') ? raw : '/' + raw;
  return RECRUITMENT_PATHS.some(path => normalized.indexOf(path) === 0);
}

function isMembershipUrl(url) {
  const raw = String(url || '').split('?')[0];
  const normalized = raw.startsWith('/') ? raw : '/' + raw;
  return MEMBERSHIP_PATHS.some(path => normalized.indexOf(path) === 0);
}

function publishFlags(flags) {
  const normalized = normalizeFlags(flags);
  try { wx.setStorageSync(CACHE_KEY, normalized); } catch (e) {}

  let app = null;
  try { app = getApp(); } catch (e) {}
  if (app && app.globalData) {
    app.globalData.featureFlags = normalized;
    if (typeof app.syncCustomTabBar === 'function') app.syncCustomTabBar();
  }

  const pages = getCurrentPages();
  pages.forEach(page => {
    if (typeof page._onFeatureFlagsChange === 'function') {
      try { page._onFeatureFlagsChange(normalized); } catch (e) {}
    }
  });
  return normalized;
}

function refreshFeatureFlags(options) {
  const force = !!(options && options.force);
  if (!force && Date.now() - lastRefreshAt < REFRESH_INTERVAL) {
    return Promise.resolve(getCurrentFlags());
  }
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = new Promise(resolve => {
    wx.request({
      url: config.API_BASE_URL + '/api/features',
      method: 'GET',
      timeout: 5000,
      success: res => {
        const data = res && res.data;
        if (res.statusCode === 200 && data && data.code === 0 && data.data) {
          lastRefreshAt = Date.now();
          resolve(publishFlags(data.data));
          return;
        }
        resolve(getCurrentFlags());
      },
      fail: () => resolve(getCurrentFlags()),
      complete: () => { pendingRefresh = null; }
    });
  });
  return pendingRefresh;
}

function redirectToAvailablePage(message) {
  if (redirecting) return;
  redirecting = true;
  wx.showToast({ title: message || '功能暂未开放', icon: 'none' });
  setTimeout(() => {
    const pages = getCurrentPages();
    const finish = () => { redirecting = false; };
    if (pages.length > 1) {
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }), complete: finish });
    } else {
      wx.switchTab({ url: '/pages/index/index', complete: finish });
    }
  }, 300);
}

function guardRecruitmentPage() {
  if (!isRecruitmentEnabled()) {
    redirectToAvailablePage('职位功能暂未开放');
    return false;
  }
  refreshFeatureFlags().then(flags => {
    if (!flags.recruitment) redirectToAvailablePage('职位功能暂未开放');
  });
  return true;
}

function guardMembershipPage() {
  if (!isMembershipEnabled()) {
    redirectToAvailablePage('功能暂未开放');
    return false;
  }
  refreshFeatureFlags().then(flags => {
    if (!flags.membership) redirectToAvailablePage('功能暂未开放');
  });
  return true;
}

function allowNavigation(url) {
  if (isMembershipUrl(url)) {
    if (isMembershipEnabled()) return true;
    wx.showToast({ title: '功能暂未开放', icon: 'none' });
    return false;
  }
  if (!isRecruitmentUrl(url) || isRecruitmentEnabled()) return true;
  wx.showToast({ title: '职位功能暂未开放', icon: 'none' });
  return false;
}

module.exports = {
  allowNavigation,
  getCachedFlags,
  getCurrentFlags,
  guardMembershipPage,
  guardRecruitmentPage,
  isMembershipEnabled,
  isMembershipUrl,
  isRecruitmentEnabled,
  isRecruitmentUrl,
  refreshFeatureFlags
};

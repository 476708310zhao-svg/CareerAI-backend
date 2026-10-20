const config = require('./app-config.js');

const CACHE_KEY = 'publicFeatureFlags_v3';
const LEGACY_CACHE_KEY = 'publicFeatureFlags_v2';
const REFRESH_INTERVAL = 30 * 1000;
const MEMBERSHIP_VERIFICATION_TTL = 5 * 60 * 1000;
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
let lastMembershipVerifiedAt = 0;
let lastAuthoritativeFlags = null;
let redirecting = false;

function defaultFlags() {
  return Object.assign({
    recruitment: false,
    home_recommendations: false,
    membership: false
  }, config.DEFAULT_FEATURE_FLAGS || {});
}

function normalizeFlags(value) {
  const defaults = defaultFlags();
  const source = value && typeof value === 'object' ? value : {};
  return {
    recruitment: typeof source.recruitment === 'boolean'
      ? source.recruitment
      : defaults.recruitment,
    home_recommendations: typeof source.home_recommendations === 'boolean'
      ? source.home_recommendations
      : defaults.home_recommendations,
    membership: typeof source.membership === 'boolean'
      ? source.membership
      : defaults.membership
  };
}

function readCachedFlags() {
  try {
    const current = wx.getStorageSync(CACHE_KEY);
    if (current && typeof current === 'object' && current.flags && typeof current.flags === 'object'
      && Number.isFinite(Number(current.verifiedAt)) && Number(current.verifiedAt) > 0) {
      return current.flags;
    }
    // v2 stored bare flags with no verification time. Preserve its explicit
    // recruitment state, but never treat an old membership=true as live.
    const legacy = wx.getStorageSync(LEGACY_CACHE_KEY);
    return legacy && typeof legacy === 'object' ? legacy : null;
  } catch (e) { return null; }
}

function safeFlags(value) {
  const flags = normalizeFlags(value);
  const age = Date.now() - lastMembershipVerifiedAt;
  if (!lastMembershipVerifiedAt || age < 0 || age > MEMBERSHIP_VERIFICATION_TTL) {
    flags.membership = false;
  }
  return flags;
}

function getCachedFlags() {
  if (lastAuthoritativeFlags) return safeFlags(lastAuthoritativeFlags);
  const cached = readCachedFlags();
  return safeFlags(cached || defaultFlags());
}

function getCurrentFlags() {
  // A response verified in this session wins over storage (including when a
  // storage write failed). Persisted false remains authoritative on restart;
  // persisted membership=true is masked until a fresh successful response.
  if (lastAuthoritativeFlags) return safeFlags(lastAuthoritativeFlags);
  const cached = readCachedFlags();
  if (cached) return safeFlags(cached);
  try {
    const app = getApp();
    const flags = app && app.globalData && app.globalData.featureFlags;
    if (flags && ['recruitment', 'home_recommendations', 'membership']
      .some(key => typeof flags[key] === 'boolean')) {
      return safeFlags(app.globalData.featureFlags);
    }
  } catch (e) {}
  return safeFlags(defaultFlags());
}

function isRecruitmentEnabled() {
  return getCurrentFlags().recruitment;
}

function isMembershipEnabled() {
  return getCurrentFlags().membership;
}

function isHomeRecommendationsEnabled() {
  const flags = getCurrentFlags();
  return flags.recruitment && flags.home_recommendations;
}

function isRecruitmentUrl(url) {
  const raw = String(url || '').split('?')[0];
  const normalized = raw.startsWith('/') ? raw : '/' + raw;
  return RECRUITMENT_PATHS.some(path => normalized.indexOf(path) === 0);
}

function isJobsTab(url) {
  const raw = String(url || '').split('?')[0].replace(/^\/+/, '');
  return raw === 'pages/jobs/jobs';
}

function isMembershipUrl(url) {
  const raw = String(url || '').split('?')[0];
  const normalized = raw.startsWith('/') ? raw : '/' + raw;
  return MEMBERSHIP_PATHS.some(path => normalized.indexOf(path) === 0);
}

function notifyFlags(flags) {
  let app = null;
  try { app = getApp(); } catch (e) {}
  if (app && app.globalData) {
    app.globalData.featureFlags = flags;
    if (typeof app.syncCustomTabBar === 'function') app.syncCustomTabBar();
  }

  const pages = getCurrentPages();
  pages.forEach(page => {
    if (typeof page._onFeatureFlagsChange === 'function') {
      try { page._onFeatureFlagsChange(flags); } catch (e) {}
    }
  });
  return flags;
}

function publishFlags(flags) {
  const normalized = normalizeFlags(flags);
  lastMembershipVerifiedAt = Date.now();
  lastAuthoritativeFlags = normalized;
  try { wx.setStorageSync(CACHE_KEY, { flags: normalized, verifiedAt: lastMembershipVerifiedAt }); } catch (e) {}
  return notifyFlags(safeFlags(normalized));
}

function markFeatureStateUnavailable() {
  lastRefreshAt = Date.now();
  lastMembershipVerifiedAt = 0;
  // Keep persisted non-commercial flags, but immediately hide paid entry
  // points on visible pages when the authority cannot be reached.
  return notifyFlags(getCurrentFlags());
}

function refreshFeatureFlags(options) {
  const force = !!(options && options.force);
  if (!force && Date.now() - lastRefreshAt < REFRESH_INTERVAL) {
    return Promise.resolve(getCurrentFlags());
  }
  if (pendingRefresh) return pendingRefresh;

  const refresh = new Promise(resolve => {
    wx.request({
      url: (config.CONTENT_API_BASE_URL || config.API_BASE_URL) + '/api/features',
      method: 'GET',
      timeout: 5000,
      success: res => {
        const data = res && res.data;
        if (res.statusCode === 200 && data && data.code === 0 && data.data) {
          lastRefreshAt = Date.now();
          resolve(publishFlags(data.data));
          return;
        }
        resolve(markFeatureStateUnavailable());
      },
      fail: () => resolve(markFeatureStateUnavailable())
    });
  });
  pendingRefresh = refresh;
  refresh.then(() => { if (pendingRefresh === refresh) pendingRefresh = null; });
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

function guardRecruitmentPage(options) {
  if (options && options.stayOnJobsTab) {
    refreshFeatureFlags();
    return true;
  }
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
  if (isJobsTab(url)) return true;
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
  isHomeRecommendationsEnabled,
  isMembershipEnabled,
  isMembershipUrl,
  isRecruitmentEnabled,
  isRecruitmentUrl,
  refreshFeatureFlags
};

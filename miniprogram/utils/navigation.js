const TAB_PAGES = new Set([
  '/pages/index/index',
  '/pages/resources/resources',
  '/pages/applications/applications',
  '/pages/ai-career/ai-career',
  '/pages/profile/profile'
]);

const ROUTE_LOCK_MS = 850;
const ROUTE_COMPLETE_GRACE_MS = 220;
const ROUTE_STALE_MS = 1800;

const rawRouteMethods = {};
let routeLockKey = '';
let routeLockAt = 0;
let routeLockId = 0;
let unlockTimer = null;

function normalizePath(url) {
  const path = String(url || '').split('?')[0].replace(/^\/+/, '');
  return path ? '/' + path : '';
}

function normalizeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  return raw.charAt(0) === '/' ? raw : '/' + raw;
}

function isTabPage(url) {
  return TAB_PAGES.has(normalizePath(url));
}

function getCurrentPage() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  return pages[pages.length - 1] || null;
}

function encodeQuery(options) {
  const source = options || {};
  return Object.keys(source)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(source[key])}`)
    .join('&');
}

function isCurrentPage(url) {
  const targetPath = normalizePath(url).replace(/^\/+/, '');
  if (!targetPath) return false;

  const current = getCurrentPage();
  if (!current || current.route !== targetPath) return false;

  const targetQuery = String(url || '').split('?')[1] || '';
  if (!targetQuery) return true;

  return targetQuery === encodeQuery(current.options);
}

function getRawRouteMethod(methodName) {
  if (rawRouteMethods[methodName]) return rawRouteMethods[methodName];
  if (typeof wx === 'undefined' || !wx) return null;
  return wx[methodName];
}

function clearUnlockTimer() {
  if (unlockTimer) clearTimeout(unlockTimer);
  unlockTimer = null;
}

function releaseRoute(id, delay) {
  clearUnlockTimer();
  unlockTimer = setTimeout(() => {
    if (routeLockId === id) {
      routeLockKey = '';
      routeLockAt = 0;
    }
  }, delay === undefined ? ROUTE_COMPLETE_GRACE_MS : delay);
}

function acquireRoute(key, lockMs) {
  const now = Date.now();
  const maxAge = Math.max(lockMs || ROUTE_LOCK_MS, ROUTE_STALE_MS);
  if (routeLockKey && now - routeLockAt < maxAge) return 0;

  routeLockKey = key;
  routeLockAt = now;
  routeLockId += 1;
  clearUnlockTimer();
  return routeLockId;
}

function invokeCallback(fn, payload) {
  if (typeof fn !== 'function') return;
  try { fn(payload); } catch (e) {}
}

function withDefaultFail(options) {
  const routeOptions = Object.assign({}, options || {});
  if (typeof routeOptions.fail !== 'function') {
    routeOptions.fail = () => {
      if (typeof wx !== 'undefined' && wx && typeof wx.showToast === 'function') {
        wx.showToast({ title: '\u9875\u9762\u6253\u5f00\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5', icon: 'none' });
      }
    };
  }
  return routeOptions;
}

function buildRouteKey(methodName, params) {
  if (methodName === 'navigateBack') {
    const delta = params && params.delta ? Number(params.delta) || 1 : 1;
    return `navigateBack:${delta}`;
  }
  return `${methodName}:${normalizeUrl(params && params.url)}`;
}

function shouldSkipRoute(methodName, params) {
  const url = params && params.url;
  if (!url) return methodName !== 'navigateBack';
  if (methodName === 'switchTab' && isCurrentPage(url)) return true;
  return false;
}

function runRoute(methodName, params, options) {
  const routeParams = Object.assign({}, params || {});
  const rawMethod = getRawRouteMethod(methodName);
  if (!rawMethod || shouldSkipRoute(methodName, routeParams)) return false;

  const lockMs = (options && options.lockMs) || routeParams.lockMs || ROUTE_LOCK_MS;
  const key = buildRouteKey(methodName, routeParams);
  const routeId = acquireRoute(key, lockMs);
  if (!routeId) {
    invokeCallback(routeParams.complete, { errMsg: `${methodName}: route busy` });
    return false;
  }

  const userSuccess = routeParams.success;
  const userFail = routeParams.fail;
  const userComplete = routeParams.complete;
  delete routeParams.lockMs;

  routeParams.success = res => {
    invokeCallback(userSuccess, res);
  };
  routeParams.fail = err => {
    releaseRoute(routeId, 0);
    invokeCallback(userFail, err);
  };
  routeParams.complete = res => {
    releaseRoute(routeId);
    invokeCallback(userComplete, res);
  };

  try {
    rawMethod.call(wx, routeParams);
  } catch (err) {
    releaseRoute(routeId, 0);
    throw err;
  }
  return true;
}

function safeNavigateTo(url, options) {
  const target = normalizeUrl(url);
  if (!target || isCurrentPage(target)) return false;
  const methodName = isTabPage(target) ? 'switchTab' : 'navigateTo';
  const routeOptions = withDefaultFail(options);
  return runRoute(methodName, Object.assign(routeOptions, { url: target }), routeOptions);
}

function safeRedirectTo(url, options) {
  const target = normalizeUrl(url);
  if (!target) return false;
  const routeOptions = withDefaultFail(options);
  return runRoute('redirectTo', Object.assign(routeOptions, { url: target }), routeOptions);
}

function safeSwitchTab(url, options) {
  const target = normalizeUrl(url);
  if (!target || !isTabPage(target) || isCurrentPage(target)) return false;
  const routeOptions = withDefaultFail(options);
  return runRoute('switchTab', Object.assign(routeOptions, { url: target }), routeOptions);
}

function safeReLaunch(url, options) {
  const target = normalizeUrl(url);
  if (!target) return false;
  const routeOptions = withDefaultFail(options);
  return runRoute('reLaunch', Object.assign(routeOptions, { url: target }), routeOptions);
}

function safeNavigateBack(options) {
  return runRoute('navigateBack', options || {}, options);
}

function installRouteGuard() {
  if (typeof wx === 'undefined' || !wx || wx.__jobappRouteGuardInstalled) return false;

  ['navigateTo', 'redirectTo', 'switchTab', 'reLaunch', 'navigateBack'].forEach(methodName => {
    if (typeof wx[methodName] !== 'function') return;
    rawRouteMethods[methodName] = wx[methodName];
    wx[methodName] = function(params) {
      return runRoute(methodName, params || {});
    };
  });

  wx.__jobappRouteGuardInstalled = true;
  return true;
}

module.exports = {
  installRouteGuard,
  isTabPage,
  normalizePath,
  safeNavigateBack,
  safeNavigateTo,
  safeRedirectTo,
  safeReLaunch,
  safeSwitchTab
};

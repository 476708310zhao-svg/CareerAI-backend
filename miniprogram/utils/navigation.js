const TAB_PAGES = new Set([
  '/pages/index/index',
  '/pages/jobs/jobs',
  '/pages/experiences/experiences',
  '/pages/campus/campus',
  '/pages/profile/profile'
]);

let pendingUrl = '';
let pendingAt = 0;

function normalizePath(url) {
  const path = String(url || '').split('?')[0].replace(/^\/+/, '');
  return path ? '/' + path : '';
}

function isTabPage(url) {
  return TAB_PAGES.has(normalizePath(url));
}

function isCurrentPage(url) {
  const path = normalizePath(url).replace(/^\/+/, '');
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  return !!(current && current.route === path);
}

function unlock(url, delay) {
  setTimeout(() => {
    if (pendingUrl === url) pendingUrl = '';
  }, delay || 500);
}

function safeNavigateTo(url, options) {
  const target = String(url || '');
  if (!target) return false;
  const now = Date.now();
  const lockMs = (options && options.lockMs) || 900;
  if (pendingUrl === target && now - pendingAt < lockMs) return false;

  pendingUrl = target;
  pendingAt = now;

  if (isCurrentPage(target)) {
    unlock(target, 100);
    return false;
  }

  const method = isTabPage(target) ? wx.switchTab : wx.navigateTo;
  method({
    url: target,
    success: options && options.success,
    fail: (err) => {
      if (options && typeof options.fail === 'function') {
        options.fail(err);
      } else {
        wx.showToast({ title: '页面打开失败，请重试', icon: 'none' });
      }
    },
    complete: (res) => {
      unlock(target, 500);
      if (options && typeof options.complete === 'function') {
        options.complete(res);
      }
    }
  });
  return true;
}

module.exports = {
  isTabPage,
  normalizePath,
  safeNavigateTo
};

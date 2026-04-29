// utils/util.js — 全局工具函数（日期 / 格式化 / UI / 导航）

// ─── TabBar 页面路径列表（用于判断 switchTab vs navigateTo）─────────
const TAB_URLS = [
  '/pages/index/index',
  '/pages/jobs/jobs',
  '/pages/experiences/experiences',
  '/pages/agencies/agencies',
  '/pages/profile/profile'
];

// ══════════════════════════════════════════════════════════════
// 导航
// ══════════════════════════════════════════════════════════════

/**
 * 统一导航：自动判断 switchTab / navigateTo
 * @param {string} url - 目标页面路径
 */
const navigateTo = (url) => {
  if (TAB_URLS.some(p => url.startsWith(p))) {
    wx.switchTab({ url });
  } else {
    wx.navigateTo({ url });
  }
};

// ══════════════════════════════════════════════════════════════
// 日期 / 时间
// ══════════════════════════════════════════════════════════════

/**
 * 格式化为 'YYYY-MM-DD HH:mm' 或 'YYYY-MM-DD'
 * @param {number|Date|string} input - 时间戳(ms)、Date 对象或 ISO 字符串
 * @param {boolean} [withTime=true]
 * @returns {string}
 */
const formatDate = (input, withTime) => {
  if (withTime === undefined) withTime = true;
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '--';
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (!withTime) return `${y}-${mo}-${day}`;
  const h   = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day} ${h}:${min}`;
};

/**
 * 相对时间：今天 / 昨天 / N天前 / N个月前 / N年前
 * @param {number|Date|string} input
 * @returns {string}
 */
const fromNow = (input) => {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '--';
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 30)  return `${diff}天前`;
  if (diff < 365) return `${Math.floor(diff / 30)}个月前`;
  return `${Math.floor(diff / 365)}年前`;
};

/**
 * 精细相对时间：刚刚 / N分钟前 / N小时前，超过一天走 fromNow
 * @param {number|Date|string} input
 * @returns {string}
 */
const formatTimeAgo = (input) => {
  if (!input) return '';
  const d    = input instanceof Date ? input : new Date(input);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours   = Math.floor(diff / 3600000);
  if (minutes < 1)  return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours   < 24) return `${hours}小时前`;
  return fromNow(d);
};

// ══════════════════════════════════════════════════════════════
// 薪资格式化
// ══════════════════════════════════════════════════════════════

/**
 * 格式化薪资数值
 * @param {number} salary
 * @param {'CNY'|'USD'|'GBP'|'HKD'} [currency='CNY']
 * @returns {string}
 */
const formatSalary = (salary, currency) => {
  if (currency === undefined) currency = 'CNY';
  if (!salary) return '面议';
  const symbols = { CNY: '¥', USD: '$', GBP: '£', HKD: 'HK$' };
  const symbol = symbols[currency] || '';
  if (salary >= 10000) return `${symbol}${(salary / 10000).toFixed(1)}万`;
  return `${symbol}${salary}`;
};

/**
 * 格式化薪资区间（JSearch API 原始数值 → "$140k - $180k"）
 * @param {number} min - 最低薪资（原始值，如 140000）
 * @param {number} max - 最高薪资
 * @returns {string}
 */
const formatSalaryRange = (min, max) => {
  if (!min || !max) return 'Negotiable';
  return `$${Math.round(min / 1000)}k - $${Math.round(max / 1000)}k`;
};

// ══════════════════════════════════════════════════════════════
// UI 快捷方法
// ══════════════════════════════════════════════════════════════

const showToast = (title, icon) => {
  wx.showToast({ title, icon: icon || 'none', duration: 2000 });
};

const showLoading = (title) => {
  wx.showLoading({ title: title || '加载中...', mask: true });
};

const hideLoading = () => {
  wx.hideLoading();
};

/**
 * Promise 化的确认弹窗
 * @param {string} content
 * @param {string} [title='提示']
 * @returns {Promise<boolean>}
 */
const showConfirm = (content, title) => {
  return new Promise((resolve) => {
    wx.showModal({
      title: title || '提示',
      content,
      success: (res) => resolve(res.confirm)
    });
  });
};

// ══════════════════════════════════════════════════════════════
// 函数控流
// ══════════════════════════════════════════════════════════════

const throttle = (fn, delay) => {
  delay = delay || 300;
  let timer = null;
  return function() {
    if (timer) return;
    const args = arguments;
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
};

const debounce = (fn, delay) => {
  delay = delay || 300;
  let timer = null;
  return function() {
    if (timer) clearTimeout(timer);
    const args = arguments;
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
};

// ══════════════════════════════════════════════════════════════
// 导出
// ══════════════════════════════════════════════════════════════

module.exports = {
  // 导航
  navigateTo,
  // 日期
  formatDate,
  fromNow,
  formatTimeAgo,
  // 薪资
  formatSalary,
  formatSalaryRange,
  // UI
  showToast,
  showLoading,
  hideLoading,
  showConfirm,
  // 控流
  throttle,
  debounce
};

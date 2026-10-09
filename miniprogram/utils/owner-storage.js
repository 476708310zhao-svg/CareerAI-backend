const progress = require('./job-progress.js');

function ownerScope() {
  let value = '';
  try { value = progress.currentOwnerScope ? String(progress.currentOwnerScope() || '') : ''; } catch (error) {}
  return value || 'guest';
}

function key(base, suffix) {
  return keyFor(ownerScope(), base, suffix);
}

function keyFor(scope, base, suffix) {
  return `${base}:${String(scope || 'guest')}${suffix === undefined || suffix === null || suffix === '' ? '' : `:${String(suffix)}`}`;
}

function get(base, suffix, fallback) {
  try {
    const value = wx.getStorageSync(key(base, suffix));
    return value === undefined || value === null || value === '' ? fallback : value;
  } catch (error) { return fallback; }
}

function set(base, suffix, value) {
  wx.setStorageSync(key(base, suffix), value);
  return value;
}

function remove(base, suffix) {
  try { wx.removeStorageSync(key(base, suffix)); } catch (error) {}
}

function capture() { return ownerScope(); }
function isCurrent(scope) { return String(scope || '') === ownerScope(); }

module.exports = { ownerScope, key, keyFor, get, set, remove, capture, isCurrent };

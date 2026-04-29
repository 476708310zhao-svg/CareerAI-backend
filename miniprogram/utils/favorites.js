// utils/favorites.js - 收藏管理工具（跨页面统一）
const STORAGE_KEY = 'userFavorites';
const API_BASE = require('./config.js').API_BASE_URL;

function _getAll() {
  return wx.getStorageSync(STORAGE_KEY) || {
    job: [],
    experience: [],
    company: [],
    agency: [],
    campus: []
  };
}

function _saveAll(data) {
  wx.setStorageSync(STORAGE_KEY, data);
}

function _syncToServer(method, payload) {
  const token = wx.getStorageSync('token');
  if (!token) return;
  wx.request({
    url: API_BASE + '/api/favorites',
    method,
    data: payload,
    header: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    fail: () => {}
  });
}

// 添加收藏
function add(type, item) {
  const all = _getAll();
  if (!all[type]) all[type] = [];
  // 去重
  const exists = all[type].some(f => f.targetId === item.targetId);
  if (exists) return false;
  item.createdAt = new Date().toISOString().slice(0, 10);
  all[type].unshift(item);
  _saveAll(all);
  _syncToServer('POST', {
    type,
    targetId: item.targetId,
    title: item.title || '',
    subtitle: item.subtitle || item.company || item.type || ''
  });
  return true;
}

// 移除收藏
function remove(type, targetId) {
  const all = _getAll();
  if (!all[type]) return false;
  const idx = all[type].findIndex(f => f.targetId === targetId);
  if (idx === -1) return false;
  all[type].splice(idx, 1);
  _saveAll(all);
  _syncToServer('DELETE', { type, targetId });
  return true;
}

// 检查是否已收藏
function isFavorited(type, targetId) {
  const all = _getAll();
  if (!all[type]) return false;
  return all[type].some(f => f.targetId === targetId);
}

// 获取某类收藏列表
function getList(type) {
  const all = _getAll();
  return all[type] || [];
}

// 获取全部收藏（带分类）
function getAll() {
  return _getAll();
}

// 获取收藏总数
function getCount(type) {
  if (type) return getList(type).length;
  const all = _getAll();
  return (all.job || []).length + (all.experience || []).length + (all.company || []).length;
}

// 切换收藏状态
function toggle(type, item, title, subtitle) {
  if (typeof item === 'string') {
    item = { targetId: item, title: title || '', subtitle: subtitle || '' };
  }
  if (isFavorited(type, item.targetId)) {
    remove(type, item.targetId);
    return false;
  } else {
    add(type, item);
    return true;
  }
}

module.exports = { add, remove, isFavorited, getList, getAll, getCount, toggle };

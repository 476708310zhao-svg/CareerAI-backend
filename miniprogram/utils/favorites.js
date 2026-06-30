// utils/favorites.js - 收藏管理工具（跨页面统一）
const STORAGE_KEY = 'userFavorites';
const API_BASE = require('./app-config.js').API_BASE_URL;
const reminders = require('./reminders.js');
const SYNC_TTL = 2 * 60 * 1000;
let _syncPending = null;
let _lastSyncAt = 0;

function _getAll() {
  return _ensureShape(wx.getStorageSync(STORAGE_KEY) || {
    job: [],
    experience: [],
    company: [],
    agency: [],
    campus: []
  });
}

function _saveAll(data) {
  wx.setStorageSync(STORAGE_KEY, data);
}

function _ensureShape(data) {
  return Object.assign({
    job: [],
    experience: [],
    company: [],
    agency: [],
    campus: []
  }, data || {});
}

function _mergeLists(localList, remoteList) {
  const merged = [];
  const seen = new Set();
  (localList || []).forEach(item => {
    if (!item || item.targetId === undefined || item.targetId === null) return;
    const normalized = Object.assign({}, item, { targetId: String(item.targetId) });
    seen.add(normalized.targetId);
    merged.push(normalized);
  });
  (remoteList || []).forEach(item => {
    if (!item || item.targetId === undefined || item.targetId === null) return;
    const targetId = String(item.targetId);
    if (seen.has(targetId)) return;
    seen.add(targetId);
    merged.push(Object.assign({}, item, { targetId }));
  });
  return merged.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
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

function _pushLocalMissingToServer(localAll, remoteAll) {
  const remoteKeys = new Set();
  Object.keys(remoteAll).forEach(type => {
    (remoteAll[type] || []).forEach(item => remoteKeys.add(type + ':' + String(item.targetId)));
  });
  Object.keys(localAll).forEach(type => {
    (localAll[type] || []).forEach(item => {
      const key = type + ':' + String(item.targetId);
      if (remoteKeys.has(key)) return;
      _syncToServer('POST', {
        type,
        targetId: item.targetId,
        title: item.title || '',
        subtitle: item.subtitle || item.company || item.type || ''
      });
    });
  });
}

function syncFromServer() {
  const token = wx.getStorageSync('token');
  if (!token) return Promise.resolve(_getAll());
  if (_syncPending) return _syncPending;
  if (Date.now() - _lastSyncAt < SYNC_TTL) return Promise.resolve(_getAll());

  _syncPending = new Promise(resolve => {
    wx.request({
      url: API_BASE + '/api/favorites',
      method: 'GET',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      success: (res) => {
        const remoteRows = res.statusCode === 200 && res.data && Array.isArray(res.data.data)
          ? res.data.data
          : [];
        const localAll = _ensureShape(_getAll());
        const remoteAll = _ensureShape({});
        remoteRows.forEach(row => {
          const type = row.type || 'job';
          if (!remoteAll[type]) remoteAll[type] = [];
          remoteAll[type].push({
            targetId: String(row.targetId),
            title: row.title || '',
            subtitle: row.subtitle || '',
            createdAt: row.createdAt || ''
          });
        });

        const merged = _ensureShape({});
        Object.keys(merged).forEach(type => {
          merged[type] = _mergeLists(localAll[type], remoteAll[type]);
        });
        _saveAll(merged);
        _pushLocalMissingToServer(localAll, remoteAll);
        _lastSyncAt = Date.now();
        resolve(merged);
      },
      fail: () => resolve(_getAll()),
      complete: () => {
        _syncPending = null;
      }
    });
  });
  return _syncPending;
}

// 添加收藏
function add(type, item) {
  const all = _getAll();
  if (!all[type]) all[type] = [];
  // 去重
  const exists = all[type].some(f => String(f.targetId) === String(item.targetId));
  if (exists) return false;
  item.createdAt = new Date().toISOString().slice(0, 10);
  all[type].unshift(item);
  _saveAll(all);
  _lastSyncAt = 0;
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
  const idx = all[type].findIndex(f => String(f.targetId) === String(targetId));
  if (idx === -1) return false;
  all[type].splice(idx, 1);
  _saveAll(all);
  _lastSyncAt = 0;
  _syncToServer('DELETE', { type, targetId });
  if (type === 'job') {
    reminders.disableReminder('favorite_job', targetId, 'deadline');
  }
  return true;
}

function update(type, targetId, patch) {
  const all = _getAll();
  if (!all[type]) return false;
  const idx = all[type].findIndex(f => String(f.targetId) === String(targetId));
  if (idx === -1) return false;
  all[type][idx] = Object.assign({}, all[type][idx], patch || {}, {
    updatedAt: new Date().toISOString()
  });
  _saveAll(all);
  return true;
}

// 检查是否已收藏
function isFavorited(type, targetId) {
  const all = _getAll();
  if (!all[type]) return false;
  return all[type].some(f => String(f.targetId) === String(targetId));
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
  return Object.keys(_ensureShape(all)).reduce((sum, key) => sum + ((all[key] || []).length), 0);
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

module.exports = { add, remove, update, isFavorited, getList, getAll, getCount, toggle, syncFromServer };

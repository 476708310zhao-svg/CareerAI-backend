// 收藏管理：本地即时响应 + 幂等 outbox + 服务端 tombstone 合并。
const apiFavorites = require('./api-favorites.js');
const reminders = require('./reminders.js');
const favoriteReminder = require('./favorite-reminder.js');

const STORAGE_KEY = 'userFavorites';
const OUTBOX_KEY = 'favoriteSyncOutboxV4';
const TYPES = ['job', 'experience', 'company', 'agency', 'campus'];
const SYNC_TTL = 2 * 60 * 1000;
let _syncPending = null;
let _flushPending = null;
let _lastSyncAt = 0;

function _ensureShape(data) {
  const result = {};
  TYPES.forEach(type => { result[type] = Array.isArray(data && data[type]) ? data[type] : []; });
  return result;
}

function _getAll() {
  return _ensureShape(wx.getStorageSync(STORAGE_KEY) || {});
}

function _saveAll(data) {
  wx.setStorageSync(STORAGE_KEY, _ensureShape(data));
}

function _readOutbox() {
  try { return wx.getStorageSync(OUTBOX_KEY) || {}; } catch (error) { return {}; }
}

function _saveOutbox(outbox) {
  try { wx.setStorageSync(OUTBOX_KEY, outbox || {}); } catch (error) {}
}

function _key(type, targetId) {
  return String(type) + ':' + String(targetId);
}

function _operationId(type, targetId) {
  return 'fav_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10) + '_' + _key(type, targetId);
}

function _queue(action, type, targetId, item) {
  const outbox = _readOutbox();
  const key = _key(type, targetId);
  const updatedAt = new Date().toISOString();
  outbox[key] = {
    operationId: _operationId(type, targetId), action, type, targetId: String(targetId), updatedAt,
    title: item && item.title || '',
    subtitle: item && (item.subtitle || item.company || item.type) || '',
    payload: item || {}
  };
  _saveOutbox(outbox);
  return outbox[key];
}

function _hasToken() {
  try { return !!wx.getStorageSync('token'); } catch (error) { return false; }
}

function _flushOutbox() {
  if (!_hasToken()) return Promise.resolve(false);
  if (_flushPending) return _flushPending;
  const operations = Object.keys(_readOutbox()).map(key => ({ key, operation: _readOutbox()[key] }));
  _flushPending = operations.reduce((promise, entry) => promise.then(() => {
    const operation = entry.operation;
    const request = operation.action === 'delete' ? apiFavorites.remove : apiFavorites.upsert;
    return request(operation).then(() => {
      const latest = _readOutbox();
      if (latest[entry.key] && latest[entry.key].operationId === operation.operationId) {
        delete latest[entry.key];
        _saveOutbox(latest);
      }
    }).catch(() => {});
  }), Promise.resolve()).then(() => true).finally(() => { _flushPending = null; });
  return _flushPending;
}

function _timestamp(value) {
  const result = new Date(value || 0).getTime();
  return Number.isFinite(result) ? result : 0;
}

function _find(list, targetId) {
  return (list || []).find(item => String(item.targetId) === String(targetId));
}

function _removeFromList(list, targetId) {
  return (list || []).filter(item => String(item.targetId) !== String(targetId));
}

function _remoteItem(row) {
  return Object.assign({}, row.payload || {}, {
    targetId: String(row.targetId),
    title: row.title || row.payload && row.payload.title || '',
    subtitle: row.subtitle || row.payload && row.payload.subtitle || '',
    createdAt: row.createdAt || '',
    updatedAt: row.clientUpdatedAt || row.updatedAt || ''
  });
}

function _syncJobReminders(all) {
  ((all && all.job) || [])
    .filter(item => item && item.reminderEnabled !== false && item.deadline)
    .forEach(item => reminders.upsertReminder(favoriteReminder.buildJobReminderPayload(item)));
}

function _mergeRemote(localAll, remoteRows) {
  const merged = _ensureShape(localAll);
  const pending = _readOutbox();
  const remoteKeys = {};
  (remoteRows || []).forEach(row => {
    const type = TYPES.includes(row.type) ? row.type : 'job';
    const key = _key(type, row.targetId);
    remoteKeys[key] = true;
    if (pending[key]) return;
    if (row.deleted || row.status === 'deleted') {
      merged[type] = _removeFromList(merged[type], row.targetId);
      return;
    }
    const local = _find(merged[type], row.targetId);
    const remote = _remoteItem(row);
    if (!local) merged[type].push(remote);
    else if (_timestamp(remote.updatedAt) >= _timestamp(local.updatedAt || local.createdAt)) {
      merged[type] = merged[type].map(item => String(item.targetId) === String(row.targetId) ? remote : item);
    }
  });

  TYPES.forEach(type => {
    merged[type].forEach(item => {
      const key = _key(type, item.targetId);
      if (!remoteKeys[key] && !pending[key]) _queue('upsert', type, item.targetId, item);
    });
    merged[type].sort((left, right) => _timestamp(right.createdAt) - _timestamp(left.createdAt));
  });
  return merged;
}

function syncFromServer(options) {
  if (!_hasToken()) return Promise.resolve(_getAll());
  if (_syncPending) return _syncPending;
  if (!(options && options.force) && Date.now() - _lastSyncAt < SYNC_TTL) return Promise.resolve(_getAll());

  _syncPending = _flushOutbox().then(() => apiFavorites.list({ includeDeleted: true })).then(response => {
    const rows = response && response.code === 0 && Array.isArray(response.data) ? response.data : [];
    const merged = _mergeRemote(_getAll(), rows);
    _saveAll(merged);
    _syncJobReminders(merged);
    _lastSyncAt = Date.now();
    return _flushOutbox().then(() => merged);
  }).catch(() => _getAll()).finally(() => { _syncPending = null; });
  return _syncPending;
}

function add(type, item) {
  const all = _getAll();
  if (!all[type]) all[type] = [];
  if (_find(all[type], item.targetId)) return false;
  const favorite = type === 'job' ? favoriteReminder.withJobReminderDefaults(item) : Object.assign({}, item);
  favorite.createdAt = favorite.createdAt || new Date().toISOString();
  favorite.updatedAt = new Date().toISOString();
  all[type].unshift(favorite);
  _saveAll(all);
  _queue('upsert', type, favorite.targetId, favorite);
  _lastSyncAt = 0;
  _flushOutbox();
  if (type === 'job') reminders.upsertReminder(favoriteReminder.buildJobReminderPayload(favorite));
  return true;
}

function remove(type, targetId) {
  const all = _getAll();
  if (!all[type] || !_find(all[type], targetId)) return false;
  all[type] = _removeFromList(all[type], targetId);
  _saveAll(all);
  _queue('delete', type, targetId, null);
  _lastSyncAt = 0;
  _flushOutbox();
  if (type === 'job') reminders.disableReminder('favorite_job', targetId, 'deadline');
  return true;
}

function update(type, targetId, patch) {
  const all = _getAll();
  const current = all[type] && _find(all[type], targetId);
  if (!current) return false;
  const updated = Object.assign({}, current, patch || {}, { updatedAt: new Date().toISOString() });
  all[type] = all[type].map(item => String(item.targetId) === String(targetId) ? updated : item);
  _saveAll(all);
  _queue('upsert', type, targetId, updated);
  _lastSyncAt = 0;
  _flushOutbox();
  return true;
}

function isFavorited(type, targetId) { return !!_find(_getAll()[type], targetId); }
function getList(type) { return _getAll()[type] || []; }
function getAll() { return _getAll(); }
function getCount(type) {
  if (type) return getList(type).length;
  const all = _getAll();
  return TYPES.reduce((sum, key) => sum + all[key].length, 0);
}
function toggle(type, item, title, subtitle) {
  const value = typeof item === 'string' ? { targetId: item, title: title || '', subtitle: subtitle || '' } : item;
  if (isFavorited(type, value.targetId)) { remove(type, value.targetId); return false; }
  add(type, value); return true;
}

module.exports = {
  add, remove, update, isFavorited, getList, getAll, getCount, toggle, syncFromServer,
  flushPending: _flushOutbox, mergeRemote: _mergeRemote, OUTBOX_KEY
};

// 收藏管理：本地即时响应 + 幂等 outbox + 服务端 tombstone 合并。
const apiFavorites = require('./api-favorites.js');
const reminders = require('./reminders.js');
const favoriteReminder = require('./favorite-reminder.js');
const dateTime = require('./date-time.js');
const apiCampus = require('./api-campus.js');
const progress = require('./job-progress.js');

const STORAGE_KEY = 'userFavorites';
const OUTBOX_KEY = 'favoriteSyncOutboxV4';
const OWNER_KEY = 'jobFavoritesVisibleOwner';
const CAMPUS_LINKED_KEY = 'campusFollowFavoriteLinkedV1';
const TYPES = ['job', 'experience', 'company', 'agency', 'campus'];
const SYNC_TTL = 2 * 60 * 1000;
let _syncPending = null;
let _flushPending = null;
let _lastSyncAt = 0;
let _campusImportPending = null;
let _preparedOwner = '';
let _ownerGeneration = 0;

function _ownerScope() {
  try { return progress.currentOwnerScope ? String(progress.currentOwnerScope() || '') : ''; } catch (error) { return ''; }
}

function _resetOwnerData() {
  _saveAll({});
  _saveOutbox({});
  _lastSyncAt = 0;
  _syncPending = null;
  _flushPending = null;
  _campusImportPending = null;
  _ownerGeneration += 1;
}

// Establish the stable account partition before any local read, upload or fetch.
// Unlabelled legacy data is intentionally discarded: its owner cannot be proven.
function prepareOwner() {
  const scope = _ownerScope();
  let visible = '';
  try { visible = String(wx.getStorageSync(OWNER_KEY) || ''); } catch (error) {}
  if (!scope) {
    if (_preparedOwner || visible || Object.keys(_readOutbox()).length) _resetOwnerData();
    _preparedOwner = '';
    try { wx.setStorageSync(OWNER_KEY, ''); } catch (error) {}
    return { scope: '', visible: false, generation: _ownerGeneration };
  }
  if ((_preparedOwner && _preparedOwner !== scope) || (visible && visible !== scope)) {
    _resetOwnerData();
    visible = '';
    try { wx.setStorageSync(OWNER_KEY, ''); } catch (error) {}
  } else if (!visible && !_preparedOwner) {
    // The persisted favorites/outbox predate ownership metadata and must not be
    // attributed to whichever account happens to sign in first.
    _resetOwnerData();
  }
  _preparedOwner = scope;
  return { scope, visible: visible === scope, generation: _ownerGeneration };
}

function _sameOwner(owner) {
  return !!owner && owner.scope === _ownerScope() && owner.generation === _ownerGeneration;
}

function _campusLinked(scope) {
  if (!scope) return {};
  try { return wx.getStorageSync(`${CAMPUS_LINKED_KEY}:${scope}`) || {}; } catch (e) { return {}; }
}

function _markCampusLinked(id, scope) {
  const ownerScope = String(scope || _ownerScope() || '');
  if (!ownerScope) return;
  const linked = _campusLinked(ownerScope);
  linked[String(id)] = true;
  wx.setStorageSync(`${CAMPUS_LINKED_KEY}:${ownerScope}`, linked);
}

// 关注和提醒共用校招收藏入口；重复关注不会切换成取消收藏。
function followCampus(item, options) {
  const id = item && (item.id || item.campusId || item.targetId);
  if (!id) return false;
  const result = add('campus', {
    targetId: String(id),
    title: item.company || item.companyName || item.title || '校招岗位 #' + id,
    subtitle: item.positionName || item.positionType || item.jobTitle || item.subtitle || '',
    ...(options && options.createdAt ? { createdAt: options.createdAt } : {})
  });
  if (result || isFavorited('campus', id)) _markCampusLinked(id);
  return result || isFavorited('campus', id);
}

// 将当前账号只保存提醒的校招关注导入一次。旧版无 owner 标记的数据不归属给任一新账号。
function syncCampusFollows() {
  const owner = prepareOwner();
  if (!owner.scope || !owner.visible) return Promise.resolve(_ensureShape({}));
  if (_campusImportPending) return _campusImportPending;
  const token = wx.getStorageSync('token') || '';
  const candidates = new Map();
  const localRows = typeof reminders.listCampusReminderLocals === 'function'
    ? reminders.listCampusReminderLocals()
    : [];
  localRows.forEach(row => {
    const id = String(row && row.targetId || '');
    if (!id) return;
    const snapshot = wx.getStorageSync('campusDetailSnapshot_' + id) || {};
    candidates.set(id, { ...snapshot, id, followedAt: row.reminder && row.reminder.updatedAt });
  });
  const pending = reminders.fetchReminders({ sourceType: 'campus_schedule' }).then(rows => {
    (rows || []).forEach(row => {
      if (row.sourceType !== 'campus_schedule' || row.reminderType !== 'campus_deadline' || !row.targetId) return;
      if (!row.enabled) { candidates.delete(String(row.targetId)); return; }
      candidates.set(String(row.targetId), { ...(candidates.get(String(row.targetId)) || {}),
        ...(row.payload || {}), id: String(row.targetId),
        company: row.company || (row.payload || {}).company,
        positionName: row.jobTitle || (row.payload || {}).positionName,
        followedAt: row.createdAt });
    });
    return Array.from(candidates.values()).reduce((promise, item) => promise.then(async () => {
      if ((wx.getStorageSync('token') || '') !== token || !_sameOwner(owner)) return;
      if (_campusLinked(owner.scope)[item.id]) return;
      if (isFavorited('campus', item.id)) { _markCampusLinked(item.id); return; }
      if (!item.company && !item.title) {
        const response = await apiCampus.getCampusDetail(item.id).catch(() => null);
        if (response && response.code === 0 && response.data) item = { ...item, ...response.data, id: item.id };
      }
      if ((wx.getStorageSync('token') || '') === token && _sameOwner(owner)) followCampus(item, { createdAt: item.followedAt });
    }), Promise.resolve());
  }).then(() => getAll()).finally(() => {
    if (_campusImportPending === pending) _campusImportPending = null;
  });
  _campusImportPending = pending;
  return _campusImportPending;
}

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
  const owner = prepareOwner();
  if (!owner.scope) return null;
  const outbox = _readOutbox();
  const key = _key(type, targetId);
  const updatedAt = new Date().toISOString();
  outbox[key] = {
    operationId: _operationId(type, targetId), action, type, targetId: String(targetId), updatedAt,
    title: item && item.title || '',
    subtitle: item && (item.subtitle || item.company || item.type) || '',
    payload: item || {}, ownerScope: owner.scope
  };
  _saveOutbox(outbox);
  return outbox[key];
}

function _hasToken() {
  try { return !!wx.getStorageSync('token'); } catch (error) { return false; }
}

function _flushOutbox() {
  const owner = prepareOwner();
  if (!_hasToken() || !owner.scope) return Promise.resolve(false);
  if (_flushPending) return _flushPending;
  const snapshot = _readOutbox();
  const operations = Object.keys(snapshot)
    .map(key => ({ key, operation: snapshot[key] }))
    .filter(entry => entry.operation && entry.operation.ownerScope === owner.scope);
  const pending = operations.reduce((promise, entry) => promise.then(() => {
    if (!_sameOwner(owner)) return;
    const operation = entry.operation;
    const request = operation.action === 'delete' ? apiFavorites.remove : apiFavorites.upsert;
    return request(operation).then(() => {
      if (!_sameOwner(owner)) return;
      const latest = _readOutbox();
      if (latest[entry.key] && latest[entry.key].operationId === operation.operationId) {
        delete latest[entry.key];
        _saveOutbox(latest);
      }
    }).catch(() => {});
  }), Promise.resolve()).then(() => true).finally(() => {
    if (_flushPending === pending) _flushPending = null;
  });
  _flushPending = pending;
  return _flushPending;
}

function _timestamp(value) {
  const parsed = dateTime.timestamp(value);
  return parsed > Date.now() + 5 * 60 * 1000 ? Date.now() : parsed;
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
    if (!row || !TYPES.includes(row.type)) return;
    const type = row.type;
    const key = _key(type, row.targetId);
    remoteKeys[key] = true;
    if (pending[key]) return;
    if (row.deleted || row.status === 'deleted') {
      if (type === 'campus') _markCampusLinked(row.targetId);
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
  const owner = prepareOwner();
  if (!_hasToken() || !owner.scope) return Promise.resolve(_ensureShape({}));
  if (_syncPending) return _syncPending;
  if (owner.visible && !(options && options.force) && Date.now() - _lastSyncAt < SYNC_TTL) return Promise.resolve(_getAll());

  const pending = _flushOutbox().then(() => {
    if (!_sameOwner(owner)) return null;
    return apiFavorites.list({ includeDeleted: true });
  }).then(response => {
    if (!_sameOwner(owner)) return _ensureShape({});
    if (!response || response.code !== 0 || !Array.isArray(response.data)) throw new Error('收藏同步失败');
    const rows = response.data;
    const merged = _mergeRemote(_getAll(), rows);
    _saveAll(merged);
    _syncJobReminders(merged);
    _lastSyncAt = Date.now();
    return _flushOutbox().then(() => {
      if (!_sameOwner(owner)) return _ensureShape({});
      wx.setStorageSync(OWNER_KEY, owner.scope);
      return merged;
    });
  }).catch(() => _sameOwner(owner) && owner.visible ? _getAll() : _ensureShape({})).finally(() => {
    if (_syncPending === pending) _syncPending = null;
  });
  _syncPending = pending;
  return _syncPending;
}

function add(type, item) {
  const owner = prepareOwner();
  if (!owner.scope) return false;
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
  const owner = prepareOwner();
  if (!owner.scope) return false;
  const all = _getAll();
  if (!all[type] || !_find(all[type], targetId)) return false;
  if (type === 'campus') _markCampusLinked(targetId);
  all[type] = _removeFromList(all[type], targetId);
  _saveAll(all);
  _queue('delete', type, targetId, null);
  _lastSyncAt = 0;
  _flushOutbox();
  if (type === 'job') reminders.disableReminder('favorite_job', targetId, 'deadline');
  return true;
}

function update(type, targetId, patch) {
  const owner = prepareOwner();
  if (!owner.scope) return false;
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

function isFavorited(type, targetId) {
  const owner = prepareOwner();
  return !!owner.scope && !!_find(_getAll()[type], targetId);
}
function getList(type) {
  const owner = prepareOwner();
  return owner.scope ? (_getAll()[type] || []) : [];
}
function getAll() {
  const owner = prepareOwner();
  return owner.scope ? _getAll() : _ensureShape({});
}
function getCount(type) {
  const owner = prepareOwner();
  if (!owner.scope) return 0;
  const all = _getAll();
  if (type) return (all[type] || []).length;
  return TYPES.reduce((sum, key) => sum + all[key].length, 0);
}
function toggle(type, item, title, subtitle) {
  const value = typeof item === 'string' ? { targetId: item, title: title || '', subtitle: subtitle || '' } : item;
  if (isFavorited(type, value.targetId)) { remove(type, value.targetId); return false; }
  add(type, value); return true;
}

function invalidateOwner() {
  _syncPending = null;
  _flushPending = null;
  _campusImportPending = null;
  _lastSyncAt = 0;
  _ownerGeneration += 1;
}

function clearCurrentOwner() {
  const scope = _ownerScope();
  invalidateOwner();
  _saveAll({});
  _saveOutbox({});
  if (scope) {
    try { wx.removeStorageSync(`${CAMPUS_LINKED_KEY}:${scope}`); } catch (error) {}
  }
  try { wx.setStorageSync(OWNER_KEY, ''); } catch (error) {}
  _preparedOwner = '';
}

module.exports = {
  add, remove, update, isFavorited, getList, getAll, getCount, toggle, syncFromServer,
  followCampus, syncCampusFollows,
  prepareOwner, flushPending: _flushOutbox, mergeRemote: _mergeRemote,
  invalidateOwner, clearCurrentOwner, OUTBOX_KEY, OWNER_KEY
};

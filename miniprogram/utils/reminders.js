const apiClient = require('./api-client.js');
const config = require('./app-config.js');

function hasToken() {
  try {
    return !!wx.getStorageSync('token');
  } catch (e) {
    return false;
  }
}

function normalizeLeadDays(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  const seen = {};
  return (source || [])
    .map(item => Number(item))
    .filter(item => Number.isInteger(item) && item >= 0 && item <= 30)
    .filter(item => {
      if (seen[item]) return false;
      seen[item] = true;
      return true;
    });
}

function getTemplateId(reminderType) {
  if (reminderType === 'interview') {
    return config.WX_TPL_INTERVIEW || config.WX_TPL_SYSTEM || '';
  }
  return config.WX_TPL_SYSTEM || config.WX_TPL_APPLICATION || '';
}

function registerSubscribe(templateIds) {
  const ids = (templateIds || []).filter(Boolean);
  if (!ids.length || !hasToken()) return Promise.resolve(false);
  return apiClient.post({
    path: '/api/notify/subscribe',
    body: { templateIds: ids },
    timeout: 12000
  }).then(() => true).catch(() => false);
}

function requestSubscribe(reminderType) {
  const tmplId = getTemplateId(reminderType);
  if (!tmplId || typeof wx.requestSubscribeMessage !== 'function') {
    return Promise.resolve(false);
  }
  return new Promise(resolve => {
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (res) => {
        if (res && res[tmplId] === 'accept') {
          registerSubscribe([tmplId]).then(resolve);
          return;
        }
        resolve(false);
      },
      fail: () => resolve(false)
    });
  });
}

function upsertReminder(payload, options) {
  const body = payload || {};
  if (!hasToken() || !body.targetId) return Promise.resolve(null);
  const reminderType = body.reminderType || 'deadline';
  const leadDays = normalizeLeadDays(
    body.leadDays || body.reminderLeadDays,
    reminderType === 'interview' ? [1, 0] : [3, 1, 0]
  );
  const write = () => apiClient.put({
    path: '/api/notify/reminders',
    body: Object.assign({}, body, {
      reminderType,
      leadDays,
      enabled: body.enabled !== false
    }),
    timeout: 15000
  }).then(res => (res && res.code === 0 ? res.data : null)).catch(() => null);

  if (options && options.withSubscribe) {
    return requestSubscribe(reminderType).then(write);
  }
  return write();
}

function disableReminder(sourceType, targetId, reminderType) {
  if (!hasToken() || !targetId) return Promise.resolve(null);
  return apiClient._write({
    method: 'DELETE',
    path: '/api/notify/reminders/' +
      encodeURIComponent(sourceType || 'job') + '/' +
      encodeURIComponent(targetId) + '/' +
      encodeURIComponent(reminderType || 'deadline'),
    timeout: 15000
  }).then(res => (res && res.code === 0 ? res : null)).catch(() => null);
}

function fetchReminders(filters) {
  if (!hasToken()) return Promise.resolve([]);
  return apiClient.request({
    path: '/api/notify/reminders',
    params: filters || {},
    noCache: true,
    timeout: 12000
  }).then(res => (res && res.code === 0 && Array.isArray(res.data) ? res.data : []))
    .catch(() => []);
}

module.exports = {
  upsertReminder,
  disableReminder,
  fetchReminders,
  requestSubscribe,
  registerSubscribe
};

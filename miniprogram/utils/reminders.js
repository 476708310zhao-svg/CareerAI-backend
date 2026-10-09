const apiClient = require('./api-client.js');
const config = require('./app-config.js');
const ownerStorage = require('./owner-storage.js');

const TEMPLATE_CACHE_KEY = 'notifyTemplateConfig';
const TEMPLATE_CACHE_TTL = 6 * 60 * 60 * 1000;
const CAMPUS_SOURCE_TYPE = 'campus_schedule';
const CAMPUS_DEADLINE_TYPE = 'campus_deadline';
const CAMPUS_DEFAULT_LEAD_DAYS = [7, 3, 1, 0];

let templateCache = null;
let templateLoading = null;
let operationGeneration = 0;

function captureOperation() {
  return {
    owner: ownerStorage.capture(),
    token: (() => { try { return String(wx.getStorageSync('token') || ''); } catch (e) { return ''; } })(),
    generation: operationGeneration
  };
}

function isOperationCurrent(operation) {
  if (!operation || !operation.token || operation.owner === 'guest') return false;
  let token = '';
  try { token = String(wx.getStorageSync('token') || ''); } catch (e) {}
  return operation.generation === operationGeneration && token === operation.token && ownerStorage.isCurrent(operation.owner);
}

function invalidateOperations() { operationGeneration += 1; }

function loginRequiredError() {
  const error = new Error('请先登录后保存关注和提醒');
  error.code = 'LOGIN_REQUIRED';
  return error;
}

function staleOperationError() {
  const error = new Error('账号或页面状态已变化');
  error.code = 'STALE_OPERATION';
  return error;
}

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

function normalizeDateText(value) {
  const text = String(value || '').trim();
  const match = text.match(/(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/);
  if (!match || !match[3]) return '';
  const month = String(match[2]).padStart(2, '0');
  const day = String(match[3]).padStart(2, '0');
  return `${match[1]}-${month}-${day}`;
}

function campusReminderStorageKey(id, owner) {
  return owner
    ? ownerStorage.keyFor(owner, 'campusReminder', id)
    : ownerStorage.key('campusReminder', id);
}

function listCampusReminderLocals() {
  const prefix = ownerStorage.key('campusReminder') + ':';
  try {
    return (wx.getStorageInfoSync().keys || []).reduce((rows, key) => {
      const text = String(key || '');
      if (text.indexOf(prefix) !== 0) return rows;
      const targetId = text.slice(prefix.length);
      const reminder = wx.getStorageSync(key);
      if (targetId && reminder && reminder.enabled !== false) rows.push({ targetId, reminder });
      return rows;
    }, []);
  } catch (e) {
    return [];
  }
}

function buildCampusDeadlineReminder(item, options) {
  const data = item || {};
  const opts = options || {};
  const id = data.id || data.campusId || data.targetId;
  const company = data.company || data.companyName || '';
  const jobTitle = data.positionName || data.positionType || data.jobTitle || '校招岗位';
  const reminderDate = normalizeDateText(data.deadlineDate || data.deadline || data.endDate);
  const leadDays = normalizeLeadDays(opts.leadDays || data.reminderLeadDays, CAMPUS_DEFAULT_LEAD_DAYS);
  return {
    sourceType: CAMPUS_SOURCE_TYPE,
    targetId: id ? String(id) : '',
    reminderType: CAMPUS_DEADLINE_TYPE,
    reminderDate,
    title: `${company || '目标公司'} ${jobTitle}`.trim(),
    company,
    jobTitle,
    leadDays,
    payload: {
      campusId: id ? String(id) : '',
      company,
      positionName: jobTitle,
      recruitType: data.recruitType || '',
      gradYear: data.gradYear || '',
      region: data.region || '',
      deadlineDate: data.deadlineDate || data.deadline || '',
      applyUrl: data.applyUrl || ''
    }
  };
}

function saveCampusReminderLocal(item, reminder, operation) {
  const id = item && (item.id || item.campusId || item.targetId);
  if (!id && id !== 0) return false;
  const stable = operation || captureOperation();
  if (!isOperationCurrent(stable)) return false;
  try {
    wx.setStorageSync(campusReminderStorageKey(id, stable.owner), {
      enabled: true,
      reminderDate: reminder && reminder.reminderDate ? reminder.reminderDate : '',
      leadDays: reminder && reminder.leadDays ? reminder.leadDays : CAMPUS_DEFAULT_LEAD_DAYS,
      updatedAt: Date.now()
    });
    return true;
  } catch (e) {
    return false;
  }
}

function removeCampusReminderLocal(id, operation) {
  if (!id && id !== 0) return false;
  const stable = operation || captureOperation();
  if (!isOperationCurrent(stable)) return false;
  try {
    wx.removeStorageSync(campusReminderStorageKey(id, stable.owner));
    return true;
  } catch (e) {
    return false;
  }
}

function isCampusReminderLocalEnabled(id) {
  if (!id && id !== 0) return false;
  try {
    const stored = wx.getStorageSync(campusReminderStorageKey(id));
    if (!stored) return false;
    if (stored === 1 || stored === true) return true;
    return stored.enabled !== false;
  } catch (e) {
    return false;
  }
}

function readTemplateCache() {
  if (templateCache) return templateCache;
  try {
    const stored = wx.getStorageSync(TEMPLATE_CACHE_KEY);
    if (stored && stored.data && Date.now() - stored.t < TEMPLATE_CACHE_TTL) {
      templateCache = stored.data;
      return templateCache;
    }
  } catch (e) {}
  return null;
}

function saveTemplateCache(data) {
  templateCache = data || {};
  try {
    wx.setStorageSync(TEMPLATE_CACHE_KEY, { t: Date.now(), data: templateCache });
  } catch (e) {}
}

function fetchTemplates(force) {
  const cached = !force ? readTemplateCache() : null;
  if (cached) return Promise.resolve(cached);
  if (templateLoading && !force) return templateLoading;
  templateLoading = apiClient.request({
    path: '/api/notify/templates',
    noCache: true,
    timeout: 10000
  }).then(res => {
    const data = res && res.code === 0 && res.data ? res.data : {};
    saveTemplateCache(data);
    templateLoading = null;
    return data;
  }).catch(() => {
    templateLoading = null;
    return readTemplateCache() || {};
  });
  return templateLoading;
}

function fallbackTemplateId(type) {
  if (type === 'interview') return config.WX_TPL_INTERVIEW || config.WX_TPL_SYSTEM || '';
  if (type === 'application') return config.WX_TPL_APPLICATION || config.WX_TPL_SYSTEM || '';
  if (type === 'payment_success') return config.WX_TPL_PAYMENT_SUCCESS || '';
  if (type === 'payment_reminder') return config.WX_TPL_PAYMENT_REMINDER || '';
  if (type === 'interview_report') return config.WX_TPL_INTERVIEW_REPORT || config.WX_TPL_INTERVIEW || '';
  return config.WX_TPL_SYSTEM || config.WX_TPL_APPLICATION || '';
}

function pickTemplateId(templates, reminderType) {
  const type = String(reminderType || 'deadline');
  const source = templates || {};
  if (type === 'interview') return source.interview_done || source.system_notice || fallbackTemplateId(type);
  if (type === 'application') return source.application_update || source.system_notice || fallbackTemplateId(type);
  if (type === 'payment_success') return source.payment_success || fallbackTemplateId(type);
  if (type === 'payment_reminder') return source.payment_reminder || fallbackTemplateId(type);
  if (type === 'interview_report') return source.interview_report || source.interview_done || fallbackTemplateId(type);
  return source.system_notice || source.application_update || fallbackTemplateId(type);
}

function getTemplateId(reminderType) {
  return pickTemplateId(readTemplateCache(), reminderType);
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

function requestSubscribe(reminderType, operation) {
  if (typeof wx.requestSubscribeMessage !== 'function') {
    return Promise.resolve(false);
  }
  return fetchTemplates(false).then(templates => new Promise(resolve => {
    if (operation && !isOperationCurrent(operation)) return resolve(false);
    const tmplId = pickTemplateId(templates, reminderType);
    if (!tmplId) {
      resolve(false);
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (res) => {
        if (operation && !isOperationCurrent(operation)) return resolve(false);
        if (res && res[tmplId] === 'accept') {
          registerSubscribe([tmplId]).then(value => resolve(!operation || isOperationCurrent(operation) ? value : false));
          return;
        }
        resolve(false);
      },
      fail: () => resolve(false)
    });
  }));
}

function upsertReminder(payload, options) {
  const body = payload || {};
  const operation = options && options.operation;
  if (!hasToken() || !body.targetId) return Promise.resolve(null);
  if (operation && !isOperationCurrent(operation)) return Promise.reject(staleOperationError());
  const reminderType = body.reminderType || 'deadline';
  const leadDays = normalizeLeadDays(
    body.leadDays || body.reminderLeadDays,
    reminderType === 'interview' ? [1, 0] : [3, 1, 0]
  );
  const write = () => {
    if (operation && !isOperationCurrent(operation)) return Promise.reject(staleOperationError());
    return apiClient.put({
      path: '/api/notify/reminders',
      body: Object.assign({}, body, {
        reminderType,
        leadDays,
        enabled: body.enabled !== false
      }),
      timeout: 15000
    }).then(res => {
      if (operation && !isOperationCurrent(operation)) throw staleOperationError();
      return res && res.code === 0 ? res.data : null;
    });
  };

  if (options && options.withSubscribe) {
    return requestSubscribe(reminderType, operation).then(write);
  }
  return write();
}

function upsertCampusDeadlineReminder(item, options) {
  const operation = options && options.operation || captureOperation();
  if (!isOperationCurrent(operation)) return Promise.reject(operation.token ? staleOperationError() : loginRequiredError());
  const payload = buildCampusDeadlineReminder(item, options);
  if (!payload.targetId) return Promise.resolve(null);
  if (!payload.reminderDate) {
    saveCampusReminderLocal(item, payload, operation);
    return Promise.resolve({ localOnly: true, data: payload });
  }
  return upsertReminder(payload, { withSubscribe: !!(options && options.withSubscribe), operation })
    .then(data => {
      if (!isOperationCurrent(operation)) throw staleOperationError();
      saveCampusReminderLocal(item, data || payload, operation);
      return data || { localOnly: true, data: payload };
    });
}

function disableCampusDeadlineReminder(id, operation) {
  const stable = operation || captureOperation();
  if (!isOperationCurrent(stable)) return Promise.reject(stable.token ? staleOperationError() : loginRequiredError());
  const targetId = id && typeof id === 'object' ? (id.id || id.campusId || id.targetId) : id;
  return disableReminder(CAMPUS_SOURCE_TYPE, targetId, CAMPUS_DEADLINE_TYPE, stable).then(result => {
    if (!isOperationCurrent(stable)) throw staleOperationError();
    removeCampusReminderLocal(targetId, stable);
    return result;
  });
}

function disableReminder(sourceType, targetId, reminderType, operation) {
  if (!hasToken() || !targetId) return Promise.resolve(null);
  if (operation && !isOperationCurrent(operation)) return Promise.reject(staleOperationError());
  return apiClient._write({
    method: 'DELETE',
    path: '/api/notify/reminders/' +
      encodeURIComponent(sourceType || 'job') + '/' +
      encodeURIComponent(targetId) + '/' +
      encodeURIComponent(reminderType || 'deadline'),
    timeout: 15000
  }).then(res => {
    if (operation && !isOperationCurrent(operation)) throw staleOperationError();
    return res && res.code === 0 ? res : null;
  });
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
  CAMPUS_SOURCE_TYPE,
  CAMPUS_DEADLINE_TYPE,
  CAMPUS_DEFAULT_LEAD_DAYS,
  upsertReminder,
  disableReminder,
  fetchReminders,
  requestSubscribe,
  registerSubscribe,
  fetchTemplates,
  getTemplateId,
  buildCampusDeadlineReminder,
  upsertCampusDeadlineReminder,
  disableCampusDeadlineReminder,
  saveCampusReminderLocal,
  removeCampusReminderLocal,
  isCampusReminderLocalEnabled,
  listCampusReminderLocals,
  campusReminderStorageKey,
  captureOperation,
  isOperationCurrent,
  invalidateOperations
};

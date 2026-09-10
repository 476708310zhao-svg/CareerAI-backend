const apiClient = require('./api-client.js');
const config = require('./app-config.js');

const QUEUE_KEY = 'analyticsEventQueue';
const DISABLED_UNTIL_KEY = 'analyticsDisabledUntil';
const MAX_QUEUE = 50;
const RETRY_AFTER_NOT_FOUND = 12 * 60 * 60 * 1000;
const RETRY_AFTER_SERVER_ERROR = 10 * 60 * 1000;

let launchOptions = {};
let installed = false;

function safeStorageGet(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value || fallback;
  } catch (e) {
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {}
}

function currentRoute() {
  try {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    return page && page.route ? page.route : '';
  } catch (e) {
    return '';
  }
}

function cleanPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const out = {};
  Object.keys(payload).slice(0, 40).forEach(key => {
    const value = payload[key];
    if (value === undefined || typeof value === 'function') return;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      out[key] = value;
    } else {
      try {
        out[key] = JSON.parse(JSON.stringify(value));
      } catch (e) {
        out[key] = String(value);
      }
    }
  });
  return out;
}

function analyticsDataClass(payload) {
  if (config.ENABLE_DEMO_FALLBACK === true) return 'demo';
  const value = payload || {};
  const ids = [value.jobId, value.sourceJobId, value.applicationId, value.clientId, value.reportId, value.taskId]
    .map(item => String(item || ''));
  if (ids.some(id => /(?:^|[_:-])(test|smoke|fixture)(?:[_:-]|$)/i.test(id))) return 'test';
  if (ids.some(id => /(?:^|[_:-])(mock|demo|default)(?:[_:-]|$)/i.test(id))) return 'demo';
  return 'production';
}

function coreRefs(payload) {
  const value = payload || {};
  const refs = Object.assign({}, value.refs || {});
  const mappings = {
    jobId: value.sourceJobId || value.jobId,
    applicationId: value.applicationId || value.id,
    resumeId: value.resumeId,
    resumeVersionId: value.resumeVersionId,
    interviewSpaceId: value.interviewSpaceId || value.spaceId,
    interviewSessionId: value.interviewSessionId || value.sessionId,
    interviewReportId: value.interviewReportId || value.reportId,
    todayTaskId: value.todayTaskId || value.taskId
  };
  Object.keys(mappings).forEach(key => {
    const candidate = mappings[key];
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) refs[key] = candidate;
  });
  return refs;
}

function enqueue(event) {
  if (isDisabled()) return;
  const queue = safeStorageGet(QUEUE_KEY, []);
  const list = Array.isArray(queue) ? queue : [];
  list.push(event);
  safeStorageSet(QUEUE_KEY, list.slice(-MAX_QUEUE));
}

function isDisabled() {
  return Number(safeStorageGet(DISABLED_UNTIL_KEY, 0)) > Date.now();
}

function disableFor(ms) {
  safeStorageSet(DISABLED_UNTIL_KEY, Date.now() + ms);
  safeStorageSet(QUEUE_KEY, []);
}

function handleSendError(err) {
  const status = Number(err && err.statusCode);
  const message = String(err && err.message || '');
  if (status === 404 || /HTTP 404|Not Found/i.test(message)) {
    disableFor(RETRY_AFTER_NOT_FOUND);
    return true;
  }
  if (status >= 500 || /Internal server error|HTTP 5\d\d/i.test(message)) {
    disableFor(RETRY_AFTER_SERVER_ERROR);
    return true;
  }
  return false;
}

function send(event) {
  if (isDisabled()) return Promise.resolve(true);
  return apiClient.post({
    path: '/api/analytics/events',
    body: event,
    timeout: 8000
  }).then(res => res && res.code === 0).catch(err => {
    if (handleSendError(err)) return true;
    return false;
  });
}

function flush() {
  if (isDisabled()) {
    safeStorageSet(QUEUE_KEY, []);
    return;
  }
  const queue = safeStorageGet(QUEUE_KEY, []);
  if (!Array.isArray(queue) || !queue.length) return;
  const rest = queue.slice();
  const next = () => {
    const item = rest.shift();
    if (!item) {
      safeStorageSet(QUEUE_KEY, []);
      return;
    }
    send(item).then(ok => {
      if (!ok) {
        safeStorageSet(QUEUE_KEY, [item].concat(rest).slice(-MAX_QUEUE));
        return;
      }
      next();
    });
  };
  next();
}

function track(eventName, payload) {
  if (isDisabled()) return Promise.resolve(true);
  const clean = cleanPayload(payload);
  clean.refs = coreRefs(clean);
  const event = {
    eventName: String(eventName || '').trim(),
    route: currentRoute(),
    source: launchOptions.query && (launchOptions.query.source || launchOptions.query.channel) || '',
    scene: launchOptions.scene ? String(launchOptions.scene) : '',
    dataClass: analyticsDataClass(clean),
    payload: clean
  };
  if (!event.eventName) return Promise.resolve(false);
  return send(event).then(ok => {
    if (!ok) enqueue(event);
    return ok;
  });
}

function setLaunchOptions(options) {
  launchOptions = options || {};
}

function wrapLifecycle(options, name, before) {
  const original = options[name];
  options[name] = function() {
    before(this, arguments);
    if (typeof original === 'function') return original.apply(this, arguments);
    return undefined;
  };
}

function installPageTracker() {
  if (typeof Page !== 'function' || installed) return;
  const originalPage = Page;
  Page = function(options) {
    options = options || {};
    wrapLifecycle(options, 'onShow', function(page) {
      track('page_view', {
        route: page && page.route || '',
        query: page && page.__shareQuery || ''
      });
      flush();
    });
    return originalPage(options);
  };
  installed = true;
}

module.exports = {
  installPageTracker,
  setLaunchOptions,
  track,
  flush
};

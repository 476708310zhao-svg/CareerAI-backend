'use strict';

// Shared with the Web practice view. Never cache owner-scoped questions,
// submissions or practice history, and never substitute local OA answers.
const client = require('./api-client.js');
const authSession = require('./auth-session.js');
const ROOT = '/api/v4/question-practice';
const HOME = '/package-content/pages/practice-home/practice-home';
const SESSION = '/package-content/pages/practice-session/practice-session';

function fail(response) {
  const status = response && response._status;
  const code = response && (response._source || response.code);
  const messages = {
    unauthorized: '登录已过期，请重新登录', authChanged: '账号已切换，请重新加载',
    timeout: '请求超时，请重试', networkError: '网络连接异常，请重试',
    rateLimit: '请求过于频繁，请稍后重试'
  };
  const error = new Error(messages[code] || (status === 403 ? '题集当前不可用，请返回刷新' :
    status === 404 ? '练习记录不存在，请返回刷新' : response && response.message || '暂时无法加载，请重试'));
  error.code = code || 'REQUEST_FAILED';
  error.statusCode = status;
  return error;
}
function unwrap(response) {
  if (response && response.code === 0 && !response._source) return response.data || {};
  throw fail(response);
}
function query(params) {
  return Object.keys(params || {}).filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
}
function get(path, params) {
  return client.request({ path: ROOT + path, params: params || {}, noCache: true }).then(unwrap);
}
function write(method, path, body, retryOnNetworkError = false) {
  return client._write({ method, path: ROOT + path, body, retryOnNetworkError }).then(unwrap).catch(error => {
    if (error && error.message === 'unauthorized') {
      error.code = 'unauthorized'; error.statusCode = 401;
    }
    if (error && error.code === 'AUTH_CHANGED') error.code = 'authChanged';
    throw error;
  });
}
function capture() { return authSession.capture(wx); }
function current(snapshot) { return authSession.isCurrent(snapshot, wx); }
function key() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}
const id = value => encodeURIComponent(String(value));
const sets = params => get('/sets', params);
const sessions = params => get('/sessions', params);
const session = sessionId => get(`/sessions/${id(sessionId)}`);
const report = sessionId => get(`/sessions/${id(sessionId)}/report`);
const question = (sessionId, position) => get(`/sessions/${id(sessionId)}/items/${id(position)}`);
const result = (sessionId, position) => get(`/sessions/${id(sessionId)}/items/${id(position)}/result`);
const mistakes = params => get('/mistakes', params);
const favorites = params => get('/favorites', params);
const start = (setId, clientKey) => write('POST', `/sets/${id(setId)}/sessions`, { clientKey }, true);
const submit = (sessionId, position, answer, requestId) => write('POST',
  `/sessions/${id(sessionId)}/items/${id(position)}/submit`, { answer, requestId }, true);
const finish = sessionId => write('POST', `/sessions/${id(sessionId)}/finish`, {}, true);
const favorite = (sessionId, position, enabled) => write(enabled ? 'PUT' : 'DELETE',
  `/sessions/${id(sessionId)}/items/${id(position)}/favorite`, {}, true);
const homeUrl = () => HOME;
const sessionUrl = (sessionId, position) => `${SESSION}?sessionId=${id(sessionId)}` +
  (position ? `&position=${id(position)}` : '');

module.exports = { capture, current, key, sets, sessions, session, report, question, result,
  mistakes, favorites, start, submit, finish, favorite, homeUrl, sessionUrl };

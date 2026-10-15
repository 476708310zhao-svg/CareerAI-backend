// utils/api-client.js
// 基础请求封装：三层缓存 + 请求去重 + Token 注入
// 供各业务模块 require，不直接暴露给页面

const config = require('./app-config.js');
const authSession = require('./auth-session.js');
const API_BASE = config.API_BASE_URL;

const _memCache = {};       // 内存缓存
const _pending  = {};       // 飞行中请求去重
const MEM_CACHE_MAX = 50;   // 内存缓存最大条目数

const CACHE_TTL        = 30 * 60 * 1000;        // 默认缓存 30 分钟
const DETAIL_CACHE_TTL =  6 * 60 * 60 * 1000;   // 详情缓存 6 小时
const STALE_TTL        = 24 * 60 * 60 * 1000;   // 过期缓存保留 24 小时（限流兜底）

const _rateLimitUntil = {};
let _lastToken;
let _lastRevision;
let _authGeneration = 0;

function _currentToken() {
  try { return wx.getStorageSync('token') || ''; } catch (e) { return ''; }
}

// Opaque, non-reversible per-login scope. Never put a JWT (or its payload) in a cache key.
// A changed token always starts a new scope, including A -> B -> A.
function _authContext(skipAuth) {
  if (skipAuth) return { token: '', scope: 'anonymous', skipAuth: true };
  const token = _currentToken();
  const revision = authSession.revision();
  if (token !== _lastToken || revision !== _lastRevision) {
    _lastToken = token;
    _lastRevision = revision;
    _authGeneration += 1;
  }
  return { token, revision, scope: 'session-' + _authGeneration, skipAuth: false };
}

function _sameIdentity(context) {
  return context.skipAuth || (_currentToken() === context.token && authSession.revision() === context.revision);
}

function _clearSessionIfCurrent(context) {
  if (context.skipAuth || !_sameIdentity(context)) return;
  authSession.clearToken(wx);
  wx.removeStorageSync('userProfile');
}

function _authChangedError() {
  const error = new Error('账号已切换，请重试');
  error.code = 'AUTH_CHANGED';
  return error;
}

function _createNetworkError(err) {
  const detail = err && (err.errMsg || err.message || String(err));
  const message = /timeout/i.test(detail || '')
    ? '请求超时，请稍后重试'
    : '网络连接失败，请检查网络后重试';
  const error = new Error(message);
  error.code = 'NETWORK_ERROR';
  error.detail = detail || '';
  return error;
}

function _createHttpError(res) {
  const message = res.data && (res.data.message || res.data.error);
  const isHtmlNotFound = Number(res.statusCode) === 404
    && typeof res.data === 'string'
    && /<!doctype html|<html[\s>]/i.test(res.data);
  const error = new Error(message || (isHtmlNotFound
    ? '服务接口暂不可用，请稍后重试'
    : ('HTTP ' + res.statusCode)));
  error.code = isHtmlNotFound ? 'SERVICE_ROUTE_UNAVAILABLE' : 'HTTP_ERROR';
  error.statusCode = res.statusCode;
  error.body = res.data;
  return error;
}

function _isSuccessStatus(statusCode) {
  const status = Number(statusCode);
  return status >= 200 && status < 300;
}

function _cacheKey(url, data) {
  const s = url + (data ? JSON.stringify(data) : '');
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return 'apic_' + Math.abs(h);
}

function _getStaleCache(key, persistent) {
  try {
    const m = _memCache[key];
    if (m && (Date.now() - m.t) < STALE_TTL) return m.d;
    if (persistent) {
      const s = wx.getStorageSync(key);
      if (s && (Date.now() - s.t) < STALE_TTL) return s.d;
    }
  } catch (e) {}
  return null;
}

function _getAuthHeader(context) {
  return context.token ? { 'Authorization': 'Bearer ' + context.token } : {};
}

/**
 * 通用 GET 请求（含三层缓存）
 * @param {{ path: string, params?: object, cacheTTL?: number, timeout?: number, baseUrl?: string, skipAuth?: boolean }} options
 */
function request(options) {
  const now = Date.now();
  const requestData = options.params || options.data || {};
  const baseUrl = options.baseUrl || API_BASE;
  const auth = _authContext(options.skipAuth);
  const key = auth.scope + ':' + _cacheKey(baseUrl + options.path, requestData);
  // A 429 on jobs must not suppress an unrelated campus or account endpoint.
  const rateLimitKey = baseUrl + '|' + auth.scope + '|' + options.path;
  const ttl = typeof options.cacheTTL === 'number' ? options.cacheTTL : CACHE_TTL;
  const noCache = !!options.noCache || ttl <= 0;
  const softTimeout = options.timeout || 10000;
  const wxTimeout = options.wxTimeout || Math.max(softTimeout + 5000, 15000);

  // 层1：内存缓存
  if (!noCache && _memCache[key] && (now - _memCache[key].t) < ttl) {
    return Promise.resolve(_memCache[key].d);
  }
  // 层2：持久化缓存
  if (!noCache && auth.skipAuth) {
    try {
      const stored = wx.getStorageSync(key);
      if (stored && (now - stored.t) < ttl) {
        _memCache[key] = stored;
        return Promise.resolve(stored.d);
      }
    } catch (e) {}
  }

  // 层3：限流冷却期，返回过期缓存兜底
  if (now < (_rateLimitUntil[rateLimitKey] || 0)) {
    const stale = _getStaleCache(key, auth.skipAuth);
    if (stale) return Promise.resolve(stale);
    return Promise.resolve({ code: 429, data: [], _source: 'rateLimit' });
  }

  // 请求去重
  if (_pending[key]) return _pending[key];

  const promise = new Promise((resolve) => {
    let done = false;
    let timer = null;
    let task = null;
    const finish = (result) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      delete _pending[key];
      resolve(_sameIdentity(auth) || (result && result._source === 'unauthorized')
        ? result : { data: [], _source: 'authChanged' });
    };

    timer = setTimeout(() => {
      const stale = _getStaleCache(key, auth.skipAuth);
      finish(stale || { data: [], _source: 'timeout' });
      if (task && typeof task.abort === 'function') {
        try { task.abort(); } catch (e) {}
      }
    }, softTimeout);

    task = wx.request({
      url: baseUrl + options.path,
      method: 'GET',
      data: requestData,
      header: Object.assign({ 'Content-Type': 'application/json' }, _getAuthHeader(auth)),
      timeout: wxTimeout,
      success: (res) => {
        if (done) return;
        if (!_sameIdentity(auth)) {
          finish({ data: [], _source: 'authChanged' });
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
          if (!noCache) {
            const entry = { d: res.data, t: Date.now() };
            _memCache[key] = entry;
            // 超出上限时驱逐最旧条目
            const cacheKeys = Object.keys(_memCache);
            if (cacheKeys.length > MEM_CACHE_MAX) {
              let oldestKey = cacheKeys[0];
              for (const k of cacheKeys) {
                if (_memCache[k].t < _memCache[oldestKey].t) oldestKey = k;
              }
              delete _memCache[oldestKey];
            }
            if (auth.skipAuth) {
              try { wx.setStorageSync(key, entry); } catch (e) {}
            }
          }
          finish(res.data);
        } else if (res.statusCode === 429) {
          _rateLimitUntil[rateLimitKey] = Date.now() + 2 * 60 * 1000;
          const stale = _getStaleCache(key, auth.skipAuth);
          finish(stale || { code: 429, data: [], _source: 'rateLimit' });
        } else if (res.statusCode === 401) {
          _clearSessionIfCurrent(auth);
          finish({ data: [], _source: 'unauthorized' });
        } else {
          console.warn('[API]', res.statusCode, options.path);
          finish({ data: [], _source: 'error', _status: res.statusCode });
        }
      },
      fail: (err) => {
        if (done) return;
        console.warn('[API] fail:', err.errMsg || err.message || err);
        const stale = _getStaleCache(key, auth.skipAuth);
        finish(stale || { data: [], _source: 'networkError' });
      }
    });
  });

  _pending[key] = promise;
  return promise;
}

/**
 * 写请求（POST / PUT / DELETE，不走缓存）
 * 写请求默认不重试：网络错误时服务端可能已经完成非幂等操作。
 * 仅明确声明 retryOnNetworkError 的幂等调用可重试一次，且始终绑定原登录身份。
 * @param {{ method?: string, path: string, body?: object, timeout?: number, skipAuth?: boolean }} options
 */
function _write(options, _retried, originalAuth) {
  return new Promise((resolve, reject) => {
    const baseUrl = options.baseUrl || API_BASE;
    const auth = originalAuth || _authContext(options.skipAuth);
    if (!_sameIdentity(auth)) return reject(_authChangedError());
    const header = Object.assign({ 'Content-Type': 'application/json' }, _getAuthHeader(auth));

    wx.request({
      url: baseUrl + options.path,
      method: options.method || 'POST',
      data: options.body || options.data || {},
      header,
      timeout: options.timeout || 60000,
      success: (res) => {
        if (!_sameIdentity(auth)) return reject(_authChangedError());
        if (_isSuccessStatus(res.statusCode)) {
          resolve(res.data === undefined ? { code: 0 } : res.data);
        } else if (res.statusCode === 401) {
          _clearSessionIfCurrent(auth);
          reject(new Error('unauthorized'));
        } else {
          reject(_createHttpError(res));
        }
      },
      fail: (err) => {
        if (!_sameIdentity(auth)) return reject(_authChangedError());
        if (!_retried && options.retryOnNetworkError === true) {
          // 网络错误重试一次，延迟 1s
          setTimeout(() => {
            if (!_sameIdentity(auth)) return reject(_authChangedError());
            _write(options, true, auth).then(resolve).catch(reject);
          }, 1000);
        } else {
          reject(_createNetworkError(err));
        }
      }
    });
  });
}

function post(options) { return _write(Object.assign({}, options, { method: 'POST' })); }
function put(options)  { return _write(Object.assign({}, options, { method: 'PUT', timeout: options.timeout || 15000 })); }

module.exports = { request, _write, post, put, DETAIL_CACHE_TTL, _isSuccessStatus, _createHttpError };

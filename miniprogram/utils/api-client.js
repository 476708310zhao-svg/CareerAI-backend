// utils/api-client.js
// 基础请求封装：三层缓存 + 请求去重 + Token 注入
// 供各业务模块 require，不直接暴露给页面

const config = require('./config.js');
const API_BASE = config.API_BASE_URL;

const _memCache = {};       // 内存缓存
const _pending  = {};       // 飞行中请求去重
const MEM_CACHE_MAX = 50;   // 内存缓存最大条目数

const CACHE_TTL        = 30 * 60 * 1000;        // 默认缓存 30 分钟
const DETAIL_CACHE_TTL =  6 * 60 * 60 * 1000;   // 详情缓存 6 小时
const STALE_TTL        = 24 * 60 * 60 * 1000;   // 过期缓存保留 24 小时（限流兜底）

let _rateLimitUntil = 0;

function _cacheKey(url, data) {
  const s = url + (data ? JSON.stringify(data) : '');
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return 'apic_' + Math.abs(h);
}

function _getStaleCache(key) {
  try {
    const m = _memCache[key];
    if (m && (Date.now() - m.t) < STALE_TTL) return m.d;
    const s = wx.getStorageSync(key);
    if (s && (Date.now() - s.t) < STALE_TTL) return s.d;
  } catch (e) {}
  return null;
}

function _getAuthHeader() {
  try {
    const token = wx.getStorageSync('token');
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  } catch (e) {
    return {};
  }
}

/**
 * 通用 GET 请求（含三层缓存）
 * @param {{ path: string, params?: object, cacheTTL?: number, timeout?: number }} options
 */
function request(options) {
  const now = Date.now();
  const requestData = options.params || options.data || {};
  const key = _cacheKey(options.path, requestData);
  const ttl = options.cacheTTL || CACHE_TTL;
  const noCache = !!options.noCache;

  // 层1：内存缓存
  if (!noCache && _memCache[key] && (now - _memCache[key].t) < ttl) {
    return Promise.resolve(_memCache[key].d);
  }
  // 层2：持久化缓存
  if (!noCache) {
    try {
      const stored = wx.getStorageSync(key);
      if (stored && (now - stored.t) < ttl) {
        _memCache[key] = stored;
        return Promise.resolve(stored.d);
      }
    } catch (e) {}
  }

  // 层3：限流冷却期，返回过期缓存兜底
  if (now < _rateLimitUntil) {
    const stale = _getStaleCache(key);
    if (stale) return Promise.resolve(stale);
    return Promise.resolve({ code: 429, data: [], _source: 'rateLimit' });
  }

  // 请求去重
  if (_pending[key]) return _pending[key];

  const promise = new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      delete _pending[key];
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ data: [], _source: 'timeout' });
    }, options.timeout || 10000);

    wx.request({
      url: API_BASE + options.path,
      method: 'GET',
      data: requestData,
      header: Object.assign({ 'Content-Type': 'application/json' }, _getAuthHeader()),
      success: (res) => {
        clearTimeout(timer);
        if (res.statusCode === 200 && res.data) {
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
            try { wx.setStorageSync(key, entry); } catch (e) {}
          }
          finish(res.data);
        } else if (res.statusCode === 429) {
          _rateLimitUntil = Date.now() + 2 * 60 * 1000;
          const stale = _getStaleCache(key);
          finish(stale || { code: 429, data: [], _source: 'rateLimit' });
        } else if (res.statusCode === 401) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('userProfile');
          finish({ data: [], _source: 'unauthorized' });
        } else {
          console.warn('[API]', res.statusCode, options.path);
          finish({ data: [], _source: 'error', _status: res.statusCode });
        }
      },
      fail: (err) => {
        clearTimeout(timer);
        console.error('[API] fail:', err);
        const stale = _getStaleCache(key);
        finish(stale || { data: [], _source: 'networkError' });
      }
    });
  });

  _pending[key] = promise;
  return promise;
}

/**
 * 写请求（POST / PUT / DELETE，不走缓存）
 * 网络层失败时自动重试一次（指数退避 1s），4xx/5xx 不重试
 * @param {{ method?: string, path: string, body?: object, timeout?: number, skipAuth?: boolean }} options
 */
function _write(options, _retried) {
  return new Promise((resolve, reject) => {
    const header = Object.assign({ 'Content-Type': 'application/json' },
      options.skipAuth ? {} : _getAuthHeader());

    wx.request({
      url: API_BASE + options.path,
      method: options.method || 'POST',
      data: options.body || options.data || {},
      header,
      timeout: options.timeout || 60000,
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('userProfile');
          reject(new Error('unauthorized'));
        } else {
          reject(new Error('HTTP ' + res.statusCode));
        }
      },
      fail: (err) => {
        if (!_retried) {
          // 网络错误重试一次，延迟 1s
          setTimeout(() => {
            _write(options, true).then(resolve).catch(reject);
          }, 1000);
        } else {
          reject(err);
        }
      }
    });
  });
}

function post(options) { return _write(Object.assign({}, options, { method: 'POST' })); }
function put(options)  { return _write(Object.assign({}, options, { method: 'PUT', timeout: options.timeout || 15000 })); }

module.exports = { request, _write, post, put, DETAIL_CACHE_TTL };

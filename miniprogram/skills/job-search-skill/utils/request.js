const { getAuthHeader } = require('./auth.js');

// Mirrors miniprogram/utils/app-config.js so this independent skill subpackage
// does not depend on main-package initialization or modules.
const API_BASE = 'https://api.zhiyincareer.com';

function buildQuery(params) {
  return Object.keys(params || {})
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
    .join('&');
}

function request(options) {
  const path = options.path;
  const params = options.params || {};
  const timeout = options.timeout || 15000;
  const method = options.method || 'GET';

  if (typeof wx === 'undefined' || !wx || !wx.request) {
    return Promise.resolve({
      isError: true,
      error: '当前运行环境不支持 wx.request',
      data: []
    });
  }

  return new Promise(resolve => {
    const query = method === 'GET' ? buildQuery(params) : '';
    const url = API_BASE + path + (query ? '?' + query : '');

    wx.request({
      url,
      method,
      data: method === 'GET' ? undefined : params,
      timeout,
      header: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeader()),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {});
          return;
        }
        resolve({
          isError: true,
          statusCode: res.statusCode,
          message: (res.data && (res.data.message || res.data.error)) || '请求失败',
          data: []
        });
      },
      fail(err) {
        resolve({
          isError: true,
          message: (err && (err.errMsg || err.message)) || '网络请求失败',
          data: []
        });
      }
    });
  });
}

module.exports = {
  request
};

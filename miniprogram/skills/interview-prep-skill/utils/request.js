const { getAuthHeader } = require('./auth.js');

const API_BASE = 'https://api.zhiyincareer.com';

function buildQuery(params) {
  return Object.keys(params || {})
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
    .join('&');
}

function request(options) {
  const method = options.method || 'GET';
  const params = options.params || {};

  if (typeof wx === 'undefined' || !wx || !wx.request) {
    return Promise.resolve({
      isError: true,
      message: '当前运行环境不支持 wx.request',
      data: null
    });
  }

  return new Promise(resolve => {
    const query = method === 'GET' ? buildQuery(params) : '';
    wx.request({
      url: API_BASE + options.path + (query ? '?' + query : ''),
      method,
      data: method === 'GET' ? undefined : params,
      timeout: options.timeout || 15000,
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
          data: null
        });
      },
      fail(err) {
        resolve({
          isError: true,
          message: (err && (err.errMsg || err.message)) || '网络请求失败',
          data: null
        });
      }
    });
  });
}

module.exports = {
  request
};

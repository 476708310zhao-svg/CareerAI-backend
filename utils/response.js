// backend/utils/response.js
// 统一 API 响应格式，消除路由间 { code, message, data } 结构不一致的问题

/**
 * 成功响应
 * @param {object} res - Express response
 * @param {*} data
 * @param {string} [message='success']
 */
function ok(res, data, message) {
  res.json({ code: 0, message: message || 'success', data });
}

/**
 * 失败响应
 * @param {object} res - Express response
 * @param {string} message
 * @param {number} [status=500]
 */
function fail(res, message, status) {
  res.status(status || 500).json({ code: -1, message: message || '服务器错误' });
}

module.exports = { ok, fail };
